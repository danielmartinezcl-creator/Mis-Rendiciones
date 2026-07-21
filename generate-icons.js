/**
 * Generador de íconos PWA — Penta Rend
 * Opción 5: gradiente índigo (#3E4092) → teal (#4BBDB6) + receipt blanca
 *
 * Uso: node generate-icons.js
 * Salida: public/icons/icon-192.png  y  public/icons/icon-512.png
 *
 * Sin dependencias externas — solo módulos built-in de Node.js
 */

const zlib = require('zlib')
const fs   = require('fs')
const path = require('path')

// ── CRC32 (requerido por el formato PNG) ──────────────────────────────────────
const CRC_TABLE = (() => {
  const t = new Uint32Array(256)
  for (let n = 0; n < 256; n++) {
    let c = n
    for (let k = 0; k < 8; k++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1)
    t[n] = c
  }
  return t
})()

function crc32(buf) {
  let c = 0xFFFFFFFF
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xFF] ^ (c >>> 8)
  return (c ^ 0xFFFFFFFF) >>> 0
}

function pngChunk(type, data) {
  const tb = Buffer.from(type, 'ascii')
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length, 0)
  const crcBuf = Buffer.alloc(4); crcBuf.writeUInt32BE(crc32(Buffer.concat([tb, data])), 0)
  return Buffer.concat([len, tb, data, crcBuf])
}

// ── Hit-test en rectángulo redondeado ─────────────────────────────────────────
function inRRect(px, py, x, y, w, h, r) {
  if (px < x || px > x + w || py < y || py > y + h) return false
  function cornerOk(cx, cy) {
    const dx = px - cx, dy = py - cy
    return dx * dx + dy * dy <= r * r
  }
  if (px < x + r && py < y + r) return cornerOk(x + r, y + r)
  if (px > x + w - r && py < y + r) return cornerOk(x + w - r, y + r)
  if (px < x + r && py > y + h - r) return cornerOk(x + r, y + h - r)
  if (px > x + w - r && py > y + h - r) return cornerOk(x + w - r, y + h - r)
  return true
}

// ── Dibujo del ícono ─────────────────────────────────────────────────────────
// Diseño basado en viewBox 148×148 (igual que el SVG del artifact)
//
//  Gradiente: (62,64,146) → (75,189,182)  [#3E4092 → #4BBDB6]
//  Receipt:   x=34 y=20 w=80 h=106 rx=11  fill=white(0.96)
//  Líneas:    color #5254A0 = (82,84,160)

function generatePixels(S) {
  const sc = S / 148

  const RECEIPT = [34 * sc, 20 * sc, 80 * sc, 106 * sc, 11 * sc]

  // [x, y, w, h, rx, alpha]  ← coordenadas globales en viewBox 148×148
  const LINES = [
    [49, 47, 50, 6.5, 3.25, 1.00],
    [49, 63, 37, 6.5, 3.25, 0.75],
    [49, 79, 43, 6.5, 3.25, 0.90],
    [49, 98, 50, 1.5, 0.75, 0.25],
    [61,106, 26, 6.5, 3.25, 0.55],
  ].map(([lx, ly, lw, lh, lr, la]) => [lx*sc, ly*sc, lw*sc, lh*sc, lr*sc, la])

  const rows = []

  for (let y = 0; y < S; y++) {
    // filter byte 0 (None) + RGB per pixel
    const row = Buffer.alloc(1 + S * 3)
    row[0] = 0

    for (let x = 0; x < S; x++) {
      // Gradiente diagonal izquierda-arriba → derecha-abajo
      const t = Math.max(0, Math.min(1, (x + y) / (2 * S)))
      let r = Math.round(62  + (75  - 62)  * t)
      let g = Math.round(64  + (189 - 64)  * t)
      let b = Math.round(146 + (182 - 146) * t)

      const [rx, ry, rw, rh, rrad] = RECEIPT

      if (inRRect(x, y, rx, ry, rw, rh, rrad)) {
        // Dentro del receipt → base blanca (con leve transparencia)
        r = 245; g = 245; b = 245

        for (const [lx, ly, lw, lh, lr, la] of LINES) {
          if (inRRect(x, y, lx, ly, lw, lh, lr)) {
            // Alpha-blend línea índigo (#5254A0) sobre blanco
            r = Math.round(82  * la + 245 * (1 - la))
            g = Math.round(84  * la + 245 * (1 - la))
            b = Math.round(160 * la + 245 * (1 - la))
            break
          }
        }
      }

      const i = 1 + x * 3
      row[i] = r; row[i + 1] = g; row[i + 2] = b
    }

    rows.push(row)
  }

  return Buffer.concat(rows)
}

// ── Encoder PNG mínimo ────────────────────────────────────────────────────────
function buildPNG(S) {
  const SIG  = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])

  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(S, 0)   // width
  ihdr.writeUInt32BE(S, 4)   // height
  ihdr[8]  = 8               // bit depth
  ihdr[9]  = 2               // color type: RGB
  ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0

  const pixels     = generatePixels(S)
  const compressed = zlib.deflateSync(pixels, { level: 6 })

  return Buffer.concat([
    SIG,
    pngChunk('IHDR', ihdr),
    pngChunk('IDAT', compressed),
    pngChunk('IEND', Buffer.alloc(0)),
  ])
}

// ── Main ──────────────────────────────────────────────────────────────────────
const OUT_DIR = path.join(__dirname, 'public', 'icons')
if (!fs.existsSync(OUT_DIR)) fs.mkdirSync(OUT_DIR, { recursive: true })

for (const S of [192, 512]) {
  process.stdout.write(`Generando icon-${S}.png ...`)
  const png  = buildPNG(S)
  const file = path.join(OUT_DIR, `icon-${S}.png`)
  fs.writeFileSync(file, png)
  console.log(` ✅  (${(png.length / 1024).toFixed(1)} KB)`)
}

console.log('\n  Íconos listos en public/icons/')
console.log('  Próximo paso: git add public/icons/ && git commit\n')
