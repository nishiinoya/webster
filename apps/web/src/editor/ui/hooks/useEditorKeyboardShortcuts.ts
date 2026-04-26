/** Hook that registers shell-level keyboard shortcuts for the editor. */
import { useEffect } from "react";

type EditorKeyboardShortcutHandlers = {
  onRedo: () => Promise<void> | void;
  onSaveProject: () => Promise<void> | void;
  onUndo: () => Promise<void> | void;
};

export function useEditorKeyboardShortcuts({
  onRedo,
  onSaveProject,
  onUndo
}: EditorKeyboardShortcutHandlers) {
  useEffect(() => {
    async function handleKeyDown(event: KeyboardEvent) {
      if (event.defaultPrevented || isEditableShortcutTarget(event.target)) {
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
      }
    }

    window.addEventListener("keydown", handleKeyDown);

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [onRedo, onSaveProject, onUndo]);
}

function isEditableShortcutTarget(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) {
    return false;
  }

  const tagName = target.tagName.toLowerCase();

  return (
    target.isContentEditable ||
    tagName === "input" ||
    tagName === "select" ||
    tagName === "textarea"
  );
}
