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

/**
 * Familias visuales de estado — sección 6 de la spec de Tornasol.
 *
 * La app tiene 9 estados de rendición y 10 de fondo. Antes eran 19 entradas
 * repartidas en tres mapas de color. Ahora son CUATRO familias.
 *
 * El argumento de la spec: siete estados «en curso» con siete colores son
 * imposibles de memorizar. El color dice la CATEGORÍA —esto avanza, esto
 * requiere atención, esto terminó— y la etiqueta dice el estado exacto
 * («Carga bancaria pendiente», «Fondos enviados»). En la pantalla de detalle,
 * la línea de tiempo muestra además el paso concreto.
 *
 * Contrapartida asumida: en un listado, ocho estados de fondo comparten color.
 * Se acepta porque la etiqueta los distingue y porque un listado se escanea
 * buscando «¿qué necesita algo de mí?», no el paso exacto del trámite.
 */
export type FamiliaEstado = 'neutro' | 'en-curso' | 'atencion' | 'resuelto'

export const FAMILIA_CLASES: Record<FamiliaEstado, { pildora: string; punto: string }> = {
  neutro:     { pildora: 'bg-ink-100 text-ink-500',         punto: 'bg-ink-400' },
  'en-curso': { pildora: 'bg-flare-100 text-flare-700',     punto: 'bg-flare-500' },
  atencion:   { pildora: 'bg-warning-100 text-warning-700', punto: 'bg-warning-500' },
  resuelto:   { pildora: 'bg-success-100 text-success-700', punto: 'bg-success-500' },
}

export const FAMILIA_REPORTE: Record<ReportStatus, FamiliaEstado> = {
  draft:               'neutro',
  submitted:           'en-curso',
  pending_l2:          'en-curso',
  pending_bank_load:   'en-curso',
  pending_bank_auth:   'en-curso',
  approved:            'resuelto',
  reimbursed:          'resuelto',
  partially_approved:  'atencion',
  rejected:            'atencion',
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

export const FAMILIA_FONDO: Record<FundStatusConst, FamiliaEstado> = {
  draft:                        'neutro',
  pending_approval:             'en-curso',
  approved:                     'en-curso',   // autorizado, pero la plata no salió
  pending_bank_load:            'en-curso',
  pending_bank_auth:            'en-curso',
  funds_sent:                   'en-curso',
  submitted:                    'en-curso',
  pending_liquidation_approval: 'en-curso',
  settled:                      'resuelto',
  rejected:                     'atencion',
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
