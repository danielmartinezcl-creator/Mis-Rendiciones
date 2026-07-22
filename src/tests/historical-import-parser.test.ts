import { describe, it, expect } from 'vitest'
import { xlSerialToDate, parseExcelBuffer } from '@/lib/historical-import/parser'
import * as XLSX from 'xlsx'

describe('xlSerialToDate', () => {
  it('convierte serial Excel 46077 a 2026-02-24', () => {
    expect(xlSerialToDate(46077)).toBe('2026-02-24')
  })
  it('convierte serial 46045 a 2026-01-23', () => {
    expect(xlSerialToDate(46045)).toBe('2026-01-23')
  })
  it('convierte serial 46052 a 2026-01-30', () => {
    expect(xlSerialToDate(46052)).toBe('2026-01-30')
  })
})

describe('parseExcelBuffer', () => {
  function makeWorkbook(rows: unknown[][]): ArrayBuffer {
    const ws = XLSX.utils.aoa_to_sheet(rows)
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Rendición')
    // XLSX.write puede retornar Uint8Array o number[] según la versión
    // new Uint8Array(output) funciona para ambos; .buffer.slice() da ArrayBuffer exacto
    const output = XLSX.write(wb, { type: 'array', bookType: 'xlsx' })
    const u8 = new Uint8Array(output)
    return u8.buffer.slice(u8.byteOffset, u8.byteOffset + u8.byteLength)
  }

  it('extrae el tipo caja_chica cuando el encabezado dice CAJA CHICA', () => {
    const rows = buildTestRows()
    const result = parseExcelBuffer(makeWorkbook(rows))
    expect(result.importType).toBe('caja_chica')
  })

  it('extrae número de fondo y nombre de oficina', () => {
    const rows = buildTestRows()
    const result = parseExcelBuffer(makeWorkbook(rows))
    expect(result.fundNumber).toBe('173')
    expect(result.officeName).toBe('OFICINA DE INGENIERÍA')
  })

  it('convierte la fecha de rendición a YYYY-MM-DD', () => {
    const rows = buildTestRows()
    const result = parseExcelBuffer(makeWorkbook(rows))
    expect(result.rendicionDate).toBe('2026-02-24')
  })

  it('extrae 6 ítems con sus datos correctos', () => {
    const rows = buildTestRows()
    const result = parseExcelBuffer(makeWorkbook(rows))
    expect(result.items).toHaveLength(6)
    expect(result.items[0].employeeName).toBe('ESTEBAN VARAS')
    expect(result.items[0].description).toBe('TAXI CONCEPCION VUELTA')
    expect(result.items[0].date).toBe('2026-01-23')
    expect(result.items[0].amountCLP).toBe(13000)
    expect(result.items[0].projectCode).toBe('2982')
  })

  it('ignora filas vacías de la tabla (Item sin Gastos)', () => {
    const rows = buildTestRows()
    const result = parseExcelBuffer(makeWorkbook(rows))
    // Solo 6 items tienen monto, el resto están vacíos
    expect(result.items.every(i => i.amountCLP > 0)).toBe(true)
  })

  it('calcula el totalAmount como suma de gastos', () => {
    const rows = buildTestRows()
    const result = parseExcelBuffer(makeWorkbook(rows))
    expect(result.totalAmount).toBe(214100)
  })
})

// Helper que construye una hoja con la misma estructura que Caja Chica 173.xlsx
function buildTestRows(): unknown[][] {
  // Posiciones: fila base 0-indexed, columnas A=0 B=1 C=2 D=3 E=4 F=5 G=6 H=7 I=8
  const rows: unknown[][] = Array.from({ length: 55 }, () => Array(11).fill(''))

  // Fila 5 (index 5): Nombre tipo + N°
  rows[5][3] = 'CAJA CHICA'
  rows[5][7] = 'N°'
  rows[5][8] = 173

  // Fila 7 (index 7): Oficina + fecha rendición
  rows[7][3] = 'OFICINA DE INGENIERÍA'
  rows[7][4] = 'Fecha de Rendición'
  rows[7][6] = 46077  // 2026-02-24

  // Fila 10 (index 10): Headers
  rows[10][1] = 'Item'
  rows[10][2] = 'Usuario'
  rows[10][3] = 'Razón'
  rows[10][4] = 'Proyecto'
  rows[10][5] = 'Fecha'
  rows[10][6] = 'Gastos'
  rows[10][7] = 'Ingresos'
  rows[10][8] = 'Saldo'

  // Fila 12 (index 12): Saldo inicial
  rows[12][8] = 200000

  // Items desde fila 14 (index 14)
  const items = [
    [1, 'ESTEBAN VARAS', 'TAXI CONCEPCION VUELTA', 2982, 46045, 13000],
    [2, 'ESTEBAN VARAS', 'TAXI CONCEPCION IDA Y  VUELTA', 2964, 46052, 31000],
    [3, 'CLAUDIA LOBOS', 'DESAYUNO ALEXIS VILLA', '', 46058, 34900],
    [4, 'CAMILA NAVARRO', 'DESAYUNO ERICK PIZARRO', '', 46064, 34400],
    [5, 'ESTEBAN VARAS', 'EXAMEN ALCOHOL Y DROGAS', 2964, 46064, 50400],
    [6, 'LEONEL CACERES', 'EXAMEN ALCOHOL Y DROGAS', 2964, 46065, 50400],
  ]
  items.forEach(([num, usuario, razon, proyecto, fecha, gastos], i) => {
    const r = rows[14 + i]
    r[1] = num; r[2] = usuario; r[3] = razon
    r[4] = proyecto; r[5] = fecha; r[6] = gastos
  })

  // Resumen fila 47 (index 47)
  rows[47][2] = 'Total Gastos'
  rows[47][6] = 214100

  return rows
}
