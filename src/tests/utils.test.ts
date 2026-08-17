import { describe, it, expect } from 'vitest'
import { formatCLP, formatDate, getStatusLabel, getStatusColor, formatExchangeRate, formatDisplayTitle } from '@/lib/utils'

describe('formatDisplayTitle', () => {
  it('convierte un título en mayúsculas dejando los nombres capitalizados', () => {
    expect(formatDisplayTitle('RENDICION N°2 DANIEL MARTINEZ')).toBe('Rendicion N°2 Daniel Martinez')
  })

  it('deja los conectores en minúscula, salvo el primero', () => {
    expect(formatDisplayTitle('GASTOS DE VIAJE A SANTIAGO')).toBe('Gastos de Viaje a Santiago')
    expect(formatDisplayTitle('DE MAYO')).toBe('De Mayo')
  })

  it('respeta el texto si el autor ya mezcló mayúsculas y minúsculas', () => {
    expect(formatDisplayTitle('Rendición de mayo')).toBe('Rendición de mayo')
    expect(formatDisplayTitle('Gastos iPhone 15')).toBe('Gastos iPhone 15')
  })

  it('también arregla un título escrito todo en minúsculas', () => {
    expect(formatDisplayTitle('rendicion mayo')).toBe('Rendicion Mayo')
  })

  it('no toca los tokens que llevan dígitos', () => {
    expect(formatDisplayTitle('RENDICION N°12 DEL 2026')).toBe('Rendicion N°12 del 2026')
  })

  it('capitaliza ambas partes de un apellido con guion', () => {
    expect(formatDisplayTitle('ANA GARCIA-LOPEZ')).toBe('Ana Garcia-Lopez')
  })

  it('normaliza espacios de más', () => {
    expect(formatDisplayTitle('  RENDICION   N°1  ')).toBe('Rendicion N°1')
  })

  it('devuelve string vacío para nulo, indefinido o vacío', () => {
    expect(formatDisplayTitle(null)).toBe('')
    expect(formatDisplayTitle(undefined)).toBe('')
    expect(formatDisplayTitle('   ')).toBe('')
  })
})

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
