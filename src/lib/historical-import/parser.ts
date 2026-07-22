import * as XLSX from 'xlsx'

export interface ParsedItem {
  employeeName: string
  description: string
  date: string
  amountCLP: number
  projectCode: string | null
}

export interface ParsedHistoricalImport {
  importType: 'rendicion' | 'caja_chica'
  fundNumber: string
  officeName: string
  rendicionDate: string
  totalAmount: number
  items: ParsedItem[]
}

/** Convierte serial de fecha Excel (epoch 1899-12-30) a YYYY-MM-DD */
export function xlSerialToDate(serial: number): string {
  const ms = Date.UTC(1899, 11, 30) + serial * 86_400_000
  return new Date(ms).toISOString().split('T')[0]
}

/** Parsea un ArrayBuffer de .xlsx con la estructura de los archivos del cliente */
export function parseExcelBuffer(buffer: ArrayBuffer): ParsedHistoricalImport {
  const wb = XLSX.read(buffer, { type: 'array' })
  const ws = wb.Sheets[wb.SheetNames[0]]
  // Leer como array 2D; defval '' para celdas vacías
  const rows = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, defval: '' }) as unknown[][]

  // ── Encabezado ────────────────────────────────────────────────────────────
  // Fila 5 (index 5): col D (3) = "CAJA CHICA" o "RENDICIÓN", col I (8) = número
  const typeCell = String(rows[5]?.[3] ?? '').trim().toUpperCase()
  const importType: 'rendicion' | 'caja_chica' =
    typeCell.includes('RENDIC') ? 'rendicion' : 'caja_chica'
  const fundNumber = String(rows[5]?.[8] ?? '').trim()

  // Fila 7 (index 7): col D (3) = nombre oficina/empleado, col G (6) = fecha serial
  const officeName = String(rows[7]?.[3] ?? '').trim()
  const dateSerial = rows[7]?.[6]
  const rendicionDate = typeof dateSerial === 'number' ? xlSerialToDate(dateSerial) : ''

  // ── Items ─────────────────────────────────────────────────────────────────
  // Buscar la fila con encabezados "Item" / "Usuario" (col B = index 1)
  let dataStart = -1
  for (let i = 0; i < Math.min(rows.length, 20); i++) {
    if (String(rows[i]?.[1] ?? '').trim().toLowerCase() === 'item') {
      dataStart = i + 2  // primera fila de datos es 2 después del header (hay fila de saldo inicial)
      break
    }
  }
  if (dataStart === -1) dataStart = 14  // fallback posición conocida

  const items: ParsedItem[] = []
  let totalAmount = 0

  for (let i = dataStart; i < rows.length; i++) {
    const row = rows[i]
    const itemNum = row?.[1]
    const usuario = String(row?.[2] ?? '').trim()
    const razon   = String(row?.[3] ?? '').trim()
    const proyecto = row?.[4]
    const fechaSerial = row?.[5]
    const gastos  = row?.[6]

    // Una fila de datos válida tiene: número de item, empleado, razón y monto
    if (typeof itemNum !== 'number' || !usuario || !razon) continue
    const amount = typeof gastos === 'number' && gastos > 0 ? gastos : 0
    if (amount === 0) continue

    const date = typeof fechaSerial === 'number'
      ? xlSerialToDate(fechaSerial)
      : rendicionDate  // fallback a fecha de rendición

    items.push({
      employeeName: usuario,
      description:  razon,
      date,
      amountCLP:    amount,
      projectCode:  proyecto && typeof proyecto === 'number' ? String(proyecto) : null,
    })
    totalAmount += amount
  }

  return { importType, fundNumber, officeName, rendicionDate, totalAmount, items }
}
