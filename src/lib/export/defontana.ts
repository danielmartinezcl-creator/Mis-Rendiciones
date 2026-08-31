// Lógica de construcción de asientos contables para importar en Defontana.
// Template: importador-comprobantes.xlsx (36 columnas, 34 nombradas + 2 vacías).
// Facturas → línea individual por ítem (preserva RUT/tipo doc/número para IVA).
// Boletas/tickets → agrupadas por (cuenta, centro de negocios).

import * as XLSX from 'xlsx'
import { formatRutDisplay } from '@/lib/sii-validator'

// ── Interfaces de entrada ───────────────────────────────────────────────────

/** Tipo de movimiento contable. Cada uno arma un asiento distinto. */
export type DefontanaMovement = 'expense' | 'advance' | 'return' | 'transfer'

export interface DefontanaItem {
  description:            string
  amount_clp:             number
  category_name:          string | null
  defontana_account_code: string | null   // de la categoría (puede tener puntos: "4.5.1030.10.13")
  supplier_account_code:  string | null   // de defontana_suppliers (prioridad sobre categoría)
  doc_type:               string | null
  doc_number:             string | null
  cost_center_id:         string | null   // override por ítem (prioridad sobre empleado)
  supplier_rut:           string | null   // requerido para facturas (crédito fiscal IVA)
  merchant:               string | null
  /** Movimiento del ítem. Ausente = 'expense' (comportamiento histórico). */
  item_type?:             DefontanaMovement | null
  /** YYYY-MM-DD del movimiento. Da la fecha del asiento y el N° de documento
   *  bancario (DDMMYY) en adelantos y devoluciones. */
  date?:                  string | null
  /** Traspasos: RUT y nombre de la otra parte. */
  counterpart_rut?:       string | null
  counterpart_name?:      string | null
  /** Traspasos: true si este reporte es el que ENTREGA el fondo. Cada traspaso
   *  genera un ítem en cada lado; el asiento se emite solo desde el pagador
   *  para no duplicarlo. */
  is_transfer_payer?:     boolean
}

export interface DefontanaReportInput {
  reportId:             string
  reportTitle:          string
  date:                 string   // YYYY-MM-DD — fecha del ítem más antiguo del reporte
  employeeName:         string
  employeeRut:          string | null  // RUT del rendidor → va en cod_ficha de la línea contrapartida
  employeeCostCenterId: string | null
  items:                DefontanaItem[]
}

export interface DefontanaSettings {
  contraAccount:   string        // cuenta Fondos por Rendir (con o sin puntos)
  voucherType:     string        // tipo comprobante de la rendición de gastos
  costCenter:      string | null // ID fallback a nivel org (ej: "EMPGESFINADM")
  providerAccount: string | null // cuenta Proveedor Nacional para facturas (con o sin puntos)
  /** Cuenta del banco. Sin ella los adelantos y devoluciones no se pueden asentar. */
  bankAccount?:         string | null
  /** Tipo de comprobante por movimiento. Nulo → cae en voucherType. */
  voucherTypeAdvance?:  string | null
  voucherTypeReturn?:   string | null
  voucherTypeTransfer?: string | null
  /** Tipo de documento de la línea de banco. */
  docTypeAdvance?:      string | null   // salida de dinero  → "CARGO"
  docTypeReturn?:       string | null   // entrada de dinero → "ABONO"
}

// ── Interfaces de salida ────────────────────────────────────────────────────

export interface DefontanaWarning {
  reportId:    string
  reportTitle: string
  unmappedCLP: number
  categories:  string[]
}

export interface DefontanaResult {
  lines:    DefontanaRow[]
  warnings: DefontanaWarning[]
}

// Fila interna (una por línea del asiento)
export interface DefontanaRow {
  numero:           string          // voucher id, ej: "RE-ABCD1234"
  tipo_comprobante: string
  moneda:           string          // "CLP"
  fecha:            number          // serial Excel
  linea:            number          // secuencial dentro del voucher
  cuenta:           string          // código sin puntos
  comentario:       string
  glosa:            string
  debe:             number | ''
  haber:            number | ''
  cod_ficha:        string          // RUT proveedor (solo facturas)
  tipo_doc:         string          // "FVAELECT" | "FVAELECEX" | ""
  nro_doc:          string          // número de documento
  centro_negocios:  string          // ID del centro (ej: "EMPGESFINADM")
  codigo_legal:     string          // igual a cod_ficha
  nombre:           string          // nombre proveedor o empleado
  /** Solo en la línea de banco: el CARGO/ABONO y su fecha van en las columnas de
   *  movimiento, no en las de documento. Las de documento quedan para las facturas. */
  tipo_movimiento?: string
  nro_movimiento?:  string
}

// ── Helpers ─────────────────────────────────────────────────────────────────

/** "4.5.1030.10.13" → "45103010013" */
function stripDots(code: string): string {
  return code.replace(/\./g, '')
}

/** YYYY-MM-DD → serial Excel (epoch: 1899-12-30) */
function toExcelSerial(dateStr: string): number {
  const [y, m, d] = dateStr.split('-').map(Number)
  const msDate  = Date.UTC(y, m - 1, d)
  const msEpoch = Date.UTC(1899, 11, 30)
  return Math.round((msDate - msEpoch) / 86_400_000)
}

/**
 * Prioridad de cuenta para un ítem:
 * 1. supplier_account_code (mapeo merchant específico)
 * 2. providerAccount (si es factura, el gasto ya está en Defontana — usar cuenta Proveedor Nacional)
 * 3. defontana_account_code (de la categoría)
 */
function resolveAccount(item: DefontanaItem, settings: DefontanaSettings): string | null {
  if (item.supplier_account_code) return item.supplier_account_code
  if (item.doc_type === 'factura' || item.doc_type === 'factura_exenta') {
    return settings.providerAccount ?? null
  }
  return item.defontana_account_code ?? null
}

/**
 * Prioridad de centro de costo:
 * 1. item.cost_center_id (override por ítem)
 * 2. settings.costCenter (fallback org)
 * El CC del responsable del fondo/rendición NO se usa como fallback
 * porque los ítems pueden pertenecer a distintos centros.
 */
function resolveCostCenter(
  item: DefontanaItem,
  _empCC: string | null,
  settings: DefontanaSettings,
): string {
  return item.cost_center_id ?? settings.costCenter ?? ''
}

function tipoDocDefontana(docType: string | null): string {
  if (docType === 'factura')         return 'FVAELECT'
  if (docType === 'factura_exenta')  return 'FVAELECEX'
  return ''
}

const VOUCHER_TYPE_DEFAULT     = 'EGRESO'
const DOC_TYPE_ADVANCE_DEFAULT = 'CARGO'
const DOC_TYPE_RETURN_DEFAULT  = 'ABONO'

/** YYYY-MM-DD → "DDMMYY". Es el N° de documento del movimiento bancario:
 *  el 24-02-2026 se registra como 240226. */
export function toBankDocNumber(dateStr: string): string {
  const [y, m, d] = dateStr.split('-')
  return `${d}${m}${y.slice(-2)}`
}

/** Ítems que no pudieron entrar al asiento, con su motivo. */
interface MovementIssue {
  label:  string
  amount: number
}

/**
 * Asiento de un movimiento bancario de fondos (adelanto o devolución).
 *
 *   Adelanto    Debe  Fondos por Rendir  / Haber Banco   (tipo doc CARGO)
 *   Devolución  Debe  Banco              / Haber Fondos por Rendir (tipo doc ABONO)
 *
 * Se emite un asiento por fecha, porque el N° de documento del banco ES la fecha.
 * La ficha del empleado va solo en Fondos por Rendir: es la cuenta que lleva el
 * saldo por persona. El banco no se imputa a centro de costo.
 */
function buildBankVoucher(
  report:     DefontanaReportInput,
  items:      DefontanaItem[],
  kind:       'advance' | 'return',
  settings:   DefontanaSettings,
  contraCode: string,
): { lines: DefontanaRow[]; issues: MovementIssue[] } {
  const out:    DefontanaRow[]  = []
  const issues: MovementIssue[] = []
  if (!items.length) return { lines: out, issues }

  const bankCode = settings.bankAccount ? stripDots(settings.bankAccount) : ''
  if (!bankCode) {
    issues.push({
      label:  kind === 'advance'
        ? 'Adelantos — falta configurar la cuenta banco'
        : 'Devoluciones — falta configurar la cuenta banco',
      amount: items.reduce((s, i) => s + i.amount_clp, 0),
    })
    return { lines: out, issues }
  }

  const tipo = (kind === 'advance' ? settings.voucherTypeAdvance : settings.voucherTypeReturn)
    || settings.voucherType || VOUCHER_TYPE_DEFAULT
  const docType = kind === 'advance'
    ? (settings.docTypeAdvance ?? DOC_TYPE_ADVANCE_DEFAULT)
    : (settings.docTypeReturn  ?? DOC_TYPE_RETURN_DEFAULT)
  const prefix = kind === 'advance' ? 'AD' : 'DE'

  // Un asiento por fecha de movimiento
  const byDate = new Map<string, DefontanaItem[]>()
  for (const item of items) {
    const d   = item.date ?? report.date
    const arr = byDate.get(d)
    if (arr) arr.push(item)
    else     byDate.set(d, [item])
  }

  for (const [date, group] of byDate) {
    const total = group.reduce((s, i) => s + i.amount_clp, 0)
    if (total <= 0) continue

    const docNo      = toBankDocNumber(date)
    const numero     = `${prefix}-${docNo}-${report.reportId.slice(-4).toUpperCase()}`
    const serial     = toExcelSerial(date)
    const comentario = kind === 'advance'
      ? `Adelanto de fondos: ${report.reportTitle}`
      : `Devolución de fondos: ${report.reportTitle}`
    const glosa = `${report.reportTitle} — ${report.employeeName}`

    out.push({
      numero,
      tipo_comprobante: tipo,
      moneda:           'CLP',
      fecha:            serial,
      linea:            1,
      cuenta:           contraCode,
      comentario,
      glosa,
      debe:             kind === 'advance' ? total : '',
      haber:            kind === 'advance' ? ''    : total,
      cod_ficha:        report.employeeRut ?? '',
      tipo_doc:         '',
      nro_doc:          '',
      centro_negocios:  '',   // cuenta de balance: se imputa por ficha, no por centro
      codigo_legal:     report.employeeRut ?? '',
      nombre:           report.employeeName,
    })

    out.push({
      numero,
      tipo_comprobante: tipo,
      moneda:           'CLP',
      fecha:            serial,
      linea:            2,
      cuenta:           bankCode,
      comentario,
      glosa,
      debe:             kind === 'advance' ? ''    : total,
      haber:            kind === 'advance' ? total : '',
      cod_ficha:        '',
      // El movimiento bancario va en las columnas de movimiento; las de
      // documento son para el folio de una factura
      tipo_doc:         '',
      nro_doc:          '',
      tipo_movimiento:  docType,
      nro_movimiento:   docNo,
      centro_negocios:  '',
      codigo_legal:     '',
      nombre:           report.employeeName,
    })
  }

  return { lines: out, issues }
}

/**
 * Traspaso de fondos entre responsables: la plata no sale de la empresa, solo
 * cambia de manos. Fondos por Rendir contra sí misma, con la ficha de cada uno.
 *
 *   Debe  Fondos por Rendir (ficha de quien RECIBE)
 *   Haber Fondos por Rendir (ficha de quien ENTREGA)
 *
 * Cada traspaso genera un ítem en el reporte de cada parte; el asiento se emite
 * solo desde el pagador para no contabilizarlo dos veces.
 */
function buildTransferVouchers(
  report:     DefontanaReportInput,
  items:      DefontanaItem[],
  settings:   DefontanaSettings,
  contraCode: string,
): { lines: DefontanaRow[]; issues: MovementIssue[] } {
  const out:    DefontanaRow[]  = []
  const issues: MovementIssue[] = []

  const tipo = settings.voucherTypeTransfer || settings.voucherType || VOUCHER_TYPE_DEFAULT

  for (const item of items) {
    // El lado receptor no emite asiento: ya lo emitió el pagador
    if (!item.is_transfer_payer) continue

    if (!item.counterpart_name && !item.counterpart_rut) {
      issues.push({
        label:  'Traspasos sin la contraparte vinculada',
        amount: item.amount_clp,
      })
      continue
    }

    const date       = item.date ?? report.date
    const numero     = `TR-${toBankDocNumber(date)}-${report.reportId.slice(-4).toUpperCase()}`
    const serial     = toExcelSerial(date)
    const comentario = `Traspaso de fondos: ${report.reportTitle}`
    const receptor   = item.counterpart_name ?? 'Destinatario'

    out.push({
      numero,
      tipo_comprobante: tipo,
      moneda:           'CLP',
      fecha:            serial,
      linea:            1,
      cuenta:           contraCode,
      comentario,
      glosa:            `Recibe ${receptor} — ${item.description || 'traspaso de fondos'}`,
      debe:             item.amount_clp,
      haber:            '',
      cod_ficha:        item.counterpart_rut ?? '',
      tipo_doc:         '',
      nro_doc:          '',
      centro_negocios:  '',   // cuenta de balance: se imputa por ficha, no por centro
      codigo_legal:     item.counterpart_rut ?? '',
      nombre:           receptor,
    })

    out.push({
      numero,
      tipo_comprobante: tipo,
      moneda:           'CLP',
      fecha:            serial,
      linea:            2,
      cuenta:           contraCode,
      comentario,
      glosa:            `Entrega ${report.employeeName} — ${item.description || 'traspaso de fondos'}`,
      debe:             '',
      haber:            item.amount_clp,
      cod_ficha:        report.employeeRut ?? '',
      tipo_doc:         '',
      nro_doc:          '',
      centro_negocios:  '',   // cuenta de balance: se imputa por ficha, no por centro
      codigo_legal:     report.employeeRut ?? '',
      nombre:           report.employeeName,
    })
  }

  return { lines: out, issues }
}

// ── Construcción de asientos ────────────────────────────────────────────────

export function buildDefontanaEntries(
  reports:  DefontanaReportInput[],
  settings: DefontanaSettings,
): DefontanaResult {
  const lines:    DefontanaRow[]    = []
  const warnings: DefontanaWarning[] = []

  const contraCode = stripDots(settings.contraAccount)

  for (const report of reports) {
    const voucher    = `RE-${report.reportId.slice(-8).toUpperCase()}`
    const serial     = toExcelSerial(report.date)
    const tipo       = settings.voucherType || VOUCHER_TYPE_DEFAULT
    const comentario = `Rendición de gastos: ${report.reportTitle}`
    let lineNum      = 1
    let totalDebe    = 0
    const unmapped:  DefontanaItem[] = []
    const issues:    MovementIssue[] = []

    // Cada movimiento arma su propio asiento. Sin item_type se asume gasto,
    // que es como se comportaba el export antes de separarlos.
    const expenseItems  = report.items.filter(i => !i.item_type || i.item_type === 'expense')
    const advanceItems  = report.items.filter(i => i.item_type === 'advance')
    const returnItems   = report.items.filter(i => i.item_type === 'return')
    const transferItems = report.items.filter(i => i.item_type === 'transfer')

    // Acumulador para boletas/tickets agrupados: key = "account|costCenter"
    const grouped = new Map<string, {
      total:     number
      glosa:     string
      cc:        string
      account:   string
    }>()

    for (const item of expenseItems) {
      const account = resolveAccount(item, settings)

      if (!account) {
        unmapped.push(item)
        continue
      }

      const cc          = resolveCostCenter(item, report.employeeCostCenterId, settings)
      const accountCode = stripDots(account)
      const isFactura   = item.doc_type === 'factura' || item.doc_type === 'factura_exenta'

      if (isFactura) {
        // Facturas: línea individual (no agrupar — preserva RUT, tipo doc, número).
        // La factura ya fue ingresada en Defontana con su CC y cuenta de gasto.
        // Aquí solo se rebaja la cuenta del proveedor nacional → sin CC, sin codigo_legal.
        if (!item.supplier_rut) {
          console.warn(`[Defontana] Factura sin RUT proveedor: ${item.description}`)
        }
        lines.push({
          numero:           voucher,
          tipo_comprobante: tipo,
          moneda:           'CLP',
          fecha:            serial,
          linea:            lineNum++,
          cuenta:           accountCode,
          comentario,
          glosa:            item.description || item.merchant || item.category_name || '',
          debe:             item.amount_clp,
          haber:            '',
          cod_ficha:        item.supplier_rut ?? '',
          tipo_doc:         tipoDocDefontana(item.doc_type),
          nro_doc:          item.doc_number ?? '',
          centro_negocios:  '',   // no va en facturas — ya está en Defontana al ingresar la factura
          codigo_legal:     '',   // no va en ítems de gasto/proveedor
          nombre:           item.merchant ?? report.employeeName,
        })
        totalDebe += item.amount_clp
      } else {
        // Boletas/tickets: acumular para agrupar
        const key = `${accountCode}|${cc}`
        const existing = grouped.get(key)
        if (existing) {
          existing.total += item.amount_clp
        } else {
          grouped.set(key, {
            total:   item.amount_clp,
            glosa:   item.category_name ?? item.description ?? '',
            cc,
            account: accountCode,
          })
        }
      }
    }

    // Emitir líneas Debe para boletas/tickets agrupados
    for (const g of grouped.values()) {
      lines.push({
        numero:           voucher,
        tipo_comprobante: tipo,
        moneda:           'CLP',
        fecha:            serial,
        linea:            lineNum++,
        cuenta:           g.account,
        comentario,
        glosa:            `${g.glosa} — ${report.employeeName}`,
        debe:             g.total,
        haber:            '',
        cod_ficha:        '',
        tipo_doc:         '',
        nro_doc:          '',
        centro_negocios:  g.cc,
        codigo_legal:     '',
        nombre:           report.employeeName,
      })
      totalDebe += g.total
    }

    // Línea Haber (contrapartida — Fondos por Rendir)
    // cod_ficha = RUT del rendidor (Defontana exige ficha del empleado en esta cuenta)
    if (totalDebe > 0 && contraCode) {
      lines.push({
        numero:           voucher,
        tipo_comprobante: tipo,
        moneda:           'CLP',
        fecha:            serial,
        linea:            lineNum++,
        cuenta:           contraCode,
        comentario,
        glosa:            `${report.reportTitle} — ${report.employeeName}`,
        debe:             '',
        haber:            totalDebe,
        cod_ficha:        report.employeeRut ?? '',
        tipo_doc:         '',
        nro_doc:          '',
        centro_negocios:  '',   // cuenta de balance: se imputa por ficha, no por centro
        codigo_legal:     report.employeeRut ?? '',
        nombre:           report.employeeName,
      })
    }

    // ── Asientos de los demás movimientos ──────────────────────────────────
    const advance  = buildBankVoucher(report, advanceItems, 'advance', settings, contraCode)
    const devol    = buildBankVoucher(report, returnItems,  'return',  settings, contraCode)
    const traspaso = buildTransferVouchers(report, transferItems, settings, contraCode)

    lines.push(...advance.lines, ...devol.lines, ...traspaso.lines)
    issues.push(...advance.issues, ...devol.issues, ...traspaso.issues)

    // Registrar lo que quedó fuera del asiento: categorías sin cuenta y
    // movimientos que no se pudieron armar
    const unmappedCLP = unmapped.reduce((s, i) => s + i.amount_clp, 0)
                      + issues.reduce((s, i) => s + i.amount, 0)
    const categories  = [
      ...new Set(unmapped.map(i => i.category_name ?? 'Sin categoría')),
      ...new Set(issues.map(i => i.label)),
    ]
    if (categories.length > 0) {
      warnings.push({ reportId: report.reportId, reportTitle: report.reportTitle, unmappedCLP, categories })
    }
  }

  return { lines, warnings }
}

// ── Serialización a Excel (36 columnas exactas del template Defontana) ──────

// 34 columnas nombradas + 2 vacías al final (coincide con importador-comprobantes.xlsx)
const HEADERS = [
  'Número', 'Tipo Comprobante', 'Moneda comprobante', 'Fecha', 'Línea',
  'Cuenta', 'Comentario', 'Glosa',
  'Debe moneda principal', 'Haber moneda principal',
  'Debe moneda secundaria', 'Haber moneda secundaria', 'Tasa cambio',
  'Código de Ficha', 'Cancelar Documento', 'Tipo de Documento',
  'Número de Documento', 'Serie de Documento', 'Vencimiento de Docto.',
  'Centro de Negocios', 'Clasificador 1', 'Clasificador 2',
  'Moneda referencia', 'Tasa referencia', 'Tipo de movimiento',
  'Número de movimiento', 'Codigo Legal', 'Nombre', 'Giro',
  'Dirección', 'Ciudad', 'Rubro',
  'actividad flujo efectivo', 'concepto flujo efectivo',
  '', '',
]

// ── Formato exigido por el importador ──────────────────────────────────────
// Verificado importando el comprobante de gastos del fondo 174.

/** El importador espera la letra "A" en la columna Número, no el id del voucher.
 *  El `numero` interno se conserva para agrupar las líneas de cada asiento. */
const SHEET_VOUCHER_NUMBER = 'A'

/** El importador nombra la moneda "PESO", no "CLP". */
const SHEET_CURRENCY = 'PESO'

/** El centro de negocios va con tres ceros al final: EMPGESINGING → EMPGESINGING000.
 *  Vacío se deja vacío: "000" solo no es un centro válido. */
export function toSheetCostCenter(costCenter: string): string {
  return costCenter ? `${costCenter}000` : ''
}

/** El importador exige el RUT con puntos y guión: 76247147-7 → 76.247.147-7.
 *  Los RUT de proveedor vienen del OCR sin puntos y los de empleado a veces con
 *  el dígito K en minúscula; esto normaliza ambos casos. Vacío queda vacío. */
export function toSheetRut(rut: string): string {
  return rut ? formatRutDisplay(rut) : ''
}

/** Cuántos asientos distintos contiene el resultado. Como la columna Número va
 *  fija en "A", el importador funde en un solo comprobante todo lo que venga en
 *  el archivo: conviene avisar antes de exportar más de uno. */
export function countVouchers(result: DefontanaResult): number {
  return new Set(result.lines.map(l => l.numero)).size
}

function rowToArray(l: DefontanaRow): (string | number | '')[] {
  return [
    SHEET_VOUCHER_NUMBER, //  1. Número
    l.tipo_comprobante, //  2. Tipo Comprobante
    SHEET_CURRENCY,     //  3. Moneda comprobante
    l.fecha,            //  4. Fecha (serial Excel)
    l.linea,            //  5. Línea
    l.cuenta,           //  6. Cuenta (sin puntos)
    l.comentario,       //  7. Comentario
    l.glosa,            //  8. Glosa
    l.debe,             //  9. Debe moneda principal
    l.haber,            // 10. Haber moneda principal
    '',                 // 11. Debe moneda secundaria
    '',                 // 12. Haber moneda secundaria
    '',                 // 13. Tasa cambio
    toSheetRut(l.cod_ficha), // 14. Código de Ficha (RUT con puntos y guión)
    '',                 // 15. Cancelar Documento
    l.tipo_doc,         // 16. Tipo de Documento
    l.nro_doc,          // 17. Número de Documento
    '',                 // 18. Serie de Documento
    l.fecha,            // 19. Vencimiento de Docto. (= Fecha)
    toSheetCostCenter(l.centro_negocios), // 20. Centro de Negocios (+ "000")
    '',                 // 21. Clasificador 1
    '',                 // 22. Clasificador 2
    '',                 // 23. Moneda referencia
    '',                 // 24. Tasa referencia
    l.tipo_movimiento ?? '', // 25. Tipo de movimiento (CARGO/ABONO del banco)
    l.nro_movimiento  ?? '', // 26. Número de movimiento (fecha DDMMYY)
    toSheetRut(l.codigo_legal), // 27. Codigo Legal (= Código de Ficha)
    l.nombre,           // 28. Nombre
    '',                 // 29. Giro
    '',                 // 30. Dirección
    '',                 // 31. Ciudad
    '',                 // 32. Rubro
    '',                 // 33. actividad flujo efectivo
    '',                 // 34. concepto flujo efectivo
    '',                 // 35. (vacía)
    '',                 // 36. (vacía)
  ]
}

/** Encabezados + una fila por línea, en el orden exacto del importador. */
export function buildSheetRows(lines: DefontanaRow[]): (string | number | '')[][] {
  return [HEADERS, ...lines.map(rowToArray)]
}

function buildWorkbook(result: DefontanaResult): XLSX.WorkBook {
  const wb = XLSX.utils.book_new()

  // ── Hoja 1: Asientos (formato exacto del importador Defontana) ─────────────
  const ws1 = XLSX.utils.aoa_to_sheet(buildSheetRows(result.lines))
  ws1['!cols'] = [
    { wch: 14 }, { wch: 16 }, { wch: 18 }, { wch: 10 }, { wch: 6 },
    { wch: 14 }, { wch: 35 }, { wch: 45 },
    { wch: 20 }, { wch: 20 }, { wch: 18 }, { wch: 18 }, { wch: 12 },
    { wch: 16 }, { wch: 16 }, { wch: 14 }, { wch: 18 }, { wch: 16 }, { wch: 20 },
    { wch: 16 }, { wch: 14 }, { wch: 14 },
    { wch: 16 }, { wch: 14 }, { wch: 16 }, { wch: 18 },
    { wch: 16 }, { wch: 25 }, { wch: 16 }, { wch: 20 }, { wch: 14 }, { wch: 10 },
    { wch: 22 }, { wch: 22 }, { wch: 6 }, { wch: 6 },
  ]
  XLSX.utils.book_append_sheet(wb, ws1, 'Importador')

  // ── Hoja 2: Advertencias (categorías sin cuenta Defontana) ─────────────────
  if (result.warnings.length > 0) {
    const warnHeaders = ['Rendición', 'Categoría sin cuenta Defontana', 'Monto CLP no mapeado', 'Acción requerida']
    const warnAoa: (string | number)[][] = [warnHeaders]
    for (const w of result.warnings) {
      for (const cat of w.categories) {
        warnAoa.push([
          w.reportTitle,
          cat,
          w.unmappedCLP,
          'Asignar código en Configuración → Defontana → Categorías',
        ])
      }
    }
    const ws2 = XLSX.utils.aoa_to_sheet(warnAoa)
    ws2['!cols'] = [{ wch: 35 }, { wch: 30 }, { wch: 22 }, { wch: 48 }]
    XLSX.utils.book_append_sheet(wb, ws2, 'Sin mapear ⚠')
  }

  return wb
}

export function exportDefontanaToExcel(
  result:   DefontanaResult,
  filename = 'asientos-defontana',
): void {
  XLSX.writeFile(buildWorkbook(result), `${filename}.xlsx`)
}

// ── Un comprobante por archivo ─────────────────────────────────────────────
// Defontana no distingue dos asientos dentro del mismo Excel: todo lo que entra
// en un archivo queda como un único comprobante. Cuando el export abarca varios,
// se entrega un ZIP con un archivo por asiento.

const VOUCHER_KIND: Record<string, string> = {
  RE: 'gastos',
  AD: 'adelanto',
  DE: 'devolucion',
  TR: 'traspaso',
}

/** Serial Excel → YYYY-MM-DD (inverso de toExcelSerial). */
function serialToDate(serial: number): string {
  const ms = Date.UTC(1899, 11, 30) + serial * 86_400_000
  return new Date(ms).toISOString().slice(0, 10)
}

export interface DefontanaVoucher {
  numero: string
  lines:  DefontanaRow[]
}

/** Agrupa las líneas por asiento, conservando el orden de aparición. */
export function splitByVoucher(result: DefontanaResult): DefontanaVoucher[] {
  const byVoucher = new Map<string, DefontanaRow[]>()
  for (const l of result.lines) {
    const arr = byVoucher.get(l.numero)
    if (arr) arr.push(l)
    else     byVoucher.set(l.numero, [l])
  }
  return [...byVoucher.entries()].map(([numero, lines]) => ({ numero, lines }))
}

/** Nombre del archivo de un comprobante dentro del ZIP. Lleva un correlativo
 *  al principio para que el orden de importación sea el del listado. */
export function voucherFileName(voucher: DefontanaVoucher, index: number): string {
  const first  = voucher.lines[0]
  const kind   = VOUCHER_KIND[voucher.numero.slice(0, 2)] ?? 'asiento'
  const fecha  = serialToDate(first.fecha)
  const titulo = (first.comentario.includes(':')
    ? first.comentario.slice(first.comentario.indexOf(':') + 1)
    : first.comentario)
    .replace(/[^\w\sáéíóúñÁÉÍÓÚÑ-]/g, '')
    .trim()
    .replace(/\s+/g, '-')
    .slice(0, 40)
  return `${String(index + 1).padStart(2, '0')}-${kind}-${fecha}${titulo ? `-${titulo}` : ''}.xlsx`
}

/**
 * Exporta el resultado en el formato que Defontana puede importar:
 * un solo asiento → un .xlsx; varios → un .zip con un .xlsx por asiento.
 * Devuelve cuántos comprobantes se generaron.
 */
export async function exportDefontanaAuto(
  result:   DefontanaResult,
  filename = 'asientos-defontana',
): Promise<number> {
  const vouchers = splitByVoucher(result)

  if (vouchers.length <= 1) {
    exportDefontanaToExcel(result, filename)
    return vouchers.length
  }

  const JSZip = (await import('jszip')).default
  const zip   = new JSZip()

  vouchers.forEach((voucher, i) => {
    // Las advertencias van una sola vez, en el archivo aparte de abajo
    const wb  = buildWorkbook({ lines: voucher.lines, warnings: [] })
    const buf = XLSX.write(wb, { bookType: 'xlsx', type: 'array' }) as ArrayBuffer
    zip.file(voucherFileName(voucher, i), buf)
  })

  if (result.warnings.length > 0) {
    const wb  = buildWorkbook({ lines: [], warnings: result.warnings })
    const buf = XLSX.write(wb, { bookType: 'xlsx', type: 'array' }) as ArrayBuffer
    zip.file('00-sin-mapear.xlsx', buf)
  }

  const content = await zip.generateAsync({ type: 'blob' })
  const link    = document.createElement('a')
  link.href     = URL.createObjectURL(content)
  link.download = `${filename}.zip`
  link.click()
  URL.revokeObjectURL(link.href)

  return vouchers.length
}
