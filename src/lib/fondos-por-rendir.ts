/**
 * La cuenta FONDOS POR RENDIR: saldo total y composición por empleado.
 *
 * Pedido de Daniel (2026-10-22) para la contabilidad. `/informes` NO puede
 * armarlo, y no es que esté escondido: su hoja «Por Empleado» suma adelantos,
 * devoluciones y traspasos con el MISMO signo —así que «Fondos CLP» no es un
 * saldo sino una suma bruta—, no resuelve la dirección de un traspaso, y sobre
 * todo `getUnifiedReportItems` nunca lee `petty_cash_transfers`: la entrega de
 * un fondo vivo, que es un movimiento puro de esta cuenta, le es invisible.
 *
 * EL SIGNO (Daniel, 2026-10-22, corrigiéndome):
 *
 *   DEBE  (+) = la empresa le entregó plata    → saldo DEUDOR
 *   HABER (−) = el empleado rindió o devolvió  → saldo ACREEDOR
 *
 * Un saldo acreedor **sigue siendo Fondos por Rendir**: la cuenta se define por
 * el ORIGEN de la transacción, no por el signo. Yo había propuesto
 * reclasificarlo como cuenta por pagar; es lectura de manual y acá no va.
 */

/** Un movimiento de la cuenta, ya con su signo resuelto. */
export interface MovimientoFxR {
  personaId:     string
  fecha:         string
  documento:     string
  /** `item_type` de un ítem, o el tipo de una transferencia de fondo vivo */
  tipo:          string
  glosa:         string
  /** Positivo = debe, negativo = haber */
  monto:         number
  /** Ya tiene comprobante en Defontana */
  contabilizado: boolean
}

export const DEBE  = 1
export const HABER = -1

/** Qué le hace cada tipo de ítem a la cuenta. `transfer` depende de la dirección. */
export const SENTIDO_ITEM: Record<string, number> = {
  advance: DEBE, expense: HABER, return: HABER,
}

/** Y cada transferencia de un fondo vivo, por el SENTIDO DEL DINERO, no por su nombre. */
export const SENTIDO_TRANSFERENCIA: Record<string, number> = {
  disbursement: DEBE, refund_to_employee: DEBE, reimbursement_from_employee: HABER,
}

/**
 * ¿Este movimiento afecta la cuenta?
 *
 * Un gasto RECHAZADO no se contabiliza, así que no abona (Daniel, 2026-10-23):
 * si el gasto se repudia, lo que la persona debe no baja.
 *
 * **Solo se miran los GASTOS.** Un adelanto, una devolución y un traspaso no los
 * aprueba nadie —los 8 traspasos de producción están en el `pending` por omisión
 * de la columna—, así que filtrarlos por estado dejaría fuera $222.150 de plata
 * que se movió con total certeza. Es la misma trampa que ya documentó
 * `computeApprovedAmount`.
 *
 * Un `pending` SÍ cuenta: el gasto ocurrió y espera revisión. Lo que no cuenta
 * es lo rechazado, que es una decisión tomada.
 */
export function afectaLaCuenta(tipo: string, estado: string | null | undefined): boolean {
  return tipo !== 'expense' || estado !== 'rejected'
}

/**
 * El sentido de un ítem de rendición. `transfer` lo decide quién paga.
 *
 * La dirección NO es una columna: sale de `fund_transfers.payer_report_id`,
 * igual que `is_transfer_payer` en el export a Defontana. Un traspaso deja un
 * ítem en los documentos de las DOS partes con el mismo monto positivo.
 */
export function sentidoDeItem(tipo: string, esElPagador: boolean): number {
  if (tipo === 'transfer') return esElPagador ? HABER : DEBE
  return SENTIDO_ITEM[tipo] ?? 0
}

export interface SaldoEmpleado {
  personaId:    string
  movimientos:  number
  /** Solo lo que ya tiene comprobante: es la columna que el contador cuadra */
  defontana:    number
  /** Todo lo registrado, contabilizado o no: cuánta plata hay de verdad en mano */
  app:          number
  /** Lo que falta contabilizar (app − defontana) */
  diferencia:   number
  // Composición de lo CONTABILIZADO
  adelantos:    number
  recibidos:    number
  gastos:       number
  devoluciones: number
  pagados:      number
}

const esEntrega   = (t: string) => t === 'advance' || t === 'disbursement' || t === 'refund_to_employee'
const esDevuelto  = (t: string) => t === 'return'  || t === 'reimbursement_from_employee'

/**
 * Agrupa por persona. **Devuelve también a quienes quedaron en cero** (Daniel,
 * 2026-10-23): para cuadrar contra el mayor hace falta ver que alguien pasó por
 * la cuenta y cerró. Una fila ausente y una en cero dicen cosas distintas.
 */
export function saldosPorEmpleado(movs: MovimientoFxR[]): SaldoEmpleado[] {
  const por = new Map<string, SaldoEmpleado>()

  for (const m of movs) {
    let s = por.get(m.personaId)
    if (!s) {
      s = {
        personaId: m.personaId, movimientos: 0, defontana: 0, app: 0, diferencia: 0,
        adelantos: 0, recibidos: 0, gastos: 0, devoluciones: 0, pagados: 0,
      }
      por.set(m.personaId, s)
    }
    s.movimientos++
    s.app += m.monto
    if (!m.contabilizado) continue

    s.defontana += m.monto
    if (esEntrega(m.tipo))        s.adelantos += m.monto
    else if (m.tipo === 'transfer') { if (m.monto > 0) s.recibidos += m.monto; else s.pagados += m.monto }
    else if (esDevuelto(m.tipo))  s.devoluciones += m.monto
    else                          s.gastos += m.monto
  }

  for (const s of por.values()) s.diferencia = s.app - s.defontana
  return [...por.values()]
}

export interface MesFxR {
  mes:        string
  debe:       number
  haber:      number
  variacion:  number
  /** Acumulado del período mostrado. NO incluye el saldo inicial anterior a la app. */
  acumulado:  number
}

/** La serie mensual de lo contabilizado (`soloContabilizado`) o de todo. */
export function porMes(movs: MovimientoFxR[], soloContabilizado: boolean): MesFxR[] {
  const por = new Map<string, { debe: number; haber: number }>()
  for (const m of movs) {
    if (soloContabilizado && !m.contabilizado) continue
    const mes = (m.fecha ?? '').slice(0, 7)
    if (!mes) continue
    const x = por.get(mes) ?? { debe: 0, haber: 0 }
    if (m.monto > 0) x.debe += m.monto; else x.haber += m.monto
    por.set(mes, x)
  }
  let acumulado = 0
  return [...por.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([mes, x]) => {
      acumulado += x.debe + x.haber
      return { mes, debe: x.debe, haber: x.haber, variacion: x.debe + x.haber, acumulado }
    })
}

export type Condicion = 'deudor' | 'acreedor' | 'cuadrado'

export function condicion(saldo: number): Condicion {
  if (saldo > 0) return 'deudor'
  if (saldo < 0) return 'acreedor'
  return 'cuadrado'
}

export const ETIQUETA_MOVIMIENTO: Record<string, string> = {
  advance:  'Adelanto / reembolso al empleado',
  expense:  'Gasto rendido',
  return:   'Devolución del empleado',
  transfer: 'Traspaso entre cajas',
  disbursement: 'Entrega del fondo',
  refund_to_employee: 'Devolución al empleado',
  reimbursement_from_employee: 'Reembolso a la empresa',
}
