// Lógica de construcción de asientos contables para Defontana.
// Format-agnostic: devuelve líneas estructuradas para serializar en cualquier formato.
// Serialización a Excel/CSV se hace en admin.ts al recibir el template real.

import * as XLSX from 'xlsx'
import { formatDate } from '@/lib/utils'

// ── Tipos de entrada ────────────────────────────────────────────────────────

export interface DefontanaItem {
  description:          string
  amount_clp:           number
  category_name:        string | null
  defontana_account_code: string | null
  doc_type:             string | null
  doc_number:           string | null
}

export interface DefontanaReportInput {
  reportId:      string
  reportTitle:   string
  date:          string   // fecha de aprobación o reembolso (YYYY-MM-DD)
  employeeName:  string
  items:         DefontanaItem[]
}

export interface DefontanaSettings {
  contraAccount: string        // cuenta Haber (ej: "2-01-001")
  voucherType:   string        // tipo comprobante (ej: "Egreso")
  costCenter:    string | null // centro de costo por defecto
}

// ── Tipos de salida (líneas del asiento) ───────────────────────────────────

export interface DefontanaLine {
  fecha:           string
  nro_comprobante: string
  tipo:            string
  glosa:           string
  cuenta:          string
  debe:            number
  haber:           number
  centro_costo:    string
  auxiliar:        string
}

export interface DefontanaWarning {
  reportId:    string
  reportTitle: string
  unmappedCLP: number
  categories:  string[]
}

export interface DefontanaResult {
  lines:    DefontanaLine[]
  warnings: DefontanaWarning[]  // ítems sin cuenta Defontana asignada
}

// ── Construcción de asientos ────────────────────────────────────────────────

export function buildDefontanaEntries(
  reports: DefontanaReportInput[],
  settings: DefontanaSettings,
): DefontanaResult {
  const lines:    DefontanaLine[]    = []
  const warnings: DefontanaWarning[] = []

  for (const report of reports) {
    // Agrupar ítems por cuenta Defontana
    const byAccount = new Map<string, { total: number; categoryName: string }>()
    const unmapped:  DefontanaItem[] = []

    for (const item of report.items) {
      if (!item.defontana_account_code) {
        unmapped.push(item)
        continue
      }
      const existing = byAccount.get(item.defontana_account_code)
      if (existing) {
        existing.total += item.amount_clp
      } else {
        byAccount.set(item.defontana_account_code, {
          total:        item.amount_clp,
          categoryName: item.category_name ?? 'Sin categoría',
        })
      }
    }

    const mappedTotal = [...byAccount.values()].reduce((s, v) => s + v.total, 0)
    const voucher     = `R-${report.reportId.slice(-6).toUpperCase()}`

    // Líneas de Debe (una por cuenta de gasto)
    for (const [code, { total, categoryName }] of byAccount.entries()) {
      lines.push({
        fecha:           report.date,
        nro_comprobante: voucher,
        tipo:            settings.voucherType,
        glosa:           `${report.reportTitle} - ${categoryName}`,
        cuenta:          code,
        debe:            total,
        haber:           0,
        centro_costo:    settings.costCenter ?? '',
        auxiliar:        report.employeeName,
      })
    }

    // Línea de Haber (contrapartida única)
    if (mappedTotal > 0 && settings.contraAccount) {
      lines.push({
        fecha:           report.date,
        nro_comprobante: voucher,
        tipo:            settings.voucherType,
        glosa:           report.reportTitle,
        cuenta:          settings.contraAccount,
        debe:            0,
        haber:           mappedTotal,
        centro_costo:    settings.costCenter ?? '',
        auxiliar:        report.employeeName,
      })
    }

    // Registrar advertencias de ítems sin mapeo
    if (unmapped.length > 0) {
      const unmappedCLP = unmapped.reduce((s, i) => s + i.amount_clp, 0)
      const categories  = [...new Set(unmapped.map(i => i.category_name ?? 'Sin categoría'))]
      warnings.push({ reportId: report.reportId, reportTitle: report.reportTitle, unmappedCLP, categories })
    }
  }

  return { lines, warnings }
}

// ── Serialización a Excel (columnas estándar Defontana — se ajustarán con el template real) ──

export function exportDefontanaToExcel(
  result: DefontanaResult,
  filename = 'asientos-defontana',
) {
  const wb = XLSX.utils.book_new()

  // Hoja 1: Asientos
  const rows = result.lines.map(l => ({
    'Fecha':          formatDate(l.fecha),
    'N° Comprobante': l.nro_comprobante,
    'Tipo':           l.tipo,
    'Glosa':          l.glosa,
    'Cuenta':         l.cuenta,
    'Debe':           l.debe || '',
    'Haber':          l.haber || '',
    'Centro Costo':   l.centro_costo,
    'Auxiliar':       l.auxiliar,
  }))

  const ws1 = XLSX.utils.json_to_sheet(rows)
  ws1['!cols'] = [
    { wch: 12 }, { wch: 16 }, { wch: 10 }, { wch: 45 },
    { wch: 14 }, { wch: 14 }, { wch: 14 }, { wch: 16 }, { wch: 25 },
  ]
  XLSX.utils.book_append_sheet(wb, ws1, 'Asientos')

  // Hoja 2: Advertencias (ítems sin cuenta Defontana)
  if (result.warnings.length > 0) {
    const warnRows = result.warnings.flatMap(w =>
      w.categories.map(cat => ({
        'Rendición':         w.reportTitle,
        'Categoría sin cuenta': cat,
        'Monto CLP no mapeado': w.unmappedCLP,
        'Acción requerida':  'Asignar código Defontana en Configuración → Categorías',
      }))
    )
    const ws2 = XLSX.utils.json_to_sheet(warnRows)
    ws2['!cols'] = [{ wch: 35 }, { wch: 25 }, { wch: 22 }, { wch: 50 }]
    XLSX.utils.book_append_sheet(wb, ws2, 'Sin mapear ⚠')
  }

  XLSX.writeFile(wb, `${filename}.xlsx`)
}
