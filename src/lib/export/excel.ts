import * as XLSX from 'xlsx'
import { formatDate, formatCLP } from '@/lib/utils'

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
