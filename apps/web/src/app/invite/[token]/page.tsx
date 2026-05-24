"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { acceptProjectInvite } from "@/editor/collaboration/sharedProjectApi";

export default function InvitePage() {
  const params = useParams<{ token: string }>();
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const token = params.token;

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
  }, [params.token, router]);

  return (
    <main className="grid h-screen min-h-0 place-items-center bg-[#101113] text-[13px] text-[#e7e9ec]">
      <div className="grid justify-items-center gap-3 text-center">
        {error ? (
          <>
            <h1 className="m-0 text-[22px] font-extrabold text-[#f2f4f7]">Invite unavailable</h1>
            <p className="m-0 max-w-[420px] text-sm font-bold text-[#ffd0d0]">{error}</p>
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
