import { describe, it, expect, vi } from 'vitest'

vi.mock('@anthropic-ai/sdk', () => ({
  default: vi.fn().mockImplementation(() => ({
    messages: {
      create: vi.fn()
    }
  }))
}))

import { parseOcrResponse, buildOcrPrompt, buildOcrSourceBlock } from '@/lib/ocr-helpers'

describe('buildOcrSourceBlock', () => {
  // La API rechaza con 400 un PDF dentro de un bloque `image`: hasta el
  // 2026-09-24 ninguna factura en PDF se leyó nunca, y el error se tragaba en silencio.
  it('manda los PDF como bloque document, no como image', () => {
    const block = buildOcrSourceBlock('JVBERi0=', 'application/pdf')
    expect(block).toEqual({
      type: 'document',
      source: { type: 'base64', media_type: 'application/pdf', data: 'JVBERi0=' },
    })
  })

  it('manda las fotos como bloque image', () => {
    const block = buildOcrSourceBlock('/9j/4AAQ', 'image/jpeg')
    expect(block).toEqual({
      type: 'image',
      source: { type: 'base64', media_type: 'image/jpeg', data: '/9j/4AAQ' },
    })
  })
})

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

  it('retorna null si confidence < 0.5', () => {
    const raw = JSON.stringify({ amount: 1000, confidence: 0.4 })
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
