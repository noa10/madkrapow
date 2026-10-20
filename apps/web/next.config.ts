import type { NextConfig } from "next";

let nextConfig: NextConfig = {
  poweredByHeader: false,
  compress: true,
  images: {
    formats: ["image/avif", "image/webp"],
    minimumCacheTTL: 2592000,
    remotePatterns: [
      {
        protocol: "https",
        hostname: "*.supabase.co",
      },
      {
        protocol: "https",
        hostname: "*.cloudfront.net",
      },
      {
        protocol: "https",
        hostname: "images.unsplash.com",
      },
      {
        protocol: "https",
        hostname: "lh3.googleusercontent.com",
      },
    ],
  },
  // The menu moved onto the storefront ("/", the single-page ordering design).
  // A config-level redirect runs before rendering, so old links, bookmarks and
  // QR codes get a real 307 — and query params are forwarded
  // (?category=... → /?category=... for the catalog's deep links).
  async redirects() {
    return [
      {
        source: "/menu",
        destination: "/",
        permanent: false,
      },
    ];
  },
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          { key: "X-Frame-Options", value: "DENY" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "X-DNS-Prefetch-Control", value: "on" },
        ],
      },
    ];
  },
  experimental: {
    optimizePackageImports: ['lucide-react', 'recharts', '@supabase/ssr'],
    staleTimes: {
      dynamic: 30,
      static: 180,
    },
  },
};

if (process.env.ANALYZE === "true") {
  const withBundleAnalyzer = require("@next/bundle-analyzer")({ enabled: true });
  nextConfig = withBundleAnalyzer(nextConfig);
}

export default nextConfig;
