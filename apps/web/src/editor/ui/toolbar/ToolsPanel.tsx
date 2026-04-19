import type { ShapeKind } from "../../layers/ShapeLayer";
import { cn } from "../classNames";

export type ToolDefinition = {
  description: string;
  icon: string;
  label: string;
  status?: "available" | "later";
  value: string;
};

type ToolsPanelProps = {
  onSelectTool: (tool: string) => void;
  onSelectShape: (shape: ShapeKind) => void;
  selectedShape: ShapeKind;
  selectedTool: string;
  tools: ToolDefinition[];
};

export function ToolsPanel({
  onSelectShape,
  onSelectTool,
  selectedShape,
  selectedTool,
  tools
}: ToolsPanelProps) {
  const availableTools = tools.filter((tool) => tool.status !== "later");
  const laterTools = tools.filter((tool) => tool.status === "later");

  return (
    <aside
      className="min-h-0 overflow-auto bg-[#17191d] px-2.5 py-3 opacity-100 transition-[opacity,padding,transform] duration-[220ms] ease-in-out [.has-no-document_&]:pointer-events-none [.has-no-document_&]:-translate-x-2.5 [.has-no-document_&]:px-0 [.has-no-document_&]:opacity-0"
      aria-label="Left tools panel"
    >
      <p className="m-0 mb-2.5 text-xs font-bold uppercase tracking-normal text-[#9aa1ab]">
        Tools
      </p>
      <ToolGroup
        onSelectShape={onSelectShape}
        onSelectTool={onSelectTool}
        selectedShape={selectedShape}
        selectedTool={selectedTool}
        tools={availableTools}
      />
      {laterTools.length > 0 ? (
        <>
          <p className="m-0 mb-2 mt-3.5 text-[11px] font-extrabold uppercase tracking-normal text-[#737b86]">
            Later
          </p>
          <ToolGroup
            onSelectShape={onSelectShape}
            onSelectTool={onSelectTool}
            selectedShape={selectedShape}
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
  onSelectShape,
  selectedShape,
  selectedTool,
  tools
}: {
  onSelectTool: (tool: string) => void;
  onSelectShape: (shape: ShapeKind) => void;
  selectedShape: ShapeKind;
  selectedTool: string;
  tools: ToolDefinition[];
}) {
  return (
    <div className="grid gap-[7px]">
      {tools.map((tool) => {
        const isDisabled = tool.status === "later";

        return (
          <div className="grid gap-1.5" key={tool.value}>
            <button
              aria-pressed={tool.value === selectedTool}
              className={cn(
                "grid min-h-16 w-full grid-cols-[34px_minmax(0,1fr)] items-center gap-[9px] rounded-lg border border-transparent bg-[#15181d] bg-[linear-gradient(180deg,rgba(255,255,255,0.025),rgba(255,255,255,0))] p-2 text-left text-[11px] text-[#d9dde3] hover:border-[#4c535c] hover:bg-[#252930] max-[760px]:min-h-[58px]",
                tool.value === selectedTool &&
                  "border-[#4aa391] bg-[#172722] bg-[linear-gradient(180deg,rgba(74,163,145,0.2),rgba(74,163,145,0.05))] text-[#dff7f1]",
                isDisabled && "cursor-not-allowed text-[#737b86] opacity-70"
              )}
              disabled={isDisabled}
              onClick={() => onSelectTool(tool.value)}
              type="button"
            >
              <span
                className={cn(
                  "grid h-[34px] w-[34px] place-items-center rounded-md border border-[#30353d] bg-[#20242b] text-xs font-extrabold text-[#e8f4f1]",
                  tool.value === selectedTool && "border-[#5bb7a4] bg-[#25453e]"
                )}
                aria-hidden="true"
              >
                {tool.icon}
              </span>
              <span className="grid min-w-0 gap-0.5">
                <span className="truncate text-xs font-extrabold text-[#eef1f4] max-[760px]:break-words">
                  {tool.label}
                </span>
                <span
                  className={cn(
                    "line-clamp-2 overflow-hidden text-[11px] leading-tight text-[#929aa5] max-[760px]:break-words",
                    tool.value === selectedTool && "text-[#aee2d8]"
                  )}
                >
                  {tool.description}
                </span>
              </span>
            </button>
            {tool.value === "Shape" && tool.value === selectedTool ? (
              <label className="grid gap-1 rounded-lg border border-[#2b403b] bg-[#121d1a] p-2">
                <span className="text-[11px] font-extrabold uppercase text-[#91cfc2]">
                  Form
                </span>
                <select
                  className="w-full rounded-md border border-[#36534c] bg-[#15171b] px-2 py-1.5 text-xs font-bold text-[#eef1f4]"
                  onChange={(event) => onSelectShape(toShapeKind(event.target.value))}
                  value={selectedShape}
                >
                  <option value="rectangle">Rectangle</option>
                  <option value="circle">Circle</option>
                  <option value="line">Line</option>
                  <option value="triangle">Triangle</option>
                  <option value="diamond">Diamond</option>
                  <option value="arrow">Arrow</option>
                </select>
              </label>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}

function toShapeKind(value: string): ShapeKind {
  if (
    value === "circle" ||
    value === "line" ||
    value === "triangle" ||
    value === "diamond" ||
    value === "arrow"
  ) {
    return value;
  }

  return "rectangle";
}
