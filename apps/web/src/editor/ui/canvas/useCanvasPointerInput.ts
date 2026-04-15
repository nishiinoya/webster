import {
  MutableRefObject,
  PointerEvent as ReactPointerEvent,
  useRef,
  useState
} from "react";
import { EditorApp } from "../../app/EditorApp";
import type { LayerSummary } from "../../app/EditorApp";

type UseCanvasPointerInputOptions = {
  editorAppRef: MutableRefObject<EditorApp | null>;
  onLayersChange: (layers: LayerSummary[]) => void;
  selectedTool: string;
};

export function useCanvasPointerInput({
  editorAppRef,
  onLayersChange,
  selectedTool
}: UseCanvasPointerInputOptions) {
  const panStateRef = useRef<{ x: number; y: number } | null>(null);
  const [canvasCursor, setCanvasCursor] = useState("default");

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

  return {
    canvasCursor,
    pointerHandlers: {
      onContextMenu: (event: ReactPointerEvent<HTMLCanvasElement>) => event.preventDefault(),
      onPointerCancel: () => {
        stopPan();
        editorAppRef.current?.cancelInput();
        setCanvasCursor("default");
      },
      onPointerDown: (event: ReactPointerEvent<HTMLCanvasElement>) => {
        if (event.button === 1 || selectedTool === "Pan") {
          event.preventDefault();
          event.currentTarget.setPointerCapture(event.pointerId);
          startPan(event.clientX, event.clientY);
          updateCanvasCursor(event.clientX, event.clientY);
          return;
        }

        if (isCanvasInputTool(selectedTool)) {
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
      },
      onPointerLeave: () => setCanvasCursor("default"),
      onPointerMove: (event: ReactPointerEvent<HTMLCanvasElement>) => {
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
      },
      onPointerUp: (event: ReactPointerEvent<HTMLCanvasElement>) => {
        if (event.currentTarget.hasPointerCapture(event.pointerId)) {
          event.currentTarget.releasePointerCapture(event.pointerId);
        }

        stopPan();

        if (editorAppRef.current?.pointerUp()) {
          onLayersChange(editorAppRef.current.getLayerSummaries());
        }

        updateCanvasCursor(event.clientX, event.clientY);
      }
    }
  };
}

function isCanvasInputTool(tool: string) {
  return (
    tool === "Move" ||
    tool === "Mask Brush" ||
    tool === "Marquee" ||
    tool === "Rectangle Select" ||
    tool === "Ellipse Select"
  );
}
