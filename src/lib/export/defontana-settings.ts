// Lectura de la configuración Defontana de la organización.
// Vive en lib/ y no en actions/ porque es un helper puro: los archivos con
// 'use server' solo pueden exportar funciones async.

import type { DefontanaSettings } from './defontana'

/** Columnas de `organizations` que necesita el export. Usar siempre esta constante
 *  en los select, así agregar una opción nueva no obliga a tocar cada action. */
export const DEFONTANA_ORG_COLUMNS =
  'defontana_contra_account, defontana_voucher_type, defontana_cost_center, ' +
  'defontana_provider_account, defontana_bank_account, defontana_voucher_type_advance, ' +
  'defontana_voucher_type_return, defontana_voucher_type_transfer, ' +
  'defontana_doc_type_advance, defontana_doc_type_return'

export interface DefontanaOrgRow {
  defontana_contra_account?:        string | null
  defontana_voucher_type?:          string | null
  defontana_cost_center?:           string | null
  defontana_provider_account?:      string | null
  defontana_bank_account?:          string | null
  defontana_voucher_type_advance?:  string | null
  defontana_voucher_type_return?:   string | null
  defontana_voucher_type_transfer?: string | null
  defontana_doc_type_advance?:      string | null
  defontana_doc_type_return?:       string | null
}

/** Fila de `organizations` → settings del generador de asientos. */
export function mapDefontanaSettings(org: DefontanaOrgRow | null | undefined): DefontanaSettings {
  return {
    contraAccount:       org?.defontana_contra_account   ?? '',
    voucherType:         org?.defontana_voucher_type     ?? 'Egreso',
    costCenter:          org?.defontana_cost_center      ?? null,
    providerAccount:     org?.defontana_provider_account ?? null,
    bankAccount:         org?.defontana_bank_account          ?? null,
    voucherTypeAdvance:  org?.defontana_voucher_type_advance  ?? null,
    voucherTypeReturn:   org?.defontana_voucher_type_return   ?? null,
    voucherTypeTransfer: org?.defontana_voucher_type_transfer ?? null,
    docTypeAdvance:      org?.defontana_doc_type_advance      ?? null,
    docTypeReturn:       org?.defontana_doc_type_return       ?? null,
  }
}
