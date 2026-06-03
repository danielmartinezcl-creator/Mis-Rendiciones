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
