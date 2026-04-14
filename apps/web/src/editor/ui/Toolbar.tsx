import { useRef } from "react";
import {
  canPickProjectFileHandle,
  pickProjectFileWithHandle
} from "./canvas/projectFiles";
import type { WebsterFileHandle } from "./canvas/projectFiles";
import type { SaveStatus } from "./canvas/useProjectFileActions";

type ToolbarProps = {
  canEditDocument: boolean;
  documentTitle: string;
  onNewDocument: () => void;
  onOpenProject: (file: File, handle?: WebsterFileHandle | null) => void;
  onSaveAsProject: () => void;
  onSaveProject: () => void;
  onUploadImage: (file: File) => void;
  saveStatus: SaveStatus;
  selectedTool: string;
  zoomPercentage: number;
};

const toolbarActions = ["Edit", "View", "Select", "Filter"];

export function Toolbar({
  canEditDocument,
  documentTitle,
  onNewDocument,
  onOpenProject,
  onSaveAsProject,
  onSaveProject,
  onUploadImage,
  saveStatus,
  selectedTool,
  zoomPercentage
}: ToolbarProps) {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const fileMenuRef = useRef<HTMLDetailsElement | null>(null);
  const projectInputRef = useRef<HTMLInputElement | null>(null);

  function openImagePicker() {
    fileMenuRef.current?.removeAttribute("open");
    fileInputRef.current?.click();
  }

  async function openProjectPicker() {
    fileMenuRef.current?.removeAttribute("open");

    if (canPickProjectFileHandle()) {
      try {
        const pickedProject = await pickProjectFileWithHandle();

        if (pickedProject) {
          onOpenProject(pickedProject.file, pickedProject.handle);
        }
      } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError") {
          return;
        }

        throw error;
      }

      return;
    }

    projectInputRef.current?.click();
  }

  return (
    <header className="editor-toolbar" aria-label="Top toolbar">
      <div className="toolbar-brand">
        <span className="toolbar-mark" aria-hidden="true">
          W
        </span>
        <div>
          <p className="toolbar-kicker">Webster</p>
          <h1>{documentTitle}</h1>
        </div>
      </div>
      <nav className="toolbar-actions" aria-label="Editor menus">
        <details className="toolbar-menu" ref={fileMenuRef}>
          <summary className="toolbar-button">File</summary>
          <div className="toolbar-menu-content" role="menu">
            <button
              className="toolbar-menu-item"
              onClick={() => {
                fileMenuRef.current?.removeAttribute("open");
                onNewDocument();
              }}
              type="button"
            >
              New
            </button>
            <button className="toolbar-menu-item" onClick={openProjectPicker} type="button">
              Open .webster...
            </button>
            <button
              className="toolbar-menu-item"
              disabled={!canEditDocument}
              onClick={openImagePicker}
              type="button"
            >
              Import image as layer...
            </button>
            <button
              className="toolbar-menu-item"
              disabled={!canEditDocument}
              onClick={() => {
                fileMenuRef.current?.removeAttribute("open");
                onSaveProject();
              }}
              type="button"
            >
              Save
            </button>
            <button
              className="toolbar-menu-item"
              disabled={!canEditDocument}
              onClick={() => {
                fileMenuRef.current?.removeAttribute("open");
                onSaveAsProject();
              }}
              type="button"
            >
              Save as .webster...
            </button>
            <button className="toolbar-menu-item" disabled type="button">
              Export
            </button>
          </div>
        </details>
        {toolbarActions.map((action) => (
          <button className="toolbar-button" key={action} type="button">
            {action}
          </button>
        ))}
        <input
          ref={fileInputRef}
          accept="image/*"
          className="visually-hidden"
          onChange={(event) => {
            const file = event.target.files?.[0];

            if (file) {
              onUploadImage(file);
              event.target.value = "";
            }
          }}
          type="file"
        />
        <input
          ref={projectInputRef}
          accept=".webster,application/zip,application/vnd.webster.project"
          className="visually-hidden"
          onChange={(event) => {
            const file = event.target.files?.[0];

            if (file) {
              onOpenProject(file, null);
              event.target.value = "";
            }
          }}
          type="file"
        />
      </nav>
      <div className="toolbar-status" aria-label="Current editor status">
        {saveStatus !== "idle" ? <span>{getSaveStatusLabel(saveStatus)}</span> : null}
        <span>{selectedTool}</span>
        <span>{zoomPercentage}%</span>
      </div>
    </header>
  );
}

function getSaveStatusLabel(status: SaveStatus) {
  if (status === "saving") {
    return "Saving...";
  }

  if (status === "saved") {
    return "Saved";
  }

  return "Save failed";
}
