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
  'pending_bank_load',
  'pending_bank_auth',
  'reimbursed',
] as const

export type ReportStatus = typeof REPORT_STATUSES[number]

export const ITEM_STATUSES = ['pending', 'approved', 'rejected'] as const
export type ItemStatus = typeof ITEM_STATUSES[number]

export const STATUS_LABELS: Record<ReportStatus, string> = {
  draft:               'Borrador',
  submitted:           'Enviada',
  pending_l2:          'En revisión L2',
  approved:            'Aprobada',
  partially_approved:  'Parcialmente aprobada',
  rejected:            'Rechazada',
  pending_bank_load:   'Carga bancaria pendiente',
  pending_bank_auth:   'Autorización bancaria pendiente',
  reimbursed:          'Reembolsada',
}

export const STATUS_COLORS: Record<ReportStatus, string> = {
  draft:               'bg-slate-100 text-slate-500',
  submitted:           'bg-warning-100 text-warning-700',
  pending_l2:          'bg-flare-100 text-flare-700',
  approved:            'bg-success-100 text-success-700',
  partially_approved:  'bg-warning-100 text-warning-700',
  rejected:            'bg-danger-100 text-danger-600',
  pending_bank_load:   'bg-info-100 text-info-700',
  pending_bank_auth:   'bg-info-100 text-info-700',
  reimbursed:          'bg-info-100 text-info-700',
}

export const STATUS_DOT: Record<ReportStatus, string> = {
  draft:               'bg-slate-400',
  submitted:           'bg-warning-500',
  pending_l2:          'bg-flare-500',
  approved:            'bg-success-500',
  partially_approved:  'bg-warning-500',
  rejected:            'bg-danger-500',
  pending_bank_load:   'bg-info-500',
  pending_bank_auth:   'bg-info-500',
  reimbursed:          'bg-info-500',
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
  'pending_bank_load',
  'pending_bank_auth',
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
  pending_bank_load:            'Carga bancaria pendiente',
  pending_bank_auth:            'Autorización bancaria pendiente',
  funds_sent:                   'Fondos enviados',
  submitted:                    'Liquidación enviada',
  pending_liquidation_approval: 'Revisando liquidación',
  settled:                      'Liquidado',
  rejected:                     'Rechazado',
}

export const FUND_STATUS_COLORS: Record<FundStatusConst, string> = {
  draft:                        'bg-slate-100 text-slate-500',
  pending_approval:             'bg-warning-100 text-warning-700',
  approved:                     'bg-info-100 text-info-700',
  pending_bank_load:            'bg-info-100 text-info-700',
  pending_bank_auth:            'bg-info-100 text-info-700',
  funds_sent:                   'bg-flare-100 text-flare-700',
  submitted:                    'bg-warning-100 text-warning-700',
  pending_liquidation_approval: 'bg-flare-100 text-flare-700',
  settled:                      'bg-success-100 text-success-700',
  rejected:                     'bg-danger-100 text-danger-600',
}

export const FUND_AUDIT_LABELS: Record<string, string> = {
  created:                 'Fondo creado',
  submitted_for_approval:  'Enviado a autorización',
  approved:                'Fondo autorizado',
  rejected:                'Rechazado',
  bank_load_requested:     'Enviado a carga bancaria',
  bank_load_confirmed:     'Carga bancaria confirmada',
  bank_authorized:         'Transferencia autorizada',
  funds_sent:              'Fondos transferidos al empleado',
  liquidation_submitted:   'Liquidación enviada',
  liquidation_elevated:    'Liquidación elevada a aprobadores',
  liquidation_approved:    'Liquidación aprobada',
  settled:                 'Fondo liquidado',
}

// Pasos del flujo de Caja Chica (para timeline)
export const FUND_STEPS = [
  { key: 'draft',                        label: 'Solicitud creada',          short: 'Solicitud' },
  { key: 'pending_approval',             label: 'Esperando autorización',    short: 'Autorización' },
  { key: 'approved',                     label: 'Autorizado',                short: 'Autorizado' },
  { key: 'pending_bank_load',            label: 'Carga en banco',            short: 'Carga banco' },
  { key: 'pending_bank_auth',            label: 'Autorización bancaria',     short: 'Autor. banco' },
  { key: 'funds_sent',                   label: 'Fondos disponibles',        short: 'Fondos' },
  { key: 'submitted',                    label: 'Liquidación enviada',       short: 'Liquidación' },
  { key: 'pending_liquidation_approval', label: 'Revisando liquidación',     short: 'Revisión' },
  { key: 'settled',                      label: 'Fondo liquidado',           short: 'Liquidado' },
] as const

// Pasos del flujo de Rendiciones (para timeline)
export const REPORT_STEPS = [
  { key: 'draft',              label: 'Borrador creado',               short: 'Borrador' },
  { key: 'submitted',         label: 'Enviada a revisión',            short: 'Enviada' },
  { key: 'pending_l2',        label: 'Revisión nivel 2',              short: 'Revisión L2' },
  { key: 'approved',          label: 'Aprobada',                      short: 'Aprobada' },
  { key: 'pending_bank_load', label: 'Carga del reembolso en banco',  short: 'Carga banco' },
  { key: 'pending_bank_auth', label: 'Autorización bancaria',         short: 'Autor. banco' },
  { key: 'reimbursed',        label: 'Reembolsada',                   short: 'Reembolsada' },
] as const
