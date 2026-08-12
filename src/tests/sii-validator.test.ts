import { describe, it, expect } from 'vitest'
import { validateRutFormat, formatRutDisplay } from '@/lib/sii-validator'

describe('validateRutFormat', () => {
  it('acepta RUTs válidos', () => {
    expect(validateRutFormat('76349816-6')).toBe(true)
    expect(validateRutFormat('15381452-K')).toBe(true)
  })
  it('rechaza RUTs con dígito incorrecto', () => {
    expect(validateRutFormat('12345678-9')).toBe(false)
  })
})

describe('formatRutDisplay', () => {
  it('formatea correctamente', () => {
    expect(formatRutDisplay('76349816-6')).toBe('76.349.816-6')
    expect(formatRutDisplay('15381452-K')).toBe('15.381.452-K')
  })
})
