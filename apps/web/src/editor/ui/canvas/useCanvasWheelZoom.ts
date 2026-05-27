/** Wheel-zoom hook for the editor canvas. */
import { MutableRefObject, useEffect } from "react";
import { EditorApp } from "../../app/EditorApp";

type UseCanvasWheelZoomOptions = {
  canvasRef: MutableRefObject<HTMLCanvasElement | null>;
  editorAppRef: MutableRefObject<EditorApp | null>;
};

export function useCanvasWheelZoom({ canvasRef, editorAppRef }: UseCanvasWheelZoomOptions) {
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
  }, [canvasRef, editorAppRef]);
}
