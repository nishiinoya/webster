"use client";

import { useEffect } from "react";
import { Auth0Provider, useAuth0 } from "@auth0/auth0-react";
import { setAccessTokenGetter } from "@/editor/collaboration/sharedProjectApi";
import "./globals.css";
import { Geist } from "next/font/google";
import { cn } from "@/lib/utils";

const geist = Geist({subsets:['latin'],variable:'--font-sans'});

function AuthBridge() {
  const { getAccessTokenSilently, loginWithRedirect } = useAuth0();

  useEffect(() => {
    let consentRedirectStarted = false;

    setAccessTokenGetter(async () => {
      try {
        return await getAccessTokenSilently();
      } catch (err) {
        const code =
          typeof err === "object" && err !== null
            ? (err as { error?: string }).error
            : undefined;

        if (code === "login_required") {
          return null;
        }

        if (code === "consent_required") {
          if (!consentRedirectStarted) {
            consentRedirectStarted = true;

            if (typeof window !== "undefined") {
              try {
                const target = `${window.location.pathname}${window.location.search}${window.location.hash}`;
                if (target && target !== "/") {
                  window.sessionStorage.setItem("auth0:returnTo", target);
                }
              } catch {
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
          {children}
        </Auth0Provider>
      </body>
    </html>
  );
}
