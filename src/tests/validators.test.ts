import { describe, it, expect } from 'vitest'
import { validateRut, validateStringLength, validateAmount, validateDateRange } from '@/lib/validators'

describe('validateRut', () => {
  // 6.871.293-9 = Roberto Hagar Carrasco (dato real del proyecto)
  it('acepta RUT válido con guión', () => expect(validateRut('6.871.293-9')).toBe(true))
  it('acepta RUT sin puntos', ()    => expect(validateRut('6871293-9')).toBe(true))
  it('acepta RUT con K', ()         => expect(validateRut('15.381.452-K')).toBe(true))
  it('rechaza RUT con dígito incorrecto', () => expect(validateRut('6.871.293-0')).toBe(false))
  it('rechaza string vacío', ()     => expect(validateRut('')).toBe(false))
})

describe('validateStringLength', () => {
  it('acepta string dentro del límite', () => expect(validateStringLength('hola', 10)).toBe(true))
  it('rechaza string vacío',            () => expect(validateStringLength('', 10)).toBe(false))
  it('rechaza string sobre el límite',  () => expect(validateStringLength('a'.repeat(11), 10)).toBe(false))
})

describe('validateAmount', () => {
  it('acepta monto positivo',   () => expect(validateAmount(1000)).toBe(true))
  it('rechaza cero',            () => expect(validateAmount(0)).toBe(false))
  it('rechaza negativo',        () => expect(validateAmount(-100)).toBe(false))
})

describe('validateDateRange', () => {
  it('acepta rango válido',        () => expect(validateDateRange('2026-01-01', '2026-01-31')).toBe(true))
  it('rechaza rango invertido',    () => expect(validateDateRange('2026-01-31', '2026-01-01')).toBe(false))
  it('acepta misma fecha',         () => expect(validateDateRange('2026-01-01', '2026-01-01')).toBe(true))
})
