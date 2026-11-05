import type { NextConfig } from "next";

// Server-side address of the FastAPI backend (inside Docker this is http://backend:8000).
const API_URL = process.env.API_URL_INTERNAL ?? process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";
const apiHost = new URL(process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000");

const nextConfig: NextConfig = {
  cacheComponents: true,
  partialPrefetching: true,
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "thumb.wikimedia.org" },
      { protocol: "https", hostname: "upload.wikimedia.org" },
      {
        protocol: apiHost.protocol.replace(":", "") as "http" | "https",
        hostname: apiHost.hostname,
        port: apiHost.port,
        pathname: "/uploads/**",
      },
    ],
    // Uploaded tour photos are served by the API on localhost during development.
    dangerouslyAllowLocalIP: process.env.NODE_ENV !== "production",
  },
  // The browser talks to the API through the site's own origin, so auth cookies stay first-party.
  async rewrites() {
    return [
      { source: "/api/:path*", destination: `${API_URL}/api/:path*` },
      { source: "/uploads/:path*", destination: `${API_URL}/uploads/:path*` },
    ];
  },
};

export default nextConfig;
