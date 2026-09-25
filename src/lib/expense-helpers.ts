export const RENDICION_CERRADA = 'Esta rendición ya fue enviada: no se pueden cambiar sus gastos'
export const RENDICION_AJENA   = 'Solo quien rinde puede cambiar los gastos de su rendición'
export const FONDO_CERRADO     = 'Solo se pueden cambiar los gastos de un fondo con los fondos enviados'
export const FONDO_AJENO       = 'Solo el empleado del fondo puede cambiar sus gastos'

type RendicionDelGasto = { status: string; submitter_id: string; is_historical_import?: boolean | null }
type FondoDelGasto     = { status: string; employee_id: string;  is_historical_import?: boolean | null }

/**
 * ¿Puede esta persona agregar o quitar gastos de esta rendición?
 *  - Solo en borrador: lo que el aprobador revisa, aprueba y se paga no puede
 *    cambiar debajo de él.
 *  - Solo quien rinde: ni el admin agrega o quita gastos de la rendición de
 *    otra persona (decisión de Daniel, 2026-09-25; el admin configura, no opera).
 *  - Excepción: el admin corrige cargas históricas, que nacen cerradas y a
 *    nombre de otro.
 * Mismo orden que la base (migración 033, sección 3b): primero el estado,
 * después el dueño. Esto es para responder con un mensaje claro antes de
 * llegar a ella.
 */
export function puedeCambiarGastos(
  reporte: RendicionDelGasto,
  userId: string,
  esAdmin = false,
): { ok: true } | { ok: false; motivo: string } {
  if (esAdmin && reporte.is_historical_import === true) return { ok: true }
  if (reporte.status !== 'draft') return { ok: false, motivo: RENDICION_CERRADA }
  if (reporte.submitter_id !== userId) return { ok: false, motivo: RENDICION_AJENA }
  return { ok: true }
}

/**
 * Lo mismo para un fondo de caja chica (migración 033, sección 3b):
 *  - Solo con los fondos enviados: antes no hay plata que rendir, y enviada la
 *    liquidación el aprobador ya está decidiendo sobre esos gastos.
 *  - Solo el empleado del fondo: ni el EFF, ni el aprobador, ni el admin.
 *  - Excepción: el admin corrige cargas históricas.
 */
export function puedeCambiarGastosFondo(
  fondo: FondoDelGasto,
  userId: string,
  esAdmin = false,
): { ok: true } | { ok: false; motivo: string } {
  if (esAdmin && fondo.is_historical_import === true) return { ok: true }
  if (fondo.status !== 'funds_sent') return { ok: false, motivo: FONDO_CERRADO }
  if (fondo.employee_id !== userId) return { ok: false, motivo: FONDO_AJENO }
  return { ok: true }
}

export type DocumentoDelGasto =
  | ({ tipo: 'rendicion' } & RendicionDelGasto)
  | ({ tipo: 'fondo' } & FondoDelGasto)

/**
 * ¿Puede esta persona subir o borrar un comprobante de este gasto? Sí, cuando
 * puede cambiar el gasto: el comprobante es parte de él. No tiene regla propia
 * a propósito — si cambia la de los gastos, los adjuntos la siguen solos. La
 * usan el servidor (que escribe con la llave de servicio: migración 035) y las
 * pantallas, para ofrecer la subida solo a quien la tiene permitida.
 */
export function puedeCambiarAdjuntos(doc: DocumentoDelGasto, userId: string, esAdmin = false) {
  return doc.tipo === 'rendicion'
    ? puedeCambiarGastos(doc, userId, esAdmin)
    : puedeCambiarGastosFondo(doc, userId, esAdmin)
}

/**
 * Copia del `patch` con solo los `campos` que vienen definidos (`null` sí pasa:
 * es «borrar el valor»). Una acción del servidor recibe lo que el navegador le
 * mande, no lo que dice su tipo: antes de escribir con ese objeto, se filtra.
 * Sin esto, un `report_id`, un `status` o una marca de Defontana colados en el
 * patch llegaban a la base.
 */
export function soloCampos<T extends object, K extends keyof T>(patch: T, campos: readonly K[]): Partial<Pick<T, K>> {
  const limpio: Partial<Pick<T, K>> = {}
  if (!patch || typeof patch !== 'object') return limpio
  for (const c of campos) {
    if (patch[c] !== undefined) limpio[c] = patch[c]
  }
  return limpio
}

export function calculateReportTotal(items: { amount_clp: number }[]): number {
  return items.reduce((sum, item) => sum + item.amount_clp, 0)
}

export function validateExpenseItem(item: {
  description: string
  amount: number
  date: string
}): string[] {
  const errors: string[] = []
  if (!item.description?.trim()) errors.push('La descripción es obligatoria')
  if (!item.amount || item.amount <= 0) errors.push('El monto debe ser mayor a 0')
  if (!item.date) errors.push('La fecha es obligatoria')
  return errors
}
