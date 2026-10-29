import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'
import { fechaChile, type Comprobante, type Indicador } from '@/lib/comprobante-cierre'
import { BRAND, NEUTRAL, SEMANTIC } from '@/lib/design-tokens'
import { formatCLP } from '@/lib/utils'

/**
 * El comprobante en PDF: lo que se archiva, se imprime o se adjunta a un correo.
 * Los números para trabajar van en el Excel (`comprobante-excel.ts`), que dibuja la
 * MISMA estructura con las mismas cuatro cifras arriba.
 *
 * Cada tabla lleva su título (Daniel, 2026-10-29): sin él, un cuadro de fechas y
 * nombres no decía que era el recorrido de aprobación.
 *
 * Devuelve los bytes y no descarga, para poder generarlo en una prueba o un script.
 */

type RGB = [number, number, number]
const rgb = (hex: string): RGB => [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16)) as RGB

const MARCA  = rgb(BRAND.primary)
const HONDA  = rgb(BRAND.primaryDeep)
const OSCURO = rgb(NEUTRAL.figure)
const TENUE  = rgb(NEUTRAL.axis)
const LINEA: RGB = [220, 227, 228]
const CEBRA: RGB = [246, 248, 248]

const TONO: Record<Indicador['tono'], { fuerte: RGB; claro: RGB }> = {
  neutro: { fuerte: MARCA,                  claro: [230, 244, 244] },
  bueno:  { fuerte: rgb(SEMANTIC.success),  claro: [232, 243, 238] },
  alerta: { fuerte: rgb(SEMANTIC.warning),  claro: [251, 239, 232] },
  malo:   { fuerte: rgb(SEMANTIC.danger),   claro: [248, 233, 232] },
}

const cuando = (iso: string) => {
  const f = fechaChile(iso)
  return f.hora ? `${f.fecha} ${f.hora}` : f.fecha
}

export function comprobanteAPdf(c: Comprobante, huella: string): Uint8Array {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })
  const ancho = doc.internal.pageSize.getWidth()
  const alto  = doc.internal.pageSize.getHeight()
  const M = 14
  const util = ancho - 2 * M
  const esFondo = c.tipo === 'caja_chica'

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const finTabla = () => (doc as any).lastAutoTable.finalY as number

  /** Título de sección con su raya. Si no entra con algo de espacio debajo, salta de página. */
  const titulo = (texto: string, y: number, detalle?: string): number => {
    if (y > alto - 40) { doc.addPage(); y = 20 }
    doc.setFont('helvetica', 'bold').setFontSize(11).setTextColor(...HONDA)
    doc.text(texto, M, y)
    if (detalle) {
      doc.setFont('helvetica', 'normal').setFontSize(8).setTextColor(...TENUE)
      doc.text(detalle, ancho - M, y, { align: 'right' })
    }
    doc.setDrawColor(...MARCA).setLineWidth(0.5)
    doc.line(M, y + 1.8, ancho - M, y + 1.8)
    return y + 4.5
  }

  const tabla = { margin: { left: M, right: M }, styles: { fontSize: 7.5, textColor: OSCURO, cellPadding: 1.8, valign: 'top' as const, lineColor: LINEA },
                  headStyles: { fillColor: HONDA, textColor: [255, 255, 255] as RGB, fontSize: 7.5 },
                  alternateRowStyles: { fillColor: CEBRA } }

  // ── Encabezado ─────────────────────────────────────────────────────────────
  doc.setFillColor(...MARCA)
  doc.rect(0, 0, ancho, 30, 'F')
  doc.setTextColor(255, 255, 255)
  doc.setFont('helvetica', 'bold').setFontSize(16)
  doc.text(esFondo ? 'Comprobante de caja chica' : 'Comprobante de rendición de gastos', M, 13)
  doc.setFont('helvetica', 'normal').setFontSize(9)
  doc.text(doc.splitTextToSize(`${c.titulo}  ·  Código ${c.codigo}`, util - 50)[0], M, 21)
  doc.setFontSize(7).text('ESTADO', ancho - M, 13, { align: 'right' })
  doc.setFont('helvetica', 'bold').setFontSize(10).text(c.estado, ancho - M, 21, { align: 'right' })

  // ── Las cuatro cifras ──────────────────────────────────────────────────────
  const inds = c.indicadores.slice(0, 4)
  const gap = 3
  const anchoTarjeta = (util - gap * (inds.length - 1)) / inds.length
  inds.forEach((ind, i) => {
    const x = M + i * (anchoTarjeta + gap)
    const t = TONO[ind.tono]
    doc.setFillColor(...t.claro).rect(x, 36, anchoTarjeta, 17, 'F')
    doc.setFillColor(...t.fuerte).rect(x, 36, 1.2, 17, 'F')
    doc.setFont('helvetica', 'bold').setFontSize(6.5).setTextColor(...TENUE)
    doc.text(ind.etiqueta.toUpperCase(), x + 4, 41.5)
    doc.setFontSize(12.5).setTextColor(...t.fuerte)
    doc.text(formatCLP(ind.monto), x + 4, 49.5)
  })

  // ── Datos ──────────────────────────────────────────────────────────────────
  let y = titulo('Datos del documento', 62)
  const datos: [string, string][] = [
    ['Empleado', c.empleado.nombre],
    ['RUT', c.empleado.rut || '—'],
    ['Centro de costo', c.empleado.centroCosto || '—'],
    ['Proyecto', c.proyecto],
    ...(c.motivo ? [['Motivo', c.motivo] as [string, string]] : []),
    ['Creado', cuando(c.creado)],
    ...(c.enviado ? [['Enviado', cuando(c.enviado)] as [string, string]] : []),
  ]
  autoTable(doc, {
    startY: y, margin: { left: M, right: M }, theme: 'plain', body: datos,
    styles: { fontSize: 8.5, cellPadding: { top: 0.9, bottom: 0.9, left: 0, right: 2 }, textColor: OSCURO },
    columnStyles: { 0: { cellWidth: 34, textColor: TENUE }, 1: { fontStyle: 'bold' } },
  })

  // ── Cuadre ─────────────────────────────────────────────────────────────────
  y = titulo('Cuadre', finTabla() + 8, esFondo ? 'Lo que el empleado tiene en mano' : 'Lo que la empresa le debe al empleado')
  const filas = c.cuadre.filter(f => !f.total)
  const tonoFinal = TONO[c.indicadores.at(-1)?.tono ?? 'neutro']
  autoTable(doc, {
    startY: y, margin: { left: M, right: M }, theme: 'plain',
    /* La fila del saldo se reemplaza por el resultado dicho con palabras: las dos
       decían el mismo número, y «saldo a favor: −26.636» obliga a pensar el signo. */
    body: [...filas.map(f => [f.concepto, formatCLP(f.monto)]), [c.resultado.texto, formatCLP(c.resultado.monto)]],
    styles: { fontSize: 9, textColor: OSCURO, cellPadding: { top: 1.8, bottom: 1.8, left: 3, right: 3 }, lineColor: LINEA },
    columnStyles: { 1: { halign: 'right', cellWidth: 45 } },
    didParseCell: d => {
      const esResultado = d.row.index === filas.length
      if (esResultado) {
        d.cell.styles.fontStyle = 'bold'
        d.cell.styles.fillColor = tonoFinal.claro
        d.cell.styles.textColor = tonoFinal.fuerte
        d.cell.styles.fontSize  = 10
      } else {
        d.cell.styles.lineWidth = { bottom: 0.2 }
        if (d.column.index === 1 && String(d.cell.raw).startsWith('-')) d.cell.styles.textColor = TONO.malo.fuerte
      }
    },
  })

  // ── Gastos ─────────────────────────────────────────────────────────────────
  y = titulo('Gastos rendidos', finTabla() + 9, `${c.gastos.length} ${c.gastos.length === 1 ? 'gasto' : 'gastos'}`)
  autoTable(doc, {
    ...tabla, startY: y,
    head: [['Fecha', 'Comercio y descripción', 'Documento', 'Categoría', 'Estado', 'Monto']],
    body: c.gastos.length
      ? c.gastos.map(g => [
          fechaChile(g.fecha).fecha,
          [g.comercio, g.descripcion].filter(Boolean).join('\n'),
          [g.documento, g.rutProveedor].filter(Boolean).join('\n'),
          g.categoria,
          g.estado + (g.motivoRechazo ? `\n${g.motivoRechazo}` : ''),
          formatCLP(g.monto),
        ])
      : [[{ content: 'Sin gastos registrados', colSpan: 6 }]],
    columnStyles: { 0: { cellWidth: 18 }, 4: { cellWidth: 26 }, 5: { halign: 'right', cellWidth: 24 } },
    headStyles: { ...tabla.headStyles },
    didParseCell: d => {
      if (d.section === 'head' && d.column.index === 5) d.cell.styles.halign = 'right'
      if (d.section !== 'body' || d.column.index !== 4) return
      const e = String(d.cell.raw)
      const t = e.startsWith('Rechazado') ? TONO.malo : e.startsWith('Pendiente') ? TONO.alerta : TONO.bueno
      d.cell.styles.textColor = t.fuerte
      d.cell.styles.fontStyle = 'bold'
    },
    foot: c.gastos.length ? [['', '', '', '', 'Total presentado', formatCLP(c.gastos.reduce((s, g) => s + g.monto, 0))]] : undefined,
    footStyles: { fillColor: [230, 244, 244], textColor: OSCURO, fontStyle: 'bold', halign: 'right' },
  })

  // ── Recorrido ──────────────────────────────────────────────────────────────
  y = titulo('Recorrido de aprobación', finTabla() + 9, 'Quién hizo cada paso, y cuándo')
  autoTable(doc, {
    ...tabla, startY: y,
    head: [['Fecha y hora', 'Paso', 'Quién', 'Comentario']],
    body: c.sinRecorrido
      ? [[{ content: c.sinRecorrido, colSpan: 4 }]]
      : c.recorrido.map(p => [
          cuando(p.fecha),
          p.accion + (p.monto != null ? `\n${formatCLP(p.monto)}` : ''),
          p.persona,
          p.nota,
        ]),
    columnStyles: { 0: { cellWidth: 26 }, 1: { cellWidth: 50 }, 2: { cellWidth: 42 } },
    didParseCell: d => {
      if (d.section !== 'body' || d.column.index !== 1) return
      const a = String(d.cell.raw)
      if (/Rechaz/.test(a)) d.cell.styles.textColor = TONO.malo.fuerte
      else if (/Devuel/.test(a)) d.cell.styles.textColor = TONO.alerta.fuerte
      else if (/[Aa]probad|[Aa]utorizad|liquidado/.test(a)) d.cell.styles.textColor = TONO.bueno.fuerte
      d.cell.styles.fontStyle = 'bold'
    },
  })

  // ── Movimientos de fondos ──────────────────────────────────────────────────
  if (c.movimientos.length) {
    y = titulo(esFondo ? 'Transferencias bancarias' : 'Movimientos de fondos', finTabla() + 9,
               esFondo ? 'Entregas y devoluciones del fondo' : 'Adelantos, devoluciones y traspasos')
    autoTable(doc, {
      ...tabla, startY: y,
      head: [['Fecha', 'Movimiento', 'Referencia', 'Monto']],
      body: c.movimientos.map(m => [fechaChile(m.fecha).fecha, m.concepto, m.referencia, formatCLP(m.monto)]),
      columnStyles: { 0: { cellWidth: 20 }, 3: { halign: 'right', cellWidth: 26 } },
      didParseCell: d => { if (d.section === 'head' && d.column.index === 3) d.cell.styles.halign = 'right' },
    })
  }

  // ── Pie en cada página: la huella y el número de página ───────────────────
  const paginas = doc.getNumberOfPages()
  const generado = cuando(new Date().toISOString())
  for (let i = 1; i <= paginas; i++) {
    doc.setPage(i)
    doc.setDrawColor(...LINEA).setLineWidth(0.2).line(M, alto - 14, ancho - M, alto - 14)
    doc.setFont('helvetica', 'normal').setFontSize(6.5).setTextColor(...TENUE)
    doc.text(`Huella SHA-256: ${huella}`, M, alto - 10)
    doc.text(`Generado el ${generado} · Mi Rendición`, M, alto - 6)
    doc.text(`Página ${i} de ${paginas}`, ancho - M, alto - 6, { align: 'right' })
  }

  return new Uint8Array(doc.output('arraybuffer'))
}
