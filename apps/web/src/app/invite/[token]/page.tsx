"use client";

import { useEffect, useState } from "react";
import { useAuth0 } from "@auth0/auth0-react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import {
  acceptProjectInvite,
  loadPublicViewerInvite,
} from "@/editor/collaboration/sharedProjectApi";

export default function InvitePage() {
  const params = useParams<{ token: string }>();
  const router = useRouter();
  const { isAuthenticated, isLoading, loginWithPopup } = useAuth0();
  const [error, setError] = useState<string | null>(null);
  const [publicViewerProjectId, setPublicViewerProjectId] = useState<string | null>(null);
  const [isCheckingPublicView, setIsCheckingPublicView] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const token = params.token;

    if (isLoading) {
      return;
    }

    if (!isAuthenticated) {
      setIsCheckingPublicView(true);
      void loadPublicViewerInvite(token)
        .then((result) => {
          if (!cancelled) {
            setPublicViewerProjectId(result.projectId);
          }
        })
        .catch(() => {
          if (!cancelled) {
            setError(null);
          }
        })
        .finally(() => {
          if (!cancelled) {
            setIsCheckingPublicView(false);
          }
        });
      return;
    }

    async function acceptInvite() {
      try {
        const result = await acceptProjectInvite(token);

        if (!cancelled) {
          router.replace(`/?projectId=${encodeURIComponent(result.projectId)}`);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Unable to accept invite.");
        }
      }
    }

    void acceptInvite();

    return () => {
      cancelled = true;
    };
  }, [isAuthenticated, isLoading, params.token, router]);

  return (
    <main className="grid h-screen min-h-0 place-items-center bg-[#101113] text-[13px] text-[#e7e9ec]">
      <div className="grid justify-items-center gap-3 text-center">
        {!isLoading && !isAuthenticated ? (
          <>
            <h1 className="m-0 text-[22px] font-extrabold text-[#f2f4f7]">Sign in required</h1>
            <p className="m-0 max-w-[420px] text-sm font-bold text-[#8b929b]">
              Sign in to accept this invite and use its full access.
            </p>
            <div className="mt-1 flex flex-wrap justify-center gap-2">
              {publicViewerProjectId ? (
                <button
                  className="inline-flex items-center gap-2 rounded-md border border-[#30353d] bg-[#202329] px-3 py-2 text-sm font-extrabold text-[#eef1f4] hover:border-[#4aa391] hover:bg-[#203731]"
                  onClick={() =>
                    router.replace(`/?projectId=${encodeURIComponent(publicViewerProjectId)}`)
                  }
                  type="button"
                >
                  Continue view only
                </button>
              ) : null}
              <button
                className="inline-flex items-center gap-2 rounded-md border border-[#4aa391] bg-[#203731] px-3 py-2 text-sm font-extrabold text-[#eef1f4] hover:border-[#6fd6c1]"
                onClick={() => void loginWithPopup()}
                type="button"
              >
                Sign in
              </button>
            </div>
            {isCheckingPublicView ? (
              <p className="m-0 text-xs font-bold text-[#8b929b]">Checking view-only access...</p>
            ) : null}
          </>
        ) : error ? (
          <>
            <h1 className="m-0 text-[22px] font-extrabold text-[#f2f4f7]">Invite unavailable</h1>
            <p className="m-0 max-w-[420px] text-sm font-bold text-[#ffd0d0]">{error}</p>
            <Link
              href="/"
              className="mt-1 inline-flex items-center gap-2 rounded-md border border-[#30353d] bg-[#202329] px-3 py-2 text-sm font-extrabold text-[#eef1f4] hover:border-[#4aa391] hover:bg-[#203731]"
            >
              ← Home
            </Link>
          </>
        ) : (
          <>
            <span
              className="h-9 w-9 animate-spin rounded-full border-2 border-[#4aa391] border-t-transparent"
              aria-hidden="true"
            />
            <p className="m-0 text-sm font-bold text-[#cfd4da]">Accepting invite...</p>
          </>
        )}
      </div>
    </main>
  );
}
