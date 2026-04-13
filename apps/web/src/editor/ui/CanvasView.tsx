"use client";

import { useEffect, useRef, useState } from "react";
import type { LayerSummary } from "../core/EditorApp";
import { EditorApp } from "../core/EditorApp";

type CanvasViewProps = {
  activeTabTitle: string;
  onLayersChange: (layers: LayerSummary[]) => void;
  onZoomChange: (zoomPercentage: number) => void;
  selectedTool: string;
  uploadRequest: { file: File; id: number } | null;
};

export function CanvasView({
  activeTabTitle,
  onLayersChange,
  onZoomChange,
  selectedTool,
  uploadRequest
}: CanvasViewProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const editorAppRef = useRef<EditorApp | null>(null);
  const panStateRef = useRef<{ x: number; y: number } | null>(null);
  const [webglError, setWebglError] = useState<string | null>(null);

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
          editorApp.start();
          onLayersChange(editorApp.getLayerSummaries());
          onZoomChange(Math.round(editorApp.getCameraSnapshot().zoom * 100));
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
  }, [onLayersChange, onZoomChange]);

  useEffect(() => {
    if (!uploadRequest || !editorAppRef.current) {
      return;
    }

    let didCancel = false;

    editorAppRef.current
      .addImageFile(uploadRequest.file)
      .then(() => {
        if (!didCancel && editorAppRef.current) {
          onLayersChange(editorAppRef.current.getLayerSummaries());
        }
      })
      .catch((error) => {
        if (!didCancel) {
          setWebglError(error instanceof Error ? error.message : "Unable to add image.");
        }
      });

    return () => {
      didCancel = true;
    };
  }, [onLayersChange, uploadRequest]);

  useEffect(() => {
    const canvas = canvasRef.current;

    if (!canvas) {
      return;
    }

    function handleWheel(event: WheelEvent) {
      event.preventDefault();
      editorAppRef.current?.zoomCameraAt(event.clientX, event.clientY, event.deltaY);
    }

    canvas.addEventListener("wheel", handleWheel, { passive: false });

    return () => {
      canvas.removeEventListener("wheel", handleWheel);
    };
  }, []);

  function startPan(clientX: number, clientY: number) {
    panStateRef.current = {
      x: clientX,
      y: clientY
    };
  }

  function stopPan() {
    panStateRef.current = null;
  }

  function panTo(clientX: number, clientY: number) {
    const panState = panStateRef.current;

    if (!panState) {
      return;
    }

    editorAppRef.current?.panCamera(clientX - panState.x, clientY - panState.y);
    panState.x = clientX;
    panState.y = clientY;
  }

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
              onContextMenu={(event) => event.preventDefault()}
              onPointerCancel={stopPan}
              onPointerDown={(event) => {
                if (event.button === 1 || selectedTool === "Pan") {
                  event.preventDefault();
                  event.currentTarget.setPointerCapture(event.pointerId);
                  startPan(event.clientX, event.clientY);
                }
              }}
              onPointerMove={(event) => panTo(event.clientX, event.clientY)}
              onPointerUp={(event) => {
                if (event.currentTarget.hasPointerCapture(event.pointerId)) {
                  event.currentTarget.releasePointerCapture(event.pointerId);
                }

                stopPan();
              }}
            />
            {webglError ? <p className="canvas-error">{webglError}</p> : null}
          </div>
          <p className="canvas-label">{activeTabTitle}</p>
          <p className="canvas-meta">Workspace - {selectedTool} tool selected</p>
        </div>
      </div>
    </section>
  );
}
