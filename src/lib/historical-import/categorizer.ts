export interface CategorySuggestion {
  index: number
  categoryId: string | null
  confidence: number
}

export function buildCategorizerPrompt(
  items: Array<{ description: string; merchantHint?: string }>,
  categories: Array<{ id: string; name: string }>,
): string {
  const catList = categories
    .map(c => `  - id: "${c.id}", nombre: "${c.name}"`)
    .join('\n')

  const itemList = items
    .map((it, i) => {
      const merchant = it.merchantHint ? ` (proveedor: ${it.merchantHint})` : ''
      return `  ${i}: "${it.description}"${merchant}`
    })
    .join('\n')

  return `Eres un clasificador de gastos corporativos chilenos.

Categorías disponibles:
${catList}

Clasifica cada gasto en la categoría más apropiada. Si no puedes determinar la categoría, usa null.

Gastos a clasificar:
${itemList}

Responde SOLO con un array JSON con este formato (sin texto adicional):
[
  { "index": 0, "category_id": "id-de-categoria-o-null", "confidence": 0.0-1.0 },
  ...
]

Reglas:
- Taxi, bus, metro, estacionamiento, combustible → categoría de movilización/transporte
- Almuerzo, desayuno, once, cena, restaurant, café → alimentación
- Examen, médico, farmacia, drogas (en contexto laboral = examen de drogas) → salud
- Materiales, insumos, herramientas → materiales
- Hotel, alojamiento → alojamiento
- Si la descripción no calza con ninguna categoría, usa null y confidence: 0.2
- confidence: cuán seguro estás de la clasificación (0.0 = no sé, 1.0 = certeza absoluta)`
}

export function parseCategorizeResponse(text: string): CategorySuggestion[] {
  try {
    const match = text.match(/\[[\s\S]*\]/)
    if (!match) return []
    const arr = JSON.parse(match[0])
    if (!Array.isArray(arr)) return []

    return arr
      .filter((entry): entry is { index: number; category_id: string | null; confidence: number } =>
        typeof entry?.index === 'number' &&
        'category_id' in entry &&
        typeof entry?.confidence === 'number'
      )
      .map(entry => ({
        index:      entry.index,
        categoryId: entry.category_id,
        confidence: entry.confidence,
      }))
  } catch {
    return []
  }
}
