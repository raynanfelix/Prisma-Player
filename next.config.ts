import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  poweredByHeader: false,
  skipTrailingSlashRedirect: true,
  async rewrites() {
    return [
      {
        source: "/ingest/static/:path*",
        destination: "https://us-assets.i.posthog.com/static/:path*",
      },
      {
        source: "/ingest/array/:path*",
        destination: "https://us-assets.i.posthog.com/array/:path*",
      },
      {
        source: "/ingest/:path*",
        destination: "https://us.i.posthog.com/:path*",
      },
    ];
  },
  async headers() {
    return [{
      source: "/embed/:path*",
      headers: [
        { key: "X-Content-Type-Options", value: "nosniff" },
        { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
        { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), unload=*" },
        { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
        // CSP dinâmico (nonce) é emitido no proxy.ts
        // O HTML carrega um token vinculado ao Origin/Referer. Ele nunca pode
        // ser reutilizado pelo CDN entre sites diferentes.
        { key: "Cache-Control", value: "private, no-store, max-age=0" },
        { key: "CDN-Cache-Control", value: "private, no-store" },
      ],
    }, {
      source: "/:path((?!embed(?:/|$)).*)",
      headers: [
        { key: "X-Content-Type-Options", value: "nosniff" },
        { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
        { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), unload=*" },
        { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
        { key: "X-Frame-Options", value: "SAMEORIGIN" },
        { key: "Cross-Origin-Opener-Policy", value: "same-origin-allow-popups" },
        // CSP dinâmico (nonce) é emitido no proxy.ts
      ],
    }];
  },
};

export default nextConfig;
