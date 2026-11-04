/**
 * Capturas para el manual de usuario (docs/manual/) y la presentación.
 *
 * Dos cuentas, cada una con su parte:
 *   - la demo de empleado —MANUAL_EMAIL / MANUAL_PASSWORD en e2e/.env.e2e—
 *     fotografía lo que ve quien rinde, en celular y en computador;
 *   - la del admin —E2E_EMAIL / E2E_PASSWORD— fotografía la bandeja y la
 *     pantalla de aprobación, porque es el N1 de la cuenta demo.
 *
 * Corre contra producción por defecto (MANUAL_URL lo cambia): el manual tiene
 * que mostrar lo mismo que el empleado va a ver. SOLO NAVEGA Y FOTOGRAFÍA:
 * ninguna toma aprieta un botón que guarde, envíe o apruebe. Las que abren
 * algo (un formulario, el menú) lo hacen por su nombre, nunca por posición.
 *
 * Los documentos de ejemplo tienen ids fijos y viven en la papelera entre una
 * corrida y otra: se sacan antes de capturar y se devuelven al terminar.
 *
 * Las claves se usan una sola vez, para abrir las dos sesiones, y eso lo corre
 * una persona. Sacar las fotos no pide ninguna clave: entra con esas sesiones,
 * así que si faltan o vencieron se detiene en vez de intentar iniciar sesión.
 *
 *   node e2e/manual/capturar.mjs --guardar-sesiones   # lo corre Daniel
 *   node e2e/manual/capturar.mjs                      # todo
 *   node e2e/manual/capturar.mjs --solo aprobador
 *   node e2e/manual/capturar.mjs --local              # contra localhost:3000
 *
 * Las sesiones quedan en e2e/.auth/ (fuera de git). Al terminar se borran: la
 * del admin abre la cuenta entera.
 */
import { chromium } from '@playwright/test'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const aqui = path.dirname(fileURLToPath(import.meta.url))
const raiz = path.resolve(aqui, '..', '..')
const SALIDA = path.join(raiz, 'docs', 'manual', 'img')

for (const linea of fs.readFileSync(path.join(raiz, 'e2e', '.env.e2e'), 'utf8').split(/\r?\n/)) {
  const m = linea.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)$/)
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim().replace(/^["']|["']$/g, '')
}

/* --local: el servidor local, para fotografiar un cambio antes de desplegarlo.
   Lee la misma base que producción; una sesión de un lado no sirve en el otro. */
const BASE = process.argv.includes('--local')
  ? 'http://localhost:3000'
  : process.env.MANUAL_URL ?? 'https://www.mi-rendicion.com'
const solo = process.argv.includes('--solo') ? process.argv[process.argv.indexOf('--solo') + 1] : null

const SESION_EMPLEADO  = path.join(raiz, 'e2e', '.auth', 'manual-empleado.json')
const SESION_APROBADOR = path.join(raiz, 'e2e', '.auth', 'manual-aprobador.json')

const R = {
  borrador:    'aaaa0001-0000-4000-8000-000000000001',
  aprobada:    'aaaa0001-0000-4000-8000-000000000002',
  reembolsada: 'aaaa0001-0000-4000-8000-000000000004',
  revision:    'aaaa0001-0000-4000-8000-000000000005',
  fondo:       'bbbb0001-0000-4000-8000-000000000001',
}

const DISPOSITIVOS = {
  movil:      { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true },
  escritorio: { viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 },
}

const abrirFormulario = (nombre) => async p => {
  await p.getByRole('button', { name: nombre }).first().click()
  await p.waitForTimeout(800)
}

/* Cada toma es del alto de una pantalla. El degradado de la app va fijo al
   viewport: en una captura de página completa se corta donde termina la
   pantalla y deja una franja oscura. Por eso las tomas de celular se
   DESPLAZAN hasta lo que ilustran (`hasta`), y las de computador que
   necesitan la página entera agrandan la ventana (`alta`).

   [archivo, ruta, dispositivos, { antes, hasta, alta }] */
const EMPLEADO = [
  ['estado',                '/',                             ['movil', 'escritorio']],
  ['menu-mas',              '/',                             ['movil'], { antes: async p => { await p.getByRole('button', { name: /más/i }).last().click(); await p.waitForTimeout(500) } }],
  ['perfil',                '/profile',                      ['movil'], { hasta: 'Institución bancaria' }],
  ['rendicion-nueva',       '/expenses/new',                 ['movil']],
  ['rendicion-borrador',    `/expenses/${R.borrador}`,       ['movil'], { hasta: 'Esto va a' }],
  ['rendicion-borrador',    `/expenses/${R.borrador}`,       ['escritorio'], { alta: true }],
  ['agregar-item',          `/expenses/${R.borrador}`,       ['movil'], { antes: async p => { await p.getByText('+ Agregar ítem').click(); await p.waitForTimeout(800) }, hasta: 'Foto o archivo del comprobante' }],
  ['rendicion-revision',    `/expenses/${R.revision}`,       ['movil']],
  ['rendicion-aprobada',    `/expenses/${R.aprobada}`,       ['movil']],
  ['rendicion-reembolsada', `/expenses/${R.reembolsada}`,    ['movil'], { hasta: 'Resumen de aprobación' }],
  ['comprobante',           `/expenses/${R.reembolsada}`,    ['movil'], { hasta: 'Comprobante PDF' }],
  ['mis-rendiciones',       '/reimbursements',               ['movil', 'escritorio']],
  ['mis-gastos',            '/mis-gastos',                   ['movil']],
  ['caja-chica',            '/petty-cash',                   ['movil', 'escritorio']],
  ['caja-chica-nueva',      '/petty-cash/new',               ['movil']],
  ['caja-chica-fondo',      `/petty-cash/${R.fondo}`,        ['movil']],
  ['caja-chica-fondo',      `/petty-cash/${R.fondo}`,        ['escritorio'], { alta: true }],
  ['caja-chica-agregar',    `/petty-cash/${R.fondo}`,        ['movil'], { antes: abrirFormulario(/Agregar gasto/), hasta: 'Foto o archivo del comprobante' }],
  ['caja-chica-liquidar',   `/petty-cash/${R.fondo}`,        ['movil'], { hasta: 'Total gastos' }],
]

const APROBADOR = [
  ['aprobaciones',          '/approvals',                    ['movil', 'escritorio']],
  ['aprobacion-detalle',    `/approvals/${R.revision}`,      ['movil']],
  ['aprobacion-detalle',    `/approvals/${R.revision}`,      ['escritorio'], { alta: true }],
  ['aprobacion-decidir',    `/approvals/${R.revision}`,      ['movil'], { hasta: 'Devolver para corregir' }],
]

/* Las dos cuentas tienen más menú que un trabajador: la demo puede cargar pagos y
   la otra es admin. El manual muestra lo que ve quien rinde y quien aprueba, así
   que esas entradas del riel no se dibujan en la foto. El indicador de Next solo
   existe con --local. */
const MENU_DE_MAS = `aside a[href="/banco"], aside a[href="/quick"], aside a[href="/informes"], aside a[href^="/admin"], nextjs-portal { display: none !important; }`

/* Lleva el texto al tercio superior de la pantalla, con el contexto de arriba a la vista. */
async function desplazarHasta(p, texto) {
  const el = p.getByText(texto, { exact: false }).first()
  /* Con scrollTo y no scrollIntoView + scrollBy: cerca del final de la página,
     lo segundo llega al tope y después retrocede, y deja el texto abajo. */
  await el.evaluate(e => window.scrollTo(0, e.getBoundingClientRect().top + window.scrollY - 140))
  await p.waitForTimeout(400)
}

async function esperarQuieta(p) {
  await p.waitForLoadState('networkidle', { timeout: 20_000 }).catch(() => {})
  await p.evaluate(() => document.fonts.ready)
  await p.waitForTimeout(600)
}

async function guardarSesion(navegador, correo, clave, destino) {
  if (!correo || !clave) throw new Error('Faltan credenciales en e2e/.env.e2e')
  const ctx = await navegador.newContext({ locale: 'es-CL', serviceWorkers: 'block' })
  const p = await ctx.newPage()
  await p.goto(`${BASE}/login`)
  await esperarQuieta(p)
  await p.locator('#email').fill(correo)
  await p.locator('#password').fill(clave)
  await p.getByRole('button', { name: 'Ingresar' }).click()
  await p.waitForURL(u => !u.pathname.startsWith('/login'), { timeout: 30_000 })
  await ctx.storageState({ path: destino })
  await ctx.close()
  console.log('✓ sesión guardada', path.relative(raiz, destino))
}

/* La pantalla de ingreso se fotografía sin sesión: con una, redirige adentro. */
async function capturarLogin(navegador) {
  for (const [nombreDisp, opciones] of Object.entries(DISPOSITIVOS)) {
    const ctx = await navegador.newContext({ ...opciones, locale: 'es-CL', serviceWorkers: 'block' })
    const p = await ctx.newPage()
    await p.goto(`${BASE}/login`)
    await esperarQuieta(p)
    await p.addStyleTag({ content: MENU_DE_MAS })
    const destino = path.join(SALIDA, `login-${nombreDisp}.png`)
    await p.screenshot({ path: destino })
    console.log('✓', path.relative(raiz, destino))
    await ctx.close()
  }
}

async function capturar(navegador, { sesion, tomas }) {
  if (!fs.existsSync(sesion)) throw new Error(`Falta ${path.relative(raiz, sesion)}: correr --guardar-sesiones`)
  for (const [nombreDisp, opciones] of Object.entries(DISPOSITIVOS)) {
    const ctx = await navegador.newContext({ ...opciones, storageState: sesion, locale: 'es-CL', serviceWorkers: 'block' })
    const p = await ctx.newPage()

    await p.goto(`${BASE}/`)
    await esperarQuieta(p)
    if (new URL(p.url()).pathname.startsWith('/login')) {
      throw new Error(`La sesión de ${path.relative(raiz, sesion)} venció: correr --guardar-sesiones`)
    }

    for (const [archivo, ruta, disps, { antes, hasta, alta } = {}] of tomas) {
      if (!disps.includes(nombreDisp)) continue
      try {
        await p.setViewportSize(opciones.viewport)
        await p.goto(`${BASE}${ruta}`)
        await esperarQuieta(p)
        await p.addStyleTag({ content: MENU_DE_MAS })
        if (antes) await antes(p)
        if (hasta) await desplazarHasta(p, hasta)
        if (alta) {
          const alto = await p.evaluate(() => document.documentElement.scrollHeight)
          await p.setViewportSize({ width: opciones.viewport.width, height: Math.min(alto, 2000) })
          await esperarQuieta(p)
        }
        const destino = path.join(SALIDA, `${archivo}-${nombreDisp}.png`)
        await p.screenshot({ path: destino })
        console.log('✓', path.relative(raiz, destino))
      } catch (e) {
        // Una toma que falla no tira las demás: se informa y se sigue.
        console.log('✗', `${archivo}-${nombreDisp}`, '—', e.message.split('\n')[0])
      }
    }
    /* Supabase rota el token de refresco al usarlo: sin volver a guardarlo, el
       contexto siguiente entraría con uno ya gastado y perdería la sesión. */
    await ctx.storageState({ path: sesion })
    await ctx.close()
  }
}

fs.mkdirSync(SALIDA, { recursive: true })
fs.mkdirSync(path.dirname(SESION_EMPLEADO), { recursive: true })
const navegador = await chromium.launch()
if (process.argv.includes('--guardar-sesiones')) {
  await guardarSesion(navegador, process.env.MANUAL_EMAIL, process.env.MANUAL_PASSWORD, SESION_EMPLEADO)
  await guardarSesion(navegador, process.env.E2E_EMAIL, process.env.E2E_PASSWORD, SESION_APROBADOR)
} else {
  if (!solo || solo === 'empleado') {
    await capturarLogin(navegador)
    await capturar(navegador, { sesion: SESION_EMPLEADO, tomas: EMPLEADO })
  }
  if (!solo || solo === 'aprobador') {
    await capturar(navegador, { sesion: SESION_APROBADOR, tomas: APROBADOR })
  }
}
await navegador.close()
