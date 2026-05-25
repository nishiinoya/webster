"use client";

import { usePathname, useRouter } from "next/navigation";
import { useEffect } from "react";
import { Auth0Provider, useAuth0 } from "@auth0/auth0-react";
import { setAccessTokenGetter } from "@/editor/collaboration/sharedProjectApi";
import "./globals.css";
import { Geist } from "next/font/google";
import { cn } from "@/lib/utils";

const geist = Geist({subsets:['latin'],variable:'--font-sans'});

const AUTH_SKIP_PATHS = ["/login", "/callback"];

function VerifyEmailScreen() {
  const { logout } = useAuth0();

  return (
    <main className="grid h-screen min-h-0 place-items-center bg-[#101113] text-[13px] text-[#e7e9ec]">
      <div className="grid justify-items-center gap-[18px] text-center max-w-sm px-4">
        <h1 className="m-0 text-[22px] font-bold text-[#f2f4f7]">Verify your email</h1>
        <p className="m-0 text-[#8b929b]">
          Check your inbox and click the verification link, then refresh this page.
        </p>
        <button
          className="rounded-lg border border-[#3a3f47] bg-transparent px-4 py-2.5 font-extrabold text-[#8b929b] hover:text-[#e7e9ec]"
          onClick={() => void logout({ logoutParams: { returnTo: `${typeof window !== "undefined" ? window.location.origin : ""}/login` } })}
          type="button"
        >
          Sign out
        </button>
      </div>
    </main>
  );
}

function RequireAuth({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, isLoading, user } = useAuth0();
  const pathname = usePathname();
  const router = useRouter();

  useEffect(() => {
    if (!isLoading && !isAuthenticated && !AUTH_SKIP_PATHS.includes(pathname)) {
      // Stash the URL we wanted (path + query) so /login can restore it after
      // Auth0 redirects back to /callback. Without this, ?projectId=... is lost.
      if (typeof window !== "undefined") {
        const target = `${window.location.pathname}${window.location.search}${window.location.hash}`;
        if (target && target !== "/") {
          try {
            window.sessionStorage.setItem("auth0:returnTo", target);
          } catch {
            // sessionStorage may be unavailable; fail open
          }
        }
      }
      router.replace("/login");
    }
  }, [isLoading, isAuthenticated, pathname, router]);

  if (AUTH_SKIP_PATHS.includes(pathname)) {
    return <>{children}</>;
  }

  if (isLoading || !isAuthenticated) {
    return null;
  }

  if (user?.email_verified === false) {
    return <VerifyEmailScreen />;
  }

  return <>{children}</>;
}

function AuthBridge() {
  const { getAccessTokenSilently, loginWithRedirect } = useAuth0();

  useEffect(() => {
    // Guard so parallel API calls (every home tab fires one) don't each kick off
    // their own redirect when consent is missing.
    let consentRedirectStarted = false;

    setAccessTokenGetter(async () => {
      try {
        return await getAccessTokenSilently();
      } catch (err) {
        const code =
          typeof err === "object" && err !== null
            ? (err as { error?: string }).error
            : undefined;

        // Silent token acquisition runs without UI, so it can't show Auth0's
        // consent screen. On localhost Auth0 can't skip consent, so any user
        // other than the tenant owner (who is auto-consented) hits
        // `consent_required`/`login_required` on their first API call. Send them
        // through one interactive consent, then back to where they were.
        if (code === "consent_required" || code === "login_required") {
          if (!consentRedirectStarted) {
            consentRedirectStarted = true;

            if (typeof window !== "undefined") {
              try {
                const target = `${window.location.pathname}${window.location.search}${window.location.hash}`;
                if (target && target !== "/") {
                  window.sessionStorage.setItem("auth0:returnTo", target);
                }
              } catch {
                // sessionStorage may be unavailable; fail open
              }
            }

            void loginWithRedirect({
              authorizationParams: { prompt: "consent" },
            });
          }
        }

        throw err;
      }
    });
  }, [getAccessTokenSilently, loginWithRedirect]);

  return null;
}

export default function RootLayout({
  children
}: Readonly<{
  children: React.ReactNode;
}>) {
  const domain = process.env.NEXT_PUBLIC_AUTH0_DOMAIN ?? "";
  const clientId = process.env.NEXT_PUBLIC_AUTH0_CLIENT_ID ?? "";
  const audience = process.env.NEXT_PUBLIC_AUTH0_AUDIENCE ?? "";
  const redirectUri =
    process.env.NEXT_PUBLIC_AUTH0_REDIRECT_URI ??
    (typeof window !== "undefined"
      ? `${window.location.origin}/callback`
      : "http://localhost:3000/callback");

  return (
    <html lang="en" className={cn("font-sans", geist.variable)}>
      <body>
        <Auth0Provider
          domain={domain}
          clientId={clientId}
          authorizationParams={{
            audience,
            redirect_uri: redirectUri,
            scope: "openid profile email offline_access"
          }}
          cacheLocation="localstorage"
          useRefreshTokens={true}
          useRefreshTokensFallback={true}
        >
          <AuthBridge />
          <RequireAuth>{children}</RequireAuth>
        </Auth0Provider>
      </body>
    </html>
  );
}
