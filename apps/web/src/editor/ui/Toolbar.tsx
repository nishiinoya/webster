import { useRef } from "react";

type ToolbarProps = {
  documentTitle: string;
  onOpenProject: (file: File) => void;
  onSaveProject: () => void;
  onUploadImage: (file: File) => void;
  selectedTool: string;
  zoomPercentage: number;
};

const toolbarActions = ["Edit", "View", "Select", "Filter"];

export function Toolbar({
  documentTitle,
  onOpenProject,
  onSaveProject,
  onUploadImage,
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

  function openProjectPicker() {
    fileMenuRef.current?.removeAttribute("open");
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
            <button className="toolbar-menu-item" disabled type="button">
              New
            </button>
            <button className="toolbar-menu-item" onClick={openProjectPicker} type="button">
              Open .webster...
            </button>
            <button className="toolbar-menu-item" onClick={openImagePicker} type="button">
              Import image as layer...
            </button>
            <button
              className="toolbar-menu-item"
              onClick={() => {
                fileMenuRef.current?.removeAttribute("open");
                onSaveProject();
              }}
              type="button"
            >
              Save .webster
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
              onOpenProject(file);
              event.target.value = "";
            }
          }}
          type="file"
        />
      </nav>
      <div className="toolbar-status" aria-label="Current editor status">
        <span>{selectedTool}</span>
        <span>{zoomPercentage}%</span>
      </div>
    </header>
  );
}
