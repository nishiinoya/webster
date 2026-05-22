import { useEffect, useState } from "react";
import {
  listProjects,
  type ProjectSummary
} from "../collaboration/sharedProjectApi";
import {
  listRecentlyOpenedProjects,
  type RecentSharedProject
} from "../projects/recentSharedProjects";

type HomeProjectsProps = {
  onOpenProject: (projectId: string, projectName: string) => void;
};

type Tab = "recent" | "all";

const ALL_PAGE_SIZE = 8;

export function HomeProjects({ onOpenProject }: HomeProjectsProps) {
  const [tab, setTab] = useState<Tab>("recent");
  const [recent, setRecent] = useState<RecentSharedProject[]>([]);
  const [allProjects, setAllProjects] = useState<ProjectSummary[]>([]);
  const [isLoadingAll, setIsLoadingAll] = useState(true);
  const [allError, setAllError] = useState<string | null>(null);
  const [page, setPage] = useState(0);

  const pageCount = Math.max(1, Math.ceil(allProjects.length / ALL_PAGE_SIZE));
  const currentPage = Math.min(page, pageCount - 1);
  const pageProjects = allProjects.slice(
    currentPage * ALL_PAGE_SIZE,
    currentPage * ALL_PAGE_SIZE + ALL_PAGE_SIZE
  );

  useEffect(() => {
    setRecent(listRecentlyOpenedProjects(10));
  }, []);

  useEffect(() => {
    let cancelled = false;

    listProjects()
      .then((response) => {
        if (!cancelled) {
          setAllProjects(response.projects);
        }
      })
      .catch((error) => {
        if (!cancelled) {
          setAllError(error instanceof Error ? error.message : "Unable to load projects.");
        }
      })
      .finally(() => {
        if (!cancelled) {
          setIsLoadingAll(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="grid w-[min(620px,100%)] gap-3 text-left">
      <div className="flex items-center gap-2">
        <button
          aria-pressed={tab === "recent"}
          className={tabClass(tab === "recent")}
          onClick={() => setTab("recent")}
          type="button"
        >
          Recently opened
        </button>
        <button
          aria-pressed={tab === "all"}
          className={tabClass(tab === "all")}
          onClick={() => setTab("all")}
          type="button"
        >
          All projects
        </button>
      </div>

      {tab === "recent" ? (
        recent.length > 0 ? (
          <div className="grid gap-2">
            {recent.map((entry) => (
              <ProjectRow
                key={entry.projectId}
                onOpen={() => onOpenProject(entry.projectId, entry.projectName)}
                subtitle={formatWhen(entry.openedAt)}
                title={entry.projectName}
              />
            ))}
          </div>
        ) : (
          <EmptyNote>No recently opened projects yet.</EmptyNote>
        )
      ) : (
        <div className="grid gap-2">
          {isLoadingAll ? (
            <EmptyNote>Loading...</EmptyNote>
          ) : allError ? (
            <EmptyNote tone="error">{allError}</EmptyNote>
          ) : allProjects.length > 0 ? (
            <>
              {pageProjects.map((project) => (
                <ProjectRow
                  key={project.id}
                  onOpen={() => onOpenProject(project.id, project.projectName)}
                  subtitle={`${capitalize(project.role)} · ${formatWhen(Date.parse(project.updatedAt))}`}
                  title={project.projectName}
                />
              ))}
              {pageCount > 1 ? (
                <div className="mt-1 flex items-center justify-between gap-3">
                  <button
                    className={pagerClass}
                    disabled={currentPage === 0}
                    onClick={() => setPage((p) => Math.max(0, p - 1))}
                    type="button"
                  >
                    Prev
                  </button>
                  <span className="text-[12px] font-bold text-[#8b929b]">
                    Page {currentPage + 1} of {pageCount}
                  </span>
                  <button
                    className={pagerClass}
                    disabled={currentPage >= pageCount - 1}
                    onClick={() => setPage((p) => Math.min(pageCount - 1, p + 1))}
                    type="button"
                  >
                    Next
                  </button>
                </div>
              ) : null}
            </>
          ) : (
            <EmptyNote>You have no projects yet.</EmptyNote>
          )}
        </div>
      )}
    </div>
  );
}

function ProjectRow({
  onOpen,
  subtitle,
  title
}: {
  onOpen: () => void;
  subtitle: string;
  title: string;
}) {
  return (
    <button
      className="flex min-h-[52px] w-full items-center justify-between gap-4 rounded-lg border border-[#30353d] bg-[#17191d] px-3 py-2.5 text-left font-bold text-[#eef1f4] hover:border-[#4aa391] hover:bg-[#203731] focus-visible:border-[#4aa391] focus-visible:bg-[#203731]"
      onClick={onOpen}
      type="button"
    >
      <span className="truncate">{title}</span>
      <strong className="whitespace-nowrap text-xs font-bold text-[#9aa1ab]">
        {subtitle}
      </strong>
    </button>
  );
}

function EmptyNote({
  children,
  tone = "muted"
}: {
  children: React.ReactNode;
  tone?: "muted" | "error";
}) {
  return (
    <p
      className={`m-0 rounded-lg border border-[#30353d] bg-[#17191d] p-3 text-[13px] font-bold ${
        tone === "error" ? "text-[#ffb9b9]" : "text-[#8b929b]"
      }`}
    >
      {children}
    </p>
  );
}

const pagerClass =
  "rounded-md border border-[#30353d] bg-[#17191d] px-3 py-1.5 text-[12px] font-bold text-[#dce1e6] hover:border-[#4aa391] disabled:opacity-40 disabled:hover:border-[#30353d]";

function tabClass(active: boolean) {
  return `rounded-lg border px-3 py-2 text-[13px] font-bold ${
    active
      ? "border-[#4aa391] bg-[#203731] text-[#eef1f4]"
      : "border-[#30353d] bg-[#17191d] text-[#9aa1ab] hover:border-[#4aa391]"
  }`;
}

function capitalize(value: string) {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function formatWhen(timestamp: number) {
  if (!Number.isFinite(timestamp)) {
    return "";
  }
  const diffMs = Date.now() - timestamp;
  const minutes = Math.round(diffMs / 60000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(timestamp).toLocaleDateString();
}
