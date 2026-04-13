"use client";

import { useEffect, useRef, useState } from "react";
import { EditorApp } from "../core/EditorApp";

type CanvasViewProps = {
  activeTabTitle: string;
  selectedTool: string;
};

export function CanvasView({ activeTabTitle, selectedTool }: CanvasViewProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [webglError, setWebglError] = useState<string | null>(null);

  useEffect(() => {
    if (!canvasRef.current) {
      return;
    }

    let editorApp: EditorApp | null = null;

    try {
      editorApp = new EditorApp(canvasRef.current);
      editorApp.start();
      setWebglError(null);
    } catch (error) {
      setWebglError(error instanceof Error ? error.message : "WebGL failed to start.");
    }

    return () => {
      editorApp?.dispose();
    };
  }, []);

  return (
    <section className="canvas-view" aria-label="Main canvas">
      <div className="canvas-ruler canvas-ruler-horizontal" aria-hidden="true" />
      <div className="canvas-ruler canvas-ruler-vertical" aria-hidden="true" />
      <div className="canvas-stage">
        <div className="canvas-placeholder">
          <p className="canvas-label">{activeTabTitle}</p>
          <div className="canvas-frame">
            <canvas
              ref={canvasRef}
              aria-label="WebGL editor canvas"
              className="webgl-canvas"
            />
            {webglError ? <p className="canvas-error">{webglError}</p> : null}
          </div>
          <p className="canvas-meta">WebGL canvas - {selectedTool} tool selected</p>
        </div>
      </div>
    </section>
  );
}
