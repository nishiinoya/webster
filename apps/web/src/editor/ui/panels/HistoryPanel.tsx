import { cn } from "../classNames";

type HistoryPanelProps = {
  entries: string[];
  isCollapsed: boolean;
  onToggleCollapsed: () => void;
};

export function HistoryPanel({
  entries,
  isCollapsed,
  onToggleCollapsed
}: HistoryPanelProps) {
  return (
    <section
      className="grid min-h-0 grid-rows-[42px_minmax(0,1fr)] overflow-hidden border-b border-[#2a2d31] last:border-b-0 max-[760px]:border-b-0 max-[760px]:border-r max-[760px]:border-[#2a2d31]"
      aria-label="History panel"
    >
      <div className="flex min-h-[42px] items-center justify-between gap-2 px-3 py-2">
        <div className="flex min-w-0 items-center gap-2">
          <PanelToggleButton
            isCollapsed={isCollapsed}
            label={isCollapsed ? "Open History panel" : "Collapse History panel"}
            onClick={onToggleCollapsed}
          />
          <h2 className="m-0 truncate text-[13px] font-extrabold tracking-normal text-[#f2f4f7] min-[1400px]:text-sm">
            History
          </h2>
        </div>
      </div>
      <ol
        className={cn(
          "m-0 grid min-h-0 gap-2 overflow-auto px-3 pb-3 pl-8 text-[13px] text-[#d9dde3] min-[1400px]:text-sm",
          isCollapsed && "hidden"
        )}
      >
        {entries.map((entry) => (
          <li className="py-1" key={entry}>
            {entry}
          </li>
        ))}
      </ol>
    </section>
  );
}

function PanelToggleButton({
  isCollapsed,
  label,
  onClick
}: {
  isCollapsed: boolean;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      aria-label={label}
      aria-expanded={!isCollapsed}
      className="grid h-6 w-6 flex-none place-items-center rounded-md border border-[#333941] bg-[#202329] text-sm font-bold leading-none text-[#c9cdd2] hover:border-[#4aa391] hover:bg-[#203731] focus-visible:border-[#4aa391] focus-visible:bg-[#203731]"
      onClick={onClick}
      type="button"
    >
      <span
        className={cn(
          "translate-y-[-1px] transition-transform duration-150",
          isCollapsed && "-rotate-90"
        )}
        aria-hidden="true"
      >
        v
      </span>
    </button>
  );
}
