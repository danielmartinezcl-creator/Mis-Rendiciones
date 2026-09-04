import type { NextConfig } from "next";

// La app es instalable con `manifest.json` + la metadata de `layout.tsx`, pero
// NO tiene service worker, así que no hay caché offline.
//
// El motivo histórico —«next-pwa v5 no es compatible con Turbopack»— era cierto
// y ya no lo es: `@serwist/turbopack`, el sucesor mantenido de next-pwa, tiene
// soporte explícito para Turbopack. La dependencia `next-pwa` quedó huérfana en
// package.json durante meses y se eliminó el 2026-09-04.
//
// Antes de adoptarlo hay que resolver una interacción concreta: el service
// worker quedaría activo en el build de producción contra el que corre la línea
// base visual (`next build && next start` en el puerto 3100), y un caché de por
// medio puede volver no determinista una comparación píxel a píxel — que es
// justamente lo que ese arnés existe para evitar. Ver e2e/README.md.
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
