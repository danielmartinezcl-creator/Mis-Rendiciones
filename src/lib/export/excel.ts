import * as XLSX from 'xlsx'
import { formatDate } from '@/lib/utils'

interface ReportItem {
  description:  string
  merchant:     string | null
  amount:       number
  currency:     string
  amount_clp:   number
  date:         string
  status:       string
  doc_type:     string | null
  doc_number:   string | null
  notes:        string | null
  expense_categories?: { name: string } | null
}

interface ReportForExport {
  title:        string
  total_amount: number
  status:       string
  items:        ReportItem[]
}

export function exportReportToExcel(report: ReportForExport) {
  const rows = report.items.map(item => ({
    Descripción:  item.description,
    Proveedor:    item.merchant ?? '',
    Fecha:        formatDate(item.date),
    Categoría:    item.expense_categories?.name ?? '',
    Monto:        item.amount,
    Moneda:       item.currency,
    'Monto CLP':  item.amount_clp,
    'Tipo doc':   item.doc_type ?? '',
    'N° doc':     item.doc_number ?? '',
    Estado:       item.status,
    Notas:        item.notes ?? '',
  }))

  const ws = XLSX.utils.json_to_sheet(rows)
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, 'Detalle')
  XLSX.writeFile(wb, `${report.title}.xlsx`)
}

interface ReportSummary {
  title:          string
  status:         string
  total_amount:   number
  approved_amount: number
  submitted_at:   string | null
  created_at:     string
}

export function exportReportsListToExcel(reports: ReportSummary[], filename = 'rendiciones') {
  const rows = reports.map(r => ({
    Título:           r.title,
    Estado:           r.status,
    'Total CLP':      r.total_amount,
    'Aprobado CLP':   r.approved_amount,
    'Fecha creación': formatDate(r.created_at.split('T')[0]),
    'Fecha envío':    r.submitted_at ? formatDate(r.submitted_at.split('T')[0]) : '',
  }))

  const ws = XLSX.utils.json_to_sheet(rows)
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, 'Rendiciones')
  XLSX.writeFile(wb, `${filename}.xlsx`)
}

// ─── Export admin (múltiples rendiciones con detalle) ────────────────────────

const STATUS_ES: Record<string, string> = {
  draft:              'Borrador',
  submitted:          'En revisión',
  pending_l2:         'Revisión N2',
  approved:           'Aprobada',
  partially_approved: 'Aprobada parcial',
  rejected:           'Rechazada',
  reimbursed:         'Reembolsada',
}

export interface AdminReportRow {
  id:               string
  title:            string
  submitter_name:   string
  department:       string | null
  status:           string
  total_amount:     number
  approved_amount:  number
  submitted_at:     string | null
  approved_at:      string | null
  reimbursed_at:    string | null
  payment_reference: string | null
  approvals?: { level: number; action: string; approver_name: string; notes: string | null; created_at: string }[]
  items?:     { description: string; amount_clp: number; status: string; rejection_reason: string | null; category_name: string | null }[]
}

export function exportAdminReportsToExcel(reports: AdminReportRow[], filename = 'rendiciones-admin') {
  const wb = XLSX.utils.book_new()

  // ── Hoja 1: Resumen ──────────────────────────────────────────
  const summaryRows = reports.map(r => ({
    Empleado:          r.submitter_name,
    Departamento:      r.department ?? '',
    Rendición:         r.title,
    Estado:            STATUS_ES[r.status] ?? r.status,
    'Total CLP':       r.total_amount,
    'Aprobado CLP':    r.approved_amount,
    'Fecha envío':     r.submitted_at ? formatDate(r.submitted_at.split('T')[0]) : '',
    'Fecha aprobación': r.approved_at ? formatDate(r.approved_at.split('T')[0]) : '',
    'Fecha reembolso': r.reimbursed_at ? formatDate(r.reimbursed_at.split('T')[0]) : '',
    'Ref. pago':       r.payment_reference ?? '',
    'Aprobadores N1/N2': (r.approvals ?? [])
      .map(a => `N${a.level} ${a.approver_name}: ${STATUS_ES[a.action] ?? a.action}${a.notes ? ` (${a.notes})` : ''}`)
      .join(' | '),
  }))

  const ws1 = XLSX.utils.json_to_sheet(summaryRows)
  ws1['!cols'] = [
    { wch: 22 }, { wch: 18 }, { wch: 30 }, { wch: 16 },
    { wch: 14 }, { wch: 14 }, { wch: 14 }, { wch: 16 },
    { wch: 14 }, { wch: 20 }, { wch: 40 },
  ]
  XLSX.utils.book_append_sheet(wb, ws1, 'Resumen')

  // ── Hoja 2: Ítems rechazados ─────────────────────────────────
  const rejectedRows: object[] = []
  for (const r of reports) {
    for (const item of r.items ?? []) {
      if (item.status === 'rejected') {
        rejectedRows.push({
          Empleado:        r.submitter_name,
          Rendición:       r.title,
          'Ítem':          item.description,
          'Categoría':     item.category_name ?? '',
          'Monto CLP':     item.amount_clp,
          'Motivo rechazo': item.rejection_reason ?? '',
          'Fecha envío':   r.submitted_at ? formatDate(r.submitted_at.split('T')[0]) : '',
        })
      }
    }
  }

  if (rejectedRows.length > 0) {
    const ws2 = XLSX.utils.json_to_sheet(rejectedRows)
    ws2['!cols'] = [{ wch: 22 }, { wch: 30 }, { wch: 30 }, { wch: 18 }, { wch: 12 }, { wch: 40 }, { wch: 14 }]
    XLSX.utils.book_append_sheet(wb, ws2, 'Rechazos')
  }

  XLSX.writeFile(wb, `${filename}.xlsx`)
}

// ─── Export Caja Chica ───────────────────────────────────────────────────────

const ITEM_STATUS_ES: Record<string, string> = {
  pending:  'Pendiente',
  approved: 'Aprobado',
  rejected: 'Rechazado',
}

export interface PettyCashItemRow {
  employee_name:    string
  fund_name:        string
  description:      string
  merchant:         string | null
  date:             string
  category_name:    string | null
  amount:           number
  currency:         string
  amount_clp:       number
  doc_type:         string | null
  doc_number:       string | null
  status:           string
  rejection_reason: string | null
  notes:            string | null
}

export function exportPettyCashToExcel(items: PettyCashItemRow[], filename = 'caja-chica-informe') {
  const wb = XLSX.utils.book_new()

  const rows = items.map(i => ({
    Empleado:          i.employee_name,
    Fondo:             i.fund_name,
    Descripción:       i.description,
    Proveedor:         i.merchant ?? '',
    Fecha:             formatDate(i.date),
    Categoría:         i.category_name ?? '',
    Monto:             i.amount,
    Moneda:            i.currency,
    'Monto CLP':       i.amount_clp,
    'Tipo doc':        i.doc_type ?? '',
    'N° doc':          i.doc_number ?? '',
    Estado:            ITEM_STATUS_ES[i.status] ?? i.status,
    'Motivo rechazo':  i.rejection_reason ?? '',
    Notas:             i.notes ?? '',
  }))

  const ws1 = XLSX.utils.json_to_sheet(rows)
  ws1['!cols'] = [
    { wch: 22 }, { wch: 22 }, { wch: 30 }, { wch: 20 },
    { wch: 12 }, { wch: 18 }, { wch: 12 }, { wch: 8 },
    { wch: 12 }, { wch: 12 }, { wch: 12 }, { wch: 12 },
    { wch: 30 }, { wch: 30 },
  ]
  XLSX.utils.book_append_sheet(wb, ws1, 'Detalle ítems')

  const byCat: Record<string, { total: number; count: number }> = {}
  for (const i of items) {
    const key = i.category_name ?? 'Sin categoría'
    if (!byCat[key]) byCat[key] = { total: 0, count: 0 }
    byCat[key].total += i.amount_clp
    byCat[key].count += 1
  }
  const catRows = Object.entries(byCat)
    .sort((a, b) => b[1].total - a[1].total)
    .map(([cat, d]) => ({ Categoría: cat, 'N° ítems': d.count, 'Total CLP': d.total }))

  if (catRows.length > 0) {
    const ws2 = XLSX.utils.json_to_sheet(catRows)
    ws2['!cols'] = [{ wch: 25 }, { wch: 10 }, { wch: 14 }]
    XLSX.utils.book_append_sheet(wb, ws2, 'Por categoría')
  }

  XLSX.writeFile(wb, `${filename}.xlsx`)
}

// ─── Export Informes Unificados ───────────────────────────────────────────────

import type { UnifiedReportItem, UnifiedKpis } from '@/lib/report-helpers'
import { MOVEMENT_LABELS } from '@/lib/report-helpers'

const UNIFIED_SOURCE_ES: Record<string, string> = {
  rendicion_new:   'Rendición',
  rendicion_hist:  'Rendición hist.',
  caja_chica_new:  'Caja Chica',
  caja_chica_hist: 'Caja Chica hist.',
}

const UNIFIED_ITEM_STATUS_ES: Record<string, string> = {
  pending:  'Pendiente',
  approved: 'Aprobado',
  rejected: 'Rechazado',
}

export function exportUnifiedToExcel(
  items:    UnifiedReportItem[],
  kpis:     UnifiedKpis,
  filename = 'informe-gastos'
) {
  const wb = XLSX.utils.book_new()

  // ── Hoja 1: Detalle ──────────────────────────────────────────
  const detailRows = items.map(i => ({
    Fuente:          UNIFIED_SOURCE_ES[i.source] ?? i.source,
    Movimiento:      MOVEMENT_LABELS[i.item_type] ?? i.item_type,
    Empleado:        i.employee_name,
    Departamento:    i.department ?? '',
    'Fondo/Rendición': i.parent_title,
    'Estado Fondo':  i.parent_status,
    Categoría:       i.category_name ?? '',
    Descripción:     i.description,
    Proveedor:       i.merchant ?? '',
    Fecha:           formatDate(i.date),
    Monto:           i.amount,
    Moneda:          i.currency,
    'Monto CLP':     i.amount_clp,
    'Tipo doc':      i.doc_type ?? '',
    'N° doc':        i.doc_number ?? '',
    'Estado ítem':   UNIFIED_ITEM_STATUS_ES[i.item_status] ?? i.item_status,
    'Motivo rechazo': i.rejection_reason ?? '',
    Notas:           i.notes ?? '',
  }))

  const ws1 = XLSX.utils.json_to_sheet(detailRows)
  ws1['!cols'] = [
    { wch: 16 }, { wch: 14 }, { wch: 22 }, { wch: 16 }, { wch: 28 }, { wch: 16 },
    { wch: 18 }, { wch: 30 }, { wch: 20 }, { wch: 12 }, { wch: 12 },
    { wch: 8  }, { wch: 12 }, { wch: 10 }, { wch: 10 }, { wch: 12 },
    { wch: 30 }, { wch: 30 },
  ]
  XLSX.utils.book_append_sheet(wb, ws1, 'Detalle')

  // ── Hoja 2: Por empleado ─────────────────────────────────────
  // Gastos y movimientos de fondos van en columnas separadas: sumarlos cuenta
  // dos veces la misma plata (el adelanto financia el gasto)
  const byEmp: Record<string, {
    name: string; dept: string | null; count: number
    gastosCLP: number; gastosAprobCLP: number; fondosCLP: number
  }> = {}
  for (const i of items) {
    if (!byEmp[i.employee_id]) {
      byEmp[i.employee_id] = { name: i.employee_name, dept: i.department, count: 0, gastosCLP: 0, gastosAprobCLP: 0, fondosCLP: 0 }
    }
    const e = byEmp[i.employee_id]
    e.count++
    if (i.item_type === 'expense') {
      e.gastosCLP += i.amount_clp
      if (i.item_status === 'approved') e.gastosAprobCLP += i.amount_clp
    } else {
      e.fondosCLP += i.amount_clp
    }
  }
  const empRows = Object.values(byEmp)
    .sort((a, b) => b.gastosCLP - a.gastosCLP)
    .map(e => ({
      Empleado:            e.name,
      Departamento:        e.dept ?? '',
      'N° ítems':          e.count,
      'Gastos CLP':        e.gastosCLP,
      'Gastos aprob. CLP': e.gastosAprobCLP,
      'Fondos CLP':        e.fondosCLP,
    }))
  const ws2 = XLSX.utils.json_to_sheet(empRows)
  ws2['!cols'] = [{ wch: 22 }, { wch: 16 }, { wch: 10 }, { wch: 14 }, { wch: 18 }, { wch: 14 }]
  XLSX.utils.book_append_sheet(wb, ws2, 'Por Empleado')

  // ── Hoja 3: Por categoría ────────────────────────────────────
  const byCat: Record<string, { count: number; totalCLP: number }> = {}
  for (const i of items) {
    const key = i.category_name ?? 'Sin categoría'
    if (!byCat[key]) byCat[key] = { count: 0, totalCLP: 0 }
    byCat[key].count++
    byCat[key].totalCLP += i.amount_clp
  }
  const catRows = Object.entries(byCat)
    .sort((a, b) => b[1].totalCLP - a[1].totalCLP)
    .map(([cat, d]) => ({ Categoría: cat, 'N° ítems': d.count, 'Total CLP': d.totalCLP }))
  const ws3 = XLSX.utils.json_to_sheet(catRows)
  ws3['!cols'] = [{ wch: 25 }, { wch: 10 }, { wch: 14 }]
  XLSX.utils.book_append_sheet(wb, ws3, 'Por Categoría')

  XLSX.writeFile(wb, `${filename}.xlsx`)
}
