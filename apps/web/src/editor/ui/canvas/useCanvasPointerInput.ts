/** Pointer-event hook for canvas tool input and text selection drags. */
import {
  MutableRefObject,
  PointerEvent as ReactPointerEvent,
  useRef,
  useState
} from "react";
import { EditorApp } from "../../app/EditorApp";
import type { LayerSummary } from "../../app/EditorApp";

type UseCanvasPointerInputOptions = {
  canEditDocument: boolean;
  editorAppRef: MutableRefObject<EditorApp | null>;
  onLayersChange: (layers: LayerSummary[]) => void;
  onInteractionEnd?: () => void;
  onPresenceCursor?: (cursor: { x: number; y: number }, tool: string) => void;
  onPreviewEditorAction?: (tool: string) => void;
  onTextToolPointerDown?: (event: ReactPointerEvent<HTMLCanvasElement>) => boolean;
  selectedTool: string;
};

export function useCanvasPointerInput({
  canEditDocument,
  editorAppRef,
  onLayersChange,
  onInteractionEnd,
  onPresenceCursor,
  onPreviewEditorAction,
  onTextToolPointerDown,
  selectedTool
}: UseCanvasPointerInputOptions) {
  const panStateRef = useRef<{ x: number; y: number } | null>(null);
  const textSelectionPointerIdRef = useRef<number | null>(null);
  const lastCursorSendRef = useRef(0);
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
        onInteractionEnd?.();
      },
      onPointerDown: (event: ReactPointerEvent<HTMLCanvasElement>) => {
        if (event.button === 1 || selectedTool === "Pan") {
          event.preventDefault();
          event.currentTarget.setPointerCapture(event.pointerId);
          startPan(event.clientX, event.clientY);
          updateCanvasCursor(event.clientX, event.clientY);
          return;
        }

        if (selectedTool === "Text") {
          if (!canEditDocument) {
            return;
          }

          event.preventDefault();
          event.currentTarget.focus();
          if (editorAppRef.current?.startTextSelectionAtClientPoint(event.clientX, event.clientY)) {
            textSelectionPointerIdRef.current = event.pointerId;
            event.currentTarget.setPointerCapture(event.pointerId);
            onLayersChange(editorAppRef.current.getLayerSummaries());
            updateCanvasCursor(event.clientX, event.clientY);
          } else if (onTextToolPointerDown?.(event)) {
            updateCanvasCursor(event.clientX, event.clientY);
          }
          return;
        }

        if (canEditDocument && isCanvasInputTool(selectedTool)) {
          const didHandleInput = editorAppRef.current?.pointerDown({
            altKey: event.altKey,
            button: event.button,
            clientX: event.clientX,
            clientY: event.clientY,
            detail: event.detail,
            shiftKey: event.shiftKey
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
        const now = Date.now();
        if (onPresenceCursor && editorAppRef.current && now - lastCursorSendRef.current > 50) {
          lastCursorSendRef.current = now;
          const world = editorAppRef.current.clientToWorldPoint(event.clientX, event.clientY);
          onPresenceCursor(world, selectedTool);
        }
        panTo(event.clientX, event.clientY);

        if (selectedTool === "Text" && textSelectionPointerIdRef.current === event.pointerId) {
          event.preventDefault();

          if (
            editorAppRef.current?.updateTextSelectionAtClientPoint(event.clientX, event.clientY)
          ) {
            onLayersChange(editorAppRef.current.getLayerSummaries());
          }

          updateCanvasCursor(event.clientX, event.clientY);
          return;
        }

        const didHandleInput = canEditDocument
          ? editorAppRef.current?.pointerMove({
              altKey: event.altKey,
              button: event.button,
              clientX: event.clientX,
              clientY: event.clientY,
              detail: event.detail,
              shiftKey: event.shiftKey
            })
          : false;

        if (didHandleInput && editorAppRef.current) {
          onLayersChange(editorAppRef.current.getLayerSummaries());
          onPreviewEditorAction?.(selectedTool);
        }

        updateCanvasCursor(event.clientX, event.clientY);
      },
      onPointerUp: (event: ReactPointerEvent<HTMLCanvasElement>) => {
        if (event.currentTarget.hasPointerCapture(event.pointerId)) {
          event.currentTarget.releasePointerCapture(event.pointerId);
        }

        stopPan();

        if (textSelectionPointerIdRef.current === event.pointerId) {
          textSelectionPointerIdRef.current = null;
          editorAppRef.current?.endTextSelection();
        }

        if (canEditDocument && editorAppRef.current?.pointerUp()) {
          onLayersChange(editorAppRef.current.getLayerSummaries());
        }

        updateCanvasCursor(event.clientX, event.clientY);
        onInteractionEnd?.();
      }
    }
  };
}

function isCanvasInputTool(tool: string) {
  return (
    tool === "Move" ||
    tool === "Transform" ||
    tool === "Crop" ||
    tool === "Draw" ||
    tool === "Mask Brush" ||
    tool === "Shape" ||
    tool === "Marquee" ||
    tool === "Rectangle Select" ||
    tool === "Ellipse Select" ||
    tool === "Lasso Select" ||
    tool === "Magic Select"
  );
}
