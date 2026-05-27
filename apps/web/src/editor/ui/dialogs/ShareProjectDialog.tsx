import { FormEvent, useEffect, useState } from "react";
import {
  grantProjectAccess,
  isUpgradeRequiredError,
  listProjectAccesses,
  resetProjectLinkAccess,
  revokeProjectAccess,
  revokeProjectInvite,
  updateProjectAccess,
  updateProjectInvite,
  updateProjectLinkAccess,
  type ProjectAccessEntry,
  type ProjectAccessPermission,
  type ProjectLinkAccess,
  type ProjectPendingInviteEntry
} from "../../collaboration/sharedProjectApi";
import { useSubscription } from "../../collaboration/useSubscription";

type ShareProjectDialogProps = {
  onClose: () => void;
  projectId: string;
};

export function ShareProjectDialog({ onClose, projectId }: ShareProjectDialogProps) {
  const [email, setEmail] = useState("");
  const [permission, setPermission] = useState<ProjectAccessPermission>("editor");
  const [linkPermission, setLinkPermission] = useState<ProjectAccessPermission>("viewer");
  const [linkMode, setLinkMode] = useState<ProjectLinkAccess["mode"]>("restricted");
  const [accesses, setAccesses] = useState<ProjectAccessEntry[]>([]);
  const [removedAccesses, setRemovedAccesses] = useState<ProjectAccessEntry[]>([]);
  const [pendingInvites, setPendingInvites] = useState<ProjectPendingInviteEntry[]>([]);
  const [owner, setOwner] = useState<{ id: string; email: string; displayName: string | null } | null>(null);
  const [isInviting, setIsInviting] = useState(false);
  const [isUpdatingLink, setIsUpdatingLink] = useState(false);
  const [isLoadingAccesses, setIsLoadingAccesses] = useState(true);
  const [dialogError, setDialogError] = useState<string | null>(null);
  const [dialogErrorRequiresUpgrade, setDialogErrorRequiresUpgrade] = useState(false);
  const [dialogSuccess, setDialogSuccess] = useState<string | null>(null);
  const [freshInviteLink, setFreshInviteLink] = useState<string | null>(null);
  const [publicInviteLink, setPublicInviteLink] = useState<string | null>(null);
  const [publicInviteExists, setPublicInviteExists] = useState(false);
  const [copied, setCopied] = useState<"project" | "invite" | "public" | null>(null);
  const [revokingId, setRevokingId] = useState<string | null>(null);
  const [updatingRoleId, setUpdatingRoleId] = useState<string | null>(null);
  const subscription = useSubscription();
  const collaboratorCount = accesses.length + pendingInvites.length;
  const shareLimit = subscription.limits.maxSharesPerProject;
  const showShareLimit =
    !subscription.isPro && !subscription.loading && typeof shareLimit === "number";

  const projectLink =
    typeof window !== "undefined"
      ? `${window.location.origin}/?projectId=${encodeURIComponent(projectId)}`
      : `/?projectId=${encodeURIComponent(projectId)}`;

  const shareUrl = publicInviteLink ?? projectLink;

  useEffect(() => {
    let cancelled = false;

    listProjectAccesses(projectId)
      .then((response) => {
        if (!cancelled) {
          setAccesses(response.accesses);
          setRemovedAccesses(response.removedAccesses);
          setPendingInvites(response.pendingInvites);
          setOwner(response.owner);
          setLinkMode(response.linkAccess.mode);
          setLinkPermission(response.linkAccess.permission);
          setPublicInviteExists(Boolean(response.linkAccess.hasInviteLink));
          setPublicInviteLink(response.linkAccess.inviteLink ?? null);
        }
      })
      .catch((error) => {
        if (!cancelled) {
          setDialogError(error instanceof Error ? error.message : "Unable to load sharing.");
        }
      })
      .finally(() => {
        if (!cancelled) {
          setIsLoadingAccesses(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [projectId]);

  async function copyToClipboard(text: string, target: "project" | "invite" | "public") {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(target);
      window.setTimeout(() => setCopied(null), 1500);
    } catch {
      setDialogError("Clipboard is unavailable.");
    }
  }

  async function revokeAccess(entry: ProjectAccessEntry) {
    const subject = entry.sharedWithUser?.email ?? "this access";

    if (!window.confirm(`Revoke access for ${subject}?`)) {
      return;
    }

    setRevokingId(entry.id);
    setDialogError(null);
    setDialogErrorRequiresUpgrade(false);
    setDialogSuccess(null);

    try {
      await revokeProjectAccess(projectId, entry.id);
      setAccesses((current) => current.filter((item) => item.id !== entry.id));
      setRemovedAccesses((current) => upsertById(current, {
        ...entry,
        revokedAt: new Date().toISOString()
      }));
    } catch (error) {
      setDialogError(error instanceof Error ? error.message : "Unable to revoke access.");
    } finally {
      setRevokingId(null);
    }
  }

  async function revokeInvite(entry: ProjectPendingInviteEntry) {
    const subject = entry.invitedEmail ?? "this invite";

    if (!window.confirm(`Revoke invite for ${subject}?`)) {
      return;
    }

    setRevokingId(entry.id);
    setDialogError(null);
    setDialogErrorRequiresUpgrade(false);
    setDialogSuccess(null);

    try {
      await revokeProjectInvite(projectId, entry.id);
      setPendingInvites((current) => current.filter((item) => item.id !== entry.id));
    } catch (error) {
      setDialogError(error instanceof Error ? error.message : "Unable to revoke invite.");
    } finally {
      setRevokingId(null);
    }
  }

  async function submitInvite(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmed = email.trim();

    if (!trimmed) {
      return;
    }

    setIsInviting(true);
    setDialogError(null);
    setDialogErrorRequiresUpgrade(false);
    setDialogSuccess(null);
    setFreshInviteLink(null);

    try {
      const result = await grantProjectAccess(projectId, trimmed, permission);

      if (result.access) {
        setAccesses((current) => upsertById(current, result.access!));
        setDialogSuccess("This person already has access.");
      }

      if (result.invite) {
        setPendingInvites((current) => upsertById(current, result.invite!));
        setFreshInviteLink(result.inviteLink);
        setDialogSuccess(result.inviteLink ? `Invite created for ${trimmed}.` : "This person already has a pending invite.");
      }

      setEmail("");
    } catch (error) {
      setDialogError(error instanceof Error ? error.message : "Unable to invite.");
      setDialogErrorRequiresUpgrade(isUpgradeRequiredError(error));
    } finally {
      setIsInviting(false);
    }
  }

  async function saveLinkAccess() {
    setIsUpdatingLink(true);
    setDialogError(null);
    setDialogErrorRequiresUpgrade(false);
    setDialogSuccess(null);
    setFreshInviteLink(null);

    try {
      const result = await updateProjectLinkAccess(projectId, {
        mode: linkMode,
        permission: linkPermission
      });

      setLinkMode(result.linkAccess.mode);
      setLinkPermission(result.linkAccess.permission);
      setPublicInviteExists(Boolean(result.linkAccess.hasInviteLink));
      setPublicInviteLink(result.inviteLink ?? publicInviteLink);
      setDialogSuccess(
        result.linkAccess.mode === "anyone_with_link"
          ? "Anyone-with-link invite settings saved."
          : "Link access is restricted to invited people."
      );
    } catch (error) {
      setDialogError(error instanceof Error ? error.message : "Unable to update link access.");
    } finally {
      setIsUpdatingLink(false);
    }
  }

  async function resetPublicLink() {
    setIsUpdatingLink(true);
    setDialogError(null);
    setDialogSuccess(null);

    try {
      const result = await resetProjectLinkAccess(projectId);
      setLinkMode(result.linkAccess.mode);
      setLinkPermission(result.linkAccess.permission);
      setPublicInviteExists(Boolean(result.linkAccess.hasInviteLink));
      setPublicInviteLink(result.inviteLink);
      setDialogSuccess("Anyone-with-link invite was reset. Old public invite links no longer work.");
    } catch (error) {
      setDialogError(error instanceof Error ? error.message : "Unable to reset link.");
    } finally {
      setIsUpdatingLink(false);
    }
  }

  async function createCopyablePublicLink() {
    if (publicInviteExists) {
      await resetPublicLink();
      return;
    }

    await saveLinkAccess();
  }

  async function changeMemberRole(entry: ProjectAccessEntry, nextPermission: ProjectAccessPermission) {
    const previous = accesses;
    setUpdatingRoleId(entry.id);
    setDialogError(null);
    setAccesses((current) =>
      current.map((item) =>
        item.id === entry.id ? { ...item, permission: nextPermission } : item
      )
    );

    try {
      const updated = await updateProjectAccess(projectId, entry.id, {
        permission: nextPermission
      });
      setAccesses((current) => upsertById(current, updated));
    } catch (error) {
      setAccesses(previous);
      setDialogError(error instanceof Error ? error.message : "Unable to update role.");
    } finally {
      setUpdatingRoleId(null);
    }
  }

  async function changeInviteRole(entry: ProjectPendingInviteEntry, nextPermission: ProjectAccessPermission) {
    const previous = pendingInvites;
    setUpdatingRoleId(entry.id);
    setDialogError(null);
    setPendingInvites((current) =>
      current.map((item) =>
        item.id === entry.id ? { ...item, permission: nextPermission } : item
      )
    );

    try {
      const updated = await updateProjectInvite(projectId, entry.id, {
        permission: nextPermission
      });
      setPendingInvites((current) => upsertById(current, updated));
    } catch (error) {
      setPendingInvites(previous);
      setDialogError(error instanceof Error ? error.message : "Unable to update invite role.");
    } finally {
      setUpdatingRoleId(null);
    }
  }

  return (
    <div className="fixed inset-0 z-30 grid place-items-center bg-[#050607]/72 p-6 backdrop-blur-md" role="presentation">
      <div
        className="grid max-h-[min(760px,calc(100vh-36px))] w-[min(680px,100%)] gap-4 overflow-auto rounded-lg border border-[#383e46] bg-[#17191d] p-[18px] shadow-[0_24px_48px_rgba(0,0,0,0.42)]"
        role="dialog"
        aria-modal="true"
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="m-0 text-lg font-bold text-[#f2f4f7]">Share project</h2>
            <p className="m-0 mt-1 text-[12px] font-bold text-[#8b929b]">
              Manage access, invites, and link behavior for this cloud project.
            </p>
          </div>
          <button
            className={dialogButtonClass}
            aria-label="Close share dialog"
            onClick={onClose}
            type="button"
          >
            Close
          </button>
        </div>

        <section className={dialogSectionClass} aria-label="Project link">
          <div>
            <h3 className={dialogSectionTitleClass}>Project link</h3>
            <p className={helperTextClass}>Only people with access can open this link.</p>
          </div>
          <div className="flex items-center gap-2">
            <input
              className={dialogInputClass}
              readOnly
              type="text"
              value={projectLink}
              onFocus={(event) => event.currentTarget.select()}
            />
            <button
              className={dialogButtonClass}
              onClick={() => copyToClipboard(projectLink, "project")}
              type="button"
            >
              {copied === "project" ? "Copied" : "Copy project link"}
            </button>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <span className={helperTextClass}>Share to</span>
            {SOCIAL_TARGETS.map((target) => (
              <button
                key={target.name}
                className={dialogSmallButtonClass}
                onClick={() => openShare(target.buildUrl(shareUrl, SHARE_TEXT))}
                type="button"
              >
                {target.name}
              </button>
            ))}
          </div>
          {!publicInviteLink ? (
            <p className={helperTextClass}>
              Tip: enable the anyone-with-link invite below so people you share with can open the project.
            </p>
          ) : null}
        </section>

        <section className={dialogSectionClass} aria-label="Invite people">
          <div>
            <h3 className={dialogSectionTitleClass}>Email invite</h3>
            <p className={helperTextClass}>Use this to invite one specific person.</p>
          </div>
          {showShareLimit ? (
            <p className={helperTextClass}>
              Free plan -{" "}
              <span
                className={
                  collaboratorCount >= (shareLimit as number)
                    ? "text-[#ffb9b9]"
                    : "text-[#cfd4da]"
                }
              >
                {collaboratorCount}/{shareLimit}
              </span>{" "}
              collaborators on this project.{" "}
              <a className="font-extrabold text-[#6fd6c1] underline" href="/billing">
                Upgrade
              </a>{" "}
              to add more.
            </p>
          ) : null}
          <form className="grid gap-2" onSubmit={submitInvite}>
            <div className="grid gap-2 sm:grid-cols-[1fr_auto_auto]">
              <input
                className={dialogInputClass}
                disabled={isInviting}
                onChange={(event) => setEmail(event.target.value)}
                placeholder="person@example.com"
                required
                type="email"
                value={email}
              />
              <select
                className={dialogInputClass}
                disabled={isInviting}
                onChange={(event) =>
                  setPermission(event.target.value as ProjectAccessPermission)
                }
                value={permission}
              >
                <option value="viewer">Viewer</option>
                <option value="commenter">Commenter</option>
                <option value="editor">Editor</option>
              </select>
              <button className={dialogButtonClass} disabled={isInviting} type="submit">
                {isInviting ? "Creating..." : "Create invite"}
              </button>
            </div>
          </form>
          {freshInviteLink ? (
            <div className="grid gap-2 rounded-md border border-[#31584f] bg-[#13231f] p-2">
              <p className="m-0 text-[12px] font-bold text-[#a9e2d2]">
                Email invite link created. Copy it now; it will not be shown again.
              </p>
              <div className="flex items-center gap-2">
                <input
                  className={dialogInputClass}
                  readOnly
                  value={freshInviteLink}
                  onFocus={(event) => event.currentTarget.select()}
                />
                <button
                  className={dialogButtonClass}
                  onClick={() => copyToClipboard(freshInviteLink, "invite")}
                  type="button"
                >
                  {copied === "invite" ? "Copied" : "Copy"}
                </button>
              </div>
            </div>
          ) : null}
        </section>

        <section className={dialogSectionClass} aria-label="Link access">
          <div>
            <h3 className={dialogSectionTitleClass}>Anyone-with-link invite</h3>
            <p className={helperTextClass}>
              Anyone with this invite link can join with the selected role, except people you removed.
            </p>
          </div>
          <div className="grid gap-2 sm:grid-cols-[1fr_auto_auto]">
            <select
              className={dialogInputClass}
              disabled={isUpdatingLink}
              onChange={(event) => setLinkMode(event.target.value as ProjectLinkAccess["mode"])}
              value={linkMode}
            >
              <option value="restricted">Restricted</option>
              <option value="anyone_with_link">Anyone with link</option>
            </select>
            <select
              className={dialogInputClass}
              disabled={isUpdatingLink || linkMode === "restricted"}
              onChange={(event) => setLinkPermission(event.target.value as ProjectAccessPermission)}
              value={linkPermission}
            >
              <option value="viewer">Viewer</option>
              <option value="commenter">Commenter</option>
              <option value="editor">Editor</option>
            </select>
            <button
              className={dialogButtonClass}
              disabled={isUpdatingLink}
              onClick={
                linkMode === "anyone_with_link" && !publicInviteLink
                  ? createCopyablePublicLink
                  : saveLinkAccess
              }
              type="button"
            >
              {isUpdatingLink
                ? "Saving..."
                : linkMode === "anyone_with_link" && !publicInviteLink
                  ? publicInviteExists
                    ? "Create copyable link"
                    : "Create anyone-with-link invite"
                  : "Save settings"}
            </button>
          </div>
          {linkMode === "anyone_with_link" && publicInviteExists && !publicInviteLink ? (
            <p className={helperTextClass}>
              An anyone-with-link invite exists, but old tokens are hidden after creation.
              Create a copyable link to replace it.
            </p>
          ) : null}
          {linkMode === "anyone_with_link" ? (
            <div className="flex flex-wrap gap-2">
              <button
                className={dialogButtonClass}
                disabled={!publicInviteLink}
                onClick={() => publicInviteLink && copyToClipboard(publicInviteLink, "public")}
                type="button"
              >
                {copied === "public" ? "Copied" : "Copy anyone-with-link invite"}
              </button>
              <button
                className={dialogButtonClass}
                disabled={isUpdatingLink}
                onClick={resetPublicLink}
                type="button"
              >
                Reset link
              </button>
            </div>
          ) : null}
          <p className={helperTextClass}>
            {linkMode === "restricted"
              ? "Only invited people can open this project."
              : "Changing this role affects only future new users. Existing members keep their current role."}
          </p>
        </section>

        <section className={dialogSectionClass} aria-label="People with access">
          <h3 className={dialogSectionTitleClass}>People with access</h3>
          {isLoadingAccesses ? (
            <p className={helperTextClass}>Loading...</p>
          ) : (
            <ul className="m-0 grid list-none gap-1.5 p-0">
              {owner ? (
                <li className={accessRowClass}>
                  <span className="min-w-0 flex-1 truncate text-[13px] font-bold text-[#eef1f4]">
                    {owner.displayName || owner.email}
                  </span>
                  <RoleBadge role="owner" />
                </li>
              ) : null}
              {accesses.map((entry) => (
                <li
                  className={accessRowClass}
                  key={entry.id}
                >
                  <span className="min-w-0 flex-1 truncate text-[13px] font-bold text-[#eef1f4]">
                    {entry.sharedWithUser?.displayName || entry.sharedWithUser?.email || "Unknown user"}
                  </span>
                  <select
                    className={dialogCompactSelectClass}
                    disabled={updatingRoleId === entry.id}
                    onChange={(event) =>
                      void changeMemberRole(entry, event.target.value as ProjectAccessPermission)
                    }
                    value={entry.permission}
                  >
                    <option value="viewer">Viewer</option>
                    <option value="commenter">Commenter</option>
                    <option value="editor">Editor</option>
                  </select>
                  <button
                    className={dialogSmallButtonClass}
                    disabled={revokingId === entry.id}
                    onClick={() => revokeAccess(entry)}
                    type="button"
                  >
                    {revokingId === entry.id ? "Revoking..." : "Revoke"}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className={dialogSectionClass} aria-label="Pending invites">
          <h3 className={dialogSectionTitleClass}>Pending invites</h3>
          {isLoadingAccesses ? (
            <p className={helperTextClass}>Loading...</p>
          ) : pendingInvites.length === 0 ? (
            <p className={helperTextClass}>No pending invites.</p>
          ) : (
            <ul className="m-0 grid list-none gap-1.5 p-0">
              {pendingInvites.map((entry) => (
                <li
                  className="flex items-center justify-between gap-3 rounded-md border border-[#30353d] bg-[#202329] px-3 py-2"
                  key={entry.id}
                >
                  <span className="min-w-0 flex-1 truncate text-[13px] font-bold text-[#eef1f4]">
                    {entry.invitedEmail ?? "Anyone with invite link"}
                  </span>
                  <span className="text-[11px] font-extrabold uppercase text-[#8b929b]">
                    pending
                  </span>
                  <select
                    className={dialogCompactSelectClass}
                    disabled={updatingRoleId === entry.id}
                    onChange={(event) =>
                      void changeInviteRole(entry, event.target.value as ProjectAccessPermission)
                    }
                    value={entry.permission}
                  >
                    <option value="viewer">Viewer</option>
                    <option value="commenter">Commenter</option>
                    <option value="editor">Editor</option>
                  </select>
                  <button
                    className={dialogSmallButtonClass}
                    disabled={revokingId === entry.id}
                    onClick={() => revokeInvite(entry)}
                    type="button"
                  >
                    {revokingId === entry.id ? "Revoking..." : "Revoke"}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className={dialogSectionClass} aria-label="Removed people">
          <h3 className={dialogSectionTitleClass}>Removed people</h3>
          {isLoadingAccesses ? (
            <p className={helperTextClass}>Loading...</p>
          ) : removedAccesses.length === 0 ? (
            <p className={helperTextClass}>No removed people.</p>
          ) : (
            <ul className="m-0 grid list-none gap-1.5 p-0">
              {removedAccesses.map((entry) => (
                <li className={accessRowClass} key={entry.id}>
                  <span className="min-w-0 flex-1 truncate text-[13px] font-bold text-[#eef1f4]">
                    {entry.sharedWithUser?.displayName || entry.sharedWithUser?.email || "Unknown user"}
                  </span>
                  <span className="text-[11px] font-extrabold uppercase text-[#8b929b]">
                    removed
                  </span>
                  <button
                    className={dialogSmallButtonClass}
                    onClick={() => {
                      setEmail(entry.sharedWithUser?.email ?? "");
                      setPermission(entry.permission);
                    }}
                    type="button"
                  >
                    Invite again
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>

        {dialogError ? (
          <div className="flex flex-wrap items-center gap-2">
            <p className="m-0 text-[12px] font-bold text-[#ffd0d0]">{dialogError}</p>
            {dialogErrorRequiresUpgrade ? (
              <a
                className="rounded-md border border-[#4aa391] bg-[#203731] px-2.5 py-1 text-[11px] font-extrabold text-[#eef1f4]"
                href="/billing"
              >
                Upgrade
              </a>
            ) : null}
          </div>
        ) : null}
        {dialogSuccess ? (
          <p className="m-0 text-[12px] font-bold text-[#a9e2d2]">{dialogSuccess}</p>
        ) : null}
      </div>
    </div>
  );
}

function RoleBadge({ role }: { role: ProjectAccessPermission | "owner" }) {
  return (
    <span className="rounded-md border border-[#3b424b] bg-[#171a1f] px-2 py-1 text-[11px] font-extrabold uppercase text-[#cfd4da]">
      {role}
    </span>
  );
}

const SHARE_TEXT = "Check out my project on Webster";

const SOCIAL_TARGETS: ReadonlyArray<{
  name: string;
  buildUrl: (url: string, text: string) => string;
}> = [
  {
    name: "X",
    buildUrl: (url, text) =>
      `https://twitter.com/intent/tweet?url=${encodeURIComponent(url)}&text=${encodeURIComponent(text)}`
  },
  {
    name: "Facebook",
    buildUrl: (url) => `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(url)}`
  },
  {
    name: "LinkedIn",
    buildUrl: (url) => `https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(url)}`
  },
  {
    name: "WhatsApp",
    buildUrl: (url, text) => `https://wa.me/?text=${encodeURIComponent(`${text} ${url}`)}`
  },
  {
    name: "Telegram",
    buildUrl: (url, text) =>
      `https://t.me/share/url?url=${encodeURIComponent(url)}&text=${encodeURIComponent(text)}`
  },
  {
    name: "Reddit",
    buildUrl: (url, text) =>
      `https://www.reddit.com/submit?url=${encodeURIComponent(url)}&title=${encodeURIComponent(text)}`
  },
  {
    name: "Email",
    buildUrl: (url, text) =>
      `mailto:?subject=${encodeURIComponent(text)}&body=${encodeURIComponent(`${text}: ${url}`)}`
  }
];

function openShare(url: string) {
  if (typeof window === "undefined") {
    return;
  }
  window.open(url, "_blank", "noopener,noreferrer,width=640,height=640");
}

function upsertById<T extends { id: string }>(items: T[], nextItem: T) {
  const index = items.findIndex((item) => item.id === nextItem.id);

  if (index < 0) {
    return [...items, nextItem];
  }

  return items.map((item, itemIndex) => (itemIndex === index ? nextItem : item));
}

const dialogSectionClass =
  "grid content-start gap-2 rounded-lg border border-[#2d3137] bg-[#1b1e23] p-3";

const accessRowClass =
  "flex items-center justify-between gap-3 rounded-md border border-[#30353d] bg-[#202329] px-3 py-2";

const dialogSectionTitleClass =
  "m-0 text-xs font-extrabold uppercase tracking-normal text-[#cfd4da]";

const helperTextClass = "m-0 text-[12px] font-bold text-[#8b929b]";

const dialogButtonClass =
  "rounded-lg border border-[#333941] bg-[#202329] px-3 py-2 font-bold text-[#eef1f4] hover:border-[#4aa391] hover:bg-[#203731] focus-visible:border-[#4aa391] focus-visible:bg-[#203731] disabled:opacity-60";

const dialogInputClass =
  "w-full rounded-md border border-[#30353d] bg-[#202329] px-2.5 py-[9px] text-[#eef1f4]";

const dialogCompactSelectClass =
  "rounded-md border border-[#30353d] bg-[#202329] px-2 py-1.5 text-[12px] font-bold text-[#eef1f4]";

const dialogSmallButtonClass =
  "rounded-md border border-[#333941] bg-[#171a1f] px-2.5 py-1 text-[11px] font-bold text-[#dce1e6] hover:border-[#d88080] hover:bg-[#372020] focus-visible:border-[#d88080] focus-visible:bg-[#372020] disabled:opacity-60";
