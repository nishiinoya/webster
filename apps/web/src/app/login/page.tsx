"use client";

import { useAuth0 } from "@auth0/auth0-react";

export default function LoginPage() {
  const { loginWithRedirect } = useAuth0();

  return (
    <main className="grid h-screen min-h-0 place-items-center bg-[#101113] text-[13px] text-[#e7e9ec]">
      <div className="grid justify-items-center gap-[18px] text-center">
        <h1 className="m-0 text-[34px] font-bold leading-[1.12] text-[#f2f4f7]">Webster</h1>
        <p className="m-0 text-xs font-extrabold uppercase tracking-normal text-[#8b929b]">
          Sign in to continue
        </p>
        <button
          className="min-w-40 rounded-lg border border-[#4aa391] bg-[#203731] px-[18px] py-3.5 font-extrabold text-[#eef1f4] hover:border-[#4aa391] hover:bg-[#203731] focus-visible:border-[#4aa391] focus-visible:bg-[#203731]"
          onClick={() => void loginWithRedirect()}
          type="button"
        >
          Continue with Auth0
        </button>
      </div>
    </main>
  );
}
