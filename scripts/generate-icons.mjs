/**
 * Generador de íconos — Mi Rendición
 *
 * Dibuja el `ReceiptText` de Lucide en trazo blanco sobre el degradado de marca
 * (`--cta-brand`). Es el mismo ícono y el mismo degradado que `<Marca>` usa en
 * el riel, en la barra del teléfono y en la pantalla de acceso: el ícono del
 * escritorio es, literalmente, el de adentro de la app.
 *
 * Reemplaza al ícono de «Penta Rend» (degradado índigo #3E4092 → #4BBDB6 con un
 * documento blanco), que no usaba ningún color de Tornasol y cuyo dibujo se
 * salía de la zona segura del recorte.
 *
 * Uso:    node scripts/generate-icons.mjs
 * Salida: public/icons/icon-192.png · public/icons/icon-512.png · src/app/favicon.ico
 *
 * ── Sin dependencias, ni siquiera para las curvas ──────────────────────────
 *
 * Rasterizar un trazo suele ser la parte cara de un dibujante: hay que construir
 * el contorno de la línea —desplazar la curva a cada lado y resolver las uniones—
 * y recién ahí rellenarlo. Pero este trazo tiene puntas y uniones REDONDAS, y en
 * ese caso vale una definición exacta y de un renglón:
 *
 *     el trazo es el conjunto de puntos que están a distancia ≤ grosor/2 de la curva
 *
 * Así que no se construye ningún contorno: se mide distancia. Aplanamos el path a
 * una polilínea densa, y para cada píxel tomamos la distancia al segmento más
 * cercano. Como esa distancia es un número continuo y no un sí/no, el suavizado
 * de bordes sale de arriba: la cobertura del píxel es `radio + 0.5 - distancia`
 * recortada a [0,1]. El generador anterior resolvía «¿está dentro?» con un
 * booleano y por eso tenía los bordes dentados.
 */

import zlib from 'node:zlib'
import fs   from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

/* ── El diseño ───────────────────────────────────────────────────────────── */

/** `--cta-brand` de globals.css: linear-gradient(130deg, #03191C 0%, #0D7F81 100%) */
const GRADIENTE = { desde: [0x03, 0x19, 0x1c], hasta: [0x0d, 0x7f, 0x81], grados: 130 }

/** El trazo, en blanco puro. */
const TINTA = [0xff, 0xff, 0xff]

/**
 * `ReceiptText` de lucide-react 1.17, copiado literal de
 * node_modules/lucide-react/dist/esm/icons/receipt-text.mjs — primero el
 * contorno del recibo, después las tres líneas de texto.
 *
 * Si algún día se actualiza Lucide y el dibujo cambia, acá se ve el diff.
 */
const RECEIPT_TEXT = [
  'M4 3a1 1 0 0 1 1-1 1.3 1.3 0 0 1 .7.2l.933.6a1.3 1.3 0 0 0 1.4 0l.934-.6a1.3 1.3 0 0 1 1.4 0l.933.6a1.3 1.3 0 0 0 1.4 0l.933-.6a1.3 1.3 0 0 1 1.4 0l.934.6a1.3 1.3 0 0 0 1.4 0l.933-.6A1.3 1.3 0 0 1 19 2a1 1 0 0 1 1 1v18a1 1 0 0 1-1 1 1.3 1.3 0 0 1-.7-.2l-.933-.6a1.3 1.3 0 0 0-1.4 0l-.934.6a1.3 1.3 0 0 1-1.4 0l-.933-.6a1.3 1.3 0 0 0-1.4 0l-.933.6a1.3 1.3 0 0 1-1.4 0l-.934-.6a1.3 1.3 0 0 0-1.4 0l-.933.6a1.3 1.3 0 0 1-.7.2 1 1 0 0 1-1-1z',
  'M14 8H8',
  'M16 12H8',
  'M13 16H8',
]

/** El recuadro que el dibujo ocupa dentro del viewBox 24×24 de Lucide. */
const CAJA = { x0: 4, y0: 2, x1: 20, y1: 22 }

/**
 * Alto del dibujo en un lienzo de 512, SIN contar el grosor del trazo. Son dos
 * encuadres porque son dos problemas distintos.
 *
 * El del manifest declara `purpose: "any maskable"`: Android lo recorta a la
 * forma de su launcher y solo garantiza el círculo central del 80 % —radio
 * 204,8 en 512—. Con 280 el dibujo mide 224×280 y, sumándole el trazo, su
 * esquina más lejana queda a 196 del centro: entra con holgura. El ícono
 * anterior llegaba al 85 % del alto, así que en un launcher circular se le
 * cortaba el documento arriba y abajo.
 *
 * Al favicon no lo recorta nadie, así que reservarle ese margen sería tirar
 * píxeles: en una pestaña de 16 todos cuentan, y el dibujo se estira.
 */
const ALTO_APP     = 280
const ALTO_FAVICON = 370

/**
 * Tamaño a partir del cual el recibo lleva sus tres líneas.
 *
 * Medido ampliando el .ico ya generado: a 32 px se distinguen, a 16 px se funden
 * entre sí y contra el borde, y el recibo termina leyéndose como un rectángulo
 * relleno. Por debajo del umbral queda solo la silueta, que a ese tamaño es lo
 * único que sobrevive. Es la misma razón por la que un tipógrafo no usa la misma
 * letra para un titular que para una nota al pie.
 */
const CON_LINEAS_DESDE = 24

/** `stroke-width` en unidades del viewBox de 24, como lo expone Lucide. */
const GROSOR = 1.75

/**
 * Piso del radio del trazo, en píxeles.
 *
 * A 16 px el trazo nominal mide 0,77 px y se apagaría casi entero contra el
 * fondo. El piso lo deja en 1,7 px: desproporcionado para el diseño, pero a ese
 * tamaño la alternativa no es un ícono más fiel, es un ícono en blanco.
 */
const RADIO_MINIMO = 0.85

/* ── Encuadre ────────────────────────────────────────────────────────────── */

function encuadre(S, alto) {
  const k = (alto / (CAJA.y1 - CAJA.y0)) * (S / 512)
  return {
    k,
    dx: S / 2 - ((CAJA.x0 + CAJA.x1) / 2) * k,
    dy: S / 2 - ((CAJA.y0 + CAJA.y1) / 2) * k,
    radio: Math.max((GROSOR * k) / 2, RADIO_MINIMO),
  }
}

/* ── Un arco elíptico de SVG, en puntos ──────────────────────────────────── */
// Conversión de extremos a centro, tal como la define la especificación de SVG
// (apéndice F.6.5). Acá los arcos siempre son circulares y sin rotación, pero el
// caso general no cuesta más y evita una sorpresa si el ícono de Lucide cambia.

function arcoAPuntos(x1, y1, rx, ry, phi, fGrande, fBarrido, x2, y2, pasos) {
  if (x1 === x2 && y1 === y2) return []
  rx = Math.abs(rx); ry = Math.abs(ry)
  if (rx === 0 || ry === 0) return [[x2, y2]]

  const cos = Math.cos(phi), sin = Math.sin(phi)
  const mx = (x1 - x2) / 2, my = (y1 - y2) / 2
  const x1p =  cos * mx + sin * my
  const y1p = -sin * mx + cos * my

  // Radios que no alcanzan a unir los extremos: se agrandan (F.6.6)
  const lambda = (x1p * x1p) / (rx * rx) + (y1p * y1p) / (ry * ry)
  if (lambda > 1) { const s = Math.sqrt(lambda); rx *= s; ry *= s }

  const arriba = rx * rx * ry * ry - rx * rx * y1p * y1p - ry * ry * x1p * x1p
  const abajo  = rx * rx * y1p * y1p + ry * ry * x1p * x1p
  let co = Math.sqrt(Math.max(0, arriba / abajo))
  if (fGrande === fBarrido) co = -co

  const cxp =  co * rx * y1p / ry
  const cyp = -co * ry * x1p / rx
  const cx = cos * cxp - sin * cyp + (x1 + x2) / 2
  const cy = sin * cxp + cos * cyp + (y1 + y2) / 2

  const angulo = (ux, uy, vx, vy) => {
    const n = Math.sqrt((ux * ux + uy * uy) * (vx * vx + vy * vy))
    const c = Math.min(1, Math.max(-1, (ux * vx + uy * vy) / n))
    return (ux * vy - uy * vx < 0) ? -Math.acos(c) : Math.acos(c)
  }

  const ax = (x1p - cxp) / rx, ay = (y1p - cyp) / ry
  const bx = (-x1p - cxp) / rx, by = (-y1p - cyp) / ry
  const t1 = angulo(1, 0, ax, ay)
  let dt   = angulo(ax, ay, bx, by)
  if (!fBarrido && dt > 0) dt -= 2 * Math.PI
  if (fBarrido && dt < 0) dt += 2 * Math.PI

  const pts = []
  for (let i = 1; i <= pasos; i++) {
    const t = t1 + dt * (i / pasos)
    const ex = rx * Math.cos(t), ey = ry * Math.sin(t)
    pts.push([cos * ex - sin * ey + cx, sin * ex + cos * ey + cy])
  }
  return pts
}

/* ── Un path de SVG, en polilíneas ───────────────────────────────────────── */
// Solo los comandos que este ícono usa: M m L l H h V v A a Z z. No hay curvas
// de Bézier en ReceiptText; si alguna vez las hubiera, este parser las ignoraría
// en silencio, así que avisa.

const TOKENS = /[MmLlHhVvAaZzCcSsQqTt]|-?(?:\d*\.\d+|\d+\.?)(?:[eE][-+]?\d+)?/g

function aPolilineas(d, pasos = 16) {
  const tk = d.match(TOKENS) ?? []
  const salida = []
  let actual = [], cmd = '', x = 0, y = 0, ix = 0, iy = 0, i = 0

  const num    = () => parseFloat(tk[i++])
  const cerrar = () => { if (actual.length > 1) salida.push(actual); actual = [] }
  const ir     = (nx, ny) => { x = nx; y = ny; actual.push([x, y]) }

  while (i < tk.length) {
    if (/[A-Za-z]/.test(tk[i])) cmd = tk[i++]
    const rel = cmd === cmd.toLowerCase()

    switch (cmd.toUpperCase()) {
      case 'M': {
        cerrar()
        const nx = num(), ny = num()
        x = rel ? x + nx : nx
        y = rel ? y + ny : ny
        ix = x; iy = y
        actual.push([x, y])
        cmd = rel ? 'l' : 'L'          // un M con más pares sigue como L
        break
      }
      case 'L': { const nx = num(), ny = num(); ir(rel ? x + nx : nx, rel ? y + ny : ny); break }
      case 'H': { const nx = num();             ir(rel ? x + nx : nx, y);                 break }
      case 'V': { const ny = num();             ir(x, rel ? y + ny : ny);                 break }
      case 'A': {
        const rx = num(), ry = num(), rot = num(), fg = num(), fb = num()
        const nx = num(), ny = num()
        const dx = rel ? x + nx : nx, dy = rel ? y + ny : ny
        for (const p of arcoAPuntos(x, y, rx, ry, (rot * Math.PI) / 180, fg, fb, dx, dy, pasos)) {
          actual.push(p)
        }
        x = dx; y = dy
        break
      }
      case 'Z': {
        if (actual.length > 1) actual.push([ix, iy])   // el cierre es un segmento más
        cerrar()
        x = ix; y = iy
        break
      }
      default:
        throw new Error(`El path usa el comando «${cmd}», que este dibujante no sabe trazar.`)
    }
  }

  cerrar()
  return salida
}

/* ── Rasterizado ─────────────────────────────────────────────────────────── */

/** Distancia de un punto al segmento AB. */
function distanciaASegmento(px, py, ax, ay, bx, by) {
  const vx = bx - ax, vy = by - ay
  const largo = vx * vx + vy * vy
  let t = largo === 0 ? 0 : ((px - ax) * vx + (py - ay) * vy) / largo
  t = t < 0 ? 0 : t > 1 ? 1 : t
  const dx = px - (ax + t * vx), dy = py - (ay + t * vy)
  return Math.sqrt(dx * dx + dy * dy)
}

function pintar(S, alto) {
  const { k, dx, dy, radio } = encuadre(S, alto)

  // El dibujo, ya en coordenadas del lienzo, como una lista de segmentos. La
  // primera entrada de RECEIPT_TEXT es el contorno; las otras tres, las líneas.
  const trazos = S >= CON_LINEAS_DESDE ? RECEIPT_TEXT : RECEIPT_TEXT.slice(0, 1)
  const segmentos = []
  for (const d of trazos) {
    for (const linea of aPolilineas(d)) {
      const p = linea.map(([px, py]) => [px * k + dx, py * k + dy])
      for (let i = 1; i < p.length; i++) segmentos.push([p[i - 1][0], p[i - 1][1], p[i][0], p[i][1]])
    }
  }

  // Distancia al trazo más cercano. Cada segmento solo visita su propio
  // vecindario, así que el costo sigue al largo del dibujo y no al área.
  const dist = new Float32Array(S * S).fill(Infinity)
  const borde = radio + 1
  for (const [ax, ay, bx, by] of segmentos) {
    const xa = Math.max(0, Math.floor(Math.min(ax, bx) - borde))
    const xb = Math.min(S - 1, Math.ceil(Math.max(ax, bx) + borde))
    const ya = Math.max(0, Math.floor(Math.min(ay, by) - borde))
    const yb = Math.min(S - 1, Math.ceil(Math.max(ay, by) + borde))
    for (let y = ya; y <= yb; y++) {
      for (let x = xa; x <= xb; x++) {
        const d = distanciaASegmento(x + 0.5, y + 0.5, ax, ay, bx, by)
        const i = y * S + x
        if (d < dist[i]) dist[i] = d
      }
    }
  }

  // El degradado, con la misma geometría que CSS: el eje apunta a `grados`
  // medidos desde arriba y en el sentido del reloj, y su largo es la proyección
  // del lienzo sobre ese eje.
  const rad = (GRADIENTE.grados * Math.PI) / 180
  const ux = Math.sin(rad), uy = -Math.cos(rad)
  const largo = Math.abs(S * ux) + Math.abs(S * uy)

  const filas = []
  for (let y = 0; y < S; y++) {
    const fila = Buffer.alloc(1 + S * 4)   // el 0 inicial es el filtro PNG «ninguno»
    for (let x = 0; x < S; x++) {
      const t = 0.5 + ((x + 0.5 - S / 2) * ux + (y + 0.5 - S / 2) * uy) / largo
      const u = t < 0 ? 0 : t > 1 ? 1 : t

      // Cobertura del píxel: el borde del trazo cae dentro de un píxel, así que
      // la distancia se convierte en una rampa de un píxel de ancho.
      let a = radio + 0.5 - dist[y * S + x]
      a = a < 0 ? 0 : a > 1 ? 1 : a

      const i = 1 + x * 4
      for (let c = 0; c < 3; c++) {
        const fondo = GRADIENTE.desde[c] + (GRADIENTE.hasta[c] - GRADIENTE.desde[c]) * u
        fila[i + c] = Math.round(fondo + (TINTA[c] - fondo) * a)
      }
      fila[i + 3] = 0xff            // opaco de borde a borde; el porqué del canal, en png()
    }
    filas.push(fila)
  }

  return Buffer.concat(filas)
}

/* ── PNG ─────────────────────────────────────────────────────────────────── */

const CRC_TABLE = (() => {
  const t = new Uint32Array(256)
  for (let n = 0; n < 256; n++) {
    let c = n
    for (let k = 0; k < 8; k++) c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1)
    t[n] = c
  }
  return t
})()

function crc32(buf) {
  let c = 0xffffffff
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}

function trozo(tipo, datos) {
  const t = Buffer.from(tipo, 'ascii')
  const largo = Buffer.alloc(4); largo.writeUInt32BE(datos.length, 0)
  const crc   = Buffer.alloc(4); crc.writeUInt32BE(crc32(Buffer.concat([t, datos])), 0)
  return Buffer.concat([largo, t, datos, crc])
}

/**
 * El ícono es opaco de borde a borde, así que RGB bastaría. Va en RGBA igual, y
 * no por el PNG sino por el .ico: un ICO que lleva PNG adentro exige que ese PNG
 * sea de 32 bits con alfa, y quien lo hace cumplir es el build —`next build`
 * procesa `src/app/favicon.ico` y corta con «The PNG is not in RGBA format!»—.
 * El canal de más es constante, así que deflate se lo lleva casi entero.
 */
function png(S, alto) {
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(S, 0)
  ihdr.writeUInt32BE(S, 4)
  ihdr[8] = 8    // bits por canal
  ihdr[9] = 6    // color: RGBA

  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    trozo('IHDR', ihdr),
    trozo('IDAT', zlib.deflateSync(pintar(S, alto), { level: 9 })),
    trozo('IEND', Buffer.alloc(0)),
  ])
}

/* ── ICO ─────────────────────────────────────────────────────────────────── */
// Un .ico es un índice y varias imágenes pegadas atrás. Van como PNG, que todo
// navegador vigente entiende y pesa bastante menos que el BMP del favicon viejo.

function ico(imagenes) {
  const dir = Buffer.alloc(6 + imagenes.length * 16)
  dir.writeUInt16LE(1, 2)                      // 1 = ícono
  dir.writeUInt16LE(imagenes.length, 4)

  let salto = dir.length
  imagenes.forEach(({ lado, datos }, n) => {
    const o = 6 + n * 16
    dir[o] = dir[o + 1] = lado >= 256 ? 0 : lado   // 256 se escribe como 0
    dir.writeUInt16LE(1, o + 4)                 // planos
    dir.writeUInt16LE(32, o + 6)                // bits por píxel
    dir.writeUInt32LE(datos.length, o + 8)
    dir.writeUInt32LE(salto, o + 12)
    salto += datos.length
  })

  return Buffer.concat([dir, ...imagenes.map(i => i.datos)])
}

/* ── Main ────────────────────────────────────────────────────────────────── */
// El script vive en scripts/, así que la raíz del proyecto es un nivel arriba:
// sin el '..' los PNG caerían en scripts/public/icons/. Y fileURLToPath en vez
// de new URL(import.meta.url).pathname, que en Windows devuelve «/C:/…».

const RAIZ = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')
const ICONOS = path.join(RAIZ, 'public', 'icons')
fs.mkdirSync(ICONOS, { recursive: true })

for (const S of [192, 512]) {
  process.stdout.write(`  icon-${S}.png `)
  const datos = png(S, ALTO_APP)
  fs.writeFileSync(path.join(ICONOS, `icon-${S}.png`), datos)
  console.log(`· ${(datos.length / 1024).toFixed(1)} KB`)
}

process.stdout.write('  favicon.ico   ')
const favicon = ico([16, 32, 48, 256].map(lado => ({ lado, datos: png(lado, ALTO_FAVICON) })))
fs.writeFileSync(path.join(RAIZ, 'src', 'app', 'favicon.ico'), favicon)
console.log(`· ${(favicon.length / 1024).toFixed(1)} KB (16, 32, 48 y 256)`)

console.log('\n  Listo.\n')
