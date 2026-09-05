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
const SESION_EMPLEADO = path.join(__dirname, 'e2e', '.auth', 'empleado.json')

/* ¿Hay credenciales de empleado? De eso depende que existan sus proyectos. */
const HAY_EMPLEADO = !!(process.env.E2E_EMPLEADO_EMAIL && process.env.E2E_EMPLEADO_PASSWORD)

const TEST_SETUP = new RegExp('auth' + String.fromCharCode(92) + '.setup' + String.fromCharCode(92) + '.ts')

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
      /* ═══ EL AJUSTE MÁS IMPORTANTE DE ESTE ARCHIVO ═══════════════════════
         `threshold` es la distancia de color POR PÍXEL a partir de la cual un
         píxel se considera distinto. El valor por defecto de Playwright es
         **0.2**, medido en espacio YIQ — que pondera fuertemente la luminancia.

         Ese default hace la comparación ciega justo al tipo de cambio que hace
         un sistema de diseño: mover el MATIZ dejando la luminancia parecida.
         Medido en esta app:

           relleno de insignia  warning-100 → flare-100    0.0083
           relleno de insignia  info-100    → success-100   0.0026
           texto de insignia    warning-700 → flare-700     0.0428

         Todos entre 15 y 75 veces por debajo del umbral. Resultado: la etapa 2
         cambió la paleta ENTERA de violeta a teal y `baseline:verificar` reportó
         7 diferencias de 50. Borrando la base y regenerando, diferían 48.
         No era un bug del arnés: era este número.

         Con 0.001 se detecta el cambio de color más chico que produjimos. Es
         seguro porque el render es determinista —mismo build, misma máquina—:
         dos corridas sin cambios dan cero píxeles distintos, no «casi cero».
         ════════════════════════════════════════════════════════════════════ */
      threshold: 0.001,
      /* Y una vez que los píxeles SÍ se cuentan, la tolerancia de cuántos
         pueden diferir baja también: ya no hace falta absorber ruido. */
      maxDiffPixelRatio: 0.0005,
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
    /* Ningún service worker se registra en las corridas del arnés.
       Hoy la app no tiene uno, así que esto no cambia nada — está puesto de
       antemano: el día que se adopte `@serwist/turbopack`, un caché entre el
       servidor y la captura volvería no determinista la comparación píxel a
       píxel, que es justo lo que este arnés existe para evitar. Con esto, esa
       adopción deja de ser un riesgo para la línea base. */
    serviceWorkers: 'block',
    trace: 'retain-on-failure',
    screenshot: 'off',
    video: 'off',
  },

  projects: [
    {
      name: 'ingreso',
      testMatch: /auth\.setup\.ts/,
      grep: /ingresar como admin/,
    },
    /* Los proyectos de empleado sólo EXISTEN si hay credenciales cargadas.
       Si el proyecto se armara igual y faltaran, el arnés entero quedaría
       rojo hasta que alguien las ponga — y un rojo que no significa nada
       entrena a ignorar los rojos. Con esto aparecen solos el día que se
       agreguen las dos líneas a e2e/.env.e2e. */
    ...(HAY_EMPLEADO ? [{
      name: 'ingreso-empleado',
      testMatch: TEST_SETUP,
      grep: /ingresar como empleado/,
    }] : []),
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
    /* Auditoría de materiales — `npm run audit:materiales`.
       Proyecto aparte a propósito: responde otra pregunta que la línea base.
       Aquélla dice «esto cambió»; ésta dice «esto está mal». Mezclarlas haría
       que un rediseño legítimo y un error de material se vean igual. */
    {
      name: 'materiales',
      dependencies: ['ingreso'],
      testMatch: /materiales\.spec\.ts/,
      use: {
        storageState: SESION,
        viewport: { width: 1440, height: 900 },
        deviceScaleFactor: 1,
      },
    },

    /* ── Corrida de EMPLEADO SIMPLE ──────────────────────────────────
       53 de los 57 usuarios de PENTA son empleado simple, y hasta el
       2026-09-05 su configuración de permisos no se había dibujado nunca:
       las 54 capturas y los 0 hallazgos de material valían todos para una
       cuenta de admin, que la usa una sola persona.

       Sólo móvil: es donde el empleado usa la app de verdad. El escritorio
       con permisos de empleado queda cubierto por la auditoría de material,
       que corre a 1440 y es la que atrapa problemas de legibilidad. */
    ...(HAY_EMPLEADO ? [
      {
        name: 'movil-empleado',
        dependencies: ['ingreso-empleado'],
        testMatch: new RegExp('baseline' + String.fromCharCode(92) + '.spec'),
        use: {
          storageState: SESION_EMPLEADO,
          viewport: { width: 390, height: 844 },
          deviceScaleFactor: 1,
          isMobile: true,
          hasTouch: true,
        },
      },
      {
        name: 'materiales-empleado',
        dependencies: ['ingreso-empleado'],
        testMatch: new RegExp('materiales' + String.fromCharCode(92) + '.spec'),
        use: {
          storageState: SESION_EMPLEADO,
          viewport: { width: 1440, height: 900 },
          deviceScaleFactor: 1,
        },
      },
    ] : []),
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
    /* `pipe` y no `ignore`: si el servidor se muere a mitad de corrida —pasa, ver
       «corridas fantasma» en e2e/README.md— su último mensaje es la única pista
       de por qué. Con `ignore` se pierde. */
    stderr: 'pipe',
  },
})
