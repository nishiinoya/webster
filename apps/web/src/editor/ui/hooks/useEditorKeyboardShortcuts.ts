/** Hook that registers shell-level keyboard shortcuts for the editor. */
import { useEffect, useRef } from "react";

type EditorKeyboardShortcutHandlers = {
  isTextEditingActive?: () => boolean;
  onClearSelection?: () => Promise<void> | void;
  onDeleteSelectedLayer?: () => Promise<void> | void;
  onDuplicateSelectedLayer?: () => Promise<void> | void;
  onNudgeSelectedLayer?: (dx: number, dy: number) => Promise<void> | void;
  onRedo: () => Promise<void> | void;
  onSaveProject: () => Promise<void> | void;
  onSelectTool?: (tool: string) => Promise<void> | void;
  onUndo: () => Promise<void> | void;
};

export function useEditorKeyboardShortcuts({
  isTextEditingActive,
  onClearSelection,
  onDeleteSelectedLayer,
  onDuplicateSelectedLayer,
  onNudgeSelectedLayer,
  onRedo,
  onSaveProject,
  onSelectTool,
  onUndo
}: EditorKeyboardShortcutHandlers) {
  const handlersRef = useRef<EditorKeyboardShortcutHandlers>({
    isTextEditingActive,
    onClearSelection,
    onDeleteSelectedLayer,
    onDuplicateSelectedLayer,
    onNudgeSelectedLayer,
    onRedo,
    onSaveProject,
    onSelectTool,
    onUndo
  });
  const nudgeTimerRef = useRef<number | null>(null);
  const nudgeShiftRef = useRef(false);
  const pressedArrowKeysRef = useRef(new Set<string>());

  useEffect(() => {
    handlersRef.current = {
      isTextEditingActive,
      onClearSelection,
      onDeleteSelectedLayer,
      onDuplicateSelectedLayer,
      onNudgeSelectedLayer,
      onRedo,
      onSaveProject,
      onSelectTool,
      onUndo
    };
  }, [
    isTextEditingActive,
    onClearSelection,
    onDeleteSelectedLayer,
    onDuplicateSelectedLayer,
    onNudgeSelectedLayer,
    onRedo,
    onSaveProject,
    onSelectTool,
    onUndo
  ]);

  useEffect(() => {
    const pressedArrowKeys = pressedArrowKeysRef.current;

    async function handleKeyDown(event: KeyboardEvent) {
      if (
        event.defaultPrevented ||
        event.isComposing ||
        isEditableShortcutTarget(event.target)
      ) {
        clearPressedArrowKeys();
        return;
      }

      const key = event.key.toLowerCase();
      const hasModifier = event.ctrlKey || event.metaKey;
      const handlers = handlersRef.current;

      nudgeShiftRef.current = event.shiftKey;

      if (hasModifier && key === "s") {
        event.preventDefault();
        await handlers.onSaveProject();
        return;
      }

      if (hasModifier && key === "z" && event.shiftKey) {
        event.preventDefault();
        await handlers.onRedo();
        return;
      }

      if (hasModifier && key === "z") {
        event.preventDefault();
        await handlers.onUndo();
        return;
      }

      if (event.ctrlKey && !event.metaKey && key === "y") {
        event.preventDefault();
        await handlers.onRedo();
        return;
      }

      if (handlers.isTextEditingActive?.()) {
        clearPressedArrowKeys();
        return;
      }

      if (handlers.onNudgeSelectedLayer && isArrowKey(event.key) && !event.altKey && !hasModifier) {
        event.preventDefault();
        pressedArrowKeys.add(event.key);
        startNudgeLoop();
        return;
      }

      if (
        handlers.onDeleteSelectedLayer &&
        !event.repeat &&
        !event.altKey &&
        !event.shiftKey &&
        !hasModifier &&
        (event.key === "Delete" || event.key === "Backspace")
      ) {
        event.preventDefault();
        await handlers.onDeleteSelectedLayer();
        return;
      }

      if (
        handlers.onDuplicateSelectedLayer &&
        !event.repeat &&
        hasModifier &&
        !event.altKey &&
        !event.shiftKey &&
        key === "j"
      ) {
        event.preventDefault();
        await handlers.onDuplicateSelectedLayer();
        return;
      }

      if (
        handlers.onClearSelection &&
        !event.repeat &&
        hasModifier &&
        !event.altKey &&
        !event.shiftKey &&
        key === "d"
      ) {
        event.preventDefault();
        await handlers.onClearSelection();
        return;
      }

      const tool = getToolForShortcutKey(key);

      if (tool && handlers.onSelectTool && !event.repeat && !event.altKey && !event.shiftKey && !hasModifier) {
        event.preventDefault();
        await handlers.onSelectTool(tool);
      }
    }

    function handleKeyUp(event: KeyboardEvent) {
      nudgeShiftRef.current = event.shiftKey;

      if (isArrowKey(event.key)) {
        const wasPressed = pressedArrowKeys.has(event.key);

        pressedArrowKeys.delete(event.key);
        stopNudgeLoopIfIdle();

        if (wasPressed) {
          event.preventDefault();
        }
      }
    }

    function clearPressedArrowKeys() {
      pressedArrowKeys.clear();
      stopNudgeLoop();
    }

    function nudgePressedArrowKeys() {
      const handlers = handlersRef.current;

      if (
        !handlers.onNudgeSelectedLayer ||
        handlers.isTextEditingActive?.() ||
        pressedArrowKeys.size === 0
      ) {
        clearPressedArrowKeys();
        return;
      }

      const distance = nudgeShiftRef.current ? 10 : 1;
      const delta = getArrowKeyDelta(pressedArrowKeys, distance);

      if (delta.x === 0 && delta.y === 0) {
        return;
      }

      void handlers.onNudgeSelectedLayer(delta.x, delta.y);
    }

    function startNudgeLoop() {
      if (nudgeTimerRef.current !== null) {
        return;
      }

      nudgePressedArrowKeys();
      nudgeTimerRef.current = window.setInterval(nudgePressedArrowKeys, 45);
    }

    function stopNudgeLoopIfIdle() {
      if (pressedArrowKeys.size === 0) {
        stopNudgeLoop();
      }
    }

    function stopNudgeLoop() {
      if (nudgeTimerRef.current === null) {
        return;
      }

      window.clearInterval(nudgeTimerRef.current);
      nudgeTimerRef.current = null;
    }

    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("keyup", handleKeyUp);
    window.addEventListener("blur", clearPressedArrowKeys);

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("keyup", handleKeyUp);
      window.removeEventListener("blur", clearPressedArrowKeys);
      clearPressedArrowKeys();
    };
  }, []);
}

function isEditableShortcutTarget(target: EventTarget | null) {
  if (!(target instanceof Element)) {
    return false;
  }

  if (target.closest("dialog, [role='dialog']")) {
    return true;
  }

  if (target.closest("input, select, textarea")) {
    return true;
  }

  return target instanceof HTMLElement && target.isContentEditable;
}

function isArrowKey(key: string) {
  return (
    key === "ArrowDown" ||
    key === "ArrowLeft" ||
    key === "ArrowRight" ||
    key === "ArrowUp"
  );
}

function getArrowKeyDelta(keys: Set<string>, distance: number) {
  let x = 0;
  let y = 0;

  if (keys.has("ArrowLeft")) {
    x -= distance;
  }

  if (keys.has("ArrowRight")) {
    x += distance;
  }

  if (keys.has("ArrowDown")) {
    y -= distance;
  }

  if (keys.has("ArrowUp")) {
    y += distance;
  }

  return { x, y };
}

function getToolForShortcutKey(key: string) {
  switch (key) {
    case "b":
      return "Mask Brush";
    case "d":
      return "Draw";
    case "e":
      return "Ellipse Select";
    case "h":
      return "Pan";
    case "r":
      return "Rectangle Select";
    case "s":
      return "Shape";
    case "t":
      return "Text";
    case "v":
      return "Move";
    default:
      return null;
  }
}
