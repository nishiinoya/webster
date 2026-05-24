import { useEffect, useMemo, useState } from "react";
import {
  acceptPendingProjectInvite,
  listProjects,
  type ProjectInviteSummary,
  type ProjectSummary
} from "../collaboration/sharedProjectApi";
import {
  listRecentlyOpenedProjects,
  type RecentSharedProject
} from "../projects/recentSharedProjects";

type HomeProjectsProps = {
  onOpenProject: (projectId: string, projectName: string) => void;
};

type Tab = "recent" | "owned" | "shared" | "invites";

export function HomeProjects({ onOpenProject }: HomeProjectsProps) {
  const [tab, setTab] = useState<Tab>("recent");
  const [recent, setRecent] = useState<RecentSharedProject[]>([]);
  const [owned, setOwned] = useState<ProjectSummary[]>([]);
  const [sharedWithMe, setSharedWithMe] = useState<ProjectSummary[]>([]);
  const [pendingInvites, setPendingInvites] = useState<ProjectInviteSummary[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [acceptingInviteId, setAcceptingInviteId] = useState<string | null>(null);

  const projectsById = useMemo(() => {
    const map = new Map<string, ProjectSummary>();

    for (const project of [...owned, ...sharedWithMe]) {
      map.set(project.id, project);
    }

    return map;
  }, [owned, sharedWithMe]);

  const recentProjects = recent
    .map((entry) => {
      const project = projectsById.get(entry.projectId);

      return project ? { ...project, openedAt: entry.openedAt } : null;
    })
    .filter((project): project is ProjectSummary & { openedAt: number } => Boolean(project));

  useEffect(() => {
    setRecent(listRecentlyOpenedProjects(10));
  }, []);

  useEffect(() => {
    let cancelled = false;

    loadCloudProjects();

    async function loadCloudProjects() {
      setIsLoading(true);
      setError(null);

      try {
        const response = await listProjects();

        if (!cancelled) {
          setOwned(response.owned);
          setSharedWithMe(response.sharedWithMe);
          setPendingInvites(response.pendingInvites);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Unable to load projects.");
        }
      } finally {
        if (!cancelled) {
          setIsLoading(false);
        }
      }
    }

    return () => {
      cancelled = true;
    };
  }, []);

  async function acceptInvite(invite: ProjectInviteSummary) {
    setAcceptingInviteId(invite.id);
    setError(null);

    try {
      const accepted = await acceptPendingProjectInvite(invite.id);

      setPendingInvites((current) => current.filter((item) => item.id !== invite.id));
      onOpenProject(accepted.projectId, accepted.projectName);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to accept invite.");
    } finally {
      setAcceptingInviteId(null);
    }
  }

  return (
    <div className="grid w-[min(680px,100%)] gap-3 text-left">
      <div className="flex flex-wrap items-center gap-2">
        <ProjectTab active={tab === "recent"} onClick={() => setTab("recent")}>
          Recent
        </ProjectTab>
        <ProjectTab active={tab === "owned"} onClick={() => setTab("owned")}>
          My projects
        </ProjectTab>
        <ProjectTab active={tab === "shared"} onClick={() => setTab("shared")}>
          Shared with me
        </ProjectTab>
        <ProjectTab active={tab === "invites"} onClick={() => setTab("invites")}>
          Invites
        </ProjectTab>
      </div>

      {isLoading ? (
        <EmptyNote>Loading...</EmptyNote>
      ) : error ? (
        <EmptyNote tone="error">{error}</EmptyNote>
      ) : tab === "recent" ? (
        recentProjects.length > 0 ? (
          <ProjectList
            projects={recentProjects}
            getSubtitle={(project) => formatWhen(project.openedAt)}
            onOpenProject={onOpenProject}
          />
        ) : (
          <EmptyNote>No cloud projects opened here yet.</EmptyNote>
        )
      ) : tab === "owned" ? (
        owned.length > 0 ? (
          <ProjectList
            projects={owned}
            getSubtitle={(project) => formatWhen(Date.parse(project.updatedAt))}
            onOpenProject={onOpenProject}
          />
        ) : (
          <EmptyNote>No cloud projects yet.</EmptyNote>
        )
      ) : tab === "shared" ? (
        sharedWithMe.length > 0 ? (
          <ProjectList
            projects={sharedWithMe}
            getSubtitle={(project) =>
              `${formatWhen(Date.parse(project.updatedAt))}${
                project.owner ? ` by ${project.owner.displayName || project.owner.email}` : ""
              }`
            }
            onOpenProject={onOpenProject}
          />
        ) : (
          <EmptyNote>No shared projects yet.</EmptyNote>
        )
      ) : pendingInvites.length > 0 ? (
        <div className="grid gap-2">
          {pendingInvites.map((invite) => (
            <InviteRow
              invite={invite}
              isAccepting={acceptingInviteId === invite.id}
              key={invite.id}
              onAccept={() => acceptInvite(invite)}
            />
          ))}
        </div>
      ) : (
        <EmptyNote>No pending invites.</EmptyNote>
      )}
    </div>
  );
}

function ProjectList<T extends ProjectSummary>({
  getSubtitle,
  onOpenProject,
  projects
}: {
  getSubtitle: (project: T) => string;
  onOpenProject: (projectId: string, projectName: string) => void;
  projects: T[];
}) {
  return (
    <div className="grid gap-2">
      {projects.map((project) => (
        <ProjectRow
          key={project.id}
          onOpen={() => onOpenProject(project.id, project.projectName)}
          project={project}
          subtitle={getSubtitle(project)}
        />
      ))}
    </div>
  );
}

function ProjectRow({
  onOpen,
  project,
  subtitle
}: {
  onOpen: () => void;
  project: ProjectSummary;
  subtitle: string;
}) {
  return (
    <button
      className="grid min-h-[58px] w-full grid-cols-[minmax(0,1fr)_auto] items-center gap-4 rounded-lg border border-[#30353d] bg-[#17191d] px-3 py-2.5 text-left font-bold text-[#eef1f4] hover:border-[#4aa391] hover:bg-[#203731] focus-visible:border-[#4aa391] focus-visible:bg-[#203731]"
      onClick={onOpen}
      type="button"
    >
      <span className="min-w-0">
        <span className="block truncate">{project.projectName}</span>
        <span className="block truncate text-[12px] text-[#8b929b]">{subtitle}</span>
      </span>
      <RoleBadge role={project.role} />
    </button>
  );
}

function InviteRow({
  invite,
  isAccepting,
  onAccept
}: {
  invite: ProjectInviteSummary;
  isAccepting: boolean;
  onAccept: () => void;
}) {
  return (
    <div className="grid min-h-[62px] grid-cols-[minmax(0,1fr)_auto] items-center gap-3 rounded-lg border border-[#30353d] bg-[#17191d] px-3 py-2.5">
      <span className="min-w-0">
        <span className="block truncate font-bold text-[#eef1f4]">{invite.projectName}</span>
        <span className="block truncate text-[12px] font-bold text-[#8b929b]">
          From {invite.invitedByUser.displayName || invite.invitedByUser.email} - {formatWhen(Date.parse(invite.createdAt))}
        </span>
      </span>
      <span className="flex items-center gap-2">
        <RoleBadge role={invite.permission} />
        <button
          className={pagerClass}
          disabled={isAccepting}
          onClick={onAccept}
          type="button"
        >
          {isAccepting ? "Accepting..." : "Accept"}
        </button>
      </span>
    </div>
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

function ProjectTab({
  active,
  children,
  onClick
}: {
  active: boolean;
  children: React.ReactNode;
  onClick: () => void;
}) {
  return (
    <button
      aria-pressed={active}
      className={tabClass(active)}
      onClick={onClick}
      type="button"
    >
      {children}
    </button>
  );
}

function RoleBadge({ role }: { role: ProjectSummary["role"] | ProjectInviteSummary["permission"] }) {
  return (
    <strong className="whitespace-nowrap rounded-md border border-[#3b424b] bg-[#202329] px-2 py-1 text-[11px] font-extrabold uppercase text-[#cfd4da]">
      {capitalize(role)}
    </strong>
  );
}

const pagerClass =
  "rounded-md border border-[#30353d] bg-[#202329] px-3 py-1.5 text-[12px] font-bold text-[#dce1e6] hover:border-[#4aa391] disabled:opacity-40 disabled:hover:border-[#30353d]";

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
