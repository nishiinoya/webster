import { MutableRefObject, useEffect, useRef } from "react";
import type { EditorDocumentTab } from "../editorDocuments";
import { EditorApp } from "../../core/EditorApp";

type UseEditorDocumentTabsOptions = {
  activeDocument: EditorDocumentTab;
  closedDocumentRequest: { id: number; tabId: string } | null;
  editorAppRef: MutableRefObject<EditorApp | null>;
  editorReadyId: number;
  onLayersChange: (layers: ReturnType<EditorApp["getLayerSummaries"]>) => void;
  onZoomChange: (zoomPercentage: number) => void;
};

export function useEditorDocumentTabs({
  activeDocument,
  closedDocumentRequest,
  editorAppRef,
  editorReadyId,
  onLayersChange,
  onZoomChange
}: UseEditorDocumentTabsOptions) {
  const activeDocumentIdRef = useRef(activeDocument.id);
  const activeDocumentId = activeDocument.id;
  const activeDocumentHeight = activeDocument.height;
  const activeDocumentWidth = activeDocument.width;

  useEffect(() => {
    if (!editorReadyId || !editorAppRef.current) {
      return;
    }

    const editorApp = editorAppRef.current;
    editorApp.switchDocument({
      height: activeDocumentHeight,
      id: activeDocumentId,
      width: activeDocumentWidth
    });
    activeDocumentIdRef.current = activeDocumentId;
    onLayersChange(editorApp.getLayerSummaries());
    onZoomChange(Math.round(editorApp.getCameraSnapshot().zoom * 100));
  }, [
    activeDocumentHeight,
    activeDocumentId,
    activeDocumentWidth,
    editorAppRef,
    editorReadyId,
    onLayersChange,
    onZoomChange
  ]);

  useEffect(() => {
    if (!closedDocumentRequest) {
      return;
    }

    editorAppRef.current?.forgetDocument(closedDocumentRequest.tabId);
  }, [closedDocumentRequest, editorAppRef]);

  return {
    rememberActiveScene() {
      if (!editorAppRef.current) {
        return;
      }

      editorAppRef.current.rememberDocument(activeDocumentIdRef.current);
    }
  };
}
