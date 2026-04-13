"use client";

import { useEffect, useRef, useState } from "react";
import type { LayerSummary } from "../core/EditorApp";
import { EditorApp } from "../core/EditorApp";

type CanvasViewProps = {
  activeTabTitle: string;
  onLayersChange: (layers: LayerSummary[]) => void;
  onZoomChange: (zoomPercentage: number) => void;
  selectLayerRequest: { layerId: string; id: number } | null;
  selectedTool: string;
  uploadRequest: { file: File; id: number } | null;
};

export function CanvasView({
  activeTabTitle,
  onLayersChange,
  onZoomChange,
  selectLayerRequest,
  selectedTool,
  uploadRequest
}: CanvasViewProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const editorAppRef = useRef<EditorApp | null>(null);
  const panStateRef = useRef<{ x: number; y: number } | null>(null);
  const selectedToolRef = useRef(selectedTool);
  const [canvasCursor, setCanvasCursor] = useState("default");
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
    if (!selectLayerRequest || !editorAppRef.current) {
      return;
    }

    editorAppRef.current.selectLayer(selectLayerRequest.layerId);
    onLayersChange(editorAppRef.current.getLayerSummaries());
  }, [onLayersChange, selectLayerRequest]);

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

  function updateCanvasCursor(clientX: number, clientY: number) {
    if (selectedTool === "Pan") {
      setCanvasCursor(panStateRef.current ? "grabbing" : "grab");
      return;
    }

    setCanvasCursor(editorAppRef.current?.getCursor(clientX, clientY) ?? "default");
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
              style={{ cursor: getCanvasCursorStyle(canvasCursor) }}
              onContextMenu={(event) => event.preventDefault()}
              onPointerCancel={() => {
                stopPan();
                editorAppRef.current?.cancelInput();
                setCanvasCursor("default");
              }}
              onPointerDown={(event) => {
                if (event.button === 1 || selectedTool === "Pan") {
                  event.preventDefault();
                  event.currentTarget.setPointerCapture(event.pointerId);
                  startPan(event.clientX, event.clientY);
                  updateCanvasCursor(event.clientX, event.clientY);
                  return;
                }

                if (selectedTool === "Move") {
                  const didHandleInput = editorAppRef.current?.pointerDown({
                    button: event.button,
                    clientX: event.clientX,
                    clientY: event.clientY
                  });

                  if (didHandleInput && editorAppRef.current) {
                    event.currentTarget.setPointerCapture(event.pointerId);
                    onLayersChange(editorAppRef.current.getLayerSummaries());
                    updateCanvasCursor(event.clientX, event.clientY);
                  }
                }
              }}
              onPointerMove={(event) => {
                panTo(event.clientX, event.clientY);

                const didHandleInput = editorAppRef.current?.pointerMove({
                  button: event.button,
                  clientX: event.clientX,
                  clientY: event.clientY
                });

                if (didHandleInput && editorAppRef.current) {
                  onLayersChange(editorAppRef.current.getLayerSummaries());
                }

                updateCanvasCursor(event.clientX, event.clientY);
              }}
              onPointerUp={(event) => {
                if (event.currentTarget.hasPointerCapture(event.pointerId)) {
                  event.currentTarget.releasePointerCapture(event.pointerId);
                }

                stopPan();

                if (editorAppRef.current?.pointerUp()) {
                  onLayersChange(editorAppRef.current.getLayerSummaries());
                }

                updateCanvasCursor(event.clientX, event.clientY);
              }}
              onPointerLeave={() => setCanvasCursor("default")}
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

function getCanvasCursorStyle(cursor: string) {
  if (!cursor.startsWith("rotate-")) {
    return cursor;
  }

  const rotation = Number(cursor.slice("rotate-".length));
  const safeRotation = Number.isFinite(rotation) ? rotation : 0;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24"><g transform="rotate(${safeRotation} 12 12)"><path fill="none" stroke="#eef1f4" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" d="M18 7v5h-5M6 17v-5h5M17.2 12a5.8 5.8 0 0 0-9.8-4.2M6.8 12a5.8 5.8 0 0 0 9.8 4.2"/></g></svg>`;

  return `url("data:image/svg+xml,${encodeURIComponent(svg)}") 12 12, grab`;
}
