import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { MutableRefObject } from "react";
import type {
  AppliedProjectOperation,
  ProjectErrorPayload,
  ProjectOperation,
  ProjectRole,
  ProjectRoleCapabilities,
  SharedProjectAssetReference,
  SharedProjectLoadResponse,
  SharedProjectPresence,
  SharedProjectSnapshotSummary
} from "@webster/shared";
import { getProjectRoleCapabilities } from "@webster/shared";
import type {
  EditorApp,
  LayerCropPreviewPayload,
  LayerFilterPreviewPayload,
  LayerTransformPreviewPayload
} from "../app/EditorApp";
import type { SharedEditorAction } from "../app/history/SharedEditorAction";
import type { DrawPreviewPayload } from "../tools/drawing/DrawingTool";
import type { MaskBrushPreviewPayload } from "../tools/mask-brush/MaskBrushTool";
import type { SerializedScene } from "../scene/Scene";
import {
  CollaborationClient,
  type CollaborationConnectionStatus
} from "./CollaborationClient";
import { PendingOperationsQueue } from "./PendingOperationsQueue";
import {
  applyMaskSnapshotFallback,
  applyOperationToScene,
  applyScenePatch,
  computeSceneDiff,
  dedupeManifestLayers,
  createOperationFromEditorAction,
  createPreviewOperationFromEditorScene,
  createRealtimePreviewOperation
} from "./operations";
import type { CollaborationPreviewPointer } from "./operations";
import {
  createProjectSnapshot,
  downloadSharedProjectFile,
  fetchSharedProjectAssets,
  getAccessToken,
  getCurrentUser,
  getSharedProjectWebSocketUrl,
  listProjectSnapshots,
  loadSharedProject,
  restoreProjectSnapshot,
  saveSharedProject,
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
  const currentUserIdRef = useRef<string | null>(null);

  useEffect(() => {
    getCurrentUser().then((u) => { currentUserIdRef.current = u.id; }).catch(() => {});
  }, []);
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
  // Confirmed server state — updated only on operation:applied, never by
  // optimistic local commits. Used as the base when replaying pending ops
  // on top of an incoming remote operation.
  const serverBaseSceneRef = useRef<import("@webster/shared").WebsterProjectManifest | null>(null);
  // Commits are serialised through this chain so two rapid edits can't both
  // read the same baseVersion / previousScene during their `await` window
  // and ship inconsistent patches.
  const commitChainRef = useRef<Promise<unknown>>(Promise.resolve());
  // Debounce timer for gesture actions (draw, transform, mask brush, shape).
  // Instead of committing one op per pointer-move point, we wait for inactivity
  // and send a single op capturing the full stroke/gesture result.
  const gestureDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // True while the debounce timeout is flushing — prevents re-entering the
  // debounce branch and creating an infinite timeout loop.
  const gestureFlushingRef = useRef(false);
  // The latest debounced gesture action, so we can flush it immediately on
  // pointer-up (before replaying deferred remote ops) instead of waiting out
  // the debounce — otherwise a deferred remote import could wipe the stroke
  // before it lands in the pending queue.
  const pendingGestureActionRef = useRef<SharedEditorAction | null>(null);
  const pendingQueueRef = useRef(new PendingOperationsQueue());
  const pendingQueueIdleWaitersRef = useRef<Array<() => void>>([]);
  // Stores the pure delta (diff from previousScene to manifest) for each
  // pending op, keyed by clientOperationId. Used during replay instead of
  // op.scene so the replay applies the op's change on top of the current
  // replayTarget rather than replacing it — prevents duplicate layer IDs.
  const pendingOpReplaysRef = useRef(new Map<string, import("@webster/shared").ProjectScenePatchOp[]>());
  const resyncingRef = useRef(false);
  const uploadedAssetPathsRef = useRef(new Set<string>());
  const knownAssetReferencesRef = useRef(new Map<string, SharedProjectAssetReference>());
  const knownAssetBlobsRef = useRef(new Map<string, Blob>());
  const previewSendInFlightRef = useRef(false);
  const previewApplyChainRef = useRef<Promise<unknown>>(Promise.resolve());
  const queuedPreviewRef = useRef<{
    pointer: CollaborationPreviewPointer | null;
    tool: string;
  } | null>(null);
  const remotePreviewRestoreTimerRef = useRef<number | null>(null);
  const remotePreviewEpochRef = useRef(0);
  const activeRemotePreviewRef = useRef<{
    clientId: string;
    epoch: number;
    operationId: string;
    version: number | null;
  } | null>(null);
  // Remote ops that arrived while the local user was mid-gesture. Importing a
  // remote scene during an active stroke orphans the layer the tool is drawing
  // into, so the user "can't do anything". We defer these and flush them when
  // the user lifts the pointer.
  const deferredRemoteOpsRef = useRef<AppliedProjectOperation[]>([]);
  // Serialise applied-operation handlers so a slow async handler (e.g. asset
  // fetch) doesn't let the next event run before the version counter advances.
  const applyChainRef = useRef<Promise<unknown>>(Promise.resolve());

  useEffect(() => {
    latestStateRef.current = state;
    onStateChange(state);
  }, [onStateChange, state]);

  useEffect(() => {
    return () => {
      if (remotePreviewRestoreTimerRef.current !== null) {
        window.clearTimeout(remotePreviewRestoreTimerRef.current);
      }
      clientRef.current?.disconnect();
    };
  }, []);

  const updatePendingCount = useCallback(() => {
    if (pendingQueueRef.current.size === 0 && pendingQueueIdleWaitersRef.current.length > 0) {
      const waiters = pendingQueueIdleWaitersRef.current;

      pendingQueueIdleWaitersRef.current = [];
      waiters.forEach((resolve) => resolve());
    }

    setState((currentState) => ({
      ...currentState,
      pendingCommitCount: pendingQueueRef.current.size
    }));
  }, []);

  const waitForPendingQueueIdle = useCallback((timeoutMs = 10000) => {
    if (pendingQueueRef.current.size === 0) {
      return Promise.resolve();
    }

    return new Promise<void>((resolve, reject) => {
      let didSettle = false;

      const finish = () => {
        if (didSettle) {
          return;
        }

        didSettle = true;
        window.clearTimeout(timeoutId);
        resolve();
      };
      const timeoutId = window.setTimeout(() => {
        if (didSettle) {
          return;
        }

        didSettle = true;
        pendingQueueIdleWaitersRef.current =
          pendingQueueIdleWaitersRef.current.filter((waiter) => waiter !== finish);
        reject(new Error("Realtime edits are still syncing. Try saving again in a moment."));
      }, timeoutMs);

      pendingQueueIdleWaitersRef.current.push(finish);
    });
  }, []);

  const rememberUploadedAssets = useCallback((assets: Array<{ assetPath: string }> = []) => {
    for (const asset of assets) {
      uploadedAssetPathsRef.current.add(asset.assetPath);
    }
  }, []);

  const rememberAssetReferences = useCallback((assets: SharedProjectAssetReference[] = []) => {
    for (const asset of assets) {
      knownAssetReferencesRef.current.set(asset.assetPath, asset);
    }
  }, []);

  const fetchAssetsForProject = useCallback(
    async (projectId: string, references: SharedProjectAssetReference[] = []) => {
      rememberAssetReferences(references);

      const missingReferences = references.filter((asset) => {
        const cacheKey = getAssetCacheKey(projectId, asset.assetPath);

        return !knownAssetBlobsRef.current.has(cacheKey);
      });
      const fetchedAssets = await fetchSharedProjectAssets(missingReferences);

      for (const asset of missingReferences) {
        const blob = fetchedAssets.get(asset.assetPath) ?? (asset.assetId ? fetchedAssets.get(asset.assetId) : undefined);

        if (blob) {
          knownAssetBlobsRef.current.set(getAssetCacheKey(projectId, asset.assetPath), blob);
        }
      }

      const assets = new Map<string, Blob>();
      for (const asset of references) {
        const blob = knownAssetBlobsRef.current.get(getAssetCacheKey(projectId, asset.assetPath));

        if (!blob) {
          continue;
        }

        assets.set(asset.assetPath, blob);
        if (asset.assetId) {
          assets.set(asset.assetId, blob);
        }
      }

      return assets;
    },
    [rememberAssetReferences]
  );

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

      const operation = {
        ...prepared.operation,
        assetReferences: [...referencesByPath.values()]
      };

      rememberAssetReferences(operation.assetReferences);

      return operation;
    },
    [rememberAssetReferences, rememberUploadedAssets]
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
        const assets = await fetchAssetsForProject(payload.projectId, payload.assets);

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
    [activeDocumentTitle, editorAppRef, fetchAssetsForProject, onDocumentLoaded, onLayersChange]
  );

  const applySharedProjectMeta = useCallback(
    (payload: SharedProjectLoadResponse, updateSceneRefs = true) => {
      const capabilities = getProjectRoleCapabilities(payload.role, payload.permissions);

      if (updateSceneRefs) {
        // Resync the optimistic baseVersion counter to the server's truth.
        nextBaseVersionRef.current = payload.currentVersion;
        // The server's snapshot IS our new baseline — next commit diffs against it.
        lastSyncedSceneRef.current = payload.snapshot ?? null;
        serverBaseSceneRef.current = payload.snapshot ?? null;
      }
      rememberUploadedAssets(payload.assets);
      rememberAssetReferences(payload.assets);
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
    [rememberAssetReferences, rememberUploadedAssets]
  );

  const applySharedProjectState = useCallback(
    async (payload: SharedProjectLoadResponse) => {
      await importSharedState(payload);
      applySharedProjectMeta(payload);
    },
    [applySharedProjectMeta, importSharedState]
  );

  const clearRemotePreviewTimer = useCallback(() => {
    if (remotePreviewRestoreTimerRef.current !== null) {
      window.clearTimeout(remotePreviewRestoreTimerRef.current);
      remotePreviewRestoreTimerRef.current = null;
    }
  }, []);

  const restoreCommittedSceneAfterPreview = useCallback(async (epoch?: number) => {
    const editorApp = editorAppRef.current;
    const currentState = latestStateRef.current;
    const activePreview = activeRemotePreviewRef.current;
    const manifest = lastSyncedSceneRef.current ?? serverBaseSceneRef.current;

    clearRemotePreviewTimer();

    if (
      !editorApp ||
      currentState.mode !== "shared" ||
      !currentState.projectId ||
      !manifest ||
      (epoch !== undefined && activePreview?.epoch !== epoch)
    ) {
      return;
    }

    const restoreVersion = currentState.currentVersion;
    const references = [...knownAssetReferencesRef.current.values()];
    const assets = await fetchAssetsForProject(currentState.projectId, references);

    if (
      (epoch !== undefined && activeRemotePreviewRef.current?.epoch !== epoch) ||
      latestStateRef.current.currentVersion !== restoreVersion
    ) {
      return;
    }

    isApplyingRemoteRef.current = true;
    try {
      await editorApp.importSerializedScene(manifest as unknown as SerializedScene, assets, {
        historyLabel: "Shared project",
        preserveHistory: true
      });
      onLayersChange(editorApp.getLayerSummaries());

      if (epoch === undefined || activeRemotePreviewRef.current?.epoch === epoch) {
        activeRemotePreviewRef.current = null;
      }
    } finally {
      isApplyingRemoteRef.current = false;
    }
  }, [clearRemotePreviewTimer, editorAppRef, fetchAssetsForProject, onLayersChange]);

  const scheduleRemotePreviewRestore = useCallback((epoch: number, delayMs = 900) => {
    clearRemotePreviewTimer();
    remotePreviewRestoreTimerRef.current = window.setTimeout(() => {
      previewApplyChainRef.current = previewApplyChainRef.current
        .then(() => restoreCommittedSceneAfterPreview(epoch))
        .catch(() => undefined);
    }, delayMs);
  }, [clearRemotePreviewTimer, restoreCommittedSceneAfterPreview]);

  const markRemotePreviewActive = useCallback(
    (operation: ProjectOperation, restoreDelayMs?: number) => {
      const epoch = remotePreviewEpochRef.current + 1;

      remotePreviewEpochRef.current = epoch;
      activeRemotePreviewRef.current = {
        clientId: operation.clientId,
        epoch,
        operationId: operation.clientOperationId,
        version: latestStateRef.current.currentVersion
      };
      scheduleRemotePreviewRestore(epoch, restoreDelayMs);
    },
    [scheduleRemotePreviewRestore]
  );

  const invalidateRemotePreview = useCallback(() => {
    remotePreviewEpochRef.current += 1;
    clearRemotePreviewTimer();
    activeRemotePreviewRef.current = null;
  }, [clearRemotePreviewTimer]);

  const applyRemotePreview = useCallback(
    (operation: ProjectOperation) => {
      previewApplyChainRef.current = previewApplyChainRef.current
        .then(async () => {
          const editorApp = editorAppRef.current;
          const currentState = latestStateRef.current;

          if (
            !editorApp ||
            operation.clientId === clientId ||
            operation.phase !== "preview" ||
            currentState.mode !== "shared" ||
            currentState.projectId !== operation.projectId ||
            (currentState.currentVersion !== null &&
              operation.baseVersion < currentState.currentVersion) ||
            resyncingRef.current ||
            editorApp.isInteracting() ||
            pendingQueueRef.current.size > 0
          ) {
            return;
          }

          if (isMaskBrushPreviewPayload(operation.payload)) {
            if (editorApp.applyRemoteMaskBrushPreview(operation.payload)) {
              markRemotePreviewActive(operation, 12000);
              onLayersChange(editorApp.getLayerSummaries());
            }
            return;
          }

          if (isDrawPreviewPayload(operation.payload)) {
            if (editorApp.applyRemoteDrawPreview(operation.payload)) {
              markRemotePreviewActive(operation, 12000);
              onLayersChange(editorApp.getLayerSummaries());
            }
            return;
          }

          if (isLayerFilterPreviewPayload(operation.payload)) {
            if (editorApp.applyRemoteLayerFilterPreview(operation.payload)) {
              markRemotePreviewActive(operation, 3000);
              onLayersChange(editorApp.getLayerSummaries());
            }
            return;
          }

          if (isLayerCropPreviewPayload(operation.payload)) {
            if (editorApp.applyRemoteLayerCropPreview(operation.payload)) {
              markRemotePreviewActive(operation, 12000);
              onLayersChange(editorApp.getLayerSummaries());
            }
            return;
          }

          if (isLayerTransformPreviewPayload(operation.payload)) {
            if (editorApp.applyRemoteLayerTransformPreview(operation.payload)) {
              markRemotePreviewActive(operation, 12000);
              onLayersChange(editorApp.getLayerSummaries());
            }
            return;
          }

          let previewManifest: import("@webster/shared").WebsterProjectManifest | null = null;
          if (operation.scenePatch?.length) {
            const baseManifest = serverBaseSceneRef.current ?? lastSyncedSceneRef.current;

            if (!baseManifest && !operation.scene) {
              return;
            }

            if (baseManifest) {
              try {
                previewManifest = applyScenePatch(baseManifest, operation.scenePatch);
              } catch {
                previewManifest = operation.scene ?? null;
              }
            } else {
              previewManifest = operation.scene ?? null;
            }
          } else if (operation.scene) {
            previewManifest = operation.scene;
          }

          if (!previewManifest) {
            return;
          }

          previewManifest = dedupeManifestLayers(previewManifest);
          const assets = await fetchAssetsForProject(
            operation.projectId,
            operation.assetReferences ?? []
          );

          isApplyingRemoteRef.current = true;
          try {
            await editorApp.importSerializedScene(
              previewManifest as unknown as SerializedScene,
              assets,
              { historyLabel: "Remote preview", preserveHistory: true }
            );
            markRemotePreviewActive(operation);
            onLayersChange(editorApp.getLayerSummaries());
          } finally {
            isApplyingRemoteRef.current = false;
          }
        })
        .catch(() => undefined);
    },
    [
      clientId,
      editorAppRef,
      fetchAssetsForProject,
      markRemotePreviewActive,
      onLayersChange,
    ]
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
        onAppliedOperation: (applied) => {
          applyChainRef.current = applyChainRef.current
            .then(() => {
              // Skip processing during resync — the resync will import the
              // authoritative state and reset all refs itself.
              if (resyncingRef.current) return;
              return handleAppliedOperation(applied);
            })
            .catch(() => {});
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
        onPreviewOperation: (operation) => {
          applyRemotePreview(operation);
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
          // If already showing this project, only refresh meta (users, version,
          // snapshots) without re-importing the full scene — avoids a double
          // import that can drop the presence list on reconnect.
          if (latestStateRef.current.projectId === projectState.projectId &&
              latestStateRef.current.mode === "shared") {
            const missedRemoteState =
              projectState.currentVersion !== latestStateRef.current.currentVersion;

            if (missedRemoteState && pendingQueueRef.current.size === 0) {
              await applySharedProjectState(projectState);
              return;
            }

            // Reconnect — only refresh presence/version/snapshots, do NOT reset
            // lastSyncedSceneRef or serverBaseSceneRef. Resetting them to the
            // server snapshot without importing it into the editor would make
            // the next commit diff against the wrong base, producing corrupt patches.
            applySharedProjectMeta(projectState, false);
          } else {
            await applySharedProjectState(projectState);
          }
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
    [applyRemotePreview, applySharedProjectState, clientId, editorAppRef, onLayersChange]
  );

  const loadAndJoinSharedProject = useCallback(
    async (projectId: string) => {
      setState((currentState) => ({
        ...currentState,
        error: null,
        isBusy: true
      }));

      invalidateRemotePreview();
      pendingQueueRef.current.clear();
      pendingOpReplaysRef.current.clear();
      uploadedAssetPathsRef.current.clear();
      knownAssetReferencesRef.current.clear();
      knownAssetBlobsRef.current.clear();

      const payload = await loadSharedProject(projectId);

      await applySharedProjectState(payload);
      connectToSharedProject(payload);
    },
    [applySharedProjectState, connectToSharedProject, invalidateRemotePreview]
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

      invalidateRemotePreview();
      pendingQueueRef.current.clear();
      pendingOpReplaysRef.current.clear();
      uploadedAssetPathsRef.current.clear();
      knownAssetReferencesRef.current.clear();
      knownAssetBlobsRef.current.clear();

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
    [applySharedProjectMeta, connectToSharedProject, editorAppRef, invalidateRemotePreview]
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
      pendingOpReplaysRef.current.clear();
      updatePendingCount();
      await applySharedProjectState(payload);
    } finally {
      resyncingRef.current = false;
    }
  }, [applySharedProjectState, updatePendingCount]);

  async function handleAppliedOperation(applied: AppliedProjectOperation) {
    const isOwnOp = applied.operation.clientId === clientId;
    const hadRemotePreview = activeRemotePreviewRef.current !== null;

    invalidateRemotePreview();
    await previewApplyChainRef.current.catch(() => undefined);
    rememberAssetReferences(applied.operation.assetReferences);

    if (isOwnOp) {
      pendingQueueRef.current.confirm(applied.operation.clientOperationId);
      pendingOpReplaysRef.current.delete(applied.operation.clientOperationId);
      updatePendingCount();

      // Advance server base to include our confirmed op. This is an
      // approximation — if the server rebased our op the result may differ
      // slightly, but it self-heals on the next remote op + replay cycle.
      if (serverBaseSceneRef.current) {
        const op = applied.operation;
        if (op.scenePatch?.length) {
          try {
            serverBaseSceneRef.current = applyScenePatch(serverBaseSceneRef.current, op.scenePatch);
          } catch {
            if (op.scene) {
              serverBaseSceneRef.current = op.scene;
            } else {
              serverBaseSceneRef.current =
                applyMaskSnapshotFallback(serverBaseSceneRef.current, op) ??
                serverBaseSceneRef.current;
            }
          }
        } else if (op.scene) {
          serverBaseSceneRef.current = op.scene;
        }
      }

      if (hadRemotePreview) {
        await restoreCommittedSceneAfterPreview().catch(() => undefined);
      }
    } else if (editorAppRef.current) {
      // If the local user is mid-gesture, importing now would orphan the layer
      // their tool is drawing into. Defer this op (in order) and flush when they
      // lift the pointer.
      if (editorAppRef.current.isInteracting()) {
        deferredRemoteOpsRef.current.push(applied);
        return;
      }

      const remoteOp = applied.operation;

      // 1. Compute new confirmed server base.
      let newServerBase: import("@webster/shared").WebsterProjectManifest | null = null;
      if (remoteOp.scenePatch?.length) {
        if (!serverBaseSceneRef.current && !remoteOp.scene) {
          await resyncProject();
          return;
        }

        if (serverBaseSceneRef.current) {
          try {
            newServerBase = applyScenePatch(serverBaseSceneRef.current, remoteOp.scenePatch);
          } catch {
            if (remoteOp.scene) {
              newServerBase = remoteOp.scene;
            } else {
              newServerBase = applyMaskSnapshotFallback(serverBaseSceneRef.current, remoteOp);

              if (!newServerBase) {
                await resyncProject();
                return;
              }
            }
          }
        } else {
          newServerBase = remoteOp.scene ?? null;
        }
      } else if (remoteOp.scene) {
        newServerBase = remoteOp.scene;
      }

      if (newServerBase) {
        serverBaseSceneRef.current = newServerBase;

        // Always wait for any in-flight commit to finish before replaying.
        // A just-finished gesture may be queued on the commit chain but not yet
        // in pendingQueue, so a size check is not enough — without this the
        // import could run first and wipe the stroke. When nothing is in flight
        // commitChainRef is already resolved, so this is effectively free.
        await commitChainRef.current;

        // 2. Replay all unconfirmed local ops on top of the new server base so
        // the user's in-progress strokes / edits are not wiped by the remote op.
        // Always use the stored replayPatch (pure delta) rather than op.scene to
        // avoid replacing replayTarget with a stale full-scene snapshot, which
        // would cause the op's layers to be added again on the next replay cycle
        // and produce duplicate layer keys.
        let replayTarget: import("@webster/shared").WebsterProjectManifest = newServerBase;
        for (const pendingOp of pendingQueueRef.current.list()) {
          const replayPatch = pendingOpReplaysRef.current.get(pendingOp.clientOperationId);
          const patchToApply = replayPatch ?? pendingOp.scenePatch;
          if (patchToApply?.length) {
            try {
              replayTarget = applyScenePatch(replayTarget, patchToApply);
            } catch {
              // Patch no longer applies cleanly — skip in replay.
            }
          }
        }

        // Replay patches were diffed against the optimistic baseline, not against
        // newServerBase, so merging them can produce duplicate layer ids. Enforce
        // the uniqueness invariant before import to avoid crashing the layer list.
        replayTarget = dedupeManifestLayers(replayTarget);

        // 3. Single import of the final replayed state.
        const assets = await fetchAssetsForProject(
          remoteOp.projectId,
          remoteOp.assetReferences ?? []
        );
        isApplyingRemoteRef.current = true;
        try {
          await editorAppRef.current.importSerializedScene(
            replayTarget as unknown as import("../scene/Scene").SerializedScene,
            assets,
            { historyLabel: "Remote update", preserveHistory: true }
          );
          lastSyncedSceneRef.current = replayTarget;
          onLayersChange(editorAppRef.current.getLayerSummaries());
        } finally {
          isApplyingRemoteRef.current = false;
        }
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
        currentState.mode !== "shared" ||
        !currentState.projectId ||
        !currentState.capabilities.canEdit ||
        resyncingRef.current
      ) {
        return;
      }

      // Gesture actions (draw strokes, transforms, mask brush) fire on every
      // pointer move. Debounce them so we send one op per completed gesture
      // instead of one per intermediate point. gestureFlushingRef prevents
      // the timeout callback from re-entering this branch (infinite loop).
      if (action.kind === "gesture" && !gestureFlushingRef.current) {
        if (gestureDebounceRef.current) {
          clearTimeout(gestureDebounceRef.current);
        }
        pendingGestureActionRef.current = action;
        gestureDebounceRef.current = setTimeout(() => {
          gestureDebounceRef.current = null;
          pendingGestureActionRef.current = null;
          gestureFlushingRef.current = true;
          handleLocalEditorAction(action);
          gestureFlushingRef.current = false;
        }, 150);
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

          // Store the pure delta for this op so replay can apply just this
          // change on top of any replayTarget instead of replacing it with
          // op.scene (which would lose concurrent remote changes).
          if (previousScene) {
            const replayPatch = computeSceneDiff(previousScene, preparedOperation.manifest);
            if (replayPatch.length > 0) {
              pendingOpReplaysRef.current.set(operation.clientOperationId, replayPatch);
            }
          }

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

  // Called when the local user lifts the pointer. First flushes the user's own
  // debounced gesture commit (so the finished stroke lands in the pending queue
  // and survives the replay), then replays any remote ops that were deferred
  // during the gesture, in arrival order, through the apply chain.
  const flushDeferredRemoteOps = useCallback(() => {
    if (pendingGestureActionRef.current) {
      const action = pendingGestureActionRef.current;
      if (gestureDebounceRef.current) {
        clearTimeout(gestureDebounceRef.current);
        gestureDebounceRef.current = null;
      }
      pendingGestureActionRef.current = null;
      gestureFlushingRef.current = true;
      handleLocalEditorAction(action);
      gestureFlushingRef.current = false;
    }

    if (deferredRemoteOpsRef.current.length === 0) {
      return;
    }
    const deferred = deferredRemoteOpsRef.current;
    deferredRemoteOpsRef.current = [];
    for (const applied of deferred) {
      applyChainRef.current = applyChainRef.current
        .then(() => {
          if (resyncingRef.current) return;
          return handleAppliedOperation(applied);
        })
        .catch(() => {});
    }
  }, [handleLocalEditorAction]);

  const sendPreviewFromCurrentScene = useCallback(
    async (tool: string, pointer: CollaborationPreviewPointer | null = null) => {
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

      const realtimePayload = editorApp.getRealtimePreviewPayload(tool);

      if (realtimePayload) {
        clientRef.current.sendPreview(
          createRealtimePreviewOperation({
            clientId,
            payload: realtimePayload as unknown as Record<string, unknown>,
            projectId: currentState.projectId,
            projectVersion: currentState.currentVersion ?? 0,
            tool
          })
        );
        return;
      }

      if (previewSendInFlightRef.current) {
        queuedPreviewRef.current = { pointer, tool };
        return;
      }

      previewSendInFlightRef.current = true;
      try {
        const preparedOperation = await createPreviewOperationFromEditorScene({
          alreadyUploadedAssetPaths: uploadedAssetPathsRef.current,
          clientId,
          editorApp,
          pointer,
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
      } finally {
        previewSendInFlightRef.current = false;
        const queued = queuedPreviewRef.current;

        queuedPreviewRef.current = null;
        if (queued) {
          window.setTimeout(() => {
            void sendPreviewFromCurrentScene(queued.tool, queued.pointer);
          }, 0);
        }
      }
    },
    [clientId, editorAppRef, prepareOperationForSocket]
  );

  const sendLayerFilterPreview = useCallback(
    (layerIds: string[]) => {
      const editorApp = editorAppRef.current;
      const currentState = latestStateRef.current;

      if (
        !editorApp ||
        layerIds.length === 0 ||
        isApplyingRemoteRef.current ||
        currentState.mode !== "shared" ||
        !currentState.projectId ||
        !currentState.capabilities.canEdit ||
        !clientRef.current?.isConnected
      ) {
        return;
      }

      const realtimePayload = editorApp.getLayerFilterPreviewPayload(layerIds);

      if (!realtimePayload) {
        return;
      }

      clientRef.current.sendPreview(
        createRealtimePreviewOperation({
          clientId,
          payload: realtimePayload as unknown as Record<string, unknown>,
          projectId: currentState.projectId,
          projectVersion: currentState.currentVersion ?? 0,
          tool: realtimePayload.tool
        })
      );
    },
    [clientId, editorAppRef]
  );

  const sendPresenceCursor = useCallback((cursor: { x: number; y: number } | null, tool: string) => {
    const currentState = latestStateRef.current;

    if (currentState.mode !== "shared" || !currentState.projectId || !clientRef.current?.isConnected) {
      return;
    }

    clientRef.current.sendPresence(cursor, tool);
  }, []);

  const saveCurrentSharedProject = useCallback(async () => {
    const editorApp = editorAppRef.current;
    const currentState = latestStateRef.current;

    if (!editorApp || currentState.mode !== "shared" || !currentState.projectId) {
      throw new Error("Open a shared project before saving to the cloud.");
    }

    if (!currentState.capabilities.canEdit) {
      throw new Error("You need editor access to save this shared project.");
    }

    await commitChainRef.current;
    await waitForPendingQueueIdle();

    const stateNow = latestStateRef.current;

    if (stateNow.mode !== "shared" || stateNow.projectId !== currentState.projectId) {
      throw new Error("The shared project changed before save completed.");
    }

    const baseVersion = stateNow.currentVersion ?? nextBaseVersionRef.current;
    const preparedOperation = await createOperationFromEditorAction({
      action: {
        id: crypto.randomUUID(),
        kind: "scene",
        label: "Cloud save",
        operation: "cloud-save",
        origin: "local",
        timestamp: Date.now()
      },
      alreadyUploadedAssetPaths: uploadedAssetPathsRef.current,
      clientId,
      editorApp,
      phase: "commit",
      previousScene: null,
      projectId: stateNow.projectId,
      projectVersion: baseVersion
    });
    const operation = await prepareOperationForSocket(preparedOperation);

    try {
      const payload = await saveSharedProject(stateNow.projectId, {
        assetReferences: operation.assetReferences,
        baseVersion,
        clientId,
        manifest: preparedOperation.manifest
      });

      lastSyncedSceneRef.current = payload.snapshot ?? preparedOperation.manifest;
      serverBaseSceneRef.current = payload.snapshot ?? preparedOperation.manifest;
      nextBaseVersionRef.current = payload.currentVersion;
      applySharedProjectMeta(payload);
    } catch (error) {
      await resyncProject();
      throw error;
    }
  }, [
    applySharedProjectMeta,
    clientId,
    editorAppRef,
    prepareOperationForSocket,
    resyncProject,
    waitForPendingQueueIdle
  ]);

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
          invalidateRemotePreview();
          clientRef.current?.disconnect();
          pendingQueueRef.current.clear();
          pendingOpReplaysRef.current.clear();
          uploadedAssetPathsRef.current.clear();
          knownAssetReferencesRef.current.clear();
          knownAssetBlobsRef.current.clear();
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
    invalidateRemotePreview,
    loadAndJoinSharedProject,
    onRequestHandled,
    request,
    shareLocalProject,
    updatePendingCount
  ]);

  return {
    canEditSharedProject: state.mode === "local" || state.capabilities.canEdit,
    currentUserIdRef,
    flushDeferredRemoteOps,
    handleLocalEditorAction,
    saveCurrentSharedProject,
    sendLayerFilterPreview,
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

function getAssetCacheKey(projectId: string, assetPath: string) {
  return `${projectId}:${assetPath}`;
}

function isMaskBrushPreviewPayload(value: unknown): value is MaskBrushPreviewPayload {
  if (!value || typeof value !== "object") {
    return false;
  }

  const payload = value as Partial<MaskBrushPreviewPayload>;

  return (
    payload.source === "mask-brush-preview" &&
    payload.tool === "Mask Brush" &&
    typeof payload.strokeId === "string" &&
    typeof payload.layerId === "string" &&
    typeof payload.maskWidth === "number" &&
    typeof payload.maskHeight === "number" &&
    (payload.pointOffset === undefined ||
      (typeof payload.pointOffset === "number" && Number.isFinite(payload.pointOffset))) &&
    Array.isArray(payload.points) &&
    payload.points.every(isMaskPoint) &&
    isMaskRadii(payload.radii) &&
    isMaskBrushOptions(payload.brush)
  );
}

function isLayerTransformPreviewPayload(
  value: unknown
): value is LayerTransformPreviewPayload {
  if (!value || typeof value !== "object") {
    return false;
  }

  const payload = value as Partial<LayerTransformPreviewPayload>;

  return (
    payload.source === "layer-transform-preview" &&
    typeof payload.tool === "string" &&
    Array.isArray(payload.layers) &&
    payload.layers.every(isLayerTransformPreviewLayer)
  );
}

function isLayerFilterPreviewPayload(value: unknown): value is LayerFilterPreviewPayload {
  if (!value || typeof value !== "object") {
    return false;
  }

  const payload = value as Partial<LayerFilterPreviewPayload>;

  return (
    payload.source === "filter-preview" &&
    payload.tool === "Filters" &&
    Array.isArray(payload.layers) &&
    payload.layers.every(isLayerFilterPreviewLayer)
  );
}

function isLayerCropPreviewPayload(value: unknown): value is LayerCropPreviewPayload {
  if (!value || typeof value !== "object") {
    return false;
  }

  const payload = value as Partial<LayerCropPreviewPayload>;

  return (
    payload.source === "layer-crop-preview" &&
    payload.tool === "Crop" &&
    Array.isArray(payload.layers) &&
    payload.layers.every(isLayerCropPreviewLayer)
  );
}

function isDrawPreviewPayload(value: unknown): value is DrawPreviewPayload {
  if (!value || typeof value !== "object") {
    return false;
  }

  const payload = value as Partial<DrawPreviewPayload>;

  return (
    payload.source === "draw-preview" &&
    payload.tool === "Draw" &&
    typeof payload.layerId === "string" &&
    typeof payload.layerIndex === "number" &&
    Number.isFinite(payload.layerIndex) &&
    (payload.mode === "draw" || payload.mode === "replace") &&
    typeof payload.pathIndex === "number" &&
    Number.isFinite(payload.pathIndex) &&
    (payload.pointOffset === undefined ||
      (typeof payload.pointOffset === "number" && Number.isFinite(payload.pointOffset))) &&
    Array.isArray(payload.points) &&
    payload.points.every(isPreviewPoint) &&
    (payload.mode !== "draw" || isDrawPreviewStrokeStyle(payload.style)) &&
    (payload.layer === null ||
      payload.layer === undefined ||
      (Boolean(payload.layer) &&
        typeof payload.layer === "object" &&
        (payload.layer as { id?: unknown }).id === payload.layerId &&
        (payload.layer as { type?: unknown }).type === "stroke"))
  );
}

function isDrawPreviewStrokeStyle(value: unknown) {
  if (!value || typeof value !== "object") {
    return false;
  }

  const style = value as {
    color?: unknown;
    selectionClip?: unknown;
    strokeStyle?: unknown;
    strokeWidth?: unknown;
  };

  return (
    isPreviewColor(style.color) &&
    (style.strokeStyle === "pencil" ||
      style.strokeStyle === "pen" ||
      style.strokeStyle === "brush" ||
      style.strokeStyle === "marker" ||
      style.strokeStyle === "highlighter") &&
    typeof style.strokeWidth === "number" &&
    Number.isFinite(style.strokeWidth)
  );
}

function isPreviewColor(value: unknown): value is [number, number, number, number] {
  return Array.isArray(value) && value.length === 4 && value.every(isFinitePreviewNumber);
}

function isLayerTransformPreviewLayer(
  value: unknown
): value is LayerTransformPreviewPayload["layers"][number] {
  if (!value || typeof value !== "object") {
    return false;
  }

  const layer = value as Partial<LayerTransformPreviewPayload["layers"][number]>;

  return (
    typeof layer.id === "string" &&
    isFinitePreviewNumber(layer.x) &&
    isFinitePreviewNumber(layer.y) &&
    isFinitePreviewNumber(layer.width) &&
    isFinitePreviewNumber(layer.height) &&
    isFinitePreviewNumber(layer.rotation) &&
    isFinitePreviewNumber(layer.scaleX) &&
    isFinitePreviewNumber(layer.scaleY) &&
    (layer.crop === null || isPreviewCrop(layer.crop)) &&
    (layer.imageGeometry === undefined || isPreviewImageGeometry(layer.imageGeometry))
  );
}

function isLayerFilterPreviewLayer(
  value: unknown
): value is LayerFilterPreviewPayload["layers"][number] {
  if (!value || typeof value !== "object") {
    return false;
  }

  const layer = value as Partial<LayerFilterPreviewPayload["layers"][number]>;

  return typeof layer.id === "string" && isPreviewLayerFilters(layer.filters);
}

function isLayerCropPreviewLayer(
  value: unknown
): value is LayerCropPreviewPayload["layers"][number] {
  if (!value || typeof value !== "object") {
    return false;
  }

  const layer = value as Partial<LayerCropPreviewPayload["layers"][number]>;

  return (
    typeof layer.id === "string" &&
    (layer.crop === null || isPreviewCrop(layer.crop)) &&
    (layer.imageGeometry === undefined || isPreviewImageGeometry(layer.imageGeometry))
  );
}

function isPreviewLayerFilters(value: unknown) {
  if (!value || typeof value !== "object") {
    return false;
  }

  const filters = value as Record<string, unknown>;

  return (
    isFinitePreviewNumber(filters.brightness) &&
    isFinitePreviewNumber(filters.blur) &&
    isFinitePreviewNumber(filters.contrast) &&
    isFinitePreviewNumber(filters.dropShadowBlur) &&
    isFinitePreviewNumber(filters.dropShadowOffsetX) &&
    isFinitePreviewNumber(filters.dropShadowOffsetY) &&
    isFinitePreviewNumber(filters.dropShadowOpacity) &&
    isFinitePreviewNumber(filters.grayscale) &&
    isFinitePreviewNumber(filters.hue) &&
    isFinitePreviewNumber(filters.invert) &&
    isFinitePreviewNumber(filters.saturation) &&
    isFinitePreviewNumber(filters.sepia) &&
    isFinitePreviewNumber(filters.shadow)
  );
}

function isPreviewCrop(value: unknown) {
  return Boolean(
    value &&
      typeof value === "object" &&
      isFinitePreviewNumber((value as { bottom?: unknown }).bottom) &&
      isFinitePreviewNumber((value as { left?: unknown }).left) &&
      isFinitePreviewNumber((value as { right?: unknown }).right) &&
      isFinitePreviewNumber((value as { top?: unknown }).top)
  );
}

function isPreviewImageGeometry(value: unknown) {
  if (!value || typeof value !== "object") {
    return false;
  }

  const geometry = value as {
    corners?: {
      bottomLeft?: unknown;
      bottomRight?: unknown;
      topLeft?: unknown;
      topRight?: unknown;
    };
    crop?: unknown;
  };

  return Boolean(
    geometry.corners &&
      isPreviewPoint(geometry.corners.bottomLeft) &&
      isPreviewPoint(geometry.corners.bottomRight) &&
      isPreviewPoint(geometry.corners.topLeft) &&
      isPreviewPoint(geometry.corners.topRight) &&
      isPreviewCrop(geometry.crop)
  );
}

function isPreviewPoint(value: unknown) {
  return Boolean(
    value &&
      typeof value === "object" &&
      isFinitePreviewNumber((value as { x?: unknown }).x) &&
      isFinitePreviewNumber((value as { y?: unknown }).y)
  );
}

function isFinitePreviewNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function isMaskPoint(value: unknown): value is { x: number; y: number } {
  return Boolean(
    value &&
      typeof value === "object" &&
      typeof (value as { x?: unknown }).x === "number" &&
      typeof (value as { y?: unknown }).y === "number"
  );
}

function isMaskRadii(value: unknown): value is { x: number; y: number } {
  return isMaskPoint(value);
}

function isMaskBrushOptions(value: unknown): value is MaskBrushPreviewPayload["brush"] {
  if (!value || typeof value !== "object") {
    return false;
  }

  const brush = value as { mode?: unknown; opacity?: unknown; size?: unknown };

  return (
    (brush.mode === "hide" || brush.mode === "reveal") &&
    typeof brush.opacity === "number" &&
    typeof brush.size === "number"
  );
}

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");

  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}
