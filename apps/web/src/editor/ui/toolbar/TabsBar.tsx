import { useState } from "react";
import type { EditorDocumentTab } from "../editorDocuments";

type TabsBarProps = {
  onCloseTab: (tabId: string) => void;
  onRenameTab: (tabId: string, title: string) => void;
  onSelectTab: (tabId: string) => void;
  tabs: EditorDocumentTab[];
};

export function TabsBar({ onCloseTab, onRenameTab, onSelectTab, tabs }: TabsBarProps) {
  const [editingTabId, setEditingTabId] = useState<string | null>(null);
  const [draftTitle, setDraftTitle] = useState("");

  function startRename(tab: EditorDocumentTab) {
    onSelectTab(tab.id);
    setDraftTitle(tab.title);
    setEditingTabId(tab.id);
  }

  function commitRename(tabId: string) {
    onRenameTab(tabId, draftTitle.trim() || "Untitled");
    setEditingTabId(null);
    setDraftTitle("");
  }

  return (
    <div className="tabs-bar" role="tablist" aria-label="Open documents">
      {tabs.map((tab) => (
        <div
          aria-selected={tab.isActive}
          className="document-tab"
          key={tab.id}
          onClick={() => onSelectTab(tab.id)}
          onDoubleClick={() => startRename(tab)}
          role="tab"
        >
          {editingTabId === tab.id ? (
            <input
              aria-label={`Rename ${tab.title}`}
              autoFocus
              onBlur={() => commitRename(tab.id)}
              onClick={(event) => event.stopPropagation()}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.currentTarget.blur();
                }

                if (event.key === "Escape") {
                  setEditingTabId(null);
                  setDraftTitle("");
                }
              }}
              onChange={(event) => setDraftTitle(event.target.value)}
              value={draftTitle}
            />
          ) : (
            <span className="document-tab-title">{tab.title}</span>
          )}
          <button
            aria-label={`Close ${tab.title}`}
            className="document-tab-close"
            onClick={(event) => {
              event.stopPropagation();
              onCloseTab(tab.id);
            }}
            type="button"
          >
            x
          </button>
        </div>
      ))}
    </div>
  );
}
