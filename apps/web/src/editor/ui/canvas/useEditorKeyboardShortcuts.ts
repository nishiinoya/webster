import { useEffect } from "react";

type EditorKeyboardShortcutHandlers = {
  onSaveProject: () => Promise<void> | void;
  onUndo: () => Promise<void> | void;
};

export function useEditorKeyboardShortcuts({ onSaveProject, onUndo }: EditorKeyboardShortcutHandlers) {
  useEffect(() => {
    async function handleKeyDown(event: KeyboardEvent) {
      const key = event.key.toLowerCase();

      if ((event.ctrlKey || event.metaKey) && key === "s") {
        event.preventDefault();
        await onSaveProject();
      }

      if ((event.ctrlKey || event.metaKey) && key === "z" && !event.shiftKey) {
        event.preventDefault();
        await onUndo();
      }
    }

    window.addEventListener("keydown", handleKeyDown);

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [onSaveProject, onUndo]);
}
