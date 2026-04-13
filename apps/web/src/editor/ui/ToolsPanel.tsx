type ToolsPanelProps = {
  onSelectTool: (tool: string) => void;
  selectedTool: string;
  tools: string[];
};

export function ToolsPanel({ onSelectTool, selectedTool, tools }: ToolsPanelProps) {
  return (
    <aside className="tools-panel" aria-label="Left tools panel">
      <p className="panel-title">Tools</p>
      <div className="tools-grid">
        {tools.map((tool) => (
          <button
            aria-pressed={tool === selectedTool}
            className="tool-button"
            key={tool}
            onClick={() => onSelectTool(tool)}
            type="button"
          >
            <span className="tool-icon" aria-hidden="true">
              {tool.slice(0, 1)}
            </span>
            <span>{tool}</span>
          </button>
        ))}
      </div>
    </aside>
  );
}
