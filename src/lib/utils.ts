import { type ReportStatus, type Currency, CURRENCY_SYMBOLS, STATUS_COLORS } from './constants'

export function formatCLP(amount: number): string {
  const abs = Math.abs(Math.round(amount))
  const formatted = abs.toLocaleString('es-CL')
  const sign = amount < 0 ? '-' : ''
  return `${sign}$ ${formatted}`
}

export function formatAmount(amount: number, currency: Currency): string {
  const symbol = CURRENCY_SYMBOLS[currency]
  const abs = Math.abs(amount)
  const formatted = abs.toLocaleString('es-CL', {
    minimumFractionDigits: currency === 'CLP' ? 0 : 2,
    maximumFractionDigits: currency === 'CLP' ? 0 : 2,
  })
  return `${amount < 0 ? '-' : ''}${symbol} ${formatted}`
}

export function formatDate(isoDate: string): string {
  const [y, m, d] = isoDate.split('-')
  return `${d}/${m}/${y}`
}

export function formatExchangeRate(rate: number): string {
  return rate.toLocaleString('es-CL', { minimumFractionDigits: 4, maximumFractionDigits: 4 })
}

export function getStatusLabel(status: ReportStatus): string {
  const labels: Record<ReportStatus, string> = {
    draft:               'Borrador',
    submitted:           'En revisión',
    pending_l2:          'Revisión nivel 2',
    approved:            'Aprobada',
    partially_approved:  'Aprobada parcial',
    rejected:            'Rechazada',
    reimbursed:          'Reembolsada',
  }
  return labels[status] ?? status
}

export function getStatusColor(status: ReportStatus): string {
  return STATUS_COLORS[status] ?? 'bg-slate-100 text-slate-600'
}

export function cn(...classes: (string | undefined | false | null)[]): string {
  return classes.filter(Boolean).join(' ')
}
