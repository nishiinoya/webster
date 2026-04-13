"use client";

import { useEffect, useRef, useState } from "react";
import { EditorApp } from "../core/EditorApp";

type CanvasViewProps = {
  activeTabTitle: string;
  onZoomChange: (zoomPercentage: number) => void;
  selectedTool: string;
};

export function CanvasView({ activeTabTitle, onZoomChange, selectedTool }: CanvasViewProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const editorAppRef = useRef<EditorApp | null>(null);
  const panStateRef = useRef<{ x: number; y: number } | null>(null);
  const [webglError, setWebglError] = useState<string | null>(null);

  useEffect(() => {
    if (!canvasRef.current) {
      return;
    }

    try {
      const editorApp = new EditorApp(canvasRef.current, ({ zoom }) => {
        onZoomChange(Math.round(zoom * 100));
      });

      editorAppRef.current = editorApp;
      editorApp.start();
      onZoomChange(Math.round(editorApp.getCameraSnapshot().zoom * 100));
      setWebglError(null);
    } catch (error) {
      setWebglError(error instanceof Error ? error.message : "WebGL failed to start.");
    }

    return () => {
      editorAppRef.current?.dispose();
      editorAppRef.current = null;
    };
  }, [onZoomChange]);

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
              onWheel={(event) => {
                event.preventDefault();
                editorAppRef.current?.zoomCameraAt(event.clientX, event.clientY, event.deltaY);
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
