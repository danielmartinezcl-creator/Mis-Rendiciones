export interface OcrResult {
  amount: number | null
  currency: string | null
  date: string | null
  merchant: string | null
  doc_type: string | null
  doc_number: string | null
  supplier_rut: string | null
  confidence: number
  raw: string
}

export function buildOcrPrompt(): string {
  return `Eres un extractor de datos de documentos financieros chilenos.
Analiza la imagen y extrae los datos del documento (boleta, factura, ticket, u otro).

Responde SOLO con un objeto JSON con estos campos:
{
  "amount": número (monto total en la moneda del documento, sin separadores de miles),
  "currency": "CLP" | "USD" | "EUR" | "ARS" | "BRL" (detectar por símbolo o contexto),
  "date": "YYYY-MM-DD" (fecha del documento),
  "merchant": "nombre del comercio o proveedor",
  "doc_type": "boleta" | "factura" | "factura_exenta" | "ticket" | "otro",
  "doc_number": "número de folio o documento si es visible, null si no",
  "supplier_rut": "RUT del emisor del documento (ej: 76.123.456-7), null si no es visible — importante para facturas y facturas exentas",
  "confidence": número entre 0 y 1 (qué tan seguro estás de los datos extraídos)
}

Reglas:
- Si el monto incluye IVA, incluir el TOTAL con IVA.
- Si la imagen es ilegible o no es un documento financiero, retornar confidence: 0.
- Si algún campo no es visible, retornar null para ese campo.
- Para facturas y facturas exentas, el RUT del emisor aparece junto al nombre del proveedor. Es distinto al RUT del receptor (quien compra).
- NO incluir texto adicional fuera del JSON.`
}

export function parseOcrResponse(raw: string): OcrResult | null {
  try {
    const jsonMatch = raw.match(/\{[\s\S]*\}/)
    if (!jsonMatch) return null

    const data = JSON.parse(jsonMatch[0])

    if (typeof data.confidence !== 'number' || data.confidence < 0.7) return null

    // Normalizar fecha DD/MM/YYYY → YYYY-MM-DD
    let date = data.date ?? null
    if (date && /^\d{2}\/\d{2}\/\d{4}$/.test(date)) {
      const [d, m, y] = date.split('/')
      date = `${y}-${m}-${d}`
    }

    return {
      amount:       typeof data.amount === 'number' ? data.amount : null,
      currency:     data.currency ?? null,
      date,
      merchant:     data.merchant ?? null,
      doc_type:     data.doc_type ?? null,
      doc_number:   data.doc_number ? String(data.doc_number) : null,
      supplier_rut: data.supplier_rut ?? null,
      confidence:   data.confidence,
      raw,
    }
  } catch {
    return null
  }
}
