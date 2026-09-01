import { defineConfig } from '@playwright/test'
import fs from 'fs'
import path from 'path'

/**
 * Línea base visual — etapa 0 del rediseño Tornasol.
 *
 * Para qué existe: la etapa 1 mueve ~1.420 clases de color a tokens semánticos
 * en 55 archivos. Ese cambio debe ser MECÁNICO — no puede alterar ni un píxel.
 * Estas capturas son la prueba. Si después del codemod el run pasa, el codemod
 * está limpio; si falla, hay un mapeo mal hecho y el reporte HTML muestra dónde.
 *
 * Uso:
 *   npm run baseline:crear     ← una sola vez, ANTES de tocar nada
 *   npm run baseline:verificar ← después del codemod
 */

/* ── Credenciales ────────────────────────────────────────────────────────
   Playwright no lee .env solo. Cargamos .env.e2e a mano para no sumar una
   dependencia. Está cubierto por el `.env*` del .gitignore.               */
function cargarEnv(archivo: string) {
  const ruta = path.join(__dirname, archivo)
  if (!fs.existsSync(ruta)) return
  for (const linea of fs.readFileSync(ruta, 'utf8').split(/\r?\n/)) {
    const m = linea.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)$/)
    if (!m) continue
    const valor = m[2].trim().replace(/^["']|["']$/g, '')
    if (!process.env[m[1]]) process.env[m[1]] = valor
  }
}
/* El archivo vive junto a los tests, en e2e/.env.e2e — no en la raíz. */
cargarEnv('e2e/.env.e2e')

/* La línea base corre contra un BUILD DE PRODUCCIÓN, no contra `next dev`.
   No es una preferencia: el modo dev es no determinista para capturas.
   Cuatro fuentes de ruido, todas exclusivas de dev, y todas verificadas
   contra los diffs de la primera pasada:

     1. El indicador «Compiling» del dev overlay aparece encima de la página.
     2. El badge «N Issues» del mismo overlay va y viene.
     3. El websocket de HMR impide que `networkidle` llegue nunca.
     4. El bloqueo de recursos de desarrollo entre orígenes.

   En producción no existe ninguno. El puerto 3100 evita chocar con el
   `next dev` que suele estar en el 3000: `next start` no tiene la
   restricción de instancia única que sí tiene `next dev`. */
const PUERTO = Number(process.env.BASELINE_PORT ?? 3100)

/* `localhost`, NO `127.0.0.1`. Next 16 bloquea el acceso a los recursos de
   desarrollo (/_next/webpack-hmr) desde un origen distinto al que sirve, y
   para él "127.0.0.1" y "localhost" son orígenes distintos. Con el HMR
   bloqueado el React Client Manifest no resuelve y las páginas cliente
   —/login la primera— fallan a renderizar. La alternativa sería agregar
   `allowedDevOrigins` a next.config.ts, pero no corresponde tocar la
   configuración de la app para acomodar el arnés de tests. */
const BASE   = `http://localhost:${PUERTO}`
const SESION = path.join(__dirname, 'e2e', '.auth', 'admin.json')

export default defineConfig({
  testDir: './e2e',

  /* Un solo worker y sin paralelismo: comparten un dev server y, sobre todo,
     comparten la base de datos. Dos pestañas escribiendo revalidatePath a la
     vez producen capturas que no se repiten. */
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 90_000,

  reporter: [
    ['list'],
    ['html', { outputFolder: 'e2e/reporte', open: 'never' }],
  ],

  /* Las capturas viven en e2e/baseline/<proyecto>/<slug>.png y SE COMMITEAN.
     Son la referencia contra la que compara la etapa 1. */
  snapshotPathTemplate: '{testDir}/baseline/{projectName}/{arg}{ext}',

  expect: {
    /* 15 s en vez de los 5 s por defecto. toHaveScreenshot dispara capturas
       repetidas hasta obtener dos idénticas ("stable screenshot"); en las
       pantallas que siguen re-renderizando mientras llegan los datos —/banco
       y /admin/employees— cinco segundos no alcanzan. */
    timeout: 15_000,
    toHaveScreenshot: {
      /* 0,2% de píxeles de tolerancia: absorbe el antialiasing del render de
         texto entre corridas sin dejar pasar un cambio de color real. */
      maxDiffPixelRatio: 0.002,
      animations: 'disabled',
      caret: 'hide',
      scale: 'css',
    },
  },

  use: {
    baseURL: BASE,
    locale: 'es-CL',
    timezoneId: 'America/Santiago',
    colorScheme: 'light',
    /* En 1.60 `reducedMotion` no es una opción suelta de `use`, va por
       contextOptions. Importa: globals.css tiene un bloque
       @media (prefers-reduced-motion: reduce) que apaga las transiciones. */
    contextOptions: { reducedMotion: 'reduce' },
    trace: 'retain-on-failure',
    screenshot: 'off',
    video: 'off',
  },

  projects: [
    {
      name: 'ingreso',
      testMatch: /auth\.setup\.ts/,
    },
    {
      name: 'movil',
      dependencies: ['ingreso'],
      testMatch: /baseline\.spec\.ts/,
      use: {
        storageState: SESION,
        viewport: { width: 390, height: 844 },   // iPhone 14/15
        deviceScaleFactor: 1,                     // 1× para que los PNG no pesen 4×
        isMobile: true,
        hasTouch: true,
      },
    },
    {
      name: 'escritorio',
      dependencies: ['ingreso'],
      testMatch: /baseline\.spec\.ts/,
      use: {
        storageState: SESION,
        viewport: { width: 1440, height: 900 },
        deviceScaleFactor: 1,
      },
    },
  ],

  webServer: {
    /* El build va incluido a propósito. Si se usara un build viejo, la etapa 1
       compararía el bundle anterior contra sí mismo y el run pasaría en verde
       sin haber verificado nada — el peor fallo posible en una red de
       seguridad. Cuesta un par de minutos y de paso confirma que el codemod
       no rompió la compilación. */
    command: `npm run build && npx next start --port ${PUERTO}`,
    url: `${BASE}/login`,
    reuseExistingServer: false,
    timeout: 420_000,
    stdout: 'ignore',
    stderr: 'pipe',
  },
})
