export type ToolDefinition = {
  description: string;
  icon: string;
  label: string;
  status?: "available" | "later";
  value: string;
};

type ToolsPanelProps = {
  onSelectTool: (tool: string) => void;
  selectedTool: string;
  tools: ToolDefinition[];
};

export function ToolsPanel({ onSelectTool, selectedTool, tools }: ToolsPanelProps) {
  const availableTools = tools.filter((tool) => tool.status !== "later");
  const laterTools = tools.filter((tool) => tool.status === "later");

  return (
    <aside className="tools-panel" aria-label="Left tools panel">
      <p className="panel-title">Tools</p>
      <ToolGroup onSelectTool={onSelectTool} selectedTool={selectedTool} tools={availableTools} />
      {laterTools.length > 0 ? (
        <>
          <p className="tools-section-title">Later</p>
          <ToolGroup
            onSelectTool={onSelectTool}
            selectedTool={selectedTool}
            tools={laterTools}
          />
        </>
      ) : null}
    </aside>
  );
}

function ToolGroup({
  onSelectTool,
  selectedTool,
  tools
}: {
  onSelectTool: (tool: string) => void;
  selectedTool: string;
  tools: ToolDefinition[];
}) {
  return (
    <div className="tools-grid">
      {tools.map((tool) => {
        const isDisabled = tool.status === "later";

        return (
          <button
            aria-pressed={tool.value === selectedTool}
            className={`tool-button${isDisabled ? " is-disabled" : ""}`}
            disabled={isDisabled}
            key={tool.value}
            onClick={() => onSelectTool(tool.value)}
            type="button"
          >
            <span className="tool-icon" aria-hidden="true">
              {tool.icon}
            </span>
            <span className="tool-copy">
              <span className="tool-name">{tool.label}</span>
              <span className="tool-description">{tool.description}</span>
            </span>
          </button>
        );
      })}
    </div>
  );
}
