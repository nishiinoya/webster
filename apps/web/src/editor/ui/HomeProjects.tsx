import { useEffect, useMemo, useState } from "react";
import { useAuth0 } from "@auth0/auth0-react";
import {
  acceptPendingProjectInvite,
  deleteProject,
  isUpgradeRequiredError,
  listProjects,
  type ProjectInviteSummary,
  type ProjectSummary
} from "../collaboration/sharedProjectApi";
import {
  listRecentlyOpenedProjects,
  type RecentSharedProject
} from "../projects/recentSharedProjects";
import { useSubscription } from "../collaboration/useSubscription";

type HomeProjectsProps = {
  onOpenProject: (projectId: string, projectName: string) => void;
};

type Tab = "recent" | "owned" | "shared" | "invites";

export function HomeProjects({ onOpenProject }: HomeProjectsProps) {
  const { isAuthenticated, isLoading: isAuthLoading, loginWithPopup, user } = useAuth0();
  const [tab, setTab] = useState<Tab>("recent");
  const [recent, setRecent] = useState<RecentSharedProject[]>([]);
  const [owned, setOwned] = useState<ProjectSummary[]>([]);
  const [sharedWithMe, setSharedWithMe] = useState<ProjectSummary[]>([]);
  const [pendingInvites, setPendingInvites] = useState<ProjectInviteSummary[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [errorRequiresUpgrade, setErrorRequiresUpgrade] = useState(false);
  const [acceptingInviteId, setAcceptingInviteId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const subscription = useSubscription();
  const isEmailVerifiedForCloud =
    isAuthenticated && user?.email_verified !== false;

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
    if (tab === "invites" && pendingInvites.length === 0) {
      setTab("recent");
    }
  }, [pendingInvites.length, tab]);

  useEffect(() => {
    let cancelled = false;

    if (isAuthLoading) {
      return;
    }

    if (!isAuthenticated || !isEmailVerifiedForCloud) {
      setIsLoading(false);
      setError(null);
      setOwned([]);
      setSharedWithMe([]);
      setPendingInvites([]);
      return;
    }

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
  }, [isAuthenticated, isAuthLoading, isEmailVerifiedForCloud]);

  async function acceptInvite(invite: ProjectInviteSummary) {
    if (!isEmailVerifiedForCloud) {
      setError("Confirm your email before accepting cloud invites.");
      return;
    }

    setAcceptingInviteId(invite.id);
    setError(null);
    setErrorRequiresUpgrade(false);

    try {
      const accepted = await acceptPendingProjectInvite(invite.id);

      setPendingInvites((current) => current.filter((item) => item.id !== invite.id));
      onOpenProject(accepted.projectId, accepted.projectName);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to accept invite.");
      setErrorRequiresUpgrade(isUpgradeRequiredError(err));
    } finally {
      setAcceptingInviteId(null);
    }
  }

  async function deleteOwnedProject(project: ProjectSummary) {
    if (!isEmailVerifiedForCloud) {
      setError("Confirm your email before managing cloud projects.");
      return;
    }

    if (
      !window.confirm(
        `Delete "${project.projectName}"? This removes it for everyone it's shared with.`
      )
    ) {
      return;
    }

    setDeletingId(project.id);
    setError(null);
    setErrorRequiresUpgrade(false);

    try {
      await deleteProject(project.id);
      setOwned((current) => current.filter((item) => item.id !== project.id));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to delete project.");
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <div className="grid w-[min(680px,100%)] gap-3 text-left">
      {isEmailVerifiedForCloud ? (
        <PlanBanner subscription={subscription} ownedCount={owned.length} />
      ) : null}

      {!isAuthLoading && !isAuthenticated ? (
        <div className="grid gap-3 rounded-lg border border-[#30353d] bg-[#17191d] p-3">
          <p className="m-0 text-[13px] font-bold text-[#8b929b]">
            Sign in to view cloud projects
          </p>
          <button
            className="w-fit rounded-lg border border-[#4aa391] bg-[#203731] px-3 py-2 text-[12px] font-extrabold text-[#eef1f4] hover:border-[#6fd6c1]"
            onClick={() => void loginWithPopup()}
            type="button"
          >
            Sign in
          </button>
        </div>
      ) : null}

      {isAuthenticated && !isEmailVerifiedForCloud ? (
        <div className="grid gap-2 rounded-lg border border-[#4f3f2b] bg-[#221d16] p-3">
          <p className="m-0 text-[13px] font-bold text-[#f0c98d]">
            Confirm your email to use cloud projects. Local projects still work.
          </p>
        </div>
      ) : null}

      {isEmailVerifiedForCloud ? (
      <>
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
        {pendingInvites.length > 0 ? (
          <ProjectTab active={tab === "invites"} onClick={() => setTab("invites")}>
            Invitations ({pendingInvites.length})
          </ProjectTab>
        ) : null}
      </div>

      {isLoading ? (
        <EmptyNote>Loading...</EmptyNote>
      ) : error ? (
        <EmptyNote tone="error">
          <span className="flex flex-wrap items-center gap-2">
            <span>{error}</span>
            {errorRequiresUpgrade ? (
              <a
                className="rounded-md border border-[#4aa391] bg-[#203731] px-2.5 py-1 text-[11px] font-extrabold text-[#eef1f4]"
                href="/billing"
              >
                Upgrade
              </a>
            ) : null}
          </span>
        </EmptyNote>
      ) : tab === "recent" ? (
        recentProjects.length > 0 ? (
          <ProjectList
            key="recent"
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
            key="owned"
            projects={owned}
            getSubtitle={(project) => formatWhen(Date.parse(project.updatedAt))}
            onOpenProject={onOpenProject}
            onDeleteProject={deleteOwnedProject}
            deletingId={deletingId}
          />
        ) : (
          <EmptyNote>No cloud projects yet.</EmptyNote>
        )
      ) : tab === "shared" ? (
        sharedWithMe.length > 0 ? (
          <ProjectList
            key="shared"
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
        <EmptyNote>No pending invitations.</EmptyNote>
      )}
      </>
      ) : null}
    </div>
  );
}

const PROJECTS_PER_PAGE = 6;

function ProjectList<T extends ProjectSummary>({
  deletingId,
  getSubtitle,
  onDeleteProject,
  onOpenProject,
  projects
}: {
  deletingId?: string | null;
  getSubtitle: (project: T) => string;
  onDeleteProject?: (project: T) => void;
  onOpenProject: (projectId: string, projectName: string) => void;
  projects: T[];
}) {
  const [page, setPage] = useState(0);
  const pageCount = Math.max(1, Math.ceil(projects.length / PROJECTS_PER_PAGE));
  // Clamp in case the list shrank (e.g. after a refetch) below the current page.
  const safePage = Math.min(page, pageCount - 1);
  const start = safePage * PROJECTS_PER_PAGE;
  const visible = projects.slice(start, start + PROJECTS_PER_PAGE);

  return (
    <div className="grid gap-2">
      <div className="grid gap-2">
        {visible.map((project) => (
          <ProjectRow
            key={project.id}
            isDeleting={deletingId === project.id}
            onDelete={onDeleteProject ? () => onDeleteProject(project) : undefined}
            onOpen={() => onOpenProject(project.id, project.projectName)}
            project={project}
            subtitle={getSubtitle(project)}
          />
        ))}
      </div>

      {pageCount > 1 ? (
        <div className="flex items-center justify-between gap-2 pt-1">
          <button
            className={pagerClass}
            disabled={safePage === 0}
            onClick={() => setPage(safePage - 1)}
            type="button"
          >
            Prev
          </button>
          <span className="text-[12px] font-bold text-[#8b929b]">
            Page {safePage + 1} of {pageCount}
          </span>
          <button
            className={pagerClass}
            disabled={safePage >= pageCount - 1}
            onClick={() => setPage(safePage + 1)}
            type="button"
          >
            Next
          </button>
        </div>
      ) : null}
    </div>
  );
}

function ProjectRow({
  isDeleting,
  onDelete,
  onOpen,
  project,
  subtitle
}: {
  isDeleting?: boolean;
  onDelete?: () => void;
  onOpen: () => void;
  project: ProjectSummary;
  subtitle: string;
}) {
  return (
    <div className="grid min-h-[58px] w-full grid-cols-[minmax(0,1fr)_auto] items-center gap-3 rounded-lg border border-[#30353d] bg-[#17191d] px-3 py-2.5 hover:border-[#4aa391]">
      <button
        className="flex min-w-0 flex-col text-left font-bold text-[#eef1f4]"
        onClick={onOpen}
        type="button"
      >
        <span className="block truncate">{project.projectName}</span>
        <span className="block truncate text-[12px] font-normal text-[#8b929b]">
          {subtitle}
        </span>
      </button>
      <span className="flex items-center gap-2">
        <RoleBadge role={project.role} />
        {onDelete ? (
          <button
            aria-label={`Delete ${project.projectName}`}
            className="rounded-md border border-[#5a2a2e] bg-[#241619] px-2.5 py-1.5 text-[12px] font-bold text-[#ffb9b9] hover:border-[#e06b6b] hover:bg-[#3a1d20] disabled:opacity-40 disabled:hover:border-[#5a2a2e]"
            disabled={isDeleting}
            onClick={onDelete}
            title="Delete project"
            type="button"
          >
            {isDeleting ? "Deleting..." : "Delete"}
          </button>
        ) : null}
      </span>
    </div>
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

function PlanBanner({
  ownedCount,
  subscription
}: {
  ownedCount: number;
  subscription: ReturnType<typeof useSubscription>;
}) {
  const { data, isPro, limits, loading } = subscription;

  // Avoid a flash before the first load resolves.
  if (loading && !data) {
    return null;
  }

  if (isPro) {
    return (
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-[#2f6d61] bg-[#11201c] px-3 py-2 text-[12px] font-bold text-[#a9e2d2]">
        <span>Pro plan — unlimited projects &amp; collaborators, 3D models unlocked.</span>
        <a className={planLinkClass} href="/billing">
          Manage
        </a>
      </div>
    );
  }

  const maxProjects = limits.maxProjects;
  const maxShares = limits.maxSharesPerProject;
  const atProjectLimit =
    typeof maxProjects === "number" && ownedCount >= maxProjects;

  return (
    <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-[#30353d] bg-[#11161a] px-3 py-2 text-[12px] font-bold text-[#aab1ba]">
      <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
        <span className="rounded-md border border-[#3b424b] bg-[#202329] px-2 py-0.5 uppercase tracking-wide text-[#cfd4da]">
          Free plan
        </span>
        <span className={atProjectLimit ? "text-[#ffb9b9]" : undefined}>
          {ownedCount}
          {typeof maxProjects === "number" ? `/${maxProjects}` : ""} projects
        </span>
        <span aria-hidden>·</span>
        <span>up to {maxShares ?? "∞"} collaborators / project</span>
        <span aria-hidden>·</span>
        <span>3D models locked</span>
      </span>
      <a className={planLinkClass} href="/billing">
        Upgrade
      </a>
    </div>
  );
}

const planLinkClass =
  "flex-none rounded-md border border-[#4aa391] bg-[#203731] px-2.5 py-1 text-[11px] font-extrabold text-[#eef1f4] hover:border-[#6fd6c1]";

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
