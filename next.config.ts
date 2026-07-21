import type { NextConfig } from "next";

// next-pwa v5 no es compatible con Turbopack (Next.js 16).
// El manifest.json + metadata en layout.tsx cubre "Add to Home Screen".
// Service worker offline: migrar a workbox-webpack-plugin con --webpack flag cuando se necesite.
const nextConfig: NextConfig = {
  experimental: {
    serverActions: {
      bodySizeLimit: '5mb',
    },
  },
};

export default nextConfig;
