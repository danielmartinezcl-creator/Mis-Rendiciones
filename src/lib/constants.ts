export const CURRENCIES = ['CLP', 'USD', 'EUR', 'ARS', 'BRL'] as const
export type Currency = typeof CURRENCIES[number]

export const CURRENCY_SYMBOLS: Record<Currency, string> = {
  CLP: '$',
  USD: 'US$',
  EUR: '€',
  ARS: 'AR$',
  BRL: 'R$',
}

export const DOC_TYPES = [
  { value: 'boleta',          label: 'Boleta' },
  { value: 'factura',         label: 'Factura' },
  { value: 'factura_exenta',  label: 'Factura Exenta' },
  { value: 'ticket',          label: 'Ticket' },
  { value: 'otro',            label: 'Otro' },
] as const

export type DocType = typeof DOC_TYPES[number]['value']

export const REPORT_STATUSES = [
  'draft',
  'submitted',
  'pending_l2',
  'approved',
  'partially_approved',
  'rejected',
  'reimbursed',
] as const

export type ReportStatus = typeof REPORT_STATUSES[number]

export const ITEM_STATUSES = ['pending', 'approved', 'rejected'] as const
export type ItemStatus = typeof ITEM_STATUSES[number]

export const STATUS_COLORS: Record<ReportStatus, string> = {
  draft:               'bg-slate-100 text-slate-500',
  submitted:           'bg-amber-100 text-amber-700',
  pending_l2:          'bg-violet-100 text-violet-700',
  approved:            'bg-emerald-100 text-emerald-700',
  partially_approved:  'bg-amber-100 text-amber-700',
  rejected:            'bg-rose-100 text-rose-600',
  reimbursed:          'bg-sky-100 text-sky-700',
}

export const STATUS_DOT: Record<ReportStatus, string> = {
  draft:               'bg-slate-400',
  submitted:           'bg-amber-500',
  pending_l2:          'bg-violet-500',
  approved:            'bg-emerald-500',
  partially_approved:  'bg-amber-500',
  rejected:            'bg-rose-500',
  reimbursed:          'bg-sky-500',
}

export const ITEM_STATUS_ACCENT: Record<ItemStatus, string> = {
  pending:  'item-accent-pending',    /* amarillo — definido en globals.css */
  approved: 'item-accent-approved',  /* esmeralda */
  rejected: 'item-accent-rejected',  /* rosa */
}

// ── Caja Chica ────────────────────────────────────────────────────────────────

export const FUND_STATUSES = [
  'draft',
  'pending_approval',
  'approved',
  'funds_sent',
  'submitted',
  'pending_liquidation_approval',
  'settled',
  'rejected',
] as const

export type FundStatusConst = typeof FUND_STATUSES[number]

export const FUND_STATUS_LABELS: Record<FundStatusConst, string> = {
  draft:                        'Borrador',
  pending_approval:             'Esperando autorización',
  approved:                     'Autorizado',
  funds_sent:                   'Fondos enviados',
  submitted:                    'Liquidación enviada',
  pending_liquidation_approval: 'Revisando liquidación',
  settled:                      'Liquidado',
  rejected:                     'Rechazado',
}

export const FUND_STATUS_COLORS: Record<FundStatusConst, string> = {
  draft:                        'bg-slate-100 text-slate-500',
  pending_approval:             'bg-amber-100 text-amber-700',
  approved:                     'bg-sky-100 text-sky-700',
  funds_sent:                   'bg-violet-100 text-violet-700',
  submitted:                    'bg-amber-100 text-amber-700',
  pending_liquidation_approval: 'bg-violet-100 text-violet-700',
  settled:                      'bg-emerald-100 text-emerald-700',
  rejected:                     'bg-rose-100 text-rose-600',
}

export const FUND_AUDIT_LABELS: Record<string, string> = {
  created:                 'Fondo creado',
  submitted_for_approval:  'Enviado a autorización',
  approved:                'Fondo autorizado',
  rejected:                'Rechazado',
  funds_sent:              'Fondos transferidos al empleado',
  liquidation_submitted:   'Liquidación enviada',
  liquidation_elevated:    'Liquidación elevada a aprobadores',
  liquidation_approved:    'Liquidación aprobada',
  settled:                 'Fondo liquidado',
}
