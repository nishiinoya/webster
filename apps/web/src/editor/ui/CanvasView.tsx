"use client";

import { useRef } from "react";
import type { LayerCommand, LayerSummary } from "../core/EditorApp";
import { getCanvasCursorStyle } from "./canvas/canvasCursor";
import { useCanvasPointerInput } from "./canvas/useCanvasPointerInput";
import { useCanvasWheelZoom } from "./canvas/useCanvasWheelZoom";
import { useEditorDocumentTabs } from "./canvas/useEditorDocumentTabs";
import { useEditorApp } from "./canvas/useEditorApp";
import { useEditorSceneRequests } from "./canvas/useEditorSceneRequests";
import { useProjectFileActions } from "./canvas/useProjectFileActions";
import type { SaveStatus } from "./canvas/useProjectFileActions";
import type { WebsterFileHandle } from "./canvas/projectFiles";
import type { EditorDocumentTab } from "./editorDocuments";

type CanvasViewProps = {
  activeDocument: EditorDocumentTab;
  closedDocumentRequest: { id: number; tabId: string } | null;
  layerCommandRequest: { command: LayerCommand; id: number } | null;
  onLayersChange: (layers: LayerSummary[]) => void;
  onLayerCommandRequestHandled: (requestId: number) => void;
  onProjectFileRequestHandled: (requestId: number) => void;
  onProjectSaveRequestHandled: (requestId: number) => void;
  onSaveStatusChange: (status: SaveStatus) => void;
  onSelectLayerRequestHandled: (requestId: number) => void;
  onUploadRequestHandled: (requestId: number) => void;
  onZoomChange: (zoomPercentage: number) => void;
  projectFileRequest: {
    file: File;
    handle?: WebsterFileHandle | null;
    id: number;
    tabId: string;
  } | null;
  projectSaveRequest: { id: number; mode: "save" | "save-as" } | null;
  selectLayerRequest: { layerId: string; id: number } | null;
  selectedTool: string;
  uploadRequest: { file: File; id: number } | null;
};

export function CanvasView({
  activeDocument,
  closedDocumentRequest,
  layerCommandRequest,
  onLayersChange,
  onLayerCommandRequestHandled,
  onProjectFileRequestHandled,
  onProjectSaveRequestHandled,
  onSaveStatusChange,
  onSelectLayerRequestHandled,
  onUploadRequestHandled,
  onZoomChange,
  projectFileRequest,
  projectSaveRequest,
  selectLayerRequest,
  selectedTool,
  uploadRequest
}: CanvasViewProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const { editorAppRef, editorReadyId, setWebglError, webglError } = useEditorApp({
    canvasRef,
    onLayersChange,
    onZoomChange,
    selectedTool
  });
  const { canvasCursor, pointerHandlers } = useCanvasPointerInput({
    editorAppRef,
    onLayersChange,
    selectedTool
  });
  const { rememberActiveScene } = useEditorDocumentTabs({
    activeDocument,
    closedDocumentRequest,
    editorAppRef,
    editorReadyId,
    onLayersChange,
    onZoomChange
  });

  useCanvasWheelZoom({ canvasRef, editorAppRef });
  useEditorSceneRequests({
    editorAppRef,
    layerCommandRequest,
    onLayersChange,
    onLayerCommandRequestHandled,
    onSelectLayerRequestHandled,
    onUploadRequestHandled,
    selectLayerRequest,
    setWebglError,
    uploadRequest
  });
  useProjectFileActions({
    editorAppRef,
    activeDocumentId: activeDocument.id,
    activeDocumentTitle: activeDocument.title,
    closedDocumentRequest,
    onLayersChange,
    onProjectFileRequestHandled,
    onProjectSaveRequestHandled,
    onSaveStatusChange,
    onSceneChange: rememberActiveScene,
    projectFileRequest,
    projectSaveRequest,
    setWebglError
  });

  return (
    <section className="canvas-view" aria-label="Main canvas">
      <div className="canvas-ruler canvas-ruler-horizontal" aria-hidden="true" />
      <div className="canvas-ruler canvas-ruler-vertical" aria-hidden="true" />
      <div className="canvas-stage">
        <div className="canvas-placeholder">
          <div className="canvas-frame">
            <canvas
              ref={canvasRef}
              aria-label="WebGL editor canvas"
              className={`webgl-canvas${selectedTool === "Pan" ? " is-pan-tool" : ""}`}
              style={{ cursor: getCanvasCursorStyle(canvasCursor) }}
              {...pointerHandlers}
            />
            {webglError ? <p className="canvas-error">{webglError}</p> : null}
          </div>
          <p className="canvas-label">{activeDocument.title}</p>
          <p className="canvas-meta">Workspace - {selectedTool} tool selected</p>
        </div>
      </div>
    </section>
  );
}
