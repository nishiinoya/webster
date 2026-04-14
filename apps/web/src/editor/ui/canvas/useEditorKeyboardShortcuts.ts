import { useEffect } from "react";

type EditorKeyboardShortcutHandlers = {
  onSaveProject: () => Promise<void> | void;
};

export function useEditorKeyboardShortcuts({ onSaveProject }: EditorKeyboardShortcutHandlers) {
  useEffect(() => {
    async function handleKeyDown(event: KeyboardEvent) {
      const key = event.key.toLowerCase();

      if ((event.ctrlKey || event.metaKey) && key === "s") {
        event.preventDefault();
        await onSaveProject();
      }
    }

    window.addEventListener("keydown", handleKeyDown);

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [onSaveProject]);
}
