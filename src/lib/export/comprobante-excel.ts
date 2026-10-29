import ExcelJS from 'exceljs'
import { fechaChile, type Comprobante, type Indicador } from '@/lib/comprobante-cierre'
import { BRAND, NEUTRAL, SEMANTIC } from '@/lib/design-tokens'

/**
 * El comprobante en Excel, para TRABAJAR los números y verse bien al abrirlo.
 *
 * La primera versión salió de SheetJS y Daniel la encontró «demasiado rústica»
 * (2026-10-29): **el build libre de SheetJS no escribe estilos**, ni colores, ni
 * bordes, ni anchos de fuente. Por eso este archivo usa exceljs. El resto de las
 * exportaciones de la app siguen con SheetJS, que alcanza para un listado plano.
 *
 * Lo que lo hace trabajable, además de lindo:
 * - montos y fechas son NÚMEROS con formato, no textos: se ordenan, filtran y suman;
 * - el total de gastos es `SUBTOTAL(109, …)`, que **respeta el filtro**: filtrando
 *   por categoría, el total dice lo de esa categoría;
 * - el saldo del cuadre es una fórmula sobre sus filas, para que se pueda auditar.
 *
 * Cada fórmula lleva también su resultado: así se ve bien incluso en un visor que
 * no recalcula (la vista previa del correo, un teléfono).
 */

const argb = (hex: string) => 'FF' + hex.replace('#', '').toUpperCase()

const C = {
  marca:      argb(BRAND.primary),
  marcaHonda: argb(BRAND.primaryDeep),
  marcaClara: 'FFE6F4F4',
  tinta:      argb(NEUTRAL.figure),
  gris:       argb(NEUTRAL.axis),
  linea:      'FFDCE3E4',
  cebra:      'FFF6F8F8',
  blanco:     'FFFFFFFF',
  verde:      argb(SEMANTIC.success), verdeClaro: 'FFE8F3EE',
  rojo:       argb(SEMANTIC.danger),  rojoClaro:  'FFF8E9E8',
  ambar:      argb(SEMANTIC.warning), ambarClaro: 'FFFBEFE8',
}

const TONO: Record<Indicador['tono'], { fuerte: string; claro: string }> = {
  neutro: { fuerte: C.marca, claro: C.marcaClara },
  bueno:  { fuerte: C.verde, claro: C.verdeClaro },
  alerta: { fuerte: C.ambar, claro: C.ambarClaro },
  malo:   { fuerte: C.rojo,  claro: C.rojoClaro },
}

const PESOS      = '"$" #,##0;-"$" #,##0;"$" 0'
const FECHA      = 'dd/mm/yyyy'
const FECHA_HORA = 'dd/mm/yyyy hh:mm'
const FUENTE     = 'Calibri'

const relleno = (color: string): ExcelJS.Fill => ({ type: 'pattern', pattern: 'solid', fgColor: { argb: color } })
const fuente  = (o: Partial<ExcelJS.Font> = {}): Partial<ExcelJS.Font> => ({ name: FUENTE, size: 10, color: { argb: C.tinta }, ...o })
const borde   = (color = C.linea): Partial<ExcelJS.Borders> => {
  const b = { style: 'thin' as const, color: { argb: color } }
  return { top: b, bottom: b, left: b, right: b }
}

function fechaCelda(celda: ExcelJS.Cell, iso: string) {
  const f = fechaChile(iso)
  celda.value  = f.serial
  celda.numFmt = f.hora ? FECHA_HORA : FECHA
}

/** La franja de color de arriba de cada hoja: el título y de qué documento es. */
function franja(ws: ExcelJS.Worksheet, ultimaCol: number, titulo: string, sub: string, c: Comprobante) {
  for (let r = 1; r <= 4; r++) {
    ws.getRow(r).height = r === 1 || r === 4 ? 8 : r === 2 ? 30 : 18
    for (let col = 1; col <= ultimaCol; col++) ws.getCell(r, col).fill = relleno(C.marca)
  }
  ws.mergeCells(2, 2, 2, ultimaCol - 2)
  ws.mergeCells(3, 2, 3, ultimaCol - 2)
  Object.assign(ws.getCell(2, 2), { value: titulo, font: fuente({ size: 18, bold: true, color: { argb: C.blanco } }), alignment: { vertical: 'middle' } })
  Object.assign(ws.getCell(3, 2), { value: sub, font: fuente({ size: 10, color: { argb: 'FFCFEDEC' } }), alignment: { vertical: 'middle' } })
  ws.mergeCells(2, ultimaCol - 1, 2, ultimaCol)
  ws.mergeCells(3, ultimaCol - 1, 3, ultimaCol)
  Object.assign(ws.getCell(2, ultimaCol - 1), {
    value: 'ESTADO', font: fuente({ size: 8, bold: true, color: { argb: 'FFCFEDEC' } }),
    alignment: { horizontal: 'right', vertical: 'bottom' },
  })
  Object.assign(ws.getCell(3, ultimaCol - 1), {
    value: c.estado, font: fuente({ size: 11, bold: true, color: { argb: C.blanco } }),
    alignment: { horizontal: 'right', vertical: 'middle' },
  })
}

/** Un título de sección: texto en el color de marca con una raya debajo. */
function seccion(ws: ExcelJS.Worksheet, fila: number, desde: number, hasta: number, texto: string) {
  ws.getRow(fila).height = 22
  for (let col = desde; col <= hasta; col++) {
    ws.getCell(fila, col).border = { bottom: { style: 'medium', color: { argb: C.marca } } }
  }
  Object.assign(ws.getCell(fila, desde), {
    value: texto, font: fuente({ size: 12, bold: true, color: { argb: C.marcaHonda } }),
    alignment: { vertical: 'bottom' },
  })
}

/** El encabezado de una tabla: fondo oscuro, letra blanca, filtro y fila congelada. */
function encabezado(ws: ExcelJS.Worksheet, fila: number, titulos: string[], desde = 1) {
  const row = ws.getRow(fila)
  row.height = 22
  titulos.forEach((t, i) => {
    Object.assign(row.getCell(desde + i), {
      value: t, fill: relleno(C.marcaHonda), border: borde(C.marcaHonda),
      font: fuente({ bold: true, color: { argb: C.blanco } }),
      alignment: { vertical: 'middle', horizontal: /Monto|Total/.test(t) ? 'right' : 'left', wrapText: true },
    })
  })
}

function filaDeDatos(row: ExcelJS.Row, desde: number, hasta: number, par: boolean) {
  for (let col = desde; col <= hasta; col++) {
    const c = row.getCell(col)
    c.font   = c.font ?? fuente()
    c.border = { bottom: { style: 'thin', color: { argb: C.linea } } }
    if (par) c.fill = relleno(C.cebra)
    c.alignment = { vertical: 'top', wrapText: true, ...(c.alignment ?? {}) }
  }
}

function estadoConColor(celda: ExcelJS.Cell, estado: string) {
  const t = estado === 'Rechazado' ? TONO.malo : estado === 'Pendiente' ? TONO.alerta : TONO.bueno
  celda.value     = estado
  celda.font      = fuente({ bold: true, color: { argb: t.fuerte } })
  celda.fill      = relleno(t.claro)
  celda.alignment = { horizontal: 'center', vertical: 'top' }
}

function pie(ws: ExcelJS.Worksheet, c: Comprobante, horizontal: boolean) {
  ws.pageSetup = {
    paperSize: 9, orientation: horizontal ? 'landscape' : 'portrait',
    fitToPage: true, fitToWidth: 1, fitToHeight: 0,
    margins: { left: 0.4, right: 0.4, top: 0.5, bottom: 0.6, header: 0.2, footer: 0.3 },
  }
  ws.headerFooter.oddFooter = `&L&8Mi Rendición · ${c.codigo}&R&8Página &P de &N`
  ws.views = [{ showGridLines: false }]
}

// ── El libro ─────────────────────────────────────────────────────────────────

export async function comprobanteAExcel(c: Comprobante, huella: string): Promise<Uint8Array> {
  const wb = new ExcelJS.Workbook()
  wb.creator = 'Mi Rendición'
  wb.created = new Date()
  const esFondo = c.tipo === 'caja_chica'
  const titulo  = esFondo ? 'Comprobante de caja chica' : 'Comprobante de rendición de gastos'
  const sub     = `${c.titulo}  ·  ${c.empleado.nombre}  ·  Código ${c.codigo}`

  resumen(wb, c, huella, titulo, sub)
  gastos(wb, c, sub)
  recorrido(wb, c, sub)
  if (c.movimientos.length) movimientos(wb, c, sub)

  return new Uint8Array(await wb.xlsx.writeBuffer())
}

function resumen(wb: ExcelJS.Workbook, c: Comprobante, huella: string, titulo: string, sub: string) {
  const ws = wb.addWorksheet('Resumen', { properties: { tabColor: { argb: C.marca } } })
  ws.columns = [{ width: 2.5 }, { width: 26 }, { width: 24 }, { width: 24 }, { width: 24 }, { width: 2.5 }]
  franja(ws, 6, titulo, sub, c)

  // ── Las cuatro cifras ──
  let r = 6
  ws.getRow(r).height = 18
  ws.getRow(r + 1).height = 30
  c.indicadores.slice(0, 4).forEach((ind, i) => {
    const col = 2 + i
    const t   = TONO[ind.tono]
    const lado = { style: 'thick' as const, color: { argb: t.fuerte } }
    Object.assign(ws.getCell(r, col), {
      value: ind.etiqueta.toUpperCase(), fill: relleno(t.claro), border: { left: lado },
      font: fuente({ size: 8, bold: true, color: { argb: C.gris } }), alignment: { indent: 1, vertical: 'bottom' },
    })
    Object.assign(ws.getCell(r + 1, col), {
      value: ind.monto, numFmt: PESOS, fill: relleno(t.claro), border: { left: lado },
      font: fuente({ size: 16, bold: true, color: { argb: t.fuerte } }), alignment: { indent: 1, vertical: 'middle' },
    })
  })

  // ── Datos ──
  r = 10
  seccion(ws, r, 2, 5, 'Datos del documento')
  const datos: [string, string | { iso: string }][] = [
    ['Documento', c.titulo],
    ['Empleado', c.empleado.nombre],
    ['RUT', c.empleado.rut || '—'],
    ['Centro de costo', c.empleado.centroCosto || '—'],
    ['Proyecto', c.proyecto],
    ...(c.motivo ? [['Motivo', c.motivo] as [string, string]] : []),
    ['Creado', { iso: c.creado }],
    ...(c.enviado ? [['Enviado', { iso: c.enviado }] as [string, { iso: string }]] : []),
    ['Código', c.codigo],
  ]
  for (const [k, v] of datos) {
    r++
    ws.getRow(r).height = 18
    Object.assign(ws.getCell(r, 2), { value: k, font: fuente({ color: { argb: C.gris } }), alignment: { vertical: 'middle' } })
    ws.mergeCells(r, 3, r, 5)
    const celda = ws.getCell(r, 3)
    if (typeof v === 'string') celda.value = v
    else fechaCelda(celda, v.iso)
    celda.font = fuente({ bold: true })
    celda.alignment = { horizontal: 'left', vertical: 'middle', wrapText: true }
  }

  // ── Cuadre ──
  r += 2
  seccion(ws, r, 2, 5, 'Cuadre')
  const primera = r + 1
  for (const f of c.cuadre) {
    r++
    ws.getRow(r).height = 20
    ws.mergeCells(r, 2, r, 4)
    const concepto = ws.getCell(r, 2)
    const monto    = ws.getCell(r, 5)
    concepto.value = f.concepto
    if (f.total) {
      monto.value = { formula: `SUM(E${primera}:E${r - 1})`, result: f.monto }
      const arriba = { top: { style: 'thin' as const, color: { argb: C.tinta } } }
      for (const celda of [concepto, monto]) { celda.font = fuente({ bold: true }); celda.border = arriba }
    } else {
      monto.value = f.monto
      concepto.font = fuente()
      monto.font = fuente({ color: { argb: f.monto < 0 ? C.rojo : C.tinta } })
      for (const celda of [concepto, monto]) celda.border = { bottom: { style: 'hair', color: { argb: C.linea } } }
    }
    monto.numFmt = PESOS
    monto.alignment = { horizontal: 'right', vertical: 'middle' }
    concepto.alignment = { vertical: 'middle', indent: 1 }
  }
  // El resultado, dicho con palabras y en el color de lo que significa
  r += 1
  ws.getRow(r).height = 26
  const tono = TONO[c.indicadores.at(-1)?.tono ?? 'neutro']
  ws.mergeCells(r, 2, r, 4)
  for (let col = 2; col <= 5; col++) ws.getCell(r, col).fill = relleno(tono.claro)
  Object.assign(ws.getCell(r, 2), {
    value: c.resultado.texto, font: fuente({ size: 11, bold: true, color: { argb: tono.fuerte } }),
    alignment: { vertical: 'middle', indent: 1 },
  })
  Object.assign(ws.getCell(r, 5), {
    value: c.resultado.monto, numFmt: PESOS, font: fuente({ size: 12, bold: true, color: { argb: tono.fuerte } }),
    alignment: { horizontal: 'right', vertical: 'middle' },
  })

  // ── Verificación ──
  r += 3
  seccion(ws, r, 2, 5, 'Verificación')
  r++
  Object.assign(ws.getCell(r, 2), { value: 'Huella SHA-256', font: fuente({ color: { argb: C.gris } }) })
  ws.mergeCells(r, 3, r, 5)
  Object.assign(ws.getCell(r, 3), { value: huella, font: { name: 'Consolas', size: 8, color: { argb: C.tinta } } })
  r++
  Object.assign(ws.getCell(r, 2), { value: 'Generado', font: fuente({ color: { argb: C.gris } }) })
  ws.mergeCells(r, 3, r, 5)
  fechaCelda(ws.getCell(r, 3), new Date().toISOString())
  ws.getCell(r, 3).alignment = { horizontal: 'left' }
  ws.getCell(r, 3).font = fuente()
  r++
  ws.mergeCells(r, 2, r, 5)
  ws.getRow(r).height = 28
  Object.assign(ws.getCell(r, 2), {
    value: 'La huella es la misma en todas las copias de este documento mientras nada cambie: si dos copias tienen huellas distintas, una fue modificada.',
    font: fuente({ size: 8, italic: true, color: { argb: C.gris } }), alignment: { wrapText: true, vertical: 'top' },
  })

  pie(ws, c, false)
}

function gastos(wb: ExcelJS.Workbook, c: Comprobante, sub: string) {
  const ws = wb.addWorksheet('Gastos', { properties: { tabColor: { argb: C.marcaHonda } } })
  const cols = [
    { t: 'Fecha', w: 11 }, { t: 'Comercio', w: 30 }, { t: 'RUT proveedor', w: 14 }, { t: 'Documento', w: 16 },
    { t: 'Descripción', w: 32 }, { t: 'Categoría', w: 20 }, { t: 'Centro de costo', w: 18 },
    { t: 'Estado', w: 12 }, { t: 'Monto', w: 14 }, { t: 'Motivo del rechazo', w: 28 },
  ]
  ws.columns = cols.map(x => ({ width: x.w }))
  franja(ws, cols.length, `Gastos rendidos (${c.gastos.length})`, sub, c)

  const cab = 6
  encabezado(ws, cab, cols.map(x => x.t))
  c.gastos.forEach((g, i) => {
    const row = ws.getRow(cab + 1 + i)
    fechaCelda(row.getCell(1), g.fecha)
    row.getCell(2).value  = g.comercio
    row.getCell(3).value  = g.rutProveedor
    row.getCell(4).value  = g.documento
    row.getCell(5).value  = g.descripcion
    row.getCell(6).value  = g.categoria
    row.getCell(7).value  = g.centroCosto
    row.getCell(9).value  = g.monto
    row.getCell(9).numFmt = PESOS
    row.getCell(9).alignment = { horizontal: 'right', vertical: 'top' }
    row.getCell(10).value = g.motivoRechazo
    filaDeDatos(row, 1, cols.length, i % 2 === 1)
    estadoConColor(row.getCell(8), g.estado)
    if (g.estado === 'Rechazado') {
      row.getCell(9).font  = fuente({ strike: true, color: { argb: C.gris } })
      row.getCell(10).font = fuente({ italic: true, color: { argb: C.rojo } })
    }
  })
  const desde = cab + 1
  const hasta = cab + Math.max(c.gastos.length, 1)
  if (!c.gastos.length) {
    ws.mergeCells(desde, 1, desde, cols.length)
    Object.assign(ws.getCell(desde, 1), { value: 'Sin gastos registrados', font: fuente({ italic: true, color: { argb: C.gris } }) })
  }
  ws.autoFilter = { from: { row: cab, column: 1 }, to: { row: hasta, column: cols.length } }
  ws.views = [{ state: 'frozen', ySplit: cab, showGridLines: false }]

  // ── Totales ──
  const suma = (estado?: string) => c.gastos.filter(g => !estado || g.estado === estado).reduce((s, g) => s + g.monto, 0)
  let r = hasta + 2
  const total = (etiqueta: string, formula: string, valor: number, fuerte: boolean, color = C.tinta) => {
    ws.mergeCells(r, 6, r, 8)
    Object.assign(ws.getCell(r, 6), {
      value: etiqueta, alignment: { horizontal: 'right', vertical: 'middle' },
      font: fuente({ bold: fuerte, color: { argb: fuerte ? C.tinta : C.gris } }),
    })
    Object.assign(ws.getCell(r, 9), {
      value: { formula, result: valor }, numFmt: PESOS, alignment: { horizontal: 'right', vertical: 'middle' },
      font: fuente({ bold: true, color: { argb: color } }),
      ...(fuerte ? { fill: relleno(C.marcaClara), border: { top: { style: 'thin', color: { argb: C.marca } } } } : {}),
    })
    ws.getRow(r).height = 20
    r++
  }
  const rango = (col: string) => `${col}${desde}:${col}${hasta}`
  total('Total de lo que se ve (respeta los filtros)', `SUBTOTAL(109,${rango('I')})`, suma(), true)
  for (const [estado, color] of [['Aprobado', C.verde], ['Pendiente', C.ambar], ['Rechazado', C.rojo]] as const) {
    if (suma(estado)) total(`Total ${estado.toLowerCase()}`, `SUMIF(${rango('H')},"${estado}",${rango('I')})`, suma(estado), false, color)
  }

  pie(ws, c, true)
  ws.views = [{ state: 'frozen', ySplit: cab, showGridLines: false }]
}

function recorrido(wb: ExcelJS.Workbook, c: Comprobante, sub: string) {
  const ws = wb.addWorksheet('Recorrido', { properties: { tabColor: { argb: C.verde } } })
  const cols = [{ t: 'Fecha y hora', w: 17 }, { t: 'Paso', w: 34 }, { t: 'Quién', w: 30 }, { t: 'Monto', w: 14 }, { t: 'Comentario', w: 50 }]
  ws.columns = cols.map(x => ({ width: x.w }))
  franja(ws, cols.length, 'Recorrido de aprobación', sub, c)
  const cab = 6
  encabezado(ws, cab, cols.map(x => x.t))

  if (c.sinRecorrido) {
    ws.mergeCells(cab + 1, 1, cab + 1, cols.length)
    Object.assign(ws.getCell(cab + 1, 1), { value: c.sinRecorrido, font: fuente({ italic: true, color: { argb: C.gris } }) })
  }
  c.recorrido.forEach((p, i) => {
    const row = ws.getRow(cab + 1 + i)
    fechaCelda(row.getCell(1), p.fecha)
    row.getCell(2).value = p.accion
    row.getCell(3).value = p.persona
    if (p.monto != null) { row.getCell(4).value = p.monto; row.getCell(4).numFmt = PESOS }
    row.getCell(4).alignment = { horizontal: 'right', vertical: 'top' }
    row.getCell(5).value = p.nota
    filaDeDatos(row, 1, cols.length, i % 2 === 1)
    const color = /Rechaz/.test(p.accion) ? C.rojo : /Devuel/.test(p.accion) ? C.ambar
                : /[Aa]probad|[Aa]utorizad|liquidado/.test(p.accion) ? C.verde : C.tinta
    row.getCell(2).font = fuente({ bold: true, color: { argb: color } })
  })
  ws.views = [{ state: 'frozen', ySplit: cab, showGridLines: false }]
  pie(ws, c, true)
  ws.views = [{ state: 'frozen', ySplit: cab, showGridLines: false }]
}

function movimientos(wb: ExcelJS.Workbook, c: Comprobante, sub: string) {
  const esFondo = c.tipo === 'caja_chica'
  const ws = wb.addWorksheet(esFondo ? 'Transferencias' : 'Movimientos', { properties: { tabColor: { argb: C.ambar } } })
  const cols = [{ t: 'Fecha', w: 12 }, { t: 'Movimiento', w: 40 }, { t: 'Referencia', w: 36 }, { t: 'Monto', w: 15 }, { t: '', w: 2 }]
  ws.columns = cols.map(x => ({ width: x.w }))
  franja(ws, cols.length, esFondo ? 'Transferencias bancarias' : 'Movimientos de fondos', sub, c)
  const cab = 6
  encabezado(ws, cab, cols.slice(0, 4).map(x => x.t))
  c.movimientos.forEach((m, i) => {
    const row = ws.getRow(cab + 1 + i)
    fechaCelda(row.getCell(1), m.fecha)
    row.getCell(2).value = m.concepto
    row.getCell(3).value = m.referencia
    row.getCell(4).value = m.monto
    row.getCell(4).numFmt = PESOS
    row.getCell(4).alignment = { horizontal: 'right', vertical: 'top' }
    filaDeDatos(row, 1, 4, i % 2 === 1)
  })
  pie(ws, c, false)
  ws.views = [{ state: 'frozen', ySplit: cab, showGridLines: false }]
}
