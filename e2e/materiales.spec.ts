import { test, expect, type Page } from '@playwright/test'
import { RUTAS_ESTATICAS, RUTAS_DETALLE } from './rutas'
import fs from 'fs'
import path from 'path'

/**
 * Auditoría de materiales — la regla del sistema Tornasol, verificada a máquina.
 *
 *   «El degradado es el contenedor, nunca la superficie de trabajo.
 *    Un dato apoyado directo sobre el degradado está mal.»
 *
 * A ojo no se encuentra: son líneas grises de 12 px en páginas de 4.000 px de
 * alto, repartidas en 25 pantallas. Este archivo recorre CADA nodo de texto,
 * sube por el árbol hasta el primer ancestro que pinte fondo, y si llega al
 * `body` sin encontrarlo, entonces ese texto está sobre el degradado.
 *
 * Sobre el degradado solo puede ir texto CLARO (títulos de pantalla y sus
 * bajadas, `.tor-on-gradient`). Texto oscuro ahí es, por definición, oscuro
 * sobre oscuro. Ese es el defecto que este archivo busca, y no tiene falsos
 * positivos: no depende de juzgar si algo "se ve bien".
 *
 * Corre aparte de la línea base (`npm run audit:materiales`) porque responde
 * otra pregunta: la línea base dice «esto cambió», esto dice «esto está mal».
 */

/** Debajo de esta luminancia relativa, el texto es oscuro. */
const UMBRAL_OSCURO = 0.5

interface Hallazgo {
  ruta:   string
  texto:  string
  color:  string
  lum:    number
  tag:    string
  clases: string
}

async function auditar(page: Page, ruta: string): Promise<{ hallazgos: Hallazgo[]; nodos: number }> {
  await page.evaluate(() => document.fonts.ready)
  await page.waitForLoadState('networkidle', { timeout: 8_000 }).catch(() => {})

  return page.evaluate((umbral) => {
    /* NO parsear el color a mano. Ya falló dos veces por lo mismo: la etapa 2
       se comió `color(srgb 1 1 1 / 0.3)` —componentes en 0–1, no en 0–255— y
       la primera versión de este archivo se comió `oklch(0.66 0.03 206)`, que
       es como Chrome computa TODA la paleta de esta app desde la etapa 2. El
       síntoma es traicionero: el color no se parsea, el texto se saltea, y la
       auditoría informa cero hallazgos con cara de éxito.
       El canvas convierte cualquier color CSS válido a sRGB sin que yo tenga
       que saber en qué espacio venía escrito. */
    const ctx = document.createElement('canvas').getContext('2d', { willReadFrequently: true })!

    /**
     * ¿El navegador acepta este color? Con DOS centinelas distintos: si el color
     * es inválido, `fillStyle` se queda con el centinela y las dos lecturas
     * difieren. Si es válido, las dos dan el mismo valor normalizado —incluso
     * si ese valor resulta ser el centinela mismo.
     */
    function valido(css: string): boolean {
      ctx.fillStyle = '#ff0000'; ctx.fillStyle = css
      const a = ctx.fillStyle
      ctx.fillStyle = '#00ff00'; ctx.fillStyle = css
      return a === ctx.fillStyle
    }

    /** [r,g,b,a] en 0–255, sea cual sea el espacio de color de origen. */
    function pixel(css: string): [number, number, number, number] | null {
      if (!valido(css)) return null
      ctx.clearRect(0, 0, 1, 1)
      ctx.fillStyle = css
      ctx.fillRect(0, 0, 1, 1)
      const d = ctx.getImageData(0, 0, 1, 1).data
      return [d[0], d[1], d[2], d[3]]
    }

    function luminancia(css: string): number | null {
      const px = pixel(css)
      if (!px) return null
      const lin = px.slice(0, 3).map(v => {
        const s = v / 255
        return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4)
      })
      const lum = 0.2126 * lin[0] + 0.7152 * lin[1] + 0.0722 * lin[2]
      /* El degradado es oscuro: un texto claro pero muy transparente llega tan
         tenue como uno oscuro. Se compone sobre negro. */
      return lum * (px[3] / 255)
    }

    /**
     * ¿Este elemento pinta un fondo propio?
     *
     * Se resuelve por el ALFA del píxel, no leyendo el string: la paleta de
     * esta app está escrita en `oklch` y cualquier regex de `rgb(` la da por
     * transparente — que fue justamente el bug que hizo que esta auditoría
     * informara 191 falsos positivos, con la app entera pareciendo rota.
     * Un vidrio a .42 pinta; un `rgba(0,0,0,0)` no.
     */
    function pintaFondo(el: Element): boolean {
      const cs = getComputedStyle(el)
      if (cs.backgroundImage && cs.backgroundImage !== 'none') return true
      const px = pixel(cs.backgroundColor)
      return px !== null && px[3] / 255 >= 0.15
    }

    const hallazgos: Array<Record<string, unknown>> = []
    let evaluados = 0
    const paseados = new Set<Element>()
    const caminante = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT)

    let nodo: Node | null
    while ((nodo = caminante.nextNode())) {
      const texto = (nodo.textContent ?? '').trim()
      if (texto.length < 2) continue

      const el = nodo.parentElement
      if (!el || paseados.has(el)) continue
      paseados.add(el)

      const cs = getComputedStyle(el)
      if (cs.display === 'none' || cs.visibility === 'hidden' || cs.opacity === '0') continue
      if (el.getBoundingClientRect().height === 0) continue
      evaluados++

      // Subir hasta el primer ancestro que pinte.
      let cursor: Element | null = el
      let sobreDegradado = true
      while (cursor && cursor !== document.body) {
        if (pintaFondo(cursor)) { sobreDegradado = false; break }
        cursor = cursor.parentElement
      }
      if (!sobreDegradado) continue

      const lum = luminancia(cs.color)
      if (lum === null || lum >= umbral) continue

      hallazgos.push({
        texto:  texto.slice(0, 60),
        color:  cs.color,
        lum:    Math.round(lum * 1000) / 1000,
        tag:    el.tagName.toLowerCase(),
        clases: (el.getAttribute('class') ?? '').slice(0, 90),
      })
    }
    return { hallazgos, evaluados }
  }, UMBRAL_OSCURO).then(r => ({
    hallazgos: (r.hallazgos as unknown as Hallazgo[]).map(h => ({ ...h, ruta })),
    nodos:     r.evaluados,
  }))
}

test('ningun dato oscuro apoyado sobre el degradado', async ({ page }, info) => {
  test.setTimeout(300_000)   // 25 pantallas en una sola prueba
  const hallazgos: Hallazgo[] = []
  const visitadas: string[] = []
  let nodosVistos = 0

  for (const ruta of RUTAS_ESTATICAS) {
    await page.goto(ruta.path, { waitUntil: 'domcontentloaded' })
    const { hallazgos: hs, nodos } = await auditar(page, ruta.path)
    hallazgos.push(...hs)
    nodosVistos += nodos
    visitadas.push(ruta.path)
  }

  /* Las rutas de detalle resuelven un id real entrando por su listado — el
     mismo mecanismo que la línea base. Sin datos, se saltea: no es un fallo. */
  for (const det of RUTAS_DETALLE) {
    let destino: string | undefined
    for (const lista of det.listas) {
      await page.goto(lista, { waitUntil: 'domcontentloaded' })
      const enlaces = await page
        .locator(`a[href^="${det.prefijo}"]`)
        .evaluateAll(nodos => nodos.map(n => n.getAttribute('href') ?? ''))
      destino = enlaces.find(h => h && !det.ignorar.includes(h) && h !== det.prefijo)
      if (destino) break
    }
    if (!destino) continue
    await page.goto(destino, { waitUntil: 'domcontentloaded' })
    const rd = await auditar(page, destino)
    hallazgos.push(...rd.hallazgos)
    nodosVistos += rd.nodos
    visitadas.push(destino)
  }

  /* El informe se escribe SIEMPRE, pase o falle: es la lista de trabajo. */
  fs.writeFileSync(
    path.join(__dirname, 'reporte-materiales.md'),
    informe(hallazgos, visitadas, nodosVistos),
    'utf8',
  )

  /* Un detector que no mira nada informa cero hallazgos con cara de éxito. Ya
     pasó: la primera versión no parseaba `oklch` —o sea, toda la paleta de
     esta app— y salteaba cada texto en silencio. Estas dos aserciones son el
     piso de confianza del archivo: sin ellas, un verde no prueba nada. */
  expect(visitadas.length, 'la auditoría no recorrió las pantallas').toBeGreaterThan(20)
  expect(nodosVistos, 'la auditoría no evaluó ningún texto').toBeGreaterThan(500)

  expect(
    hallazgos,
    `${hallazgos.length} textos oscuros sobre el degradado. Detalle en e2e/reporte-materiales.md`,
  ).toEqual([])
})

function informe(hs: Hallazgo[], visitadas: string[], nodos: number): string {
  const porRuta = new Map<string, Hallazgo[]>()
  for (const h of hs) {
    const lista = porRuta.get(h.ruta) ?? []
    lista.push(h)
    porRuta.set(h.ruta, lista)
  }

  const lineas = [
    `# Auditoría de materiales`,
    '',
    `Generado por \`npm run audit:materiales\`.`,
    '',
    `**${hs.length} hallazgos** · ${visitadas.length} pantallas recorridas · ${nodos} textos evaluados.`,
    '',
    '> El segundo y el tercer número importan tanto como el primero: «0 hallazgos»',
    '> solo significa algo si la auditoría de verdad miró. Si dicen 0, el detector',
    '> está roto, no la app.',
    '',
    'Cada línea es un texto oscuro que no tiene ninguna superficie debajo: está',
    'apoyado directo sobre el degradado. La corrección es envolverlo en `.hoja`',
    '(si se lee o se llena) o en `.tor-glass` (si se mira), o aclarar el texto',
    'cuando de verdad es un título de pantalla.',
    '',
  ]

  for (const [ruta, lista] of [...porRuta].sort((a, b) => b[1].length - a[1].length)) {
    lineas.push(`## ${ruta} — ${lista.length}`, '')
    lineas.push('| Texto | Etiqueta | Luminancia | Clases |', '|---|---|---:|---|')
    for (const h of lista) {
      const txt = h.texto.replace(/\|/g, '\\|')
      lineas.push(`| ${txt} | \`${h.tag}\` | ${h.lum} | \`${h.clases}\` |`)
    }
    lineas.push('')
  }

  return lineas.join('\n')
}
