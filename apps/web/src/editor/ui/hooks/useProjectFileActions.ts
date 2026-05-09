/** Hook that provides open/save actions for `.webster` project files. */
import { MutableRefObject, useCallback, useEffect, useRef } from "react";
import { EditorApp } from "../../app/EditorApp";
import type { EditorClipboardCommand } from "../../app/EditorApp";
import { useEditorKeyboardShortcuts } from "./useEditorKeyboardShortcuts";
import { saveProjectFile } from "../../projects/projectFiles";
import type { WebsterFileHandle } from "../../projects/projectFiles";
import type { ProjectPackageProgress } from "../../projects/ProjectPackage";
import {
  forgetRememberedProjectFileHandle,
  rememberProjectFileHandle
} from "../../projects/projectFileHandleStore";

type UseProjectFileActionsOptions = {
  activeDocumentId: string;
  activeDocumentTitle: string;
  canEditDocument: boolean;
  closedDocumentRequest: { id: number; tabId: string } | null;
  editorAppRef: MutableRefObject<EditorApp | null>;
  onLayersChange: (layers: ReturnType<EditorApp["getLayerSummaries"]>) => void;
  onProjectFileRequestHandled: (requestId: number) => void;
  onProjectSaveRequestHandled: (requestId: number) => void;
  onProjectFilePendingChange?: (state: ProjectFilePendingState | null) => void;
  onSaveStatusChange: (status: SaveStatus) => void;
  onSceneChange: () => void;
  onSelectTool: (tool: string) => void;
  projectFileRequest: {
    file: File;
    handle?: WebsterFileHandle | null;
    id: number;
    tabId: string;
  } | null;
  projectSaveRequest: { id: number; mode: "save" | "save-as" } | null;
  setWebglError: (error: string | null) => void;
};

export type SaveStatus = "idle" | "saving" | "saved" | "error";

export type ProjectFilePendingState = ProjectPackageProgress & {
  status: "complete" | "error" | "loading" | "saving";
};

export function useProjectFileActions({
  activeDocumentId,
  activeDocumentTitle,
  canEditDocument,
  closedDocumentRequest,
  editorAppRef,
  onLayersChange,
  onProjectFileRequestHandled,
  onProjectSaveRequestHandled,
  onProjectFilePendingChange,
  onSaveStatusChange,
  onSceneChange,
  onSelectTool,
  projectFileRequest,
  projectSaveRequest,
  setWebglError
}: UseProjectFileActionsOptions) {
  const projectFileHandleRef = useRef<WebsterFileHandle | null>(null);
  const projectFileHandlesRef = useRef(new Map<string, WebsterFileHandle | null>());
  const handledProjectFileRequestIdRef = useRef<number | null>(null);
  const handledProjectSaveRequestIdRef = useRef<number | null>(null);
  const saveStatusTimerRef = useRef<number | null>(null);

  const updateSaveStatus = useCallback(
    (status: SaveStatus) => {
      if (saveStatusTimerRef.current) {
        window.clearTimeout(saveStatusTimerRef.current);
        saveStatusTimerRef.current = null;
      }

      onSaveStatusChange(status);

      if (status === "saved" || status === "error") {
        saveStatusTimerRef.current = window.setTimeout(() => {
          onSaveStatusChange("idle");
          saveStatusTimerRef.current = null;
        }, 1800);
      }
    },
    [onSaveStatusChange]
  );

  const saveCurrentProject = useCallback(
    async (mode: "save" | "save-as" = "save") => {
      if (!editorAppRef.current) {
        return;
      }

      updateSaveStatus("saving");
      onProjectFilePendingChange?.({
        message: "Preparing project assets.",
        progress: 4,
        status: "saving",
        title: "Saving project..."
      });
      await waitForNextPaint();

      try {
        const activeHandleRef = {
          current: projectFileHandlesRef.current.get(activeDocumentId) ?? null
        };

        await saveProjectFile(
          editorAppRef.current,
          activeHandleRef,
          mode === "save-as",
          getProjectFilename(activeDocumentTitle),
          {
            onProgress: (state) =>
              onProjectFilePendingChange?.({
                ...state,
                status: "saving"
              })
          }
        );
        onProjectFilePendingChange?.({
          message: "Project saved.",
          progress: 100,
          status: "complete",
          title: "Save complete"
        });
        projectFileHandleRef.current = activeHandleRef.current;
        projectFileHandlesRef.current.set(activeDocumentId, activeHandleRef.current);
        updateSaveStatus("saved");
        setWebglError(null);
      } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError") {
          updateSaveStatus("idle");
          onProjectFilePendingChange?.(null);
          return;
        }

        updateSaveStatus("error");
        onProjectFilePendingChange?.({
          message: error instanceof Error ? error.message : "Unable to save project file.",
          progress: 100,
          status: "error",
          title: "Save failed"
        });
        setWebglError(error instanceof Error ? error.message : "Unable to save project file.");
      } finally {
        window.setTimeout(() => onProjectFilePendingChange?.(null), 500);
      }
    },
    [
      activeDocumentId,
      activeDocumentTitle,
      editorAppRef,
      onProjectFilePendingChange,
      setWebglError,
      updateSaveStatus
    ]
  );

  const runClipboardCommand = useCallback(
    async (command: EditorClipboardCommand) => {
      if (!editorAppRef.current) {
        return;
      }

      const result =
        command === "copy"
          ? await editorAppRef.current.copySelectedContent()
          : command === "cut"
            ? await editorAppRef.current.cutSelectedContent()
            : await editorAppRef.current.pasteClipboardContent();

      if (!result.didHandle) {
        return;
      }

      setWebglError(null);

      if (result.didChangeScene) {
        onLayersChange(editorAppRef.current.getLayerSummaries());
        onSceneChange();
      }
    },
    [editorAppRef, onLayersChange, onSceneChange, setWebglError]
  );

  useEffect(() => {
    return () => {
      if (saveStatusTimerRef.current) {
        window.clearTimeout(saveStatusTimerRef.current);
      }
    };
  }, []);

  useEditorKeyboardShortcuts({
    isTextEditingActive: () => editorAppRef.current?.hasActiveTextEdit() ?? false,
    onClearSelection: () => {
      if (!canEditDocument || !editorAppRef.current) {
        return;
      }

      if (editorAppRef.current.applySelectionCommand("clear")) {
        onLayersChange(editorAppRef.current.getLayerSummaries());
        onSceneChange();
        setWebglError(null);
      }
    },
    onCopy: () => runClipboardCommand("copy"),
    onCut: () => {
      if (canEditDocument) {
        return runClipboardCommand("cut");
      }
    },
    onDeleteSelectedLayer: () => {
      if (!canEditDocument || !editorAppRef.current) {
        return;
      }

      const layerId = editorAppRef.current.getSelectedLayerId();

      if (!layerId) {
        return;
      }

      if (editorAppRef.current.applyLayerCommand({ layerId, type: "delete" })) {
        onLayersChange(editorAppRef.current.getLayerSummaries());
        onSceneChange();
        setWebglError(null);
      }
    },
    onDuplicateSelectedLayer: () => {
      if (!canEditDocument || !editorAppRef.current) {
        return;
      }

      const layerId = editorAppRef.current.getSelectedLayerId();

      if (!layerId) {
        return;
      }

      if (editorAppRef.current.applyLayerCommand({ layerId, type: "duplicate" })) {
        onLayersChange(editorAppRef.current.getLayerSummaries());
        onSceneChange();
        setWebglError(null);
      }
    },
    onGroupSelectedLayers: () => {
      if (!canEditDocument || !editorAppRef.current) {
        return;
      }

      const layerIds = editorAppRef.current.getSelectedLayerIds();

      if (layerIds.length < 2) {
        return;
      }

      if (editorAppRef.current.applyLayerCommand({ layerIds, name: "Group", type: "group" })) {
        onLayersChange(editorAppRef.current.getLayerSummaries());
        onSceneChange();
        setWebglError(null);
      }
    },
    onNudgeSelectedLayer: (dx, dy) => {
      if (!canEditDocument || !editorAppRef.current) {
        return;
      }

      if (editorAppRef.current.nudgeSelectedLayer(dx, dy)) {
        onLayersChange(editorAppRef.current.getLayerSummaries());
        onSceneChange();
        setWebglError(null);
      }
    },
    onPaste: () => {
      if (canEditDocument) {
        return runClipboardCommand("paste");
      }
    },
    onSaveProject: () => saveCurrentProject("save"),
    onSelectTool: (tool) => {
      if (canEditDocument || tool === "Pan") {
        return onSelectTool(tool);
      }
    },
    onUndo: () => {
      if (!canEditDocument || !editorAppRef.current) {
        return;
      }

      if (editorAppRef.current.undo()) {
        onLayersChange(editorAppRef.current.getLayerSummaries());
        onSceneChange();
        setWebglError(null);
      }
    },
    onRedo: () => {
      if (!canEditDocument || !editorAppRef.current) {
        return;
      }

      if (editorAppRef.current.redo()) {
        onLayersChange(editorAppRef.current.getLayerSummaries());
        onSceneChange();
        setWebglError(null);
      }
    }
  });

  useEffect(() => {
    if (!closedDocumentRequest) {
      return;
    }

    projectFileHandlesRef.current.delete(closedDocumentRequest.tabId);

    if (closedDocumentRequest.tabId === activeDocumentId) {
      projectFileHandleRef.current = projectFileHandlesRef.current.get(activeDocumentId) ?? null;
    }
  }, [activeDocumentId, closedDocumentRequest]);

  useEffect(() => {
    if (!projectSaveRequest || !editorAppRef.current) {
      return;
    }

    const request = projectSaveRequest;

    if (handledProjectSaveRequestIdRef.current === request.id) {
      return;
    }

    handledProjectSaveRequestIdRef.current = request.id;
    onProjectSaveRequestHandled(request.id);

    async function saveProject() {
      await saveCurrentProject(request.mode);
    }

    void saveProject();
  }, [editorAppRef, onProjectSaveRequestHandled, projectSaveRequest, saveCurrentProject]);

  useEffect(() => {
    if (!projectFileRequest || !editorAppRef.current) {
      return;
    }

    const editorApp = editorAppRef.current;
    const request = projectFileRequest;

    if (handledProjectFileRequestIdRef.current === request.id) {
      return;
    }

    if (request.tabId !== activeDocumentId) {
      return;
    }

    handledProjectFileRequestIdRef.current = request.id;
    const requestId = request.id;

    async function openProject() {
      try {
        onProjectFilePendingChange?.({
          message: "Preparing to open the project.",
          progress: 4,
          status: "loading",
          title: "Opening project..."
        });
        await waitForNextPaint();
        await editorApp.importProjectFile(request.file, {
          onProgress: (state) =>
            onProjectFilePendingChange?.({
              ...state,
              status: "loading"
            })
        });
        onProjectFilePendingChange?.({
          message: "Project loaded.",
          progress: 100,
          status: "complete",
          title: "Open complete"
        });
        projectFileHandleRef.current = request.handle ?? null;
        projectFileHandlesRef.current.set(activeDocumentId, request.handle ?? null);

        await (request.handle
          ? rememberProjectFileHandle(request.handle)
          : forgetRememberedProjectFileHandle()
        ).catch(() => undefined);

        onLayersChange(editorApp.getLayerSummaries());
        onSceneChange();
        setWebglError(null);
      } catch (error) {
        onProjectFilePendingChange?.({
          message: error instanceof Error ? error.message : "Unable to open project file.",
          progress: 100,
          status: "error",
          title: "Open failed"
        });
        setWebglError(error instanceof Error ? error.message : "Unable to open project file.");
      } finally {
        window.setTimeout(() => onProjectFilePendingChange?.(null), 500);
        onProjectFileRequestHandled(requestId);
      }
    }

    void openProject();
  }, [
    activeDocumentId,
    editorAppRef,
    onLayersChange,
    onProjectFilePendingChange,
    onProjectFileRequestHandled,
    onSceneChange,
    projectFileRequest,
    setWebglError
  ]);
}

function waitForNextPaint() {
  return new Promise<void>((resolve) => {
    window.requestAnimationFrame(() => window.requestAnimationFrame(() => resolve()));
  });
}

function getProjectFilename(title: string) {
  const trimmedTitle = title.trim() || "untitled";
  const safeTitle = trimmedTitle.replace(/[<>:"/\\|?*\u0000-\u001f]/g, "-");

  return safeTitle.toLowerCase().endsWith(".webster") ? safeTitle : `${safeTitle}.webster`;
}
