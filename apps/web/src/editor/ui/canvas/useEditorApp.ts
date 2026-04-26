/** Hook that creates and owns the shared `EditorApp` instance. */
import { MutableRefObject, useEffect, useRef, useState } from "react";
import type { HistoryStateSnapshot, LayerSummary } from "../../app/EditorApp";
import { EditorApp } from "../../app/EditorApp";
import type { ShapeKind } from "../../layers/ShapeLayer";
import type { StrokeStyle } from "../../layers/StrokeLayer";
import type { MaskBrushOptions } from "../../tools/mask-brush/MaskBrushTypes";

type UseEditorAppOptions = {
  canvasRef: MutableRefObject<HTMLCanvasElement | null>;
  onHistoryChange: (history: HistoryStateSnapshot) => void;
  onLayersChange: (layers: LayerSummary[]) => void;
  onStrokeLayerCreated: (layerId: string) => void;
  onZoomChange: (zoomPercentage: number) => void;
  maskBrushOptions: MaskBrushOptions;
  selectedTool: string;
  showCanvasBorder: boolean;
  selectedShape: ShapeKind;
  selectedStrokeColor: [number, number, number, number];
  selectedStrokeMode: "draw" | "erase";
  selectedStrokeStyle: StrokeStyle;
  selectedStrokeTargetLayerId: string | null;
  selectedStrokeTargetMode: "layer" | "new" | "selected";
  selectedStrokeWidth: number;
};

export function useEditorApp({
  canvasRef,
  maskBrushOptions,
  onHistoryChange,
  onLayersChange,
  onStrokeLayerCreated,
  onZoomChange,
  selectedShape,
  showCanvasBorder,
  selectedStrokeColor,
  selectedStrokeMode,
  selectedStrokeStyle,
  selectedStrokeTargetLayerId,
  selectedStrokeTargetMode,
  selectedStrokeWidth,
  selectedTool
}: UseEditorAppOptions) {
  const editorAppRef = useRef<EditorApp | null>(null);
  const maskBrushOptionsRef = useRef(maskBrushOptions);
  const onStrokeLayerCreatedRef = useRef(onStrokeLayerCreated);
  const selectedShapeRef = useRef(selectedShape);
  const selectedStrokeColorRef = useRef(selectedStrokeColor);
  const selectedStrokeModeRef = useRef(selectedStrokeMode);
  const selectedStrokeStyleRef = useRef(selectedStrokeStyle);
  const selectedStrokeTargetLayerIdRef = useRef(selectedStrokeTargetLayerId);
  const selectedStrokeTargetModeRef = useRef(selectedStrokeTargetMode);
  const selectedStrokeWidthRef = useRef(selectedStrokeWidth);
  const selectedToolRef = useRef(selectedTool);
  const [editorReadyId, setEditorReadyId] = useState(0);
  const [webglError, setWebglError] = useState<string | null>(null);

  useEffect(() => {
    onStrokeLayerCreatedRef.current = onStrokeLayerCreated;
  }, [onStrokeLayerCreated]);

  useEffect(() => {
    selectedToolRef.current = selectedTool;
    editorAppRef.current?.setSelectedTool(selectedTool);
  }, [selectedTool]);

  useEffect(() => {
    editorAppRef.current?.setShowCanvasBorder(showCanvasBorder);
  }, [showCanvasBorder]);

  useEffect(() => {
    selectedShapeRef.current = selectedShape;
    editorAppRef.current?.setShapeToolKind(selectedShape);
  }, [selectedShape]);

  useEffect(() => {
    selectedStrokeColorRef.current = selectedStrokeColor;
    selectedStrokeModeRef.current = selectedStrokeMode;
    selectedStrokeStyleRef.current = selectedStrokeStyle;
    selectedStrokeTargetLayerIdRef.current = selectedStrokeTargetLayerId;
    selectedStrokeTargetModeRef.current = selectedStrokeTargetMode;
    selectedStrokeWidthRef.current = selectedStrokeWidth;
    editorAppRef.current?.setDrawingToolOptions({
      color: selectedStrokeColor,
      mode: selectedStrokeMode,
      targetLayerId: selectedStrokeTargetLayerId,
      targetMode: selectedStrokeTargetMode,
      strokeWidth: selectedStrokeWidth,
      style: selectedStrokeStyle
    });
  }, [
    selectedStrokeColor,
    selectedStrokeMode,
    selectedStrokeStyle,
    selectedStrokeTargetLayerId,
    selectedStrokeTargetMode,
    selectedStrokeWidth
  ]);

  useEffect(() => {
    maskBrushOptionsRef.current = maskBrushOptions;
    editorAppRef.current?.setMaskBrushOptions(maskBrushOptions);
  }, [maskBrushOptions]);

  useEffect(() => {
    if (!canvasRef.current) {
      return;
    }

    let didCancel = false;

    try {
      EditorApp.create(canvasRef.current, {
        onCameraChange: ({ zoom }) => {
          onZoomChange(Math.round(zoom * 100));
        },
        onHistoryChange,
        onStrokeLayerCreated: (layerId) => {
          onStrokeLayerCreatedRef.current(layerId);
        }
      })
        .then((editorApp) => {
          if (didCancel) {
            editorApp.dispose();
            return;
          }

          editorAppRef.current = editorApp;
          editorApp.setSelectedTool(selectedToolRef.current);
          editorApp.setShowCanvasBorder(showCanvasBorder);
          editorApp.setShapeToolKind(selectedShapeRef.current);
          editorApp.setDrawingToolOptions({
            color: selectedStrokeColorRef.current,
            mode: selectedStrokeModeRef.current,
            targetLayerId: selectedStrokeTargetLayerIdRef.current,
            targetMode: selectedStrokeTargetModeRef.current,
            strokeWidth: selectedStrokeWidthRef.current,
            style: selectedStrokeStyleRef.current
          });
          editorApp.setMaskBrushOptions(maskBrushOptionsRef.current);
          editorApp.start();
          onLayersChange(editorApp.getLayerSummaries());
          onZoomChange(Math.round(editorApp.getCameraSnapshot().zoom * 100));
          setEditorReadyId((readyId) => readyId + 1);
          setWebglError(null);
        })
        .catch((error) => {
          if (!didCancel) {
            setWebglError(error instanceof Error ? error.message : "WebGL failed to start.");
          }
        });
    } catch (error) {
      setWebglError(error instanceof Error ? error.message : "WebGL failed to start.");
    }

    return () => {
      didCancel = true;
      editorAppRef.current?.dispose();
      editorAppRef.current = null;
    };
  }, [canvasRef, onHistoryChange, onLayersChange, onZoomChange]);

  return {
    editorReadyId,
    editorAppRef,
    setWebglError,
    webglError
  };
}
