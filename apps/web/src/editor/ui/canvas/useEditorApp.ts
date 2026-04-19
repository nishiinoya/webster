import { MutableRefObject, useEffect, useRef, useState } from "react";
import type { LayerSummary } from "../../app/EditorApp";
import { EditorApp } from "../../app/EditorApp";
import type { ShapeKind } from "../../layers/ShapeLayer";
import type { StrokeStyle } from "../../layers/StrokeLayer";
import type { MaskBrushOptions } from "../../tools/mask-brush/MaskBrushTypes";

type UseEditorAppOptions = {
  canvasRef: MutableRefObject<HTMLCanvasElement | null>;
  onLayersChange: (layers: LayerSummary[]) => void;
  onZoomChange: (zoomPercentage: number) => void;
  maskBrushOptions: MaskBrushOptions;
  selectedTool: string;
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
  onLayersChange,
  onZoomChange,
  selectedShape,
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
    selectedToolRef.current = selectedTool;
    editorAppRef.current?.setSelectedTool(selectedTool);
  }, [selectedTool]);

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
      EditorApp.create(canvasRef.current, ({ zoom }) => {
        onZoomChange(Math.round(zoom * 100));
      })
        .then((editorApp) => {
          if (didCancel) {
            editorApp.dispose();
            return;
          }

          editorAppRef.current = editorApp;
          editorApp.setSelectedTool(selectedToolRef.current);
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
  }, [canvasRef, onLayersChange, onZoomChange]);

  return {
    editorReadyId,
    editorAppRef,
    setWebglError,
    webglError
  };
}
