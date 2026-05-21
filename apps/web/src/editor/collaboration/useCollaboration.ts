import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { MutableRefObject } from "react";
import type {
  AppliedProjectOperation,
  ProjectErrorPayload,
  ProjectRole,
  ProjectRoleCapabilities,
  SharedProjectLoadResponse,
  SharedProjectPresence,
  SharedProjectSnapshotSummary
} from "@webster/shared";
import { getProjectRoleCapabilities } from "@webster/shared";
import type { EditorApp } from "../app/EditorApp";
import type { SharedEditorAction } from "../app/history/SharedEditorAction";
import type { SerializedScene } from "../scene/Scene";
import {
  CollaborationClient,
  type CollaborationConnectionStatus
} from "./CollaborationClient";
import { PendingOperationsQueue } from "./PendingOperationsQueue";
import {
  applyOperationToScene,
  createOperationFromEditorAction,
  createPreviewOperationFromEditorScene
} from "./operations";
import {
  createProjectSnapshot,
  downloadSharedProjectFile,
  fetchSharedProjectAssets,
  getAccessToken,
  getSharedProjectWebSocketUrl,
  listProjectSnapshots,
  loadSharedProject,
  restoreProjectSnapshot,
  uploadLocalWebsterProject,
  uploadSharedProjectAssets
} from "./sharedProjectApi";
import type { PreparedProjectOperation } from "./operations";

export type SharedProjectRequest =
  | { id: number; type: "share-local"; title: string }
  | { id: number; projectId: string; type: "open-shared" }
  | { id: number; type: "switch-local" }
  | { id: number; type: "download-webster" }
  | { id: number; message?: string | null; type: "create-snapshot" }
  | { id: number; snapshotId: string; type: "restore-snapshot" }
  | { id: number; type: "refresh-snapshots" };

export type SharedProjectUiState = {
  capabilities: ProjectRoleCapabilities;
  connectionStatus: CollaborationConnectionStatus;
  currentVersion: number | null;
  error: string | null;
  isBusy: boolean;
  mode: "local" | "shared";
  pendingCommitCount: number;
  projectId: string | null;
  projectName: string | null;
  role: ProjectRole | null;
  snapshots: SharedProjectSnapshotSummary[];
  users: SharedProjectPresence[];
};

type UseCollaborationOptions = {
  activeDocumentTitle: string;
  editorAppRef: MutableRefObject<EditorApp | null>;
  onDocumentLoaded: (document: { height: number; title: string; width: number }) => void;
  onLayersChange: (layers: ReturnType<EditorApp["getLayerSummaries"]>) => void;
  onRequestHandled: (requestId: number) => void;
  onStateChange: (state: SharedProjectUiState) => void;
  request: SharedProjectRequest | null;
};

const localCapabilities: ProjectRoleCapabilities = {
  canCreateSnapshots: false,
  canDownloadWebster: false,
  canEdit: true,
  canManageMembers: false,
  canRestoreSnapshots: false
};

const initialState: SharedProjectUiState = {
  capabilities: localCapabilities,
  connectionStatus: "disconnected",
  currentVersion: null,
  error: null,
  isBusy: false,
  mode: "local",
  pendingCommitCount: 0,
  projectId: null,
  projectName: null,
  role: null,
  snapshots: [],
  users: []
};

export function useCollaboration({
  activeDocumentTitle,
  editorAppRef,
  onDocumentLoaded,
  onLayersChange,
  onRequestHandled,
  onStateChange,
  request
}: UseCollaborationOptions) {
  const [state, setState] = useState<SharedProjectUiState>(initialState);
  const clientId = useMemo(() => getOrCreateClientId(), []);
  const clientRef = useRef<CollaborationClient | null>(null);
  const handledRequestIdRef = useRef<number | null>(null);
  const isApplyingRemoteRef = useRef(false);
  const latestStateRef = useRef(state);
  // Optimistic baseVersion for outgoing commits. Each send bumps this so rapid
  // typing doesn't ship N commits all with the same stale baseVersion (which
  // would trip the gateway's version_conflict check on every one after the
  // first). Reset whenever we re-sync from the server.
  const nextBaseVersionRef = useRef(0);
  // Last manifest we either sent to or received from the server. We diff
  // against this to compute the JSON Patch for the next commit, instead of
  // shipping the whole scene each time.
  const lastSyncedSceneRef = useRef<import("@webster/shared").WebsterProjectManifest | null>(null);
  // Commits are serialised through this chain so two rapid edits can't both
  // read the same baseVersion / previousScene during their `await` window
  // and ship inconsistent patches.
  const commitChainRef = useRef<Promise<unknown>>(Promise.resolve());
  const pendingQueueRef = useRef(new PendingOperationsQueue());
  const resyncingRef = useRef(false);
  const uploadedAssetPathsRef = useRef(new Set<string>());

  useEffect(() => {
    latestStateRef.current = state;
    onStateChange(state);
  }, [onStateChange, state]);

  useEffect(() => {
    return () => {
      clientRef.current?.disconnect();
    };
  }, []);

  const updatePendingCount = useCallback(() => {
    setState((currentState) => ({
      ...currentState,
      pendingCommitCount: pendingQueueRef.current.size
    }));
  }, []);

  const rememberUploadedAssets = useCallback((assets: Array<{ assetPath: string }> = []) => {
    for (const asset of assets) {
      uploadedAssetPathsRef.current.add(asset.assetPath);
    }
  }, []);

  const prepareOperationForSocket = useCallback(
    async (prepared: PreparedProjectOperation) => {
      const missingAssets = prepared.assetUploads.filter(
        (asset) => !uploadedAssetPathsRef.current.has(asset.assetPath)
      );
      const uploadedAssets = await uploadSharedProjectAssets(
        prepared.operation.projectId,
        missingAssets
      );

      rememberUploadedAssets(missingAssets);
      rememberUploadedAssets(uploadedAssets);

      const referencesByPath = new Map(
        (prepared.operation.assetReferences ?? []).map((asset) => [asset.assetPath, asset])
      );

      for (const asset of uploadedAssets) {
        referencesByPath.set(asset.assetPath, asset);
      }

      return {
        ...prepared.operation,
        assetReferences: [...referencesByPath.values()]
      };
    },
    [rememberUploadedAssets]
  );

  const importSharedState = useCallback(
    async (payload: SharedProjectLoadResponse) => {
      // The receiver-side flow opens a project from a URL with no tab/editor
      // pre-mounted. Wait up to ~3s for the editor to mount before importing.
      for (let attempts = 0; attempts < 30 && !editorAppRef.current; attempts += 1) {
        await new Promise((resolve) => setTimeout(resolve, 100));
      }

      if (!editorAppRef.current) {
        return;
      }

      isApplyingRemoteRef.current = true;

      try {
        const assets = await fetchSharedProjectAssets(payload.assets);

        await editorAppRef.current.importSerializedScene(payload.snapshot as unknown as SerializedScene, assets, {
          historyLabel: "Shared project"
        });
        onLayersChange(editorAppRef.current.getLayerSummaries());
        onDocumentLoaded({
          height: payload.snapshot.canvas.height,
          title: payload.projectName ?? activeDocumentTitle,
          width: payload.snapshot.canvas.width
        });
      } finally {
        isApplyingRemoteRef.current = false;
      }
    },
    [activeDocumentTitle, editorAppRef, onDocumentLoaded, onLayersChange]
  );

  const applySharedProjectMeta = useCallback(
    (payload: SharedProjectLoadResponse) => {
      const capabilities = getProjectRoleCapabilities(payload.role, payload.permissions);

      // Resync the optimistic baseVersion counter to the server's truth.
      nextBaseVersionRef.current = payload.currentVersion;
      // The server's snapshot IS our new baseline — next commit diffs against it.
      lastSyncedSceneRef.current = payload.snapshot ?? null;
      rememberUploadedAssets(payload.assets);
      setState((currentState) => ({
        ...currentState,
        capabilities,
        connectionStatus: currentState.connectionStatus,
        currentVersion: payload.currentVersion,
        error: null,
        isBusy: false,
        mode: "shared",
        pendingCommitCount: pendingQueueRef.current.size,
        projectId: payload.projectId,
        projectName: payload.projectName ?? currentState.projectName,
        role: payload.role,
        snapshots: payload.snapshots ?? currentState.snapshots,
        users: payload.users ?? currentState.users
      }));
    },
    [rememberUploadedAssets]
  );

  const applySharedProjectState = useCallback(
    async (payload: SharedProjectLoadResponse) => {
      await importSharedState(payload);
      applySharedProjectMeta(payload);
    },
    [applySharedProjectMeta, importSharedState]
  );

  const connectToSharedProject = useCallback(
    async (payload: SharedProjectLoadResponse) => {
      clientRef.current?.disconnect();

      // BUG 3 fix: fetch the access token before creating the client so the
      // socket handshake auth.token is populated.
      const accessToken = (await getAccessToken()) ?? "";

      const client = new CollaborationClient({
        accessToken,
        clientId,
        onAppliedOperation: async (applied) => {
          await handleAppliedOperation(applied);
        },
        onError: async (error) => {
          await handleProjectError(error);
        },
        onPresence: (users) => {
          setState((currentState) => ({
            ...currentState,
            users
          }));
        },
        onPreviewOperation: async (operation) => {
          if (operation.clientId === clientId || !editorAppRef.current) {
            return;
          }

          try {
            const assets = await fetchSharedProjectAssets(operation.assetReferences);

            isApplyingRemoteRef.current = true;
            // Previews are ephemeral in-progress visuals. We render them but
            // must NOT advance lastSyncedSceneRef — only committed operations
            // move the baseline the next diff is computed against.
            await applyOperationToScene(
              editorAppRef.current,
              operation,
              assets,
              lastSyncedSceneRef.current
            );
            onLayersChange(editorAppRef.current.getLayerSummaries());
          } catch {
            // A preview that can't apply to our base is harmless — the
            // committed op (or a resync triggered by it) will correct the
            // canvas. Don't surface an error or resync for previews.
          } finally {
            isApplyingRemoteRef.current = false;
          }
        },
        onReadyToResend: () => {
          // Commit operations stay in the pending queue until the backend
          // confirms them. Reconnect resends them in order so a browser tab can
          // recover from a dropped socket without losing local edits.
          for (const operation of pendingQueueRef.current.list()) {
            clientRef.current?.sendCommit(operation);
          }
        },
        onState: async (projectState) => {
          await applySharedProjectState(projectState);
        },
        onStatusChange: (connectionStatus) => {
          setState((currentState) => ({
            ...currentState,
            connectionStatus
          }));
        },
        projectId: payload.projectId,
        webSocketUrl: getSharedProjectWebSocketUrl(payload.projectId)
      });

      clientRef.current = client;
      client.connect();
    },
    [applySharedProjectState, clientId, editorAppRef, onLayersChange]
  );

  const loadAndJoinSharedProject = useCallback(
    async (projectId: string) => {
      setState((currentState) => ({
        ...currentState,
        error: null,
        isBusy: true
      }));

      const payload = await loadSharedProject(projectId);

      await applySharedProjectState(payload);
      connectToSharedProject(payload);
    },
    [applySharedProjectState, connectToSharedProject]
  );

  const shareLocalProject = useCallback(
    async (title: string) => {
      // Programmatic auto-share fires right after a new tab is created; the
      // editor may not have mounted yet, so wait up to ~3s for it.
      let editorApp = editorAppRef.current;
      for (let attempts = 0; attempts < 30 && !editorApp; attempts += 1) {
        await new Promise((resolve) => setTimeout(resolve, 100));
        editorApp = editorAppRef.current;
      }

      if (!editorApp) {
        return;
      }

      setState((currentState) => ({
        ...currentState,
        error: null,
        isBusy: true
      }));

      // Local mode becomes shared mode by creating a real `.webster` package
      // with the same exporter used by Save As, then uploading it via REST.
      const projectBlob = await editorApp.exportProjectFile();
      const payload = await uploadLocalWebsterProject(projectBlob, getWebsterFilename(title));

      // Sharer already has the canonical scene in their editor — skip the
      // re-import (which would call resetCurrentHistory and wipe undo).
      applySharedProjectMeta(payload);
      connectToSharedProject(payload);
    },
    [applySharedProjectMeta, connectToSharedProject, editorAppRef]
  );

  const resyncProject = useCallback(async () => {
    const projectId = latestStateRef.current.projectId;

    if (!projectId || resyncingRef.current) {
      return;
    }

    resyncingRef.current = true;

    try {
      const payload = await loadSharedProject(projectId);

      // MVP conflict recovery is intentionally conservative: reload the latest
      // state and clear unconfirmed commits instead of trying to merge divergent
      // local edits against the new version.
      pendingQueueRef.current.clear();
      updatePendingCount();
      await applySharedProjectState(payload);
    } finally {
      resyncingRef.current = false;
    }
  }, [applySharedProjectState, updatePendingCount]);

  async function handleAppliedOperation(applied: AppliedProjectOperation) {
    if (applied.operation.clientId === clientId) {
      pendingQueueRef.current.confirm(applied.operation.clientOperationId);
      updatePendingCount();
    } else if (editorAppRef.current) {
      // A remote op's patch is computed against the version right before it
      // (applied.version - 1). If our local version isn't that, we've missed
      // an op — applying this patch to our stale base would corrupt the scene.
      // Resync from the server (authoritative) instead.
      const localVersion = latestStateRef.current.currentVersion ?? 0;
      const expectedBase = applied.version - 1;

      if (localVersion !== expectedBase) {
        await resyncProject();
        return;
      }

      try {
        const assets = await fetchSharedProjectAssets(applied.operation.assetReferences);

        isApplyingRemoteRef.current = true;
        const appliedManifest = await applyOperationToScene(
          editorAppRef.current,
          applied.operation,
          assets,
          lastSyncedSceneRef.current
        );
        if (appliedManifest) {
          lastSyncedSceneRef.current = appliedManifest;
        }
        onLayersChange(editorAppRef.current.getLayerSummaries());
      } catch (error) {
        // Patch couldn't apply to our local base (drift) — pull the
        // authoritative scene from the server to self-heal.
        isApplyingRemoteRef.current = false;
        await resyncProject();
        return;
      } finally {
        isApplyingRemoteRef.current = false;
      }
    }

    if (applied.version > nextBaseVersionRef.current) {
      nextBaseVersionRef.current = applied.version;
    }

    setState((currentState) => ({
      ...currentState,
      currentVersion: applied.version,
      error: null
    }));
  }

  async function handleProjectError(error: ProjectErrorPayload) {
    setState((currentState) => ({
      ...currentState,
      error: error.message
    }));

    if (error.code === "version_conflict") {
      await resyncProject();
    }
  }

  const handleLocalEditorAction = useCallback(
    (action: SharedEditorAction) => {
      const editorApp = editorAppRef.current;
      const currentState = latestStateRef.current;

      if (
        !editorApp ||
        isApplyingRemoteRef.current ||
        currentState.mode !== "shared" ||
        !currentState.projectId ||
        !currentState.capabilities.canEdit ||
        resyncingRef.current
      ) {
        return;
      }

      // Capture the projectId at enqueue time. We re-check the live state
      // when the chained task actually runs in case the user switched away.
      const projectId = currentState.projectId;

      // Commits are serialised through the chain, so only one task runs at a
      // time. We compute baseVersion INSIDE the task (not synchronously here)
      // so that we only consume a version number for commits that actually
      // carry a change — selection-only / no-op actions are dropped.
      commitChainRef.current = commitChainRef.current.then(async () => {
        const editorAppNow = editorAppRef.current;
        const stateNow = latestStateRef.current;
        if (
          !editorAppNow ||
          stateNow.mode !== "shared" ||
          stateNow.projectId !== projectId ||
          resyncingRef.current
        ) {
          return;
        }

        try {
          const previousScene = lastSyncedSceneRef.current;
          const confirmedVersion = stateNow.currentVersion ?? 0;
          const baseVersion = Math.max(nextBaseVersionRef.current, confirmedVersion);

          const preparedOperation = await createOperationFromEditorAction({
            action,
            alreadyUploadedAssetPaths: uploadedAssetPathsRef.current,
            clientId,
            editorApp: editorAppNow,
            phase: "commit",
            previousScene,
            projectId,
            projectVersion: baseVersion
          });

          // No actual document change (e.g. a selection-only action, which is
          // stripped from the synced scene) — don't burn a version or send.
          const op = preparedOperation.operation;
          const hasChange = Boolean(op.scene) || (op.scenePatch?.length ?? 0) > 0;
          if (!hasChange) {
            return;
          }

          nextBaseVersionRef.current = baseVersion + 1;
          // Update the baseline immediately so the NEXT commit (already queued
          // behind us) diffs against this manifest and not the stale one.
          lastSyncedSceneRef.current = preparedOperation.manifest;

          const operation = await prepareOperationForSocket(preparedOperation);

          pendingQueueRef.current.add(operation);
          updatePendingCount();
          clientRef.current?.sendCommit(operation);
        } catch (error) {
          setState((cur) => ({
            ...cur,
            error: error instanceof Error ? error.message : "Unable to prepare shared edit."
          }));
        }
      });
    },
    [clientId, editorAppRef, prepareOperationForSocket, updatePendingCount]
  );

  const sendPreviewFromCurrentScene = useCallback(
    async (tool: string) => {
      const editorApp = editorAppRef.current;
      const currentState = latestStateRef.current;

      if (
        !editorApp ||
        isApplyingRemoteRef.current ||
        currentState.mode !== "shared" ||
        !currentState.projectId ||
        !currentState.capabilities.canEdit ||
        !clientRef.current?.isConnected
      ) {
        return;
      }

      try {
        const preparedOperation = await createPreviewOperationFromEditorScene({
          alreadyUploadedAssetPaths: uploadedAssetPathsRef.current,
          clientId,
          editorApp,
          previousScene: lastSyncedSceneRef.current,
          projectId: currentState.projectId,
          projectVersion: currentState.currentVersion ?? 0,
          tool
        });
        const operation = await prepareOperationForSocket(preparedOperation);

        clientRef.current.sendPreview(operation);
      } catch (error) {
        setState((currentState) => ({
          ...currentState,
          error: error instanceof Error ? error.message : "Unable to prepare shared preview."
        }));
      }
    },
    [clientId, editorAppRef, prepareOperationForSocket]
  );

  const sendPresenceCursor = useCallback((cursor: { x: number; y: number } | null, tool: string) => {
    const currentState = latestStateRef.current;

    if (currentState.mode !== "shared" || !currentState.projectId || !clientRef.current?.isConnected) {
      return;
    }

    clientRef.current.sendPresence(cursor, tool);
  }, []);

  useEffect(() => {
    if (!request || handledRequestIdRef.current === request.id) {
      return;
    }

    handledRequestIdRef.current = request.id;

    async function handleRequest() {
      if (!request) {
        return;
      }

      try {
        if (request.type === "share-local") {
          await shareLocalProject(request.title);
        } else if (request.type === "open-shared") {
          await loadAndJoinSharedProject(request.projectId);
        } else if (request.type === "switch-local") {
          clientRef.current?.disconnect();
          pendingQueueRef.current.clear();
          uploadedAssetPathsRef.current.clear();
          setState(initialState);
        } else if (request.type === "download-webster") {
          const projectId = latestStateRef.current.projectId;

          if (!projectId) {
            throw new Error("Open a shared project before downloading it.");
          }

          const blob = await downloadSharedProjectFile(projectId);

          downloadBlob(blob, getWebsterFilename(latestStateRef.current.projectName ?? activeDocumentTitle));
        } else if (request.type === "create-snapshot") {
          const projectId = latestStateRef.current.projectId;

          if (!projectId) {
            throw new Error("Open a shared project before creating a snapshot.");
          }

          await createProjectSnapshot({ message: request.message, projectId });
          const { snapshots } = await listProjectSnapshots(projectId);

          setState((currentState) => ({
            ...currentState,
            snapshots
          }));
        } else if (request.type === "restore-snapshot") {
          const projectId = latestStateRef.current.projectId;

          if (!projectId) {
            throw new Error("Open a shared project before restoring a snapshot.");
          }

          const payload = await restoreProjectSnapshot(projectId, request.snapshotId);

          pendingQueueRef.current.clear();
          updatePendingCount();
          await applySharedProjectState(payload);
        } else if (request.type === "refresh-snapshots") {
          const projectId = latestStateRef.current.projectId;

          if (projectId) {
            const { snapshots } = await listProjectSnapshots(projectId);

            setState((currentState) => ({
              ...currentState,
              snapshots
            }));
          }
        }
      } catch (error) {
        setState((currentState) => ({
          ...currentState,
          error: error instanceof Error ? error.message : "Shared project request failed.",
          isBusy: false
        }));
      } finally {
        onRequestHandled(request.id);
      }
    }

    void handleRequest();
  }, [
    activeDocumentTitle,
    applySharedProjectState,
    loadAndJoinSharedProject,
    onRequestHandled,
    request,
    shareLocalProject,
    updatePendingCount
  ]);

  return {
    canEditSharedProject: state.mode === "local" || state.capabilities.canEdit,
    handleLocalEditorAction,
    sendPresenceCursor,
    sendPreviewFromCurrentScene,
    state
  };
}

function getOrCreateClientId() {
  const storageKey = "webster.collaboration.clientId";
  const existingId = localStorage.getItem(storageKey);

  if (existingId) {
    return existingId;
  }

  const nextId = crypto.randomUUID();

  localStorage.setItem(storageKey, nextId);

  return nextId;
}

function getWebsterFilename(title: string) {
  const safeTitle = (title.trim() || "shared-project").replace(/[<>:"/\\|?*\u0000-\u001f]/gu, "-");

  return safeTitle.toLowerCase().endsWith(".webster") ? safeTitle : `${safeTitle}.webster`;
}

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");

  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}
