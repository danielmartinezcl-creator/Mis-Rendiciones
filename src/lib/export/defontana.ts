// Lógica de construcción de asientos contables para importar en Defontana.
// Template: importador-comprobantes.xlsx (36 columnas, 34 nombradas + 2 vacías).
// Facturas → línea individual por ítem (preserva RUT/tipo doc/número para IVA).
// Boletas/tickets → agrupadas por (cuenta, centro de negocios).

import * as XLSX from 'xlsx'

// ── Interfaces de entrada ───────────────────────────────────────────────────

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
  contraAccount:   string        // cuenta Haber contrapartida (con o sin puntos)
  voucherType:     string        // tipo comprobante (ej: "EGRESO")
  costCenter:      string | null // ID fallback a nivel org (ej: "EMPGESFINADM")
  providerAccount: string | null // cuenta Proveedor Nacional para facturas (con o sin puntos)
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
 * 2. employeeCostCenterId (default del empleado)
 * 3. settings.costCenter (fallback org)
 */
function resolveCostCenter(
  item: DefontanaItem,
  empCC: string | null,
  settings: DefontanaSettings,
): string {
  return item.cost_center_id ?? empCC ?? settings.costCenter ?? ''
}

function tipoDocDefontana(docType: string | null): string {
  if (docType === 'factura')         return 'FVAELECT'
  if (docType === 'factura_exenta')  return 'FVAELECEX'
  return ''
}

const VOUCHER_TYPE_DEFAULT = 'EGRESO'

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

    // Acumulador para boletas/tickets agrupados: key = "account|costCenter"
    const grouped = new Map<string, {
      total:     number
      glosa:     string
      cc:        string
      account:   string
    }>()

    for (const item of report.items) {
      const account = resolveAccount(item, settings)

      if (!account) {
        unmapped.push(item)
        continue
      }

      const cc          = resolveCostCenter(item, report.employeeCostCenterId, settings)
      const accountCode = stripDots(account)
      const isFactura   = item.doc_type === 'factura' || item.doc_type === 'factura_exenta'

      if (isFactura) {
        // Facturas: línea individual (no agrupar — preserva RUT, tipo doc, número)
        if (!item.supplier_rut) {
          // Advertencia pero no bloqueo — continúa generando la línea
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
          centro_negocios:  cc,
          codigo_legal:     item.supplier_rut ?? '',
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
        centro_negocios:  report.employeeCostCenterId ?? settings.costCenter ?? '',
        codigo_legal:     report.employeeRut ?? '',
        nombre:           report.employeeName,
      })
    }

    // Registrar ítems sin mapeo de cuenta
    if (unmapped.length > 0) {
      const unmappedCLP = unmapped.reduce((s, i) => s + i.amount_clp, 0)
      const categories  = [...new Set(unmapped.map(i => i.category_name ?? 'Sin categoría'))]
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

function rowToArray(l: DefontanaRow): (string | number | '')[] {
  return [
    l.numero,           //  1. Número
    l.tipo_comprobante, //  2. Tipo Comprobante
    'CLP',              //  3. Moneda comprobante
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
    l.cod_ficha,        // 14. Código de Ficha (RUT proveedor)
    '',                 // 15. Cancelar Documento
    l.tipo_doc,         // 16. Tipo de Documento
    l.nro_doc,          // 17. Número de Documento
    '',                 // 18. Serie de Documento
    l.fecha,            // 19. Vencimiento de Docto. (= Fecha)
    l.centro_negocios,  // 20. Centro de Negocios
    '',                 // 21. Clasificador 1
    '',                 // 22. Clasificador 2
    '',                 // 23. Moneda referencia
    '',                 // 24. Tasa referencia
    '',                 // 25. Tipo de movimiento
    '',                 // 26. Número de movimiento
    l.codigo_legal,     // 27. Codigo Legal (= RUT proveedor)
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

export function exportDefontanaToExcel(
  result:   DefontanaResult,
  filename = 'asientos-defontana',
): void {
  const wb = XLSX.utils.book_new()

  // ── Hoja 1: Asientos (formato exacto del importador Defontana) ─────────────
  const aoa: (string | number | '')[][] = [HEADERS]
  for (const line of result.lines) {
    aoa.push(rowToArray(line))
  }
  const ws1 = XLSX.utils.aoa_to_sheet(aoa)
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

  XLSX.writeFile(wb, `${filename}.xlsx`)
}
