/** Hook that registers shell-level keyboard shortcuts for the editor. */
import { useEffect } from "react";

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
  useEffect(() => {
    async function handleKeyDown(event: KeyboardEvent) {
      if (
        event.defaultPrevented ||
        event.isComposing ||
        isEditableShortcutTarget(event.target)
      ) {
        return;
      }

      const key = event.key.toLowerCase();
      const hasModifier = event.ctrlKey || event.metaKey;

      if (hasModifier && key === "s") {
        event.preventDefault();
        await onSaveProject();
        return;
      }

      if (hasModifier && key === "z" && event.shiftKey) {
        event.preventDefault();
        await onRedo();
        return;
      }

      if (hasModifier && key === "z") {
        event.preventDefault();
        await onUndo();
        return;
      }

      if (event.ctrlKey && !event.metaKey && key === "y") {
        event.preventDefault();
        await onRedo();
        return;
      }

      if (isTextEditingActive?.()) {
        return;
      }

      if (onNudgeSelectedLayer && isArrowKey(event.key) && !event.altKey && !hasModifier) {
        event.preventDefault();
        const distance = event.shiftKey ? 10 : 1;
        const delta = getArrowKeyDelta(event.key, distance);

        await onNudgeSelectedLayer(delta.x, delta.y);
        return;
      }

      if (
        onDeleteSelectedLayer &&
        !event.repeat &&
        !event.altKey &&
        !event.shiftKey &&
        !hasModifier &&
        (event.key === "Delete" || event.key === "Backspace")
      ) {
        event.preventDefault();
        await onDeleteSelectedLayer();
        return;
      }

      if (
        onDuplicateSelectedLayer &&
        !event.repeat &&
        hasModifier &&
        !event.altKey &&
        !event.shiftKey &&
        key === "j"
      ) {
        event.preventDefault();
        await onDuplicateSelectedLayer();
        return;
      }

      if (
        onClearSelection &&
        !event.repeat &&
        hasModifier &&
        !event.altKey &&
        !event.shiftKey &&
        key === "d"
      ) {
        event.preventDefault();
        await onClearSelection();
        return;
      }

      const tool = getToolForShortcutKey(key);

      if (tool && onSelectTool && !event.repeat && !event.altKey && !event.shiftKey && !hasModifier) {
        event.preventDefault();
        await onSelectTool(tool);
      }
    }

    window.addEventListener("keydown", handleKeyDown);

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
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

function getArrowKeyDelta(key: string, distance: number) {
  switch (key) {
    case "ArrowDown":
      return { x: 0, y: distance };
    case "ArrowLeft":
      return { x: -distance, y: 0 };
    case "ArrowRight":
      return { x: distance, y: 0 };
    case "ArrowUp":
      return { x: 0, y: -distance };
    default:
      return { x: 0, y: 0 };
  }
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
