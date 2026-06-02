import { describe, it, expect } from 'vitest'
import { formatCLP, formatDate, getStatusLabel, getStatusColor, formatExchangeRate } from '@/lib/utils'

describe('formatCLP', () => {
  it('formatea número positivo con símbolo y separador de miles', () => {
    expect(formatCLP(1234567)).toBe('$ 1.234.567')
  })
  it('formatea cero como $ 0', () => {
    expect(formatCLP(0)).toBe('$ 0')
  })
  it('formatea negativo con signo', () => {
    expect(formatCLP(-50000)).toBe('-$ 50.000')
  })
})

describe('formatDate', () => {
  it('formatea YYYY-MM-DD a DD/MM/YYYY', () => {
    expect(formatDate('2026-06-01')).toBe('01/06/2026')
  })
})

describe('getStatusLabel', () => {
  it('retorna etiquetas en español', () => {
    expect(getStatusLabel('draft')).toBe('Borrador')
    expect(getStatusLabel('submitted')).toBe('En revisión')
    expect(getStatusLabel('approved')).toBe('Aprobada')
    expect(getStatusLabel('partially_approved')).toBe('Aprobada parcial')
    expect(getStatusLabel('rejected')).toBe('Rechazada')
    expect(getStatusLabel('reimbursed')).toBe('Reembolsada')
  })
})

describe('formatExchangeRate', () => {
  it('formatea el TC con 4 decimales', () => {
    expect(formatExchangeRate(0.5694)).toBe('0,5694')
  })
})
