"use client";

import { useAuth0 } from "@auth0/auth0-react";
import { useRouter } from "next/navigation";
import { useEffect } from "react";

export default function CallbackPage() {
  const { isLoading, error, isAuthenticated } = useAuth0();
  const router = useRouter();

  useEffect(() => {
    if (!isLoading && isAuthenticated) {
      router.replace("/");
    }
  }, [isLoading, isAuthenticated, router]);

  if (error) {
    return (
      <main className="grid h-screen min-h-0 place-items-center bg-[#101113] text-[13px] text-[#e7e9ec]">
        <p className="m-0 font-bold text-[#ffd0d0]">Authentication error: {error.message}</p>
      </main>
    );
  }

  return (
    <main className="grid h-screen min-h-0 place-items-center bg-[#101113] text-[13px] text-[#e7e9ec]">
      <span
        className="h-9 w-9 animate-spin rounded-full border-2 border-[#4aa391] border-t-transparent"
        aria-hidden="true"
      />
    </main>
  );
}
