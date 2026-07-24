export interface AiAnalysisStats {
  total_clp:         number
  item_count:        number
  vs_employee_avg:   string
  policy_violations: number
  missing_docs:      number
  new_merchants:     number
}

export interface AttentionItem {
  item_id:    string
  reasons:    string[]
  suggestion: 'aprobar' | 'rechazar' | 'revisar'
}

export interface AiAnalysis {
  risk_level:       'low' | 'medium' | 'high'
  headline:         string
  routine_item_ids: string[]
  attention_items:  AttentionItem[]
  stats:            AiAnalysisStats
}

export interface ReportForAnalysis {
  id:             string
  title:          string
  submitter_name: string
  expense_items:  Array<{
    id:                string
    description:       string
    amount_clp:        number
    category_name:     string | null
    merchant:          string | null
    doc_type:          string | null
    doc_number:        string | null
    policy_violations: unknown
  }>
}

export interface HistoricalItem {
  description:      string
  amount_clp:       number
  category_name:    string | null
  merchant:         string | null
  status:           string
  rejection_reason: string | null
}

export function buildAnalysisPrompt(
  report: ReportForAnalysis,
  history: HistoricalItem[],
): string {
  const itemsText = report.expense_items
    .map((item, i) => {
      const violations = item.policy_violations
        ? ` [VIOLACIÓN DE POLÍTICA: ${JSON.stringify(item.policy_violations)}]`
        : ''
      const missingDoc =
        item.doc_type && ['boleta', 'factura', 'factura_exenta'].includes(item.doc_type) && !item.doc_number
          ? ' [SIN NÚMERO DE DOCUMENTO]'
          : ''
      return [
        `${i + 1}. ID:${item.id}`,
        `Desc:${item.description}`,
        `$${item.amount_clp.toLocaleString('es-CL')} CLP`,
        `Cat:${item.category_name ?? 'sin categoría'}`,
        `Merchant:${item.merchant ?? '-'}`,
        `Doc:${item.doc_type ?? '-'} ${item.doc_number ?? ''}`,
        violations,
        missingDoc,
      ].filter(Boolean).join(' | ')
    })
    .join('\n')

  // Frecuencia de merchants en historial
  const merchantFreq: Record<string, number> = {}
  const catAvg: Record<string, { sum: number; count: number }> = {}
  for (const h of history) {
    if (h.merchant) {
      merchantFreq[h.merchant] = (merchantFreq[h.merchant] ?? 0) + 1
    }
    if (h.category_name) {
      const slot = catAvg[h.category_name] ?? { sum: 0, count: 0 }
      slot.sum += h.amount_clp
      slot.count++
      catAvg[h.category_name] = slot
    }
  }

  const topMerchants = Object.entries(merchantFreq)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([m, n]) => `${m} (${n}x)`)
    .join(', ') || 'sin historial'

  const catAverages = Object.entries(catAvg)
    .map(([cat, { sum, count }]) =>
      `${cat}: $${Math.round(sum / count).toLocaleString('es-CL')} promedio`
    )
    .join(', ') || 'sin historial'

  const rejections = history
    .filter(h => h.status === 'rejected' && h.rejection_reason)
    .slice(0, 5)
    .map(h => `- "${h.description}": ${h.rejection_reason}`)
    .join('\n') || 'Sin rechazos previos'

  return `Eres un asistente de análisis de rendiciones de gastos en Chile. Analiza la siguiente rendición y clasifica cada ítem.

RENDICIÓN: ${report.title}
EMPLEADO: ${report.submitter_name}

ÍTEMS A ANALIZAR:
${itemsText}

HISTORIAL DEL EMPLEADO (últimos 6 meses):
- Merchants frecuentes: ${topMerchants}
- Promedio por categoría: ${catAverages}
- Rechazos anteriores:
${rejections}

Clasifica como "atención" los ítems con:
- Violaciones de política (marcadas con VIOLACIÓN DE POLÍTICA)
- Documento requerido faltante (marcado SIN NÚMERO DE DOCUMENTO)
- Merchants nunca vistos en historial
- Montos más del triple del promedio histórico de su categoría
- Patrones similares a rechazos anteriores

Responde SOLO con este JSON exacto, sin markdown, sin texto adicional:
{
  "risk_level": "low" | "medium" | "high",
  "headline": "string de 1 oración resumiendo",
  "routine_item_ids": ["id1", "id2"],
  "attention_items": [
    { "item_id": "uuid", "reasons": ["razón específica"], "suggestion": "aprobar" | "rechazar" | "revisar" }
  ],
  "stats": {
    "total_clp": number,
    "item_count": number,
    "vs_employee_avg": "string como '+40%' o 'dentro del rango habitual'",
    "policy_violations": number,
    "missing_docs": number,
    "new_merchants": number
  }
}`
}

export function parseAnalysisResponse(raw: string): AiAnalysis {
  const cleaned = raw
    .replace(/^```(?:json)?\s*/m, '')
    .replace(/\s*```\s*$/m, '')
    .trim()
  return JSON.parse(cleaned) as AiAnalysis
}
