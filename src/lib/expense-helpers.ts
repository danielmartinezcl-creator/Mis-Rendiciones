export const RENDICION_CERRADA = 'Esta rendición ya fue enviada: no se pueden cambiar sus gastos'

/**
 * ¿Se pueden agregar o quitar gastos de esta rendición? Solo en borrador: lo
 * que el aprobador revisa, aprueba y se paga no puede cambiar debajo de él. El
 * admin además corrige cargas históricas, que nacen cerradas.
 * La base aplica la misma regla (migración 033, sección 3b); esto es para
 * responder con un mensaje claro antes de llegar a ella.
 */
export function gastosEditables(
  reporte: { status: string; is_historical_import?: boolean | null },
  esAdmin = false,
): boolean {
  if (reporte.status === 'draft') return true
  return esAdmin && reporte.is_historical_import === true
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
