"use client";

import { usePathname } from "next/navigation";
import { useEffect } from "react";
import { Auth0Provider, useAuth0 } from "@auth0/auth0-react";
import { setAccessTokenGetter } from "@/editor/collaboration/sharedProjectApi";
import "./globals.css";
import { Geist } from "next/font/google";
import { cn } from "@/lib/utils";

const geist = Geist({subsets:['latin'],variable:'--font-sans'});

const AUTH_SKIP_PATHS = ["/login", "/callback"];

function RequireAuth({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, isLoading, loginWithRedirect } = useAuth0();
  const pathname = usePathname();

  useEffect(() => {
    if (!isLoading && !isAuthenticated && !AUTH_SKIP_PATHS.includes(pathname)) {
      void loginWithRedirect();
    }
  }, [isLoading, isAuthenticated, pathname, loginWithRedirect]);

  if (AUTH_SKIP_PATHS.includes(pathname)) {
    return <>{children}</>;
  }

  if (isLoading || !isAuthenticated) {
    return null;
  }

  return <>{children}</>;
}

function AuthBridge() {
  const { getAccessTokenSilently } = useAuth0();

  useEffect(() => {
    setAccessTokenGetter(getAccessTokenSilently);
  }, [getAccessTokenSilently]);

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
            redirect_uri: redirectUri
          }}
        >
          <AuthBridge />
          <RequireAuth>{children}</RequireAuth>
        </Auth0Provider>
      </body>
    </html>
  );
}
