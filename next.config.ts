import type { NextConfig } from "next";

// next-pwa v5 no es compatible con Turbopack (Next.js 16).
// El manifest.json + metadata en layout.tsx cubre "Add to Home Screen".
// Service worker offline: migrar a workbox-webpack-plugin con --webpack flag cuando se necesite.
const nextConfig: NextConfig = {
  // Raíz del workspace fijada a mano. Sin esto, Next 16 detecta el
  // package-lock.json que quedó suelto en C:\Users\danie y toma esa carpeta
  // como raíz, lo que cambia la resolución de módulos y el file tracing del
  // build: el bundle local puede terminar distinto al de Vercel.
  turbopack: {
    root: __dirname,
  },
  experimental: {
    serverActions: {
      bodySizeLimit: '5mb',
    },
  },
};

export default nextConfig;
