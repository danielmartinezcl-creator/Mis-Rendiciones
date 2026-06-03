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
  pending:  'Pendiente',
  approved: 'Aprobado',
  rejected: 'Rechazado',
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
