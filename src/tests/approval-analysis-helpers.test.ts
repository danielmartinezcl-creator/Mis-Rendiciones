import { describe, it, expect } from 'vitest'
import {
  buildAnalysisPrompt,
  parseAnalysisResponse,
} from '@/lib/approval-analysis-helpers'
import type { ReportForAnalysis, HistoricalItem, AiAnalysis } from '@/lib/approval-analysis-helpers'

const sampleReport: ReportForAnalysis = {
  id: 'r1',
  title: 'Rendición Mayo 2026',
  submitter_name: 'Juan Pérez',
  expense_items: [
    {
      id: 'item1',
      description: 'Almuerzo cliente',
      amount_clp: 25000,
      category_name: 'Alimentación',
      merchant: 'Mercado 500',
      doc_type: 'boleta',
      doc_number: '12345',
      policy_violations: null,
    },
    {
      id: 'item2',
      description: 'Taxi aeropuerto',
      amount_clp: 85000,
      category_name: 'Transporte',
      merchant: null,
      doc_type: 'ticket',
      doc_number: null,
      policy_violations: [{ enforcement: 'warn', dimension: 'item', limit: 80000 }],
    },
  ],
}

const sampleHistory: HistoricalItem[] = [
  { description: 'Almuerzo', amount_clp: 22000, merchant: 'Mercado 500', category_name: 'Alimentación', status: 'approved', rejection_reason: null },
  { description: 'Taxi',     amount_clp: 15000, merchant: 'Cabify',       category_name: 'Transporte',  status: 'rejected',  rejection_reason: 'Sin comprobante' },
]

describe('buildAnalysisPrompt', () => {
  it('returns a non-empty string', () => {
    const prompt = buildAnalysisPrompt(sampleReport, sampleHistory)
    expect(typeof prompt).toBe('string')
    expect(prompt.length).toBeGreaterThan(100)
  })

  it('includes item IDs in the prompt', () => {
    const prompt = buildAnalysisPrompt(sampleReport, sampleHistory)
    expect(prompt).toContain('item1')
    expect(prompt).toContain('item2')
  })

  it('includes submitter name', () => {
    const prompt = buildAnalysisPrompt(sampleReport, sampleHistory)
    expect(prompt).toContain('Juan Pérez')
  })

  it('includes policy violation marker when present', () => {
    const prompt = buildAnalysisPrompt(sampleReport, sampleHistory)
    expect(prompt).toContain('VIOLACIÓN')
  })

  it('includes merchant frequency from history', () => {
    const prompt = buildAnalysisPrompt(sampleReport, sampleHistory)
    expect(prompt).toContain('Mercado 500')
  })

  it('includes rejection history', () => {
    const prompt = buildAnalysisPrompt(sampleReport, sampleHistory)
    expect(prompt).toContain('Sin comprobante')
  })

  it('requests JSON-only response', () => {
    const prompt = buildAnalysisPrompt(sampleReport, sampleHistory)
    expect(prompt).toContain('JSON')
  })
})

describe('parseAnalysisResponse', () => {
  const validAnalysis: AiAnalysis = {
    risk_level: 'medium',
    headline: '1 ítem requiere atención.',
    routine_item_ids: ['item1'],
    attention_items: [{ item_id: 'item2', reasons: ['Monto inusual'], suggestion: 'revisar' }],
    stats: {
      total_clp: 110000,
      item_count: 2,
      vs_employee_avg: '+40%',
      policy_violations: 1,
      missing_docs: 0,
      new_merchants: 0,
    },
  }

  it('parses valid JSON response', () => {
    const raw = JSON.stringify(validAnalysis)
    const parsed = parseAnalysisResponse(raw)
    expect(parsed.risk_level).toBe('medium')
    expect(parsed.routine_item_ids).toEqual(['item1'])
    expect(parsed.attention_items).toHaveLength(1)
  })

  it('strips markdown code fences before parsing', () => {
    const raw = '```json\n' + JSON.stringify(validAnalysis) + '\n```'
    const parsed = parseAnalysisResponse(raw)
    expect(parsed.risk_level).toBe('medium')
  })

  it('throws on invalid JSON', () => {
    expect(() => parseAnalysisResponse('not json')).toThrow()
  })
})
