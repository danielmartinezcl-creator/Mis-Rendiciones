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
