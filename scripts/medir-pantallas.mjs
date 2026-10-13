// Mide cada pantalla POR BLOQUES, que es lo que dice qué rediseñar.
//
// La §5 de `docs/Rediseño/tornasol-spec.md` describe este método y lo usa para
// explicar los cuatro rediseños que salieron bien, pero la medición se había
// hecho a mano cada vez. Esto la vuelve repetible:
//
//     node scripts/medir-pantallas.mjs            → las 24 rutas estáticas
//     node scripts/medir-pantallas.mjs informes   → solo las que contengan eso
//     node scripts/medir-pantallas.mjs --ancho 1280
//
// Por qué «pantallas de scroll» y no píxeles: 4.404 px no dice nada, «5,2
// pantallas» dice que hay que bajar cinco veces para ver todo. Y el desglose
// por bloque dice DÓNDE están esas pantallas — en `/petty-cash` el 54% era el
// archivo histórico, no las cajas chicas que la pantalla promete.
//
// SOLO NAVEGA Y MIDE. No hace clic en nada: el servidor local apunta a la base
// real y una pantalla de administración puede mandar correos.

import { chromium } from '@playwright/test'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { RUTAS_ESTATICAS } from '../e2e/rutas.ts'

const raiz = path.dirname(fileURLToPath(new URL('.', import.meta.url)))
const BASE = process.env.BASE_URL ?? 'http://localhost:3000'

const args = process.argv.slice(2)

/* `--empleado` mide lo que ve quien USA la app. Con la sesión de admin, las
   pantallas del rendidor salen vacías —no tiene rendiciones propias, no está
   en ninguna cadena, y /banco directamente lo redirige al dashboard— así que
   un `1.0` ahí no dice que la pantalla sea corta: dice que no se midió nada.
   Es el mismo error que la captura `banco.png` de la línea base. */
const comoEmpleado = args.includes('--empleado')
const SESION = path.join(raiz, 'e2e', '.auth', comoEmpleado ? 'empleado.json' : 'admin.json')
const iAncho = args.indexOf('--ancho')
const ancho = iAncho >= 0 ? Number(args[iAncho + 1]) : 390
const alto = ancho >= 768 ? 900 : 844
const filtro = args.filter((a, i) => !a.startsWith('--') && i !== iAncho + 1).join(' ')

/* El 404 no es una pantalla a rediseñar. */
const alcance = comoEmpleado ? ['employee'] : ['employee','approver','admin']
const rutas = RUTAS_ESTATICAS
  .filter(r => alcance.includes(r.rol))
  .filter(r => r.estadoEsperado !== 404)
  .filter(r => !filtro || r.slug.includes(filtro) || r.path.includes(filtro))

const navegador = await chromium.launch()
const ctx = await navegador.newContext({
  storageState: SESION,
  viewport: { width: ancho, height: alto },
  serviceWorkers: 'block',
})

const medidas = []

for (const ruta of rutas) {
  const page = await ctx.newPage()
  try {
    await page.goto(BASE + ruta.path, { waitUntil: 'networkidle', timeout: 45_000 })
    /* Lo que carga después del primer pintado —listas, KPIs— cambia el alto.
       Sin esta espera se mide el esqueleto, no la pantalla, y el esqueleto
       entra justo en una pantalla: un `1.0` clavado es la señal de que se
       midió antes de tiempo. En dev, además, la primera visita a cada ruta
       la compila, así que conviene correrlo dos veces y creerle a la segunda. */
    await page.waitForTimeout(Number(process.env.ESPERA ?? 3000))

    const m = await page.evaluate(() => {
      const main = document.querySelector('main')
      if (!main) return null
      const alto = document.documentElement.scrollHeight
      const vista = window.innerHeight

      /* Un bloque es un hijo directo de <main>, o de su único hijo cuando la
         pantalla envuelve todo en un contenedor (el patrón `space-y-4`). */
      let contenedor = main
      const hijos = [...main.children].filter(e => e.getBoundingClientRect().height > 0)
      if (hijos.length === 1) {
        const dentro = [...hijos[0].children].filter(e => e.getBoundingClientRect().height > 0)
        if (dentro.length > 1) contenedor = hijos[0]
      }

      const nombre = (e) => {
        const t = (e.querySelector('h1,h2,h3,p,span,button,th')?.textContent ?? '').trim()
        return (t.replace(/\s+/g, ' ').slice(0, 42) || e.tagName.toLowerCase())
      }

      const bloques = [...contenedor.children]
        .map(e => ({ alto: Math.round(e.getBoundingClientRect().height), que: nombre(e) }))
        .filter(b => b.alto > 0)
        .sort((a, b) => b.alto - a.alto)

      return { alto, vista, bloques, anchoDoc: document.documentElement.scrollWidth }
    })

    if (!m) { medidas.push({ ...ruta, error: 'sin <main> — ¿redirigió?' }); continue }

    medidas.push({
      ...ruta,
      pantallas: +(m.alto / m.vista).toFixed(1),
      px: m.alto,
      desborde: m.anchoDoc > ancho ? m.anchoDoc - ancho : 0,
      bloques: m.bloques,
    })
  } catch (e) {
    medidas.push({ ...ruta, error: String(e).split('\n')[0].slice(0, 70) })
  } finally {
    await page.close()
  }
}

await navegador.close()

// ── El informe ──────────────────────────────────────────────────────────────
medidas.sort((a, b) => (b.pantallas ?? 0) - (a.pantallas ?? 0))

console.log(`\nMEDIDO A ${ancho}×${alto}\n${'─'.repeat(78)}`)
console.log('pant.  px     ruta                           pantalla')
console.log('─'.repeat(78))
for (const m of medidas) {
  if (m.error) { console.log(`  ——          ${m.path.padEnd(30)} ${m.error}`); continue }
  const marca = m.pantallas >= 4 ? '!!' : m.pantallas >= 2.5 ? ' !' : '  '
  console.log(
    `${String(m.pantallas).padStart(4)}${marca} ${String(m.px).padStart(5)}  ` +
    `${m.path.padEnd(30)} ${m.nombre}` + (m.desborde ? `  ⟵ DESBORDA ${m.desborde}px` : ''))
}

console.log(`\n${'─'.repeat(78)}\nDESGLOSE POR BLOQUE — de las que pasan de 2,5 pantallas\n`)
for (const m of medidas.filter(x => !x.error && x.pantallas >= 2.5)) {
  console.log(`\n${m.path}  ·  ${m.pantallas} pantallas  ·  ${m.px}px`)
  for (const b of m.bloques.slice(0, 6)) {
    const pct = Math.round((b.alto / m.px) * 100)
    const barra = '█'.repeat(Math.max(1, Math.round(pct / 3)))
    console.log(`   ${String(pct).padStart(3)}%  ${String(b.alto).padStart(5)}px  ${barra.padEnd(34)} ${b.que}`)
  }
}
console.log()
