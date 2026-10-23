import * as XLSX from 'xlsx'
import { ETIQUETA_MOVIMIENTO, type MovimientoFxR, type MesFxR } from '@/lib/fondos-por-rendir'

/**
 * El Excel de Fondos por Rendir, para la contabilidad.
 *
 * Recibe lo YA calculado por la pantalla con `src/lib/fondos-por-rendir.ts`: si
 * volviera a sumar acá, el archivo y la pantalla podrían decir cifras distintas.
 *
 * **Una celda con fórmula necesita también un valor cacheado**: el build libre
 * de SheetJS descarta al escribir las que solo traen `f`, y la columna quedaba
 * vacía sin ningún error. El valor cacheado además deja la planilla legible
 * antes de que Excel recalcule.
 */

export interface SaldoExportable {
  personaId:   string
  nombre:      string
  rut:         string
  movimientos: number
  inicial:     number
  defontana:   number
  app:         number
  diferencia:  number
  final:       number
  adelantos:    number
  recibidos:    number
  gastos:       number
  devoluciones: number
  pagados:      number
}

const ancho = (...n: number[]) => n.map(wch => ({ wch }))

export function exportFondosPorRendir(datos: {
  movimientos: MovimientoFxR[]
  saldos:      SaldoExportable[]
  meses:       MesFxR[]
  fechaCorte:  string | null
}) {
  const { movimientos, saldos, meses, fechaCorte } = datos
  const wb  = XLSX.utils.book_new()
  const hoy = new Date().toLocaleDateString('es-CL')
  const nombrePor = Object.fromEntries(saldos.map(s => [s.personaId, s]))

  // ── Hoja 1: saldo por empleado ─────────────────────────────────────────────
  const h1: (string | number | null)[][] = [
    ['FONDOS POR RENDIR — saldo por empleado'],
    [`Generado el ${hoy}. Excluye documentos en la papelera y gastos rechazados.`],
    fechaCorte
      ? [`Saldo inicial medido al ${fechaCorte}; los movimientos posteriores se suman encima.`]
      : ['SIN FECHA DE CORTE: el saldo solo cubre lo que pasó por la app.'],
    ['Saldo DEUDOR (+): la empresa le entregó plata.  ACREEDOR (−): el empleado rindió o devolvió de más.'],
    [],
    ['RUT', 'Empleado', 'Movimientos', 'Saldo inicial', 'Movimiento Defontana',
     'Saldo Defontana', 'Saldo App', 'Falta contabilizar', 'Condición'],
  ]
  const PRIMERA = h1.length + 1
  for (const s of saldos) {
    h1.push([s.rut, s.nombre, s.movimientos, s.inicial, s.defontana,
             null, s.inicial + s.app, s.diferencia,
             s.final > 0 ? 'Deudor' : s.final < 0 ? 'Acreedor' : 'Cuadrado'])
  }
  const ULTIMA = h1.length
  h1.push(['', 'TOTAL', null, null, null, null, null, null, ''])

  const ws1 = XLSX.utils.aoa_to_sheet(h1)
  const formula = (celda: string, f: string, v: number) => { ws1[celda] = { t: 'n', f, v } }

  // F = saldo inicial + movimiento contabilizado
  saldos.forEach((s, i) => formula(`F${PRIMERA + i}`, `D${PRIMERA + i}+E${PRIMERA + i}`, s.final))

  const suma = (f: (s: SaldoExportable) => number) => saldos.reduce((t, s) => t + f(s), 0)
  const tot  = ULTIMA + 1
  const sumas: Record<string, number> = {
    C: suma(s => s.movimientos),
    D: suma(s => s.inicial),
    E: suma(s => s.defontana),
    F: suma(s => s.final),
    G: suma(s => s.inicial + s.app),
    H: suma(s => s.diferencia),
  }
  for (const [col, v] of Object.entries(sumas)) {
    formula(`${col}${tot}`, `SUM(${col}${PRIMERA}:${col}${ULTIMA})`, v)
  }
  ws1['!cols'] = ancho(14, 28, 12, 15, 20, 16, 16, 18, 11)
  XLSX.utils.book_append_sheet(wb, ws1, 'Saldo por empleado')

  // ── Hoja 2: composición de lo contabilizado ────────────────────────────────
  const h2: (string | number)[][] = [
    ['COMPOSICIÓN DEL SALDO — solo movimientos ya contabilizados en Defontana'],
    ['El Debe aumenta lo que la persona tiene en mano; el Haber lo baja.'],
    [],
    ['RUT', 'Empleado', 'Adelantos (debe)', 'Traspasos recibidos (debe)',
     'Gastos rendidos (haber)', 'Devoluciones (haber)', 'Traspasos pagados (haber)', 'Saldo'],
  ]
  for (const s of saldos) {
    if (!s.movimientos) continue
    h2.push([s.rut, s.nombre, s.adelantos, s.recibidos, s.gastos, s.devoluciones, s.pagados, s.defontana])
  }
  const ws2 = XLSX.utils.aoa_to_sheet(h2)
  ws2['!cols'] = ancho(14, 28, 17, 24, 22, 20, 23, 15)
  XLSX.utils.book_append_sheet(wb, ws2, 'Composición')

  // ── Hoja 3: movimiento por mes ─────────────────────────────────────────────
  const inicialTotal = suma(s => s.inicial)
  const h3: (string | number)[][] = [
    ['MOVIMIENTO POR MES — solo lo contabilizado'],
    [`El acumulado incluye el saldo inicial de todos (${inicialTotal}).`],
    [],
    ['Mes', 'Debe', 'Haber', 'Variación', 'Acumulado'],
  ]
  for (const m of meses) h3.push([m.mes, m.debe, m.haber, m.variacion, m.acumulado + inicialTotal])
  const ws3 = XLSX.utils.aoa_to_sheet(h3)
  ws3['!cols'] = ancho(10, 15, 15, 14, 16)
  XLSX.utils.book_append_sheet(wb, ws3, 'Por mes')

  // ── Hoja 4: detalle, para trazar cualquier diferencia ──────────────────────
  const ws4 = XLSX.utils.json_to_sheet(
    movimientos
      .slice()
      .sort((a, b) => String(a.fecha).localeCompare(String(b.fecha)))
      .map(m => ({
        Fecha:          m.fecha,
        Empleado:       nombrePor[m.personaId]?.nombre ?? '',
        RUT:            nombrePor[m.personaId]?.rut ?? '',
        Documento:      m.documento,
        Movimiento:     ETIQUETA_MOVIMIENTO[m.tipo] ?? m.tipo,
        Glosa:          m.glosa,
        Debe:           m.monto > 0 ? m.monto : null,
        Haber:          m.monto < 0 ? -m.monto : null,
        'En Defontana': m.contabilizado ? 'Sí' : 'No',
      })),
  )
  ws4['!cols'] = ancho(12, 26, 14, 40, 30, 36, 13, 13, 13)
  XLSX.utils.book_append_sheet(wb, ws4, 'Detalle')

  XLSX.writeFile(wb, `Fondos por Rendir ${new Date().toISOString().slice(0, 10)}.xlsx`)
}
