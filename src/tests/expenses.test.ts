import { describe, it, expect } from 'vitest'
import { calculateReportTotal, validateExpenseItem } from '@/lib/expense-helpers'

describe('calculateReportTotal', () => {
  it('suma los amount_clp de todos los ítems', () => {
    const items = [
      { amount_clp: 10000 },
      { amount_clp: 25000 },
      { amount_clp: 5000 },
    ]
    expect(calculateReportTotal(items)).toBe(40000)
  })

  it('retorna 0 si no hay ítems', () => {
    expect(calculateReportTotal([])).toBe(0)
  })
})

describe('validateExpenseItem', () => {
  it('retorna error si description está vacío', () => {
    const errors = validateExpenseItem({ description: '', amount: 1000, date: '2026-06-01' })
    expect(errors).toContain('La descripción es obligatoria')
  })

  it('retorna error si amount es 0 o negativo', () => {
    const errors = validateExpenseItem({ description: 'Test', amount: 0, date: '2026-06-01' })
    expect(errors).toContain('El monto debe ser mayor a 0')
  })

  it('retorna error si date está vacío', () => {
    const errors = validateExpenseItem({ description: 'Test', amount: 1000, date: '' })
    expect(errors).toContain('La fecha es obligatoria')
  })

  it('retorna array vacío si todos los campos son válidos', () => {
    const errors = validateExpenseItem({ description: 'Almuerzo cliente', amount: 15000, date: '2026-06-01' })
    expect(errors).toHaveLength(0)
  })
})
