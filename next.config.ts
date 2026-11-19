import type { NextConfig } from "next";

const isProd = process.env.NODE_ENV === "production";

// Pages get a per-request nonce CSP from src/middleware.ts. API routes return JSON or redirects,
// never pages, so they get a policy that allows nothing at all.
const apiCsp = "default-src 'none'; frame-ancestors 'none'";

const securityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=(), usb=(), browsing-topics=()" },
  { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
  // Browsers ignore this header on plain http, so it only takes effect where the app is served over https.
  ...(isProd ? [{ key: "Strict-Transport-Security", value: "max-age=31536000" }] : []),
];

const nextConfig: NextConfig = {
  images: { unoptimized: true },
  poweredByHeader: false,
  async headers() {
    return [
      { source: "/:path*", headers: securityHeaders },
      // Nothing behind the login or under /api should ever be stored by a shared cache.
      {
        source: "/api/:path*",
        headers: [{ key: "Cache-Control", value: "no-store" }, ...(isProd ? [{ key: "Content-Security-Policy", value: apiCsp }] : [])],
      },
    ];
  },
};

export default nextConfig;
