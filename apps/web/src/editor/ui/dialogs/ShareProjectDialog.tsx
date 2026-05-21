import { FormEvent, useEffect, useState } from "react";
import {
  grantProjectAccess,
  listProjectAccesses,
  revokeProjectAccess,
  type ProjectAccessEntry,
  type ProjectAccessPermission
} from "../../collaboration/sharedProjectApi";

type ShareProjectDialogProps = {
  onClose: () => void;
  projectId: string;
};

export function ShareProjectDialog({ onClose, projectId }: ShareProjectDialogProps) {
  const [email, setEmail] = useState("");
  const [permission, setPermission] = useState<ProjectAccessPermission>("editor");
  const [accesses, setAccesses] = useState<ProjectAccessEntry[]>([]);
  const [isInviting, setIsInviting] = useState(false);
  const [isLoadingAccesses, setIsLoadingAccesses] = useState(true);
  const [inviteError, setInviteError] = useState<string | null>(null);
  const [inviteSuccess, setInviteSuccess] = useState<string | null>(null);
  const [copied, setCopied] = useState<"id" | "link" | null>(null);
  const [revokingId, setRevokingId] = useState<string | null>(null);

  const shareLink =
    typeof window !== "undefined"
      ? `${window.location.origin}/?projectId=${encodeURIComponent(projectId)}`
      : `/?projectId=${encodeURIComponent(projectId)}`;

  useEffect(() => {
    let cancelled = false;

    listProjectAccesses(projectId)
      .then((response) => {
        if (!cancelled) {
          setAccesses(response.accesses);
        }
      })
      .catch(() => {
        // Non-owners can't list — silently leave the list empty
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

  async function copyToClipboard(text: string, target: "id" | "link") {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(target);
      window.setTimeout(() => setCopied(null), 1500);
    } catch {
      // Clipboard may be unavailable; ignore.
    }
  }

  async function revoke(entry: ProjectAccessEntry) {
    const subject = entry.sharedWithUser?.email ?? "this access";

    if (!window.confirm(`Revoke access for ${subject}?`)) {
      return;
    }

    setRevokingId(entry.id);
    setInviteError(null);
    setInviteSuccess(null);

    try {
      await revokeProjectAccess(projectId, entry.id);
      setAccesses((current) => current.filter((item) => item.id !== entry.id));
    } catch (error) {
      setInviteError(error instanceof Error ? error.message : "Unable to revoke access.");
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
    setInviteError(null);
    setInviteSuccess(null);

    try {
      const entry = await grantProjectAccess(projectId, trimmed, permission);
      setAccesses((current) => [...current, entry]);
      setInviteSuccess(`Invited ${trimmed} as ${permission}.`);
      setEmail("");
    } catch (error) {
      setInviteError(error instanceof Error ? error.message : "Unable to invite.");
    } finally {
      setIsInviting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-30 grid place-items-center bg-black/60 p-6" role="presentation">
      <div
        className="grid w-[min(560px,100%)] gap-4 rounded-lg border border-[#383e46] bg-[#17191d] p-[18px] shadow-[0_24px_48px_rgba(0,0,0,0.42)]"
        role="dialog"
        aria-modal="true"
      >
        <div className="flex items-center justify-between gap-3">
          <div>
            <h2 className="m-0 text-lg font-bold text-[#f2f4f7]">Project shared</h2>
            <p className="m-0 mt-1 text-[12px] font-bold text-[#8b929b]">
              Share the link or ID below, or invite people directly by email.
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

        <section className={dialogSectionClass} aria-label="Share link">
          <h3 className={dialogSectionTitleClass}>Share link</h3>
          <div className="flex items-center gap-2">
            <input
              className={dialogInputClass}
              readOnly
              type="text"
              value={shareLink}
              onFocus={(event) => event.currentTarget.select()}
            />
            <button
              className={dialogButtonClass}
              onClick={() => copyToClipboard(shareLink, "link")}
              type="button"
            >
              {copied === "link" ? "Copied" : "Copy link"}
            </button>
          </div>
        </section>

        <section className={dialogSectionClass} aria-label="Shared project ID">
          <h3 className={dialogSectionTitleClass}>Project ID</h3>
          <div className="flex items-center gap-2">
            <input
              className={`${dialogInputClass} font-mono`}
              readOnly
              type="text"
              value={projectId}
              onFocus={(event) => event.currentTarget.select()}
            />
            <button
              className={dialogButtonClass}
              onClick={() => copyToClipboard(projectId, "id")}
              type="button"
            >
              {copied === "id" ? "Copied" : "Copy ID"}
            </button>
          </div>
        </section>

        <section className={dialogSectionClass} aria-label="Invite by email">
          <h3 className={dialogSectionTitleClass}>Invite by email</h3>
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
            {inviteError ? (
              <p className="m-0 text-[12px] font-bold text-[#ffd0d0]">{inviteError}</p>
            ) : null}
            {inviteSuccess ? (
              <p className="m-0 text-[12px] font-bold text-[#a9e2d2]">{inviteSuccess}</p>
            ) : null}
          </form>
        </section>

        <section className={dialogSectionClass} aria-label="People with access">
          <h3 className={dialogSectionTitleClass}>People with access</h3>
          {isLoadingAccesses ? (
            <p className="m-0 text-[12px] font-bold text-[#8b929b]">Loading...</p>
          ) : accesses.length === 0 ? (
            <p className="m-0 text-[12px] font-bold text-[#8b929b]">
              No one else has access yet.
            </p>
          ) : (
            <ul className="m-0 grid list-none gap-1.5 p-0">
              {accesses.map((entry) => (
                <li
                  className="flex items-center justify-between gap-3 rounded-md border border-[#30353d] bg-[#202329] px-3 py-2"
                  key={entry.id}
                >
                  <span className="min-w-0 flex-1 truncate text-[13px] font-bold text-[#eef1f4]">
                    {entry.sharedWithUser?.email ?? "Public link"}
                  </span>
                  <span className="text-[11px] font-extrabold uppercase text-[#8b929b]">
                    {entry.permission}
                  </span>
                  <button
                    className={dialogSmallButtonClass}
                    disabled={revokingId === entry.id}
                    onClick={() => revoke(entry)}
                    type="button"
                  >
                    {revokingId === entry.id ? "Revoking..." : "Revoke"}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}

const dialogSectionClass =
  "grid content-start gap-2 rounded-lg border border-[#2d3137] bg-[#17191d] p-3";

const dialogSectionTitleClass =
  "m-0 text-xs font-extrabold uppercase tracking-normal text-[#cfd4da]";

const dialogButtonClass =
  "rounded-lg border border-[#333941] bg-[#202329] px-3 py-2 font-bold text-[#eef1f4] hover:border-[#4aa391] hover:bg-[#203731] focus-visible:border-[#4aa391] focus-visible:bg-[#203731] disabled:opacity-60";

const dialogInputClass =
  "w-full rounded-md border border-[#30353d] bg-[#101113] px-2.5 py-[9px] text-[#eef1f4]";

const dialogSmallButtonClass =
  "rounded-md border border-[#333941] bg-[#171a1f] px-2.5 py-1 text-[11px] font-bold text-[#dce1e6] hover:border-[#d88080] hover:bg-[#372020] focus-visible:border-[#d88080] focus-visible:bg-[#372020] disabled:opacity-60";
