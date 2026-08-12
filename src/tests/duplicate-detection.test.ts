import { describe, it, expect } from 'vitest'
import { normalizeMerchant } from '@/lib/duplicate-detection'

describe('normalizeMerchant', () => {
  it('normaliza mayúsculas y tildes', () =>
    expect(normalizeMerchant('RESTAURANT EL RINCÓN')).toBe('restaurant el rincon'))
  it('elimina caracteres especiales', () =>
    expect(normalizeMerchant('COPEC S.A.')).toBe('copec sa'))
})
