import type { HistoryEntrySummary } from "../../app/EditorApp";
import { cn } from "../classNames";

type HistoryPanelProps = {
  entries: HistoryEntrySummary[];
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
          "m-0 grid min-h-0 gap-2 overflow-auto px-3 pb-3 pl-3 text-[13px] min-[1400px]:text-sm",
          isCollapsed && "hidden"
        )}
      >
        {entries.length > 0 ? (
          entries.map((entry, index) => (
            <li
              className={cn(
                "grid grid-cols-[auto_1fr_auto] items-center gap-2 rounded-lg border px-2.5 py-2",
                entry.isCurrent &&
                  "border-[#4aa391] bg-[#203731] text-[#eef1f4]",
                !entry.isCurrent &&
                  !entry.isUndone &&
                  "border-[#30353d] bg-[#202329] text-[#d9dde3]",
                entry.isUndone &&
                  "border-transparent bg-transparent text-[#6f7680]"
              )}
              key={entry.id}
            >
              <span className="text-[11px] font-bold text-inherit">{index + 1}</span>
              <span className="truncate font-semibold">{entry.label}</span>
              <span className="text-[10px] font-bold uppercase tracking-normal text-inherit">
                {entry.isCurrent ? "Current" : entry.isUndone ? "Redo" : "Done"}
              </span>
            </li>
          ))
        ) : (
          <li className="rounded-lg border border-dashed border-[#30353d] px-2.5 py-3 text-[#8b929b]">
            No edits yet.
          </li>
        )}
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
