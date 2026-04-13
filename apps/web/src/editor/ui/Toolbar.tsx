type ToolbarProps = {
  documentTitle: string;
  selectedTool: string;
  zoomPercentage: number;
};

const toolbarActions = ["File", "Edit", "View", "Select", "Filter"];

export function Toolbar({ documentTitle, selectedTool, zoomPercentage }: ToolbarProps) {
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
        {toolbarActions.map((action) => (
          <button className="toolbar-button" key={action} type="button">
            {action}
          </button>
        ))}
      </nav>
      <div className="toolbar-status" aria-label="Current editor status">
        <span>{selectedTool}</span>
        <span>{zoomPercentage}%</span>
      </div>
    </header>
  );
}
