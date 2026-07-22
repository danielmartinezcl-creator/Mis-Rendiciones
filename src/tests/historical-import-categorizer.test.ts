import { describe, it, expect } from 'vitest'
import { buildCategorizerPrompt, parseCategorizeResponse } from '@/lib/historical-import/categorizer'

const CATS = [
  { id: 'cat-mov', name: 'Movilización' },
  { id: 'cat-ali', name: 'Alimentación' },
  { id: 'cat-sal', name: 'Salud y Seguridad' },
  { id: 'cat-mat', name: 'Materiales' },
]

describe('buildCategorizerPrompt', () => {
  it('incluye todos los nombres de categoría', () => {
    const prompt = buildCategorizerPrompt(
      [{ description: 'TAXI AEROPUERTO' }],
      CATS
    )
    expect(prompt).toContain('Movilización')
    expect(prompt).toContain('Alimentación')
    expect(prompt).toContain('Salud y Seguridad')
  })

  it('incluye todas las descripciones con sus índices', () => {
    const items = [
      { description: 'TAXI AEROPUERTO' },
      { description: 'DESAYUNO EQUIPO' },
    ]
    const prompt = buildCategorizerPrompt(items, CATS)
    expect(prompt).toContain('TAXI AEROPUERTO')
    expect(prompt).toContain('DESAYUNO EQUIPO')
  })

  it('pide una respuesta JSON', () => {
    const prompt = buildCategorizerPrompt(
      [{ description: 'COMPRA COMBUSTIBLE' }],
      CATS
    )
    expect(prompt).toContain('JSON')
  })
})

describe('parseCategorizeResponse', () => {
  it('parsea respuesta JSON correcta', () => {
    const raw = JSON.stringify([
      { index: 0, category_id: 'cat-mov', confidence: 0.95 },
      { index: 1, category_id: 'cat-ali', confidence: 0.88 },
    ])
    const result = parseCategorizeResponse(raw)
    expect(result).toHaveLength(2)
    expect(result[0].categoryId).toBe('cat-mov')
    expect(result[0].confidence).toBe(0.95)
    expect(result[1].categoryId).toBe('cat-ali')
  })

  it('retorna array vacío si el JSON no es válido', () => {
    expect(parseCategorizeResponse('esto no es json')).toEqual([])
  })

  it('maneja category_id null (ítem sin categoría clara)', () => {
    const raw = JSON.stringify([
      { index: 0, category_id: null, confidence: 0.3 },
    ])
    const result = parseCategorizeResponse(raw)
    expect(result[0].categoryId).toBeNull()
  })

  it('filtra entradas con campos faltantes', () => {
    const raw = JSON.stringify([
      { index: 0, category_id: 'cat-mov', confidence: 0.9 },
      { index: 1 },  // sin category_id ni confidence
    ])
    const result = parseCategorizeResponse(raw)
    expect(result).toHaveLength(1)
    expect(result[0].index).toBe(0)
  })
})
