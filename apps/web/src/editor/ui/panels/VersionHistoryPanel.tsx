import type {
  ProjectRole,
  ProjectRoleCapabilities,
  SharedProjectPresence,
  SharedProjectSnapshotSummary
} from "@webster/shared";
import { cn } from "../classNames";

type VersionHistoryPanelProps = {
  capabilities: ProjectRoleCapabilities;
  currentVersion: number | null;
  isCollapsed: boolean;
  isSharedMode: boolean;
  onCreateSnapshot: () => void;
  onDownloadWebster: () => void;
  onRefreshSnapshots: () => void;
  onRestoreSnapshot: (snapshotId: string) => void;
  onToggleCollapsed: () => void;
  pendingCommitCount: number;
  projectId: string | null;
  role: ProjectRole | null;
  snapshots: SharedProjectSnapshotSummary[];
  users: SharedProjectPresence[];
};

export function VersionHistoryPanel({
  capabilities,
  currentVersion,
  isCollapsed,
  isSharedMode,
  onCreateSnapshot,
  onDownloadWebster,
  onRefreshSnapshots,
  onRestoreSnapshot,
  onToggleCollapsed,
  pendingCommitCount,
  projectId,
  role,
  snapshots,
  users
}: VersionHistoryPanelProps) {
  return (
    <section
      className="grid h-full min-h-0 grid-rows-[42px_minmax(0,1fr)] overflow-hidden border-b border-[#2a2d31] last:border-b-0 max-[760px]:border-b-0 max-[760px]:border-r max-[760px]:border-[#2a2d31]"
      aria-label="Version history panel"
    >
      <div className="flex min-h-[42px] items-center justify-between gap-2 px-3 py-2">
        <div className="flex min-w-0 items-center gap-2">
          <PanelToggleButton
            isCollapsed={isCollapsed}
            label={isCollapsed ? "Open Version History panel" : "Collapse Version History panel"}
            onClick={onToggleCollapsed}
          />
          <h2 className="m-0 truncate text-[13px] font-extrabold tracking-normal text-[#f2f4f7] min-[1400px]:text-sm">
            Versions
          </h2>
        </div>
        <span className="text-xs font-bold text-[#9aa1ab]">
          {isSharedMode ? `v${currentVersion ?? 0}` : "local"}
        </span>
      </div>
      <div className={cn("min-h-0 overflow-auto px-3 pb-3", isCollapsed && "hidden")}>
        <div className="grid gap-3">
          <div className="grid gap-2 border-b border-[#2d3137] pb-3">
            <div className="grid grid-cols-2 gap-2 text-[11px] font-bold text-[#9aa1ab]">
              <span>Mode</span>
              <strong className="text-right text-[#eef1f4]">
                {isSharedMode ? role ?? "shared" : "local"}
              </strong>
              <span>Project</span>
              <strong className="truncate text-right text-[#eef1f4]">{projectId ?? "none"}</strong>
              <span>Pending</span>
              <strong className="text-right text-[#eef1f4]">{pendingCommitCount}</strong>
            </div>
            {isSharedMode ? (
              <div className="flex min-h-7 flex-wrap gap-1.5" aria-label="Online users">
                {users.length > 0 ? (
                  users.map((presence) => (
                    <span
                      className="max-w-full truncate rounded-md border border-[#30353d] bg-[#111317] px-2 py-1 text-[11px] font-bold text-[#cfd4da]"
                      key={presence.user.id}
                      title={presence.tool ? `${presence.user.displayName} - ${presence.tool}` : presence.user.displayName}
                    >
                      {presence.user.displayName}
                      {presence.tool ? ` - ${presence.tool}` : ""}
                    </span>
                  ))
                ) : (
                  <span className="text-[11px] font-bold text-[#8b929b]">Only you online</span>
                )}
              </div>
            ) : null}
            <div className="grid grid-cols-2 gap-2">
              <button
                className={panelButtonClass}
                disabled={!isSharedMode || !capabilities.canCreateSnapshots}
                onClick={onCreateSnapshot}
                type="button"
              >
                Snapshot
              </button>
              <button
                className={panelButtonClass}
                disabled={!isSharedMode}
                onClick={onRefreshSnapshots}
                type="button"
              >
                Refresh
              </button>
              <button
                className={cn(panelButtonClass, "col-span-2")}
                disabled={!isSharedMode || !capabilities.canDownloadWebster}
                onClick={onDownloadWebster}
                type="button"
              >
                Download .webster
              </button>
            </div>
          </div>
          {snapshots.length > 0 ? (
            <div className="grid gap-2">
              {snapshots.map((snapshot) => (
                <article
                  className={cn(
                    "grid gap-1 rounded-lg border border-[#30353d] bg-[#171a1f] p-2.5",
                    snapshot.isCurrent && "border-[#4aa391] bg-[#172722]"
                  )}
                  key={snapshot.id}
                >
                  <div className="flex items-center justify-between gap-2">
                    <strong className="text-[12px] text-[#eef1f4]">
                      Version {snapshot.version}
                    </strong>
                    <span className="rounded border border-[#3b5f58] bg-[#10231f] px-1.5 py-[2px] text-[10px] font-extrabold uppercase text-[#79dac7]">
                      {snapshot.type ?? "snapshot"}
                    </span>
                  </div>
                  <p className="m-0 text-[11px] font-bold text-[#9aa1ab]">
                    {formatSnapshotDate(snapshot.createdAt)}
                    {snapshot.authorName ? ` by ${snapshot.authorName}` : ""}
                  </p>
                  {snapshot.message ? (
                    <p className="m-0 line-clamp-2 text-[12px] font-bold text-[#d4d8de]">
                      {snapshot.message}
                    </p>
                  ) : null}
                  <button
                    className={panelButtonClass}
                    disabled={
                      !capabilities.canRestoreSnapshots ||
                      snapshot.isCurrent ||
                      currentVersion === snapshot.version
                    }
                    onClick={() => onRestoreSnapshot(snapshot.id)}
                    type="button"
                  >
                    Restore
                  </button>
                </article>
              ))}
            </div>
          ) : (
            <p className="m-0 text-[12px] font-bold text-[#8b929b]">
              {isSharedMode ? "No snapshots returned yet." : "Snapshots appear in shared mode."}
            </p>
          )}
        </div>
      </div>
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

function formatSnapshotDate(value: string) {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "Unknown date";
  }

  return date.toLocaleString(undefined, {
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    month: "short"
  });
}

const panelButtonClass =
  "rounded-md border border-[#333941] bg-[#202329] px-2 py-1.5 text-[11px] font-bold text-[#dce1e6] hover:border-[#4aa391] hover:bg-[#203731] focus-visible:border-[#4aa391] focus-visible:bg-[#203731] disabled:cursor-not-allowed disabled:text-[#747b85] disabled:opacity-70 disabled:hover:border-[#333941] disabled:hover:bg-[#202329]";
