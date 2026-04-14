import { MutableRefObject, useEffect, useRef, useState } from "react";
import type { LayerSummary } from "../../core/EditorApp";
import { EditorApp } from "../../core/EditorApp";

type UseEditorAppOptions = {
  canvasRef: MutableRefObject<HTMLCanvasElement | null>;
  onLayersChange: (layers: LayerSummary[]) => void;
  onZoomChange: (zoomPercentage: number) => void;
  selectedTool: string;
};

export function useEditorApp({
  canvasRef,
  onLayersChange,
  onZoomChange,
  selectedTool
}: UseEditorAppOptions) {
  const editorAppRef = useRef<EditorApp | null>(null);
  const selectedToolRef = useRef(selectedTool);
  const [editorReadyId, setEditorReadyId] = useState(0);
  const [webglError, setWebglError] = useState<string | null>(null);

  useEffect(() => {
    selectedToolRef.current = selectedTool;
    editorAppRef.current?.setSelectedTool(selectedTool);
  }, [selectedTool]);

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
