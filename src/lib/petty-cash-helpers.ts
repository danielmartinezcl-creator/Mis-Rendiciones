import type { PettyCashItem, PettyCashTransfer } from '@/lib/supabase/types'
import { FUND_STEPS, type FundStatusConst } from '@/lib/constants'

/**
 * Saldo de un fondo y quién le debe a quién al liquidarlo.
 *
 * El empleado recibe el fondo ANTES de gastar. Si gastó menos, lo que sobra
 * está en sus manos y lo devuelve (`reimbursement_from_employee`, entra al
 * banco); si gastó más, puso de su bolsillo y la empresa le paga
 * (`refund_to_employee`, sale del banco). Hasta el 2026-09-24 estas dos
 * marcas estaban invertidas — ver petty-cash-helpers.test.ts.
 *
 * `pending` descuenta las transferencias de cierre ya registradas, para que
 * la misma diferencia no se pueda registrar dos veces.
 */
export function calculateFundBalance(
  approvedAmount: number | null,
  items: Pick<PettyCashItem, 'amount_clp' | 'status'>[],
  transfers: Pick<PettyCashTransfer, 'type' | 'amount'>[] = [],
) {
  const approved = approvedAmount ?? 0
  const spent = items
    .filter(i => i.status !== 'rejected')
    .reduce((sum, i) => sum + i.amount_clp, 0)
  /* Lo que sobra en manos del empleado: positivo lo debe él, negativo se le debe. */
  const difference = approved - spent

  const devuelto = transfers.filter(t => t.type === 'reimbursement_from_employee').reduce((s, t) => s + t.amount, 0)
  const pagado   = transfers.filter(t => t.type === 'refund_to_employee').reduce((s, t) => s + t.amount, 0)
  const pending  = difference - devuelto + pagado

  return {
    approved,
    spent,
    remaining: Math.max(0, difference),
    difference,
    pending,
    employeeOwes: pending > 0,
    companyOwes:  pending < 0,
    isBalanced:   pending === 0,
    settlementType: pending > 0 ? 'reimbursement_from_employee' as const
                  : pending < 0 ? 'refund_to_employee' as const
                  : null,
  }
}

export function canEmployeeAddItems(status: string) {
  return status === 'funds_sent'
}

export function canEmployeeSubmitLiquidation(status: string, items: PettyCashItem[]) {
  return status === 'funds_sent' && items.length > 0
}

export function canManagerElevate(status: string) {
  return status === 'submitted'
}

export function canApproverActOnFund(status: string) {
  return status === 'pending_approval'
}

export function canApproverActOnLiquidation(status: string) {
  return status === 'pending_liquidation_approval'
}

export function canManagerRecordDisbursement(status: string) {
  return status === 'approved'
}

export function canManagerRecordSettlement(status: string) {
  return status === 'settled'
}

export function formatPeriod(start: string, end: string): string {
  const fmt = (d: string) =>
    new Date(d + 'T00:00:00').toLocaleDateString('es-CL', { day: 'numeric', month: 'short', year: 'numeric' })
  return `${fmt(start)} – ${fmt(end)}`
}

// ── Tornasol · sección 7 ──────────────────────────────────────────────────────

/**
 * Los cuatro tramos de vida de un fondo.
 *
 * No son cuatro estilos de la misma tarjeta: son cuatro CONTENIDOS distintos
 * para el mismo lugar. Antes de que llegue la transferencia no hay medidor
 * porque no hay nada que medir, y esa ausencia es información.
 *
 * Diez estados entran, cuatro tramos salen. Si hace falta un quinto, cae el
 * test de `src/tests/petty-cash-helpers.test.ts` — a propósito.
 */
export const TRAMOS_FONDO = ['antes', 'con-dinero', 'cerrado', 'rechazado'] as const
export type TramoFondo = typeof TRAMOS_FONDO[number]

const TRAMO_POR_ESTADO: Record<FundStatusConst, TramoFondo> = {
  draft:                        'antes',
  pending_approval:             'antes',
  pending_approval_l2:          'antes',
  approved:                     'antes',   // autorizado, pero la plata no salió
  pending_bank_load:            'antes',
  pending_bank_auth:            'antes',
  funds_sent:                   'con-dinero',
  submitted:                    'con-dinero',
  pending_liquidation_approval: 'con-dinero',
  pending_liquidation_l2:       'con-dinero',
  settled:                      'cerrado',
  rejected:                     'rechazado',
}

export function tramoDelFondo(status: FundStatusConst): TramoFondo {
  return TRAMO_POR_ESTADO[status]
}

/**
 * Qué acción del registro de auditoría marca la LLEGADA a cada paso.
 *
 * `bank_authorized` no está: comparte transición con `funds_sent`, así que no
 * tiene un paso propio. Aparece igual en el historial completo de abajo.
 */
const AUDIT_QUE_ALCANZA: Record<string, string> = {
  draft:                        'created',
  pending_approval:             'submitted_for_approval',
  approved:                     'approved',
  pending_bank_load:            'bank_load_requested',
  pending_bank_auth:            'bank_load_confirmed',
  funds_sent:                   'funds_sent',
  submitted:                    'liquidation_submitted',
  pending_liquidation_approval: 'liquidation_elevated',
  settled:                      'liquidation_approved',
}

export type EstadoPaso = 'hecho' | 'actual' | 'pendiente'

export interface PasoRecorrido {
  key:    string
  label:  string
  estado: EstadoPaso
  fecha:  string | null
}

/**
 * Los dos niveles de aprobación se ven como UN paso del recorrido: la
 * etiqueta del estado ya dice «N2». Así FUND_STEPS no crece con un paso que
 * los fondos sin N2 nunca pisan.
 */
const PASO_VISIBLE: Partial<Record<FundStatusConst, FundStatusConst>> = {
  pending_approval_l2:    'pending_approval',
  pending_liquidation_l2: 'pending_liquidation_approval',
}

export function pasoVisibleDelFondo(status: FundStatusConst): FundStatusConst {
  return PASO_VISIBLE[status] ?? status
}

/**
 * Fusiona los pasos canónicos con las fechas reales.
 *
 * Hasta ahora esto vivía partido en dos componentes: `VerticalTimeline` tenía
 * los pasos sin fechas y `FundTimeline` las fechas sin los pasos que faltan.
 * El diseño de Tornasol pide las dos cosas juntas, con el futuro visible.
 *
 * Cuatro reglas, en este orden:
 *   0. Un paso posterior al vigente está pendiente y sin fecha.
 *   1. El paso del estado vigente es «actual», aunque ya tenga fecha.
 *   2. Un paso con fecha de auditoría está hecho.
 *   3. Un paso anterior al vigente está hecho aunque no haya fila que lo
 *      pruebe — las cargas históricas entran directo a un estado avanzado.
 */
export function construirRecorrido(
  status: FundStatusConst,
  audits: readonly { action: string; created_at: string }[],
): PasoRecorrido[] {
  const idx = FUND_STEPS.findIndex(s => s.key === pasoVisibleDelFondo(status))

  return FUND_STEPS.map((step, i) => {
    const accion = AUDIT_QUE_ALCANZA[step.key]
    // Un paso posterior al vigente es futuro aunque el historial ya tenga su
    // acción: en N2, la aprobación del N1 no vuelve «hecho» a «Autorizado».
    const futuro = idx >= 0 && i > idx
    const fecha  = futuro ? null : audits.find(a => a.action === accion)?.created_at ?? null

    const estado: EstadoPaso =
      i === idx        ? 'actual'    :
      futuro           ? 'pendiente' :
      fecha !== null   ? 'hecho'     :
      idx >= 0         ? 'hecho'     :
                         'pendiente'

    return { key: step.key, label: step.label, estado, fecha }
  })
}

/**
 * ¿Esta transferencia representa plata que YA se movió?
 *
 * La entrega al empleado (`disbursement`) se registra en `confirmBankLoad`, que
 * es el paso de CARGA: el operador ya ingresó la transferencia en el banco, pero
 * nadie la autorizó todavía y la plata no salió. La autorización es el paso
 * siguiente, y es ahí donde el fondo pasa a `funds_sent`.
 *
 * Que la fila se cree en la carga es correcto —el dato lo conoce quien carga, y
 * perderlo para volver a pedirlo sería peor—, pero **tratarla como un hecho
 * consumado no lo es**, y hasta el 2026-10-20 se hacían las dos cosas:
 *
 * - la pantalla del fondo la rotulaba «Fondos enviados al empleado» cuando no se
 *   habían enviado (Daniel lo reportó: «esto debe pasar una vez que se autoriza
 *   en el banco, 1 paso después»);
 * - el panel de Defontana la ofrecía para contabilizar, así que se podía emitir
 *   un asiento Debe Fondos por Rendir / Haber Banco por una plata que seguía en
 *   la cuenta de la empresa. Si la autorización se rechazaba o se demoraba, el
 *   asiento quedaba mal y había que revertirlo.
 *
 * Las devoluciones y los reembolsos no pasan por esto: se registran cuando ya
 * ocurrieron.
 */
export function transferenciaFirme(estadoFondo: string, tipo: string): boolean {
  return !(tipo === 'disbursement' && estadoFondo === 'pending_bank_auth')
}

/** Cómo se lee una transferencia en la pantalla del fondo. */
export function rotuloTransferencia(estadoFondo: string, tipo: string): string {
  if (!transferenciaFirme(estadoFondo, tipo)) {
    // Ni «enviados» ni nada: se dice en qué paso está, que es lo que falta.
    return 'Carga registrada · esperando autorización del banco'
  }
  if (tipo === 'disbursement')       return 'Fondos enviados al empleado'
  if (tipo === 'refund_to_employee') return 'Devolución al empleado'
  return 'Reembolso del empleado'
}

/**
 * Por qué NO se puede eliminar un fondo, o null si se puede.
 *
 * Una sola función para la acción y para la pantalla: si el botón se dibujara
 * con una regla y el servidor decidiera con otra, la app ofrecería algo que
 * después niega — que es exactamente lo que le pasó a Francisco Díaz el
 * 2026-10-21, pero al revés: veía el botón y la acción lo rechazaba.
 *
 * **Quien lo pidió puede eliminar su propio BORRADOR.** Es la misma puerta que
 * las rendiciones tienen desde la migración 025 (`deleteExpenseReport`) y que
 * en caja chica nunca se abrió: la acción exigía `role === 'admin'` y nada más.
 *
 * El beneficiario o el EFF, porque en caja chica no son siempre la misma
 * persona: un EFF pide el fondo a nombre de otro, y mientras sea borrador
 * cualquiera de los dos puede deshacerlo.
 *
 * **Enviado, ya no**: desde ahí hay gente esperándolo y un historial firmado
 * detrás. Para deshacerlo está el rechazo. El admin sí puede, en cualquier
 * estado: es quien limpia lo que quedó mal.
 */
export function motivoNoSeEliminaFondo(
  fondo: { status: string; employee_id: string; manager_id: string | null },
  yo:    { id: string; esAdmin: boolean },
): string | null {
  if (yo.esAdmin) return null
  if (fondo.employee_id !== yo.id && fondo.manager_id !== yo.id) {
    return 'Solo podés eliminar tus propios fondos'
  }
  if (fondo.status !== 'draft') {
    return 'Solo se pueden eliminar fondos en borrador. Este ya fue enviado'
  }
  return null
}
