"use client";

import { useEffect, useRef } from "react";
import type {
  ImageExportBackground,
  ImageExportFormat,
  LayerCommand,
  LayerSummary,
  SelectionCommand
} from "../app/EditorApp";
import { getCanvasCursorStyle } from "./canvas/canvasCursor";
import { useCanvasPointerInput } from "./canvas/useCanvasPointerInput";
import { useCanvasWheelZoom } from "./canvas/useCanvasWheelZoom";
import { useEditorDocumentTabs } from "./hooks/useEditorDocumentTabs";
import { useEditorApp } from "./canvas/useEditorApp";
import { useEditorSceneRequests } from "./hooks/useEditorSceneRequests";
import { useProjectFileActions } from "./hooks/useProjectFileActions";
import type { SaveStatus } from "./hooks/useProjectFileActions";
import type { WebsterFileHandle } from "../projects/projectFiles";
import type { EditorDocumentTab } from "./editorDocuments";
import type { MaskBrushOptions } from "../tools/mask-brush/MaskBrushTypes";

type CanvasViewProps = {
  activeDocument: EditorDocumentTab;
  closedDocumentRequest: { id: number; tabId: string } | null;
  imageExportRequest: {
    background: ImageExportBackground;
    format: ImageExportFormat;
    id: number;
    title: string;
  } | null;
  layerCommandRequest: { command: LayerCommand; id: number } | null;
  maskBrushOptions: MaskBrushOptions;
  onLayersChange: (layers: LayerSummary[]) => void;
  onLayerCommandRequestHandled: (requestId: number) => void;
  onImageExportRequestHandled: (requestId: number) => void;
  onProjectFileRequestHandled: (requestId: number) => void;
  onProjectSaveRequestHandled: (requestId: number) => void;
  onSaveStatusChange: (status: SaveStatus) => void;
  onSelectionCommandRequestHandled: (requestId: number) => void;
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
  selectionCommandRequest: { command: SelectionCommand; id: number } | null;
  selectedTool: string;
  uploadRequest: { file: File; id: number } | null;
};

export function CanvasView({
  activeDocument,
  closedDocumentRequest,
  imageExportRequest,
  layerCommandRequest,
  maskBrushOptions,
  onLayersChange,
  onLayerCommandRequestHandled,
  onImageExportRequestHandled,
  onProjectFileRequestHandled,
  onProjectSaveRequestHandled,
  onSaveStatusChange,
  onSelectionCommandRequestHandled,
  onSelectLayerRequestHandled,
  onUploadRequestHandled,
  onZoomChange,
  projectFileRequest,
  projectSaveRequest,
  selectLayerRequest,
  selectionCommandRequest,
  selectedTool,
  uploadRequest
}: CanvasViewProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const { editorAppRef, editorReadyId, setWebglError, webglError } = useEditorApp({
    canvasRef,
    maskBrushOptions,
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
    selectedTool,
    setWebglError
  });

  useEffect(() => {
    if (!imageExportRequest || !editorAppRef.current) {
      return;
    }

    let didCancel = false;

    editorAppRef.current
      .exportImageFile(imageExportRequest.format, imageExportRequest.background)
      .then((blob) => {
        if (!didCancel) {
          downloadBlob(
            blob,
            getImageExportFilename(imageExportRequest.title, imageExportRequest.format)
          );
        }
      })
      .catch((error) => {
        if (!didCancel) {
          setWebglError(error instanceof Error ? error.message : "Unable to export image.");
        }
      })
      .finally(() => {
        if (!didCancel) {
          onImageExportRequestHandled(imageExportRequest.id);
        }
      });

    return () => {
      didCancel = true;
    };
  }, [
    editorAppRef,
    imageExportRequest,
    onImageExportRequestHandled,
    setWebglError
  ]);

  useEffect(() => {
    if (!selectionCommandRequest || !editorAppRef.current) {
      return;
    }

    const didApply = editorAppRef.current.applySelectionCommand(selectionCommandRequest.command);

    if (didApply) {
      onLayersChange(editorAppRef.current.getLayerSummaries());
    }

    onSelectionCommandRequestHandled(selectionCommandRequest.id);
  }, [
    editorAppRef,
    onLayersChange,
    onSelectionCommandRequestHandled,
    selectionCommandRequest
  ]);

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

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");

  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

function getImageExportFilename(title: string, format: ImageExportFormat) {
  const extension = format === "jpeg" ? "jpg" : format;
  const safeTitle = (title.trim() || "untitled").replace(/[<>:"/\\|?*\u0000-\u001f]/g, "-");
  const withoutImageExtension = safeTitle.replace(/\.(pdf|png|jpe?g)$/i, "");

  return `${withoutImageExtension}.${extension}`;
}
