import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@anthropic-ai/sdk', () => ({
  default: vi.fn().mockImplementation(() => ({
    messages: {
      create: vi.fn()
    }
  }))
}))

import { parseOcrResponse, buildOcrPrompt } from '@/lib/ocr-helpers'

describe('parseOcrResponse', () => {
  it('parsea respuesta JSON correcta de Claude', () => {
    const raw = JSON.stringify({
      amount: 15000,
      currency: 'CLP',
      date: '2026-05-15',
      merchant: 'Restaurante El Quijote',
      doc_type: 'boleta',
      doc_number: '000123',
      confidence: 0.95
    })

    const result = parseOcrResponse(raw)
    expect(result?.amount).toBe(15000)
    expect(result?.currency).toBe('CLP')
    expect(result?.date).toBe('2026-05-15')
    expect(result?.merchant).toBe('Restaurante El Quijote')
    expect(result?.confidence).toBe(0.95)
  })

  it('retorna null si la respuesta no es JSON válido', () => {
    const result = parseOcrResponse('esto no es json')
    expect(result).toBeNull()
  })

  it('retorna null si confidence < 0.7', () => {
    const raw = JSON.stringify({ amount: 1000, confidence: 0.5 })
    const result = parseOcrResponse(raw)
    expect(result).toBeNull()
  })

  it('normaliza fechas en formato DD/MM/YYYY a YYYY-MM-DD', () => {
    const raw = JSON.stringify({
      amount: 5000,
      currency: 'CLP',
      date: '15/05/2026',
      confidence: 0.9
    })
    const result = parseOcrResponse(raw)
    expect(result?.date).toBe('2026-05-15')
  })
})

describe('buildOcrPrompt', () => {
  it('construye el sistema prompt con instrucciones en español', () => {
    const prompt = buildOcrPrompt()
    expect(prompt).toContain('boleta')
    expect(prompt).toContain('JSON')
    expect(prompt).toContain('confidence')
  })
})
