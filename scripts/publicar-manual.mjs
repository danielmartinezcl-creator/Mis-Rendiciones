/**
 * Publica la guía de uso dentro de la app: docs/manual/ → public/manual/.
 *
 *   - las capturas PNG de docs/manual/img pasan a WebP y al ancho al que se
 *     ven (un celular se dibuja a 290 px: no hace falta mandarlo a 780);
 *   - manual.html se envuelve con su <head> y queda como public/manual/index.html,
 *     que next.config.ts sirve en /manual;
 *   - el PDF sale de esa misma página, con las mismas imágenes livianas.
 *
 * Correr después de e2e/manual/capturar.mjs, o cuando cambie el texto:
 *
 *   node scripts/publicar-manual.mjs
 */
import { chromium } from '@playwright/test'
import sharp from 'sharp'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const raiz    = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const origen  = path.join(raiz, 'docs', 'manual')
const destino = path.join(raiz, 'public', 'manual')
const PDF     = 'Manual-Mi-Rendicion.pdf'

fs.rmSync(destino, { recursive: true, force: true })
fs.mkdirSync(path.join(destino, 'img'), { recursive: true })

/* 1. Imágenes. Las de celular salen a 2x (780 px) y se ven a 290: a 600 siguen
   nítidas en una pantalla retina. Las de computador se ven casi a su ancho. */
for (const archivo of fs.readdirSync(path.join(origen, 'img')).filter(f => f.endsWith('.png'))) {
  const ancho = archivo.includes('-movil') ? 600 : 1440
  await sharp(path.join(origen, 'img', archivo))
    .resize({ width: ancho, withoutEnlargement: true })
    .webp({ quality: 80 })
    .toFile(path.join(destino, 'img', archivo.replace(/\.png$/, '.webp')))
}

/* 2. La página. El archivo fuente no trae <html>/<head>/<meta charset>: sin
   ellos el navegador adivina la codificación y rompe los acentos. */
const cuerpo = fs.readFileSync(path.join(origen, 'manual.html'), 'utf8')
  .replace(/src="img\/([^"]+)\.png"/g, 'src="img/$1.webp"')

const envolver = (html, base) => `<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
${base ? `<base href="${base}">` : ''}
<link rel="icon" href="/favicon.ico">
</head>
<body>
${html}
</body>
</html>
`

/* Con <base href="/manual/"> las rutas relativas (img/…, el PDF) resuelven
   aunque la página se abra como /manual, sin la barra final. Los anclajes del
   índice se reescriben con la ruta entera: con <base>, un «#rendiciones» suelto
   navegaría a /manual/ y recargaría la página. */
const web = cuerpo.replace(/href="#([^"]+)"/g, 'href="/manual#$1"')
fs.writeFileSync(path.join(destino, 'index.html'), envolver(web, '/manual/'))

/* 3. El PDF, desde un archivo junto a las imágenes (desde about:blank Chromium
   no deja cargar archivos locales). Las reglas @media print / @page del manual
   deciden la paginación. */
const temporal = path.join(destino, '.para-pdf.html')
fs.writeFileSync(temporal, envolver(cuerpo, null))
const navegador = await chromium.launch()
const p = await navegador.newPage()
await p.goto(pathToFileURL(temporal).href, { waitUntil: 'networkidle' })
await p.evaluate(() => document.fonts.ready)
await p.pdf({ path: path.join(destino, PDF), printBackground: true, preferCSSPageSize: true })
await navegador.close()
fs.rmSync(temporal, { force: true })

const peso = (f) => (fs.statSync(f).size / 1024 / 1024).toFixed(1) + ' MB'
const imgs = fs.readdirSync(path.join(destino, 'img'))
const total = imgs.reduce((s, f) => s + fs.statSync(path.join(destino, 'img', f)).size, 0)
console.log(`✓ public/manual/index.html`)
console.log(`✓ ${imgs.length} imágenes, ${(total / 1024 / 1024).toFixed(1)} MB`)
console.log(`✓ ${PDF}, ${peso(path.join(destino, PDF))}`)
