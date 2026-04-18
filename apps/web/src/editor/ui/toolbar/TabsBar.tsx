import { useState } from "react";
import type { EditorDocumentTab } from "../editorDocuments";
import { cn } from "../classNames";

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
    <div
      className="flex min-w-0 items-end gap-1.5 border-b border-[#2a2d31] bg-[#101113] px-2.5 pt-[7px] opacity-100 transition-[opacity,padding,transform] duration-[220ms] ease-in-out [.has-no-document_&]:pointer-events-none [.has-no-document_&]:-translate-y-2 [.has-no-document_&]:overflow-hidden [.has-no-document_&]:py-0 [.has-no-document_&]:opacity-0"
      role="tablist"
      aria-label="Open documents"
    >
      {tabs.map((tab) => (
        <div
          aria-selected={tab.isActive}
          className={cn(
            "grid h-[35px] min-w-[132px] max-w-[220px] grid-cols-[minmax(0,1fr)_24px] items-center gap-1.5 overflow-hidden rounded-t-lg border border-[#2f3339] border-b-transparent bg-[#191c21] py-0 pl-3 pr-[7px] text-left text-[13px] font-bold text-inherit hover:border-[#4c535c] hover:bg-[#252930]",
            tab.isActive && "border-[#4aa391] border-b-[#191c21] bg-[#202b29] text-[#f2f7f5]"
          )}
          key={tab.id}
          onClick={() => onSelectTab(tab.id)}
          onDoubleClick={() => startRename(tab)}
          role="tab"
        >
          {editingTabId === tab.id ? (
            <input
              aria-label={`Rename ${tab.title}`}
              autoFocus
              className="min-w-0 truncate border-0 bg-transparent [font:inherit] text-inherit outline-0 focus:text-white"
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
              <span className="min-w-0 truncate">{tab.title}</span>
          )}
          <button
            aria-label={`Close ${tab.title}`}
            className="grid h-6 w-6 place-items-center rounded-md border border-transparent bg-transparent text-xs leading-none text-[#9aa1ab] hover:border-[#4c535c] hover:bg-[#252930] hover:text-[#f2f4f7] focus-visible:border-[#4c535c] focus-visible:bg-[#252930] focus-visible:text-[#f2f4f7]"
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
