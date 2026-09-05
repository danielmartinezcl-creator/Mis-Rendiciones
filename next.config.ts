import type { NextConfig } from "next";

// La app es instalable con `manifest.json` + la metadata de `layout.tsx`, pero
// NO tiene service worker, así que no hay caché offline.
//
// El motivo histórico —«next-pwa v5 no es compatible con Turbopack»— era cierto
// y ya no lo es: `@serwist/turbopack`, el sucesor mantenido de next-pwa, tiene
// soporte explícito para Turbopack. La dependencia `next-pwa` quedó huérfana en
// package.json durante meses y se eliminó el 2026-09-04.
//
// Esa interacción YA NO BLOQUEA (resuelto el 2026-09-04): el arnés corre con
// `serviceWorkers: 'block'` en playwright.config.ts, así que ningún service
// worker se registra durante la línea base y la comparación píxel a píxel sigue
// siendo determinista.
//
// Lo que queda es una decisión de producto, no técnica: un service worker da
// caché offline —valioso para fotografiar boletas donde no hay señal— a cambio
// del riesgo clásico de servir assets viejos después de un deploy. Esa decisión
// es del dueño del producto.
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
