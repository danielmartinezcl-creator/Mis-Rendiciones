import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'
import { formatDate, formatCLP } from '@/lib/utils'

interface ReportItem {
  description:  string
  merchant:     string | null
  amount_clp:   number
  date:         string
  status:       string
  expense_categories?: { name: string } | null
}

interface ReportForPDF {
  title:          string
  total_amount:   number
  approved_amount: number
  status:         string
  submitted_at:   string | null
  items:          ReportItem[]
}

const STATUS_ES: Record<string, string> = {
  pending:            'Pendiente',
  approved:           'Aprobado',
  rejected:           'Rechazado',
  draft:              'Borrador',
  submitted:          'En revisión',
  pending_l2:         'Revisión N2',
  partially_approved: 'Aprobada parcial',
  reimbursed:         'Reembolsada',
}

export function exportReportToPDF(report: ReportForPDF) {
  const doc = new jsPDF()

  // Encabezado
  doc.setFontSize(16)
  doc.setFont('helvetica', 'bold')
  doc.text(report.title, 14, 20)

  doc.setFontSize(10)
  doc.setFont('helvetica', 'normal')
  doc.setTextColor(100)
  if (report.submitted_at) {
    doc.text(`Enviada: ${formatDate(report.submitted_at.split('T')[0])}`, 14, 28)
  }
  doc.text(`Estado: ${report.status}`, 14, 34)
  doc.text(`Total: ${formatCLP(report.total_amount)}`, 14, 40)
  if (report.approved_amount > 0) {
    doc.text(`Aprobado: ${formatCLP(report.approved_amount)}`, 14, 46)
  }

  doc.setTextColor(0)

  // Tabla de ítems
  autoTable(doc, {
    startY: 55,
    head: [['Descripción', 'Proveedor', 'Categoría', 'Fecha', 'Monto CLP', 'Estado']],
    body: report.items.map(item => [
      item.description,
      item.merchant ?? '',
      item.expense_categories?.name ?? '',
      formatDate(item.date),
      formatCLP(item.amount_clp),
      STATUS_ES[item.status] ?? item.status,
    ]),
    styles: { fontSize: 9 },
    headStyles: { fillColor: [99, 102, 241] },
    alternateRowStyles: { fillColor: [248, 250, 252] },
  })

  doc.save(`${report.title}.pdf`)
}

// ─── Export admin (lista filtrada de rendiciones) ────────────────────────────

import type { AdminReportRow } from './excel'

interface AdminPDFFilters {
  dateFrom?:  string
  dateTo?:    string
  employee?:  string
  department?: string
  status?:    string[]
}

export function exportAdminReportsToPDF(reports: AdminReportRow[], filters: AdminPDFFilters = {}, filename = 'rendiciones-admin') {
  const doc = new jsPDF({ orientation: 'landscape' })

  // Encabezado
  doc.setFontSize(14)
  doc.setFont('helvetica', 'bold')
  doc.text('Reporte de Rendiciones', 14, 18)

  // Filtros activos
  const filterParts: string[] = []
  if (filters.dateFrom || filters.dateTo) {
    filterParts.push(`Período: ${filters.dateFrom ?? '—'} a ${filters.dateTo ?? '—'}`)
  }
  if (filters.employee)   filterParts.push(`Empleado: ${filters.employee}`)
  if (filters.department) filterParts.push(`Depto: ${filters.department}`)
  if (filters.status?.length) filterParts.push(`Estado: ${filters.status.map(s => STATUS_ES[s] ?? s).join(', ')}`)

  doc.setFontSize(8)
  doc.setFont('helvetica', 'normal')
  doc.setTextColor(100)
  if (filterParts.length > 0) doc.text(filterParts.join('   |   '), 14, 26)
  doc.text(`${reports.length} rendición${reports.length !== 1 ? 'es' : ''} · Exportado ${new Date().toLocaleDateString('es-CL')}`, 14, 32)
  doc.setTextColor(0)

  // KPIs rápidos
  const totalMonto   = reports.reduce((s, r) => s + r.total_amount, 0)
  const totalAprobado = reports.reduce((s, r) => s + r.approved_amount, 0)
  doc.setFontSize(9)
  doc.text(`Total: ${formatCLP(totalMonto)}   Aprobado: ${formatCLP(totalAprobado)}`, 14, 38)

  // Tabla principal
  autoTable(doc, {
    startY: 44,
    head: [['Empleado', 'Depto', 'Rendición', 'Estado', 'Total CLP', 'Aprobado CLP', 'Envío', 'Aprobación', 'Reembolso']],
    body: reports.map(r => [
      r.submitter_name,
      r.department ?? '',
      r.title,
      STATUS_ES[r.status] ?? r.status,
      formatCLP(r.total_amount),
      r.approved_amount > 0 ? formatCLP(r.approved_amount) : '',
      r.submitted_at  ? formatDate(r.submitted_at.split('T')[0])  : '',
      r.approved_at   ? formatDate(r.approved_at.split('T')[0])   : '',
      r.reimbursed_at ? formatDate(r.reimbursed_at.split('T')[0]) : '',
    ]),
    styles: { fontSize: 8 },
    headStyles: { fillColor: [99, 102, 241] },
    alternateRowStyles: { fillColor: [248, 250, 252] },
    columnStyles: {
      0: { cellWidth: 32 }, 1: { cellWidth: 24 }, 2: { cellWidth: 50 },
      3: { cellWidth: 26 }, 4: { cellWidth: 24 }, 5: { cellWidth: 24 },
    },
  })

  // Segunda página: motivos de rechazo (si los hay)
  const rejected: { emp: string; report: string; item: string; motivo: string }[] = []
  for (const r of reports) {
    for (const item of r.items ?? []) {
      if (item.status === 'rejected' && item.rejection_reason) {
        rejected.push({ emp: r.submitter_name, report: r.title, item: item.description, motivo: item.rejection_reason })
      }
    }
  }

  if (rejected.length > 0) {
    doc.addPage()
    doc.setFontSize(12)
    doc.setFont('helvetica', 'bold')
    doc.text('Ítems rechazados', 14, 18)

    autoTable(doc, {
      startY: 24,
      head: [['Empleado', 'Rendición', 'Ítem rechazado', 'Motivo']],
      body: rejected.map(r => [r.emp, r.report, r.item, r.motivo]),
      styles: { fontSize: 8 },
      headStyles: { fillColor: [239, 68, 68] },
      columnStyles: { 3: { cellWidth: 80 } },
    })
  }

  doc.save(`${filename}.pdf`)
}

// ─── Export Caja Chica ───────────────────────────────────────────────────────

import type { PettyCashItemRow } from './excel'

const ITEM_STATUS_ES: Record<string, string> = {
  pending:  'Pendiente',
  approved: 'Aprobado',
  rejected: 'Rechazado',
}

export function exportPettyCashToPDF(items: PettyCashItemRow[], title = 'Informe Caja Chica') {
  const doc = new jsPDF({ orientation: 'landscape' })

  doc.setFontSize(14)
  doc.setFont('helvetica', 'bold')
  doc.text(title, 14, 18)

  const totalCLP = items.reduce((s, i) => s + i.amount_clp, 0)
  doc.setFontSize(9)
  doc.setFont('helvetica', 'normal')
  doc.setTextColor(100)
  doc.text(`Total: ${formatCLP(totalCLP)}   ·   ${items.length} ítem${items.length !== 1 ? 's' : ''}   ·   Exportado ${new Date().toLocaleDateString('es-CL')}`, 14, 26)
  doc.setTextColor(0)

  autoTable(doc, {
    startY: 32,
    head: [['Empleado', 'Fondo', 'Fecha', 'Descripción', 'Categoría', 'Monto CLP', 'Estado']],
    body: items.map(i => [
      i.employee_name,
      i.fund_name,
      formatDate(i.date),
      i.description,
      i.category_name ?? '',
      formatCLP(i.amount_clp),
      ITEM_STATUS_ES[i.status] ?? i.status,
    ]),
    styles:              { fontSize: 8 },
    headStyles:          { fillColor: [13, 148, 136] },
    alternateRowStyles:  { fillColor: [240, 253, 250] },
    columnStyles: {
      0: { cellWidth: 32 }, 1: { cellWidth: 32 }, 2: { cellWidth: 22 },
      3: { cellWidth: 60 }, 4: { cellWidth: 28 }, 5: { cellWidth: 26 },
    },
  })

  // Segunda página: resumen por categoría
  const byCat: Record<string, number> = {}
  for (const i of items) {
    const key = i.category_name ?? 'Sin categoría'
    byCat[key] = (byCat[key] ?? 0) + i.amount_clp
  }
  const catEntries = Object.entries(byCat).sort((a, b) => b[1] - a[1])

  if (catEntries.length > 1) {
    doc.addPage()
    doc.setFontSize(12)
    doc.setFont('helvetica', 'bold')
    doc.text('Resumen por categoría', 14, 18)

    autoTable(doc, {
      startY: 24,
      head: [['Categoría', 'Total CLP']],
      body: catEntries.map(([cat, total]) => [cat, formatCLP(total)]),
      styles:     { fontSize: 9 },
      headStyles: { fillColor: [13, 148, 136] },
    })
  }

  doc.save(`${title.toLowerCase().replace(/\s+/g, '-')}.pdf`)
}
