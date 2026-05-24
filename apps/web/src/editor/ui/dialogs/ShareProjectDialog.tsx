import { FormEvent, useEffect, useState } from "react";
import {
  grantProjectAccess,
  listProjectAccesses,
  revokeProjectAccess,
  revokeProjectInvite,
  updateProjectLinkAccess,
  type ProjectAccessEntry,
  type ProjectAccessPermission,
  type ProjectLinkAccess,
  type ProjectPendingInviteEntry
} from "../../collaboration/sharedProjectApi";

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
  const [pendingInvites, setPendingInvites] = useState<ProjectPendingInviteEntry[]>([]);
  const [isInviting, setIsInviting] = useState(false);
  const [isUpdatingLink, setIsUpdatingLink] = useState(false);
  const [isLoadingAccesses, setIsLoadingAccesses] = useState(true);
  const [dialogError, setDialogError] = useState<string | null>(null);
  const [dialogSuccess, setDialogSuccess] = useState<string | null>(null);
  const [freshInviteLink, setFreshInviteLink] = useState<string | null>(null);
  const [copied, setCopied] = useState<"project" | "invite" | null>(null);
  const [revokingId, setRevokingId] = useState<string | null>(null);

  const projectLink =
    typeof window !== "undefined"
      ? `${window.location.origin}/?projectId=${encodeURIComponent(projectId)}`
      : `/?projectId=${encodeURIComponent(projectId)}`;

  useEffect(() => {
    let cancelled = false;

    listProjectAccesses(projectId)
      .then((response) => {
        if (!cancelled) {
          setAccesses(response.accesses);
          setPendingInvites(response.pendingInvites);
          setLinkMode(response.linkAccess.mode);
          setLinkPermission(response.linkAccess.permission);
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

  async function copyToClipboard(text: string, target: "project" | "invite") {
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
    setDialogSuccess(null);

    try {
      await revokeProjectAccess(projectId, entry.id);
      setAccesses((current) => current.filter((item) => item.id !== entry.id));
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
    setDialogSuccess(null);
    setFreshInviteLink(null);

    try {
      const result = await grantProjectAccess(projectId, trimmed, permission);

      if (result.access) {
        setAccesses((current) => upsertById(current, result.access!));
        setDialogSuccess(`${trimmed} already has ${result.access.permission} access.`);
      }

      if (result.invite) {
        setPendingInvites((current) => upsertById(current, result.invite!));
        setFreshInviteLink(result.inviteLink);
        setDialogSuccess(`Invite created for ${trimmed}.`);
      }

      setEmail("");
    } catch (error) {
      setDialogError(error instanceof Error ? error.message : "Unable to invite.");
    } finally {
      setIsInviting(false);
    }
  }

  async function saveLinkAccess() {
    setIsUpdatingLink(true);
    setDialogError(null);
    setDialogSuccess(null);
    setFreshInviteLink(null);

    try {
      const result = await updateProjectLinkAccess(projectId, {
        mode: linkMode,
        permission: linkPermission
      });

      setLinkMode(result.linkAccess.mode);
      setLinkPermission(result.linkAccess.permission);
      setFreshInviteLink(result.inviteLink);
      setDialogSuccess(
        result.linkAccess.mode === "anyone_with_link"
          ? "Anyone with the project link can now open with the selected role."
          : "Link access is restricted to invited people."
      );
    } catch (error) {
      setDialogError(error instanceof Error ? error.message : "Unable to update link access.");
    } finally {
      setIsUpdatingLink(false);
    }
  }

  return (
    <div className="fixed inset-0 z-30 grid place-items-center bg-black/60 p-6" role="presentation">
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
              {copied === "project" ? "Copied" : "Copy"}
            </button>
          </div>
        </section>

        <section className={dialogSectionClass} aria-label="Invite people">
          <h3 className={dialogSectionTitleClass}>Invite people</h3>
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
                {isInviting ? "Inviting..." : "Invite"}
              </button>
            </div>
          </form>
          {freshInviteLink ? (
            <div className="grid gap-2 rounded-md border border-[#31584f] bg-[#13231f] p-2">
              <p className="m-0 text-[12px] font-bold text-[#a9e2d2]">
                Invite link created. Copy it now; it will not be shown again.
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
          <h3 className={dialogSectionTitleClass}>Link access</h3>
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
              onClick={saveLinkAccess}
              type="button"
            >
              {isUpdatingLink ? "Saving..." : "Save"}
            </button>
          </div>
          <p className={helperTextClass}>
            {linkMode === "restricted"
              ? "Only invited people can open this project."
              : "Opening the project link grants the selected role."}
          </p>
        </section>

        <section className={dialogSectionClass} aria-label="People with access">
          <h3 className={dialogSectionTitleClass}>People with access</h3>
          {isLoadingAccesses ? (
            <p className={helperTextClass}>Loading...</p>
          ) : accesses.length === 0 ? (
            <p className={helperTextClass}>No one else has access yet.</p>
          ) : (
            <ul className="m-0 grid list-none gap-1.5 p-0">
              {accesses.map((entry) => (
                <li
                  className="flex items-center justify-between gap-3 rounded-md border border-[#30353d] bg-[#202329] px-3 py-2"
                  key={entry.id}
                >
                  <span className="min-w-0 flex-1 truncate text-[13px] font-bold text-[#eef1f4]">
                    {entry.sharedWithUser?.displayName || entry.sharedWithUser?.email || "Unknown user"}
                  </span>
                  <RoleBadge role={entry.permission} />
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
                  <RoleBadge role={entry.permission} />
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

        {dialogError ? (
          <p className="m-0 text-[12px] font-bold text-[#ffd0d0]">{dialogError}</p>
        ) : null}
        {dialogSuccess ? (
          <p className="m-0 text-[12px] font-bold text-[#a9e2d2]">{dialogSuccess}</p>
        ) : null}
      </div>
    </div>
  );
}

function RoleBadge({ role }: { role: ProjectAccessPermission }) {
  return (
    <span className="rounded-md border border-[#3b424b] bg-[#171a1f] px-2 py-1 text-[11px] font-extrabold uppercase text-[#cfd4da]">
      {role}
    </span>
  );
}

function upsertById<T extends { id: string }>(items: T[], nextItem: T) {
  const index = items.findIndex((item) => item.id === nextItem.id);

  if (index < 0) {
    return [...items, nextItem];
  }

  return items.map((item, itemIndex) => (itemIndex === index ? nextItem : item));
}

const dialogSectionClass =
  "grid content-start gap-2 rounded-lg border border-[#2d3137] bg-[#17191d] p-3";

const dialogSectionTitleClass =
  "m-0 text-xs font-extrabold uppercase tracking-normal text-[#cfd4da]";

const helperTextClass = "m-0 text-[12px] font-bold text-[#8b929b]";

const dialogButtonClass =
  "rounded-lg border border-[#333941] bg-[#202329] px-3 py-2 font-bold text-[#eef1f4] hover:border-[#4aa391] hover:bg-[#203731] focus-visible:border-[#4aa391] focus-visible:bg-[#203731] disabled:opacity-60";

const dialogInputClass =
  "w-full rounded-md border border-[#30353d] bg-[#101113] px-2.5 py-[9px] text-[#eef1f4]";

const dialogSmallButtonClass =
  "rounded-md border border-[#333941] bg-[#171a1f] px-2.5 py-1 text-[11px] font-bold text-[#dce1e6] hover:border-[#d88080] hover:bg-[#372020] focus-visible:border-[#d88080] focus-visible:bg-[#372020] disabled:opacity-60";
