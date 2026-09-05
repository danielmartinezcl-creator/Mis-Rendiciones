/**
 * Deuda de sistema por pantalla — `npm run audit:deuda`
 *
 * No mide «se ve feo». Mide algo verificable: cuántas veces cada pantalla
 * ESCRIBE EL PATRÓN A MANO habiendo un material para eso. Cada aparición es un
 * lugar que no va a heredar un cambio del design system, y por eso es el orden
 * en que conviene migrar: primero las que más lejos están.
 *
 * ── LO QUE ESTE SCRIPT TIENE QUE SABER PARA NO MENTIR ──────────────────────
 *
 * Un instrumento que no conoce las decisiones del proyecto convierte cada una
 * en deuda. La primera versión contaba las clases `card-*` como «escala vieja»
 * y reportaba 265 unidades donde hay 109: los 156 usos de `card-eyebrow`,
 * `card-label`, `card-meta` y `section-title` NO son deuda, son la escala
 * vigente de la hoja (decisión del 2026-08-16, ratificada el 2026-09-03).
 *
 * La regla del sistema es que el MATERIAL decide el tamaño: el vidrio va con
 * el piso de 11 px porque se mira, la hoja va con las clases `card-*` porque
 * se lee. Ver la fe de erratas de docs/Rediseño/tornasol-spec.md.
 *
 * Si agregás un material nuevo a globals.css, agregalo también acá — si no,
 * usarlo va a contar como no usar nada.
 */
import fs from 'fs'
import path from 'path'

const RAIZ = 'src/app/(app)'

/**
 * DEUDA — el patrón escrito a mano, habiendo un material para eso.
 *
 * OJO CON LAS ETIQUETAS. La primera versión llamaba «campo a mano» a todo lo
 * que tuviera `border-ink-200` + `rounded-item`, y de las 29 apariciones **23
 * eran botones secundarios**, no campos. Seguir esa etiqueta habría convertido
 * 23 botones en campos de formulario. Lo que distingue al botón es que reacciona
 * al mouse; el campo reacciona al foco.
 *
 * La lección: cuando una categoría da un número alto, mirar los casos antes de
 * actuar. Un nombre equivocado en el instrumento se convierte en un codemod
 * equivocado.
 */
const DEUDA = [
  ['hoja a mano',   /bg-white[^"']*rounded-card|rounded-card[^"']*bg-white/g],
  // Botón: tiene hover de fondo o de texto. Es la firma que lo separa del campo.
  ['boton 2° a mano', /border-ink-200[^"']*rounded-item[^"']*hover:(bg-ink-50|bg-white|text-ink)|hover:(bg-ink-50|bg-white|text-ink)[^"']*border-ink-200/g],
  /* Campo: reacciona al FOCO. Es coincidencia POSITIVA y no negativa a
     propósito. La primera versión marcaba todo lo que tuviera `border-ink-200`
     + `rounded-item`, y de las 11 que quedaban NINGUNA era un campo: menús
     flotantes, cajas con scroll, dos selectores de color, una miniatura, dos
     chips y un botón. Ir agregando exclusiones para cada uno habría repetido la
     fragilidad del selector de legibilidad, que se acopló a los nombres de las
     superficies y se rompió cuando apareció una nueva.
     Un campo se reconoce por lo que HACE: tiene tratamiento de foco. */
  ['campo a mano',  /(border-ink-200[^"'`]*focus:(ring|border)|focus:(ring|border)[^"'`]*border-ink-200)/g],
  ['boton 1° a mano', /bg-brand-600[^"']*(rounded-item|font-bold)/g],
  ['radio literal', /rounded-\[\d+px\]/g],
  ['hex suelto',    /#[0-9a-fA-F]{6}\b/g],
]

/** CRÉDITO — uso del sistema. Las clases de escala cuentan acá, no en deuda. */
const CREDITO = [
  ['hoja',     /\bhoja\b/g],
  ['campo',    /\bcampo(-compacto)?\b/g],
  ['btn-1°',   /\bbtn-primario\b/g],
  ['btn-2°',   /\bbtn-secundario\b/g],
  ['vidrio',   /\btor-glass\b/g],
  ['on-grad',  /\btor-on-gradient/g],
  ['insignia', /InsigniaEstado/g],
  ['escala',   /\b(card-eyebrow|card-label|card-meta|section-title)\b/g],
  ['esqueleto',/\besqueleto\b/g],
]

/**
 * Autocomprobación — corre siempre, antes de medir nada.
 *
 * Este script informó 265 unidades de deuda donde había 109 (contaba las clases
 * `card-*`, que son una decisión y no deuda) y llamó «campo a mano» a 23 botones
 * secundarios. Las dos veces el número salió con cara de verdad.
 *
 * Un detector solo probado en una dirección no vale nada: hay que confirmar que
 * DETECTA lo que busca y que IGNORA lo que se le parece. Si esto falla, el
 * script se planta en vez de informar un cero tranquilizador.
 */
function autocomprobar() {
  const campo = DEUDA.find(([n]) => n === 'campo a mano')[1]
  const boton = DEUDA.find(([n]) => n === 'boton 2° a mano')[1]
  const casos = [
    [campo, 'border border-ink-200 rounded-item px-3 py-2 focus:ring-2 focus:ring-brand-500', true],
    [campo, 'focus:border-brand-600 border border-ink-200 rounded-item',                      true],
    [campo, 'absolute mt-1 bg-white border border-ink-200 rounded-item shadow-lg',            false],
    [campo, 'w-11 h-8 rounded-item border border-ink-200 cursor-pointer p-0.5',               false],
    [boton, 'px-4 py-2 border border-ink-200 rounded-item text-ink-600 hover:bg-ink-50',      true],
    [boton, 'max-h-28 overflow-y-auto border border-ink-200 rounded-item p-2',                false],
  ]
  const fallas = casos.filter(([re, texto, esperado]) => {
    re.lastIndex = 0
    return re.test(texto) !== esperado
  })
  if (fallas.length) {
    console.error('\n⛔ El detector está roto: falla en', fallas.length, 'de', casos.length, 'casos.')
    for (const [, texto, esperado] of fallas) {
      console.error(`   debía ${esperado ? 'DETECTAR' : 'IGNORAR'}: ${texto}`)
    }
    console.error('\nUn conteo salido de un detector roto es peor que ninguno.\n')
    process.exit(1)
  }
}

autocomprobar()

function contar(txt, defs) {
  const out = {}
  let total = 0
  for (const [nombre, re] of defs) {
    const n = (txt.match(re) ?? []).length
    if (n) out[nombre] = n
    total += n
  }
  return { out, total }
}

/** Archivos propios de una ruta, sin bajar a las subrutas. */
function archivosDe(dir) {
  return fs.readdirSync(dir, { withFileTypes: true })
    .filter(e => e.isFile() && e.name.endsWith('.tsx') && e.name !== 'loading.tsx')
    .map(e => path.join(dir, e.name))
}

function rutas(dir, base = '') {
  const res = []
  const propios = archivosDe(dir)
  if (propios.length) res.push({ ruta: base || '/', archivos: propios })
  for (const h of fs.readdirSync(dir, { withFileTypes: true })) {
    if (h.isDirectory()) res.push(...rutas(path.join(dir, h.name), `${base}/${h.name}`))
  }
  return res
}

const filas = rutas(RAIZ)
  .map(({ ruta, archivos }) => {
    const txt = archivos.map(a => fs.readFileSync(a, 'utf8')).join('\n')
    const d = contar(txt, DEUDA)
    const c = contar(txt, CREDITO)
    return { ruta, deuda: d.total, credito: c.total, detalle: d.out }
  })
  .sort((a, b) => b.deuda - a.deuda || a.ruta.localeCompare(b.ruta))

const w = Math.max(...filas.map(f => f.ruta.length), 6)
console.log('\nDeuda de sistema — cuántas veces se escribe el patrón a mano\n')
console.log('ruta'.padEnd(w), 'deuda'.padStart(6), 'credito'.padStart(8), '  qué la compone')
console.log('─'.repeat(w + 18 + 40))
for (const f of filas) {
  const det = Object.entries(f.detalle).map(([k, v]) => `${k}:${v}`).join(' ')
  console.log(
    f.ruta.padEnd(w),
    String(f.deuda).padStart(6),
    String(f.credito).padStart(8),
    '  ' + det,
  )
}
console.log('─'.repeat(w + 18 + 40))
console.log('TOTAL deuda:', filas.reduce((s, f) => s + f.deuda, 0),
            '· crédito:', filas.reduce((s, f) => s + f.credito, 0),
            `· ${filas.filter(f => f.deuda === 0).length} de ${filas.length} pantallas en cero\n`)
