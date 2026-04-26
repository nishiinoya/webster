/** Hook that provides open/save actions for `.webster` project files. */
import { MutableRefObject, useCallback, useEffect, useRef } from "react";
import { EditorApp } from "../../app/EditorApp";
import { useEditorKeyboardShortcuts } from "./useEditorKeyboardShortcuts";
import { saveProjectFile } from "../../projects/projectFiles";
import type { WebsterFileHandle } from "../../projects/projectFiles";
import {
  forgetRememberedProjectFileHandle,
  rememberProjectFileHandle
} from "../../projects/projectFileHandleStore";

type UseProjectFileActionsOptions = {
  activeDocumentId: string;
  activeDocumentTitle: string;
  closedDocumentRequest: { id: number; tabId: string } | null;
  editorAppRef: MutableRefObject<EditorApp | null>;
  onLayersChange: (layers: ReturnType<EditorApp["getLayerSummaries"]>) => void;
  onProjectFileRequestHandled: (requestId: number) => void;
  onProjectSaveRequestHandled: (requestId: number) => void;
  onSaveStatusChange: (status: SaveStatus) => void;
  onSceneChange: () => void;
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

export function useProjectFileActions({
  activeDocumentId,
  activeDocumentTitle,
  closedDocumentRequest,
  editorAppRef,
  onLayersChange,
  onProjectFileRequestHandled,
  onProjectSaveRequestHandled,
  onSaveStatusChange,
  onSceneChange,
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

      try {
        const activeHandleRef = {
          current: projectFileHandlesRef.current.get(activeDocumentId) ?? null
        };

        await saveProjectFile(
          editorAppRef.current,
          activeHandleRef,
          mode === "save-as",
          getProjectFilename(activeDocumentTitle)
        );
        projectFileHandleRef.current = activeHandleRef.current;
        projectFileHandlesRef.current.set(activeDocumentId, activeHandleRef.current);
        updateSaveStatus("saved");
        setWebglError(null);
      } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError") {
          updateSaveStatus("idle");
          return;
        }

        updateSaveStatus("error");
        setWebglError(error instanceof Error ? error.message : "Unable to save project file.");
      }
    },
    [activeDocumentId, activeDocumentTitle, editorAppRef, setWebglError, updateSaveStatus]
  );

  useEffect(() => {
    return () => {
      if (saveStatusTimerRef.current) {
        window.clearTimeout(saveStatusTimerRef.current);
      }
    };
  }, []);

  useEditorKeyboardShortcuts({
    onSaveProject: () => saveCurrentProject("save"),
    onUndo: () => {
      if (!editorAppRef.current) {
        return;
      }

      if (editorAppRef.current.undo()) {
        onLayersChange(editorAppRef.current.getLayerSummaries());
        onSceneChange();
        setWebglError(null);
      }
    },
    onRedo: () => {
      if (!editorAppRef.current) {
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
        await editorApp.importProjectFile(request.file);
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
        setWebglError(error instanceof Error ? error.message : "Unable to open project file.");
      } finally {
        onProjectFileRequestHandled(requestId);
      }
    }

    void openProject();
  }, [
    activeDocumentId,
    editorAppRef,
    onLayersChange,
    onProjectFileRequestHandled,
    onSceneChange,
    projectFileRequest,
    setWebglError
  ]);
}

function getProjectFilename(title: string) {
  const trimmedTitle = title.trim() || "untitled";
  const safeTitle = trimmedTitle.replace(/[<>:"/\\|?*\u0000-\u001f]/g, "-");

  return safeTitle.toLowerCase().endsWith(".webster") ? safeTitle : `${safeTitle}.webster`;
}
