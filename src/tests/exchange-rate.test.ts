import { describe, it, expect } from 'vitest'
import { buildExchangeRateUrl, parseExchangeRateResponse, convertToCLP } from '@/lib/exchange-rate-helpers'

describe('buildExchangeRateUrl', () => {
  it('construye URL con fecha y moneda correctas', () => {
    const url = buildExchangeRateUrl('USD', '2026-05-15')
    expect(url).toContain('USD')
    // La API recibe la fecha descompuesta: /history/{currency}/{year}/{month}/{day}
    expect(url).toContain('2026/05/15')
  })
})

describe('parseExchangeRateResponse', () => {
  it('extrae la tasa de CLP desde la respuesta de la API', () => {
    const mockResponse = {
      result: 'success',
      conversion_rates: { CLP: 950.5 }
    }
    const rate = parseExchangeRateResponse(mockResponse, 'USD')
    expect(rate).toBe(950.5)
  })

  it('retorna null si la moneda no está en la respuesta', () => {
    const mockResponse = {
      result: 'success',
      conversion_rates: {}
    }
    const rate = parseExchangeRateResponse(mockResponse, 'USD')
    expect(rate).toBeNull()
  })
})

describe('convertToCLP', () => {
  it('convierte monto usando el TC', () => {
    expect(convertToCLP(100, 950.5)).toBe(95050)
  })
  it('retorna el monto sin cambio si la moneda es CLP (TC=1)', () => {
    expect(convertToCLP(50000, 1)).toBe(50000)
  })
})
