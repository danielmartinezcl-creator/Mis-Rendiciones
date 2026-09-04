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

/**
 * Paneles que arrancan cerrados, y por eso nunca los vio nadie.
 *
 * ⛔ REGLA DE SEGURIDAD — leerla antes de agregar una entrada acá.
 *
 * Esta auditoría corre contra la BASE REAL. Este mapa solo puede contener
 * controles que ABREN o CAMBIAN DE VISTA. Ninguno que confirme, envíe, guarde
 * o elimine: un clic equivocado acá borra datos de verdad, y la auditoría los
 * recorre las 24 pantallas sin que nadie mire.
 *
 * Por eso es un mapa explícito y no un «hacé clic en todo lo que parezca un
 * botón». Cada entrada se verifica a mano antes de entrar: las pestañas de
 * `/admin/settings` son `onClick={() => setActiveTab(id)}`, estado local puro.
 */
interface Paso {
  /** Texto visible del control. Es la etiqueta del error aunque haya `selector`. */
  boton: string
  /**
   * Selector CSS, para controles que NO tienen texto — un expansor que es solo
   * un chevron. Se prefiere `title`/`aria-label` antes que una clase: la clase
   * cambia con cualquier retoque visual y el atributo describe la intención.
   */
  selector?: string
}

interface Panel {
  /** Ruta estática, o el slug de una RUTA_DETALLE para resolver un id real. */
  ruta?:    string
  detalle?: string
  panel:    string
  /**
   * Los clics, en orden. Casi siempre uno — pero las cargas históricas están
   * plegadas en DOS niveles: hay que abrir el grupo para que existan las filas,
   * y recién entonces se puede abrir una fila.
   */
  pasos:    Paso[]
  /**
   * El control solo existe en ciertos estados — «+ Agregar ítem» está en la
   * rendición solo mientras es borrador. Si no aparece, NO es un fallo: es que
   * los datos de hoy no permiten abrirlo.
   *
   * Pero tampoco se saltea en silencio, que es como nació este punto ciego.
   * Queda listado en el informe como «no auditado», con su motivo: un hueco
   * que se ve es un hueco que se puede cerrar.
   */
  condicional?: boolean
}

const PANELES: Panel[] = [
  // Pestañas — `onClick={() => setActiveTab(id)}`, estado local puro.
  { ruta: '/admin/settings', panel: 'Empleados',  pasos: [{ boton: 'Empleados' }] },
  { ruta: '/admin/settings', panel: 'Aprobación', pasos: [{ boton: 'Aprobación' }] },
  { ruta: '/admin/settings', panel: 'Límites',    pasos: [{ boton: 'Límites' }] },
  { ruta: '/admin/settings', panel: 'Defontana',  pasos: [{ boton: 'Defontana' }] },
  { ruta: '/admin/settings', panel: 'Políticas',  pasos: [{ boton: 'Políticas' }] },
  { ruta: '/admin/settings', panel: 'Viáticos',   pasos: [{ boton: 'Viáticos' }] },
  { ruta: '/admin/settings', panel: 'Webhooks',   pasos: [{ boton: 'Webhooks' }] },
  { ruta: '/admin/settings', panel: 'Marca',      pasos: [{ boton: 'Marca' }] },

  // Formularios que arrancan cerrados. Los tres controles son `setState` a
  // secas —verificado leyendo cada componente—: revelan el formulario vacío y
  // no envían nada. El formulario queda sin tocar y la auditoría navega afuera.
  { detalle: 'rendicion-detalle',  panel: 'Nuevo ítem',     pasos: [{ boton: '+ Agregar ítem' }], condicional: true },
  { detalle: 'caja-chica-detalle', panel: 'Nuevo gasto',    pasos: [{ boton: 'Agregar gasto' }],  condicional: true },
  { ruta: '/admin/employees',      panel: 'Nuevo empleado', pasos: [{ boton: 'Agregar empleado' }] },

  /* El rincón más enterrado de la app: las cargas históricas están plegadas en
     DOS niveles. Los grupos arrancan colapsados, así que las filas ni existen;
     hay que abrir el grupo y recién después la fila, y adentro vive un
     `ItemAttachmentZone` que no vio nunca nadie.
     Los dos controles son `setState` a secas y van por `title`, que además se
     agregó al grupo junto con `aria-expanded` — un control que pliega tiene que
     decir si está abierto, y no lo decía. */
  { ruta: '/petty-cash', panel: 'Carga histórica expandida', condicional: true, pasos: [
    { boton: 'Ver movimientos del fondo', selector: 'button[title="Ver movimientos del fondo"]' },
    { boton: 'Ver ítems',                 selector: 'button[title="Ver ítems"]' },
  ] },
]

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

      /* ── REGLA 2: claro sobre claro ──────────────────────────────────
         La regla de abajo busca texto OSCURO sobre el degradado. Su espejo
         es igual de invisible y no lo veía nadie: texto CLARO sobre una
         superficie clara — un `tor-on-gradient-soft` (blanco al 72%) que
         quedó dentro de una hoja blanca, por ejemplo.

         Solo se evalúa contra superficies OPACAS: sobre vidrio traslúcido
         el color efectivo depende de lo que haya detrás y el cálculo daría
         cualquier cosa. Y el umbral es 2.0:1, no el 4.5:1 de AA — acá no se
         juzga si el contraste es cómodo, se detecta lo que directamente no
         se lee. Por debajo de 2 no hay decisión de diseño posible. */
      const superficie = (() => {
        let c: Element | null = el
        while (c && c !== document.body) {
          const est = getComputedStyle(c)
          /* Un degradado corta la medición: el color efectivo depende del punto
             y no hay un único valor contra el cual calcular. Devolver null es
             correcto —no «no hay superficie»—, porque seguir subiendo mediría
             contra una superficie que en realidad está TAPADA por el degradado.
             Sin esto, un botón con `style={{background:'var(--cta-brand)'}}` se
             reporta como blanco sobre blanco. */
          if (est.backgroundImage && est.backgroundImage !== 'none') return null
          const px = pixel(est.backgroundColor)
          if (px && px[3] / 255 >= 0.95) return px
          c = c.parentElement
        }
        return null
      })()

      if (superficie) {
        const lt = luminancia(cs.color)
        const lf = luminancia(`rgb(${superficie[0]},${superficie[1]},${superficie[2]})`)
        if (lt !== null && lf !== null) {
          const razon = (Math.max(lt, lf) + 0.05) / (Math.min(lt, lf) + 0.05)
          if (razon < 2) {
            hallazgos.push({
              texto:  texto.slice(0, 60),
              color:  `${cs.color} sobre rgb(${superficie[0]},${superficie[1]},${superficie[2]})`,
              lum:    Math.round(razon * 100) / 100,
              tag:    el.tagName.toLowerCase(),
              clases: (el.getAttribute('class') ?? '').slice(0, 90),
            })
          }
        }
        continue   // tiene superficie: la regla del degradado no aplica
      }

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

/** Entra por el listado y devuelve el href de un detalle real, o null si no hay datos. */
async function resolverDetalle(
  page: Page,
  det: (typeof RUTAS_DETALLE)[number],
): Promise<string | null> {
  for (const lista of det.listas) {
    await page.goto(lista, { waitUntil: 'domcontentloaded' })
    const enlaces = await page
      .locator(`a[href^="${det.prefijo}"]`)
      .evaluateAll(nodos => nodos.map(n => n.getAttribute('href') ?? ''))
    const destino = enlaces.find(h => h && !det.ignorar.includes(h) && h !== det.prefijo)
    if (destino) return destino
  }
  return null
}

test('ningun dato oscuro apoyado sobre el degradado', async ({ page }, info) => {
  /* 33 pantallas en una sola prueba, cada una con su espera de `networkidle`.
     Los 300 s originales alcanzaban con 24 y quedaron cortos al crecer: sola
     entra en ~2,5 min, pero corriendo detrás de las 51 capturas de la línea
     base tarda el doble y se pasaba justo. El síntoma engaña — se ve como una
     auditoría que falla, no como una que no llegó a terminar. */
  test.setTimeout(900_000)
  const hallazgos: Hallazgo[] = []
  const visitadas: string[] = []
  let nodosVistos = 0
  const noAuditados: string[] = []

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
    const destino = await resolverDetalle(page, det)
    if (!destino) continue
    await page.goto(destino, { waitUntil: 'domcontentloaded' })
    const rd = await auditar(page, destino)
    hallazgos.push(...rd.hallazgos)
    nodosVistos += rd.nodos
    visitadas.push(destino)
  }

  /* Los paneles que arrancan cerrados. Ver la regla de seguridad de PANELES:
     estos clics solo abren o cambian de vista, nunca confirman. */
  for (const p of PANELES) {
    let ruta = p.ruta
    if (p.detalle) {
      const det = RUTAS_DETALLE.find(d => d.slug === p.detalle)
      if (!det) throw new Error(`PANELES apunta a un detalle inexistente: ${p.detalle}`)
      ruta = (await resolverDetalle(page, det)) ?? undefined
      if (!ruta) continue   // sin datos: no es un fallo, es información
    }
    await page.goto(ruta!, { waitUntil: 'domcontentloaded' })
    /* Esperar a que la pantalla se asiente ANTES de buscar el control. Varias
       muestran un spinner hasta que llegan los datos, y buscar el botón contra
       el spinner da «no encontrado» por una razón que no es la real. Las
       pestañas de settings no lo necesitaban porque son estáticas — por eso
       este error tardó en aparecer. */
    await page.waitForLoadState('networkidle', { timeout: 8_000 }).catch(() => {})

    const etiqueta = `${p.ruta ?? '/' + p.detalle} [${p.panel}]`
    /* Los pasos, en orden. Por contenido de texto y no por rol: varios de estos
       botones llevan un `<svg>` inline sin `aria-hidden`, y el nombre accesible
       que computa Chromium no coincide con la etiqueta visible. El texto sí. */
    let abierto = true
    for (const paso of p.pasos) {
      const control = paso.selector
        ? page.locator(paso.selector)
        : page.locator('button', { hasText: paso.boton })

      const visible = await control.first()
        .waitFor({ state: 'visible', timeout: 5_000 })
        .then(() => true)
        .catch(() => false)

      if (!visible) {
        if (p.condicional) {
          /* Los datos de hoy no permiten abrirlo — la rendición que el arnés
             encontró no está en borrador, o no hay cargas históricas. No es un
             fallo, pero tampoco se saltea callado: va al informe. */
          noAuditados.push(`${etiqueta} — el control «${paso.boton}» no está en este estado`)
          abierto = false
          break
        }
        throw new Error(
          `No se encontró el control «${paso.boton}» en ${ruta}. Si la pantalla ` +
          `cambió, actualizá PANELES: un panel que deja de abrirse vuelve a ser ` +
          `punto ciego en silencio, que es justo lo que este archivo evita.`,
        )
      }
      await control.first().click()
    }
    if (!abierto) continue

    const r = await auditar(page, etiqueta)
    hallazgos.push(...r.hallazgos)
    nodosVistos += r.nodos
    visitadas.push(etiqueta)
  }

  /* El informe se escribe SIEMPRE, pase o falle: es la lista de trabajo. */
  fs.writeFileSync(
    path.join(__dirname, 'reporte-materiales.md'),
    informe(hallazgos, visitadas, nodosVistos, noAuditados),
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

function informe(hs: Hallazgo[], visitadas: string[], nodos: number, noAuditados: string[]): string {
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
    ...(noAuditados.length ? [
      '## ⚠ No auditado en esta corrida',
      '',
      'Paneles que los datos de hoy no permitieron abrir. **No son hallazgos, son',
      'huecos**: nadie miró lo que hay adentro. Para cerrarlos hace falta dejar la',
      'app en el estado que los habilita — por ejemplo, una rendición en borrador.',
      '',
      ...noAuditados.map(s => `- ${s}`),
      '',
    ] : []),
    'Cada línea es un texto oscuro que no tiene ninguna superficie debajo: está',
    'apoyado directo sobre el degradado. La corrección es envolverlo en `.hoja`',
    '(si se lee o se llena) o en `.tor-glass` (si se mira), o aclarar el texto',
    'cuando de verdad es un título de pantalla.',
    '',
  ]

  for (const [ruta, lista] of [...porRuta].sort((a, b) => b[1].length - a[1].length)) {
    lineas.push(`## ${ruta} — ${lista.length}`, '')
    lineas.push('| Texto | Etiqueta | Medida | Color / sobre qué | Clases |',
                '|---|---|---:|---|---|')
    for (const h of lista) {
      const txt = h.texto.replace(/\|/g, '\\|')
      lineas.push(`| ${txt} | \`${h.tag}\` | ${h.lum} | \`${h.color}\` | \`${h.clases}\` |`)
    }
    lineas.push('')
  }

  return lineas.join('\n')
}
