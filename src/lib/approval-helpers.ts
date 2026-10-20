import type { ReportStatus } from '@/lib/constants'

export function computeReportStatus(items: { status: string }[]): ReportStatus {
  if (items.length === 0) return 'submitted'
  const allApproved = items.every(i => i.status === 'approved')
  const allRejected  = items.every(i => i.status === 'rejected')
  if (allApproved) return 'approved'
  if (allRejected)  return 'rejected'
  return 'partially_approved'
}

/**
 * Lo que falta pagarle a la persona. Positivo: la empresa le debe. Negativo:
 * recibió de más y tiene que devolver.
 *
 * El signo de cada movimiento sigue a quién tiene la plata:
 *
 * | | | |
 * |---|---|---|
 * | `expense`  | gastó de lo suyo o de lo adelantado | **suma** |
 * | `advance`  | la empresa ya le entregó plata     | **resta** |
 * | `return`   | la devolvió, ya no la tiene        | **suma** |
 * | `transfer` | movimiento interno entre fondos    | se ignora |
 *
 * **La devolución sumaba, y es el error que esto corrige** (2026-10-20). El comentario
 * que lo justificaba decía que una devolución «reduce lo que la empresa debe
 * reembolsar»: reduce lo que debe LA PERSONA, que en el signo de esta función es lo
 * contrario. Con adelanto 100.000, gastos 60.000 y devolución 40.000 —un caso
 * saldado— devolvía −80.000, como si siguiera debiendo el doble de lo que recibió.
 *
 * No era cosmético. `estadoTrasDecisionReporte` manda la rendición a `pending_bank_load`
 * solo si este monto es **mayor que cero**, así que un monto hundido de más deja la
 * rendición en `approved` y **nadie le paga**. Medido sobre las 155 rendiciones de
 * producción: 24 tienen devoluciones y las 24 cambian de monto; **9 cruzan el cero y
 * las 9 pasan a estar por pagar**, por $2.895.638 en total.
 *
 * No se ejercitaba porque las 155 son cargas históricas, cuyo monto lo calcula
 * `totalesDeCargaHistorica` y no esta función. Las alcanza igual por un camino:
 * `revertReimbursement` recalcula `approved_amount` con esto.
 *
 * El mismo signo, medido aparte y por otra vía, está en `lib/saldo-rendicion.ts`: de
 * las 24 filas con devoluciones, restándola quedan 21 en saldo cero y sumándola, 0.
 * Las dos funciones conviven: esta dice cuánto falta pagar de los ítems, y aquella
 * además mira `reimbursed_amount` y los traspasos.
 */
export function computeApprovedAmount(
  items: { status: string; amount_clp: number; item_type?: string }[]
): number {
  return items
    .filter(i => i.status === 'approved')
    .reduce((sum, i) => {
      const type = i.item_type ?? 'expense'
      if (type === 'advance')  return sum - i.amount_clp
      if (type === 'transfer') return sum
      // `return` y `expense` suman: ver la tabla de arriba.
      return sum + i.amount_clp
    }, 0)
}
