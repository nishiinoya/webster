/** Next.js configuration for the Webster web app. */
import type { NextConfig } from "next";

// Server-side proxy target for the Nest API. In dev this is the API on the
// host/Docker forward; in a containerized prod web it would be http://api:4000.
const apiProxyTarget =
  process.env.WEBSTER_API_PROXY_TARGET ?? "http://localhost:4000";

const nextConfig: NextConfig = {
  async rewrites() {
    return [
      {
        // Browser calls same-origin /api/* ; Next forwards to the Nest API.
        // Removes CORS entirely and means the browser only ever talks to :3000.
        source: "/api/:path*",
        destination: `${apiProxyTarget}/api/:path*`,
      },
    ];
  },
};

export default nextConfig;
