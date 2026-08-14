# App Rindegastos — Plan B: Flujo de Rendición (Rendidor)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Prerequisito:** Plan A completo y funcionando (auth, layout, Supabase schema, design system).

**Goal:** Implementar el flujo completo del rendidor — desde el dashboard personal hasta crear una rendición con fotos, OCR automático, multi-moneda y envío a aprobación.

**Architecture:** Server Actions para OCR (Claude Sonnet 4.6) y tipo de cambio (ExchangeRate-API). Formulario en el cliente con pre-llenado desde OCR. Supabase para persistencia con RLS.

**Tech Stack:** Next.js 15 Server Actions, @anthropic-ai/sdk, ExchangeRate-API, Supabase Storage

---

## Mapa de archivos — Plan B

| Acción | Ruta |
|--------|------|
| Crear | `src/actions/ocr.ts` |
| Crear | `src/actions/exchange-rate.ts` |
| Crear | `src/actions/expenses.ts` |
| Crear | `src/components/expenses/PhotoUpload.tsx` |
| Crear | `src/components/expenses/ExpenseItemForm.tsx` |
| Crear | `src/components/expenses/ExpenseItemCard.tsx` |
| Crear | `src/components/expenses/ExpenseReportCard.tsx` |
| Crear | `src/app/(app)/page.tsx` (reemplazar placeholder) |
| Crear | `src/app/(app)/expenses/new/page.tsx` |
| Crear | `src/app/(app)/expenses/[id]/page.tsx` |
| Crear | `src/app/(app)/reimbursements/page.tsx` |
| Crear | `src/tests/ocr.test.ts` |
| Crear | `src/tests/exchange-rate.test.ts` |
| Crear | `src/tests/expenses.test.ts` |

---

## Task 1: Server Action — OCR con Claude Sonnet 4.6

**Files:**
- Crear: `src/actions/ocr.ts`
- Crear: `src/tests/ocr.test.ts`

- [ ] **Step 1: Escribir tests de OCR ANTES de implementar**

Crear `src/tests/ocr.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock del SDK de Anthropic
vi.mock('@anthropic-ai/sdk', () => ({
  default: vi.fn().mockImplementation(() => ({
    messages: {
      create: vi.fn()
    }
  }))
}))

import Anthropic from '@anthropic-ai/sdk'
import { parseOcrResponse, buildOcrPrompt } from '@/actions/ocr'

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
    expect(result.amount).toBe(15000)
    expect(result.currency).toBe('CLP')
    expect(result.date).toBe('2026-05-15')
    expect(result.merchant).toBe('Restaurante El Quijote')
    expect(result.confidence).toBe(0.95)
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
```

- [ ] **Step 2: Ejecutar tests para verificar que fallan**

```bash
npx vitest run src/tests/ocr.test.ts
```

Esperado: FAIL — "Cannot find module '@/actions/ocr'"

- [ ] **Step 3: Implementar ocr.ts**

Crear `src/actions/ocr.ts`:

```typescript
'use server'

import Anthropic from '@anthropic-ai/sdk'

export interface OcrResult {
  amount: number | null
  currency: string | null
  date: string | null
  merchant: string | null
  doc_type: string | null
  doc_number: string | null
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
  "doc_number": "número de documento si es visible, null si no",
  "confidence": número entre 0 y 1 (qué tan seguro estás de los datos extraídos)
}

Reglas:
- Si el monto incluye IVA, incluir el TOTAL con IVA.
- Si la imagen es ilegible o no es un documento financiero, retornar confidence: 0.
- Si algún campo no es visible, retornar null para ese campo.
- NO incluir texto adicional fuera del JSON.`
}

export function parseOcrResponse(raw: string): OcrResult | null {
  try {
    // Extraer JSON aunque venga con texto extra
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
      amount:     typeof data.amount === 'number' ? data.amount : null,
      currency:   data.currency ?? null,
      date,
      merchant:   data.merchant ?? null,
      doc_type:   data.doc_type ?? null,
      doc_number: data.doc_number ?? null,
      confidence: data.confidence,
      raw,
    }
  } catch {
    return null
  }
}

export async function runOcr(imageBase64: string, mimeType: string): Promise<OcrResult | null> {
  const client = new Anthropic({
    apiKey: process.env.ANTHROPIC_API_KEY!,
  })

  try {
    const response = await client.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 512,
      system: buildOcrPrompt(),
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'image',
              source: {
                type: 'base64',
                media_type: mimeType as 'image/jpeg' | 'image/png' | 'image/webp',
                data: imageBase64,
              },
            },
            {
              type: 'text',
              text: 'Extrae los datos de este documento.',
            },
          ],
        },
      ],
    })

    const text = response.content[0].type === 'text' ? response.content[0].text : ''
    return parseOcrResponse(text)
  } catch (error) {
    // OCR no bloqueante — si falla, retornar null y el usuario llena manualmente
    console.error('[OCR] Error llamando a Claude:', error)
    return null
  }
}
```

- [ ] **Step 4: Ejecutar tests**

```bash
npx vitest run src/tests/ocr.test.ts
```

Esperado: PASS — 5 tests en verde.

- [ ] **Step 5: Commit**

```bash
git add src/actions/ocr.ts src/tests/ocr.test.ts
git commit -m "feat: OCR Server Action with Claude Sonnet 4.6 — 5 tests passing"
```

---

## Task 2: Server Action — Tipo de cambio histórico

**Files:**
- Crear: `src/actions/exchange-rate.ts`
- Crear: `src/tests/exchange-rate.test.ts`

- [ ] **Step 1: Escribir tests**

Crear `src/tests/exchange-rate.test.ts`:

```typescript
import { describe, it, expect, vi } from 'vitest'
import { buildExchangeRateUrl, parseExchangeRateResponse, convertToCLP } from '@/actions/exchange-rate'

describe('buildExchangeRateUrl', () => {
  it('construye URL con fecha y moneda correctas', () => {
    const url = buildExchangeRateUrl('USD', '2026-05-15')
    expect(url).toContain('USD')
    expect(url).toContain('2026-05-15')
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
```

- [ ] **Step 2: Verificar que fallan**

```bash
npx vitest run src/tests/exchange-rate.test.ts
```

Esperado: FAIL — "Cannot find module '@/actions/exchange-rate'"

- [ ] **Step 3: Implementar exchange-rate.ts**

Crear `src/actions/exchange-rate.ts`:

```typescript
'use server'

export interface ExchangeRateResult {
  rate: number
  source: 'api' | 'manual'
  date: string
  currency: string
}

export function buildExchangeRateUrl(currency: string, date: string): string {
  const apiKey = process.env.EXCHANGE_RATE_API_KEY!
  // ExchangeRate-API formato: /v6/{key}/history/{currency}/{year}/{month}/{day}
  const [year, month, day] = date.split('-')
  return `https://v6.exchangerate-api.com/v6/${apiKey}/history/${currency}/${year}/${month}/${day}`
}

export function parseExchangeRateResponse(data: Record<string, unknown>, fromCurrency: string): number | null {
  if (data.result !== 'success') return null
  const rates = data.conversion_rates as Record<string, number>
  return rates?.CLP ?? null
}

export function convertToCLP(amount: number, rateToClp: number): number {
  return Math.round(amount * rateToClp)
}

export async function getHistoricalRate(
  currency: string,
  date: string
): Promise<ExchangeRateResult | null> {
  if (currency === 'CLP') {
    return { rate: 1, source: 'api', date, currency }
  }

  try {
    const url = buildExchangeRateUrl(currency, date)
    const response = await fetch(url, {
      next: { revalidate: 86400 }, // cachear 24h — el TC histórico no cambia
    })

    if (!response.ok) {
      console.error(`[ExchangeRate] API error: ${response.status}`)
      return null
    }

    const data = await response.json()
    const rate = parseExchangeRateResponse(data, currency)

    if (!rate) return null

    return { rate, source: 'api', date, currency }
  } catch (error) {
    console.error('[ExchangeRate] Error:', error)
    return null
  }
}
```

- [ ] **Step 4: Ejecutar tests**

```bash
npx vitest run src/tests/exchange-rate.test.ts
```

Esperado: PASS — 4 tests en verde.

- [ ] **Step 5: Commit**

```bash
git add src/actions/exchange-rate.ts src/tests/exchange-rate.test.ts
git commit -m "feat: exchange rate Server Action — historical TC via ExchangeRate-API"
```

---

## Task 3: Server Actions — CRUD de rendiciones

**Files:**
- Crear: `src/actions/expenses.ts`
- Crear: `src/tests/expenses.test.ts`

- [ ] **Step 1: Escribir tests**

Crear `src/tests/expenses.test.ts`:

```typescript
import { describe, it, expect } from 'vitest'
import { calculateReportTotal, validateExpenseItem } from '@/actions/expenses'

describe('calculateReportTotal', () => {
  it('suma los amount_clp de todos los ítems', () => {
    const items = [
      { amount_clp: 10000 },
      { amount_clp: 25000 },
      { amount_clp: 5000 },
    ]
    expect(calculateReportTotal(items)).toBe(40000)
  })

  it('retorna 0 si no hay ítems', () => {
    expect(calculateReportTotal([])).toBe(0)
  })
})

describe('validateExpenseItem', () => {
  it('retorna error si description está vacío', () => {
    const errors = validateExpenseItem({ description: '', amount: 1000, date: '2026-06-01' })
    expect(errors).toContain('La descripción es obligatoria')
  })

  it('retorna error si amount es 0 o negativo', () => {
    const errors = validateExpenseItem({ description: 'Test', amount: 0, date: '2026-06-01' })
    expect(errors).toContain('El monto debe ser mayor a 0')
  })

  it('retorna error si date está vacío', () => {
    const errors = validateExpenseItem({ description: 'Test', amount: 1000, date: '' })
    expect(errors).toContain('La fecha es obligatoria')
  })

  it('retorna array vacío si todos los campos son válidos', () => {
    const errors = validateExpenseItem({ description: 'Almuerzo cliente', amount: 15000, date: '2026-06-01' })
    expect(errors).toHaveLength(0)
  })
})
```

- [ ] **Step 2: Verificar que fallan**

```bash
npx vitest run src/tests/expenses.test.ts
```

Esperado: FAIL.

- [ ] **Step 3: Implementar expenses.ts**

Crear `src/actions/expenses.ts`:

```typescript
'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'

// ── Helpers puros (también importados en tests) ──

export function calculateReportTotal(items: { amount_clp: number }[]): number {
  return items.reduce((sum, item) => sum + item.amount_clp, 0)
}

export function validateExpenseItem(item: {
  description: string
  amount: number
  date: string
}): string[] {
  const errors: string[] = []
  if (!item.description?.trim()) errors.push('La descripción es obligatoria')
  if (!item.amount || item.amount <= 0) errors.push('El monto debe ser mayor a 0')
  if (!item.date) errors.push('La fecha es obligatoria')
  return errors
}

// ── Server Actions ──

export async function createExpenseReport(formData: FormData) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('users').select('org_id').eq('id', user.id).single()
  if (!profile) throw new Error('Perfil no encontrado')

  const title = formData.get('title') as string
  const description = formData.get('description') as string

  if (!title?.trim()) throw new Error('El título es obligatorio')

  const { data, error } = await supabase
    .from('expense_reports')
    .insert({
      org_id:       profile.org_id,
      submitter_id: user.id,
      title:        title.trim(),
      description:  description?.trim() || null,
      status:       'draft',
      total_amount: 0,
      approved_amount: 0,
      currency: 'CLP',
    })
    .select('id')
    .single()

  if (error) throw new Error(error.message)

  redirect(`/expenses/${data.id}`)
}

export async function addExpenseItem(
  reportId: string,
  item: {
    description: string
    amount: number
    currency: string
    exchange_rate: number
    exchange_rate_source: 'api' | 'manual'
    amount_clp: number
    date: string
    category_id?: string | null
    merchant?: string | null
    doc_type?: string | null
    doc_number?: string | null
    notes?: string | null
    ocr_raw?: object | null
    ocr_confidence?: number | null
  }
) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('users').select('org_id').eq('id', user.id).single()
  if (!profile) throw new Error('Perfil no encontrado')

  const errors = validateExpenseItem(item)
  if (errors.length > 0) throw new Error(errors.join(', '))

  const { data: newItem, error } = await supabase
    .from('expense_items')
    .insert({
      report_id:           reportId,
      org_id:              profile.org_id,
      description:         item.description.trim(),
      amount:              item.amount,
      currency:            item.currency,
      exchange_rate:       item.exchange_rate,
      exchange_rate_source: item.exchange_rate_source,
      amount_clp:          item.amount_clp,
      date:                item.date,
      category_id:         item.category_id ?? null,
      merchant:            item.merchant ?? null,
      doc_type:            item.doc_type ?? null,
      doc_number:          item.doc_number ?? null,
      notes:               item.notes ?? null,
      ocr_raw:             item.ocr_raw ?? null,
      ocr_confidence:      item.ocr_confidence ?? null,
      status:              'pending',
    })
    .select('id')
    .single()

  if (error) throw new Error(error.message)

  // Recalcular total de la rendición
  const { data: allItems } = await supabase
    .from('expense_items')
    .select('amount_clp')
    .eq('report_id', reportId)

  const total = calculateReportTotal(allItems ?? [])

  await supabase
    .from('expense_reports')
    .update({ total_amount: total })
    .eq('id', reportId)

  revalidatePath(`/expenses/${reportId}`)
  return newItem?.id
}

export async function deleteExpenseItem(itemId: string, reportId: string) {
  const supabase = await createClient()

  const { error } = await supabase
    .from('expense_items')
    .delete()
    .eq('id', itemId)

  if (error) throw new Error(error.message)

  // Recalcular total
  const { data: allItems } = await supabase
    .from('expense_items')
    .select('amount_clp')
    .eq('report_id', reportId)

  const total = calculateReportTotal(allItems ?? [])
  await supabase
    .from('expense_reports')
    .update({ total_amount: total })
    .eq('id', reportId)

  revalidatePath(`/expenses/${reportId}`)
}

export async function submitExpenseReport(reportId: string) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  // Verificar que hay al menos 1 ítem
  const { count } = await supabase
    .from('expense_items')
    .select('*', { count: 'exact', head: true })
    .eq('report_id', reportId)

  if (!count || count === 0) {
    throw new Error('La rendición debe tener al menos un ítem')
  }

  const { error } = await supabase
    .from('expense_reports')
    .update({
      status:       'submitted',
      submitted_at: new Date().toISOString(),
    })
    .eq('id', reportId)
    .eq('submitter_id', user.id)
    .eq('status', 'draft') // Solo borradores se pueden enviar

  if (error) throw new Error(error.message)

  revalidatePath(`/expenses/${reportId}`)
  revalidatePath('/')
}

export async function getMyReports() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return []

  const { data } = await supabase
    .from('expense_reports')
    .select(`
      id, title, status, total_amount, approved_amount,
      submitted_at, created_at, currency,
      expense_items(count)
    `)
    .eq('submitter_id', user.id)
    .order('created_at', { ascending: false })
    .limit(20)

  return data ?? []
}

export async function getReportWithItems(reportId: string) {
  const supabase = await createClient()

  const { data: report } = await supabase
    .from('expense_reports')
    .select(`
      *,
      expense_items (
        *,
        expense_categories (name, icon, color),
        attachments (id, storage_path, file_type, thumbnail_path)
      )
    `)
    .eq('id', reportId)
    .single()

  return report
}

export async function uploadAttachment(
  itemId: string,
  orgId: string,
  file: File
): Promise<string> {
  const supabase = await createClient()

  const ext = file.name.split('.').pop() ?? 'jpg'
  const path = `${orgId}/${itemId}/${Date.now()}.${ext}`

  const { error: uploadError } = await supabase.storage
    .from('expense-attachments')
    .upload(path, file, { contentType: file.type })

  if (uploadError) throw new Error(uploadError.message)

  const fileType = file.type.startsWith('image/') ? 'image' : 'pdf'

  await supabase
    .from('attachments')
    .insert({
      item_id:      itemId,
      org_id:       orgId,
      storage_path: path,
      file_type:    fileType,
      file_size:    file.size,
    })

  return path
}
```

- [ ] **Step 4: Ejecutar tests**

```bash
npx vitest run src/tests/expenses.test.ts
```

Esperado: PASS — 5 tests en verde.

- [ ] **Step 5: Correr todos los tests juntos**

```bash
npm test
```

Esperado: PASS — todos los tests anteriores más los nuevos. Total: ~15 tests.

- [ ] **Step 6: Commit**

```bash
git add src/actions/expenses.ts src/tests/expenses.test.ts
git commit -m "feat: expense CRUD Server Actions — create, add item, submit, upload"
```

---

## Task 4: Componente PhotoUpload + trigger OCR

**Files:**
- Crear: `src/components/expenses/PhotoUpload.tsx`

- [ ] **Step 1: Crear PhotoUpload**

Crear `src/components/expenses/PhotoUpload.tsx`:

```typescript
'use client'

import { useState, useRef } from 'react'
import { runOcr, type OcrResult } from '@/actions/ocr'

interface PhotoUploadProps {
  onOcrResult: (result: OcrResult | null, file: File) => void
  disabled?: boolean
}

export function PhotoUpload({ onOcrResult, disabled }: PhotoUploadProps) {
  const [status, setStatus] = useState<'idle' | 'reading' | 'processing' | 'done' | 'error'>('idle')
  const inputRef = useRef<HTMLInputElement>(null)

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return

    // Validar tipo
    const allowed = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf']
    if (!allowed.includes(file.type)) {
      alert('Solo se aceptan imágenes JPG, PNG, WebP o PDF')
      return
    }

    // Validar tamaño (máx 10MB)
    if (file.size > 10 * 1024 * 1024) {
      alert('El archivo no puede superar 10 MB')
      return
    }

    setStatus('reading')

    // Convertir a base64 para enviar al Server Action
    const reader = new FileReader()
    reader.onload = async (ev) => {
      const dataUrl = ev.target?.result as string
      // dataUrl es "data:image/jpeg;base64,XXXXX..."
      const base64 = dataUrl.split(',')[1]
      const mimeType = file.type

      setStatus('processing')

      try {
        const result = await runOcr(base64, mimeType)
        setStatus('done')
        onOcrResult(result, file)
      } catch {
        setStatus('error')
        onOcrResult(null, file)
      }
    }
    reader.readAsDataURL(file)
  }

  const labels = {
    idle:       'Tomá la foto y listo',
    reading:    'Leyendo imagen...',
    processing: 'Extrayendo datos con IA...',
    done:       'Foto procesada ✓',
    error:      'Error — llenar manualmente',
  }

  return (
    <div className="space-y-2">
      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp,application/pdf"
        capture="environment"    // abre cámara trasera en móvil
        className="hidden"
        onChange={handleFileChange}
        disabled={disabled || status === 'processing' || status === 'reading'}
      />

      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        disabled={disabled || status === 'processing' || status === 'reading'}
        className="w-full border-2 border-dashed border-brand-200 hover:border-brand-400 rounded-card p-6 text-center transition-colors disabled:opacity-50"
      >
        <div className="flex flex-col items-center gap-2">
          {status === 'processing' || status === 'reading' ? (
            <div className="w-8 h-8 border-2 border-brand-600 border-t-transparent rounded-full animate-spin" />
          ) : (
            <span className="text-3xl">📷</span>
          )}
          <span className="text-sm font-semibold text-brand-600">
            {labels[status]}
          </span>
          {status === 'idle' && (
            <span className="text-xs text-slate-400">
              JPG · PNG · WebP · PDF — máx 10 MB
            </span>
          )}
          {status === 'done' && (
            <span className="text-xs text-slate-400">
              Datos pre-cargados — revisá y confirmá
            </span>
          )}
          {status === 'error' && (
            <span className="text-xs text-slate-400">
              La IA no pudo leer el documento — completá los campos manualmente
            </span>
          )}
        </div>
      </button>
    </div>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/expenses/PhotoUpload.tsx
git commit -m "feat: PhotoUpload component — camera capture, OCR trigger, graceful fallback"
```

---

## Task 5: Formulario de ítem con pre-llenado OCR y multi-moneda

**Files:**
- Crear: `src/components/expenses/ExpenseItemForm.tsx`

- [ ] **Step 1: Crear ExpenseItemForm**

Crear `src/components/expenses/ExpenseItemForm.tsx`:

```typescript
'use client'

import { useState, useEffect } from 'react'
import { PhotoUpload } from './PhotoUpload'
import { getHistoricalRate } from '@/actions/exchange-rate'
import { formatCLP, formatExchangeRate } from '@/lib/utils'
import { CURRENCIES, DOC_TYPES, type Currency } from '@/lib/constants'
import type { OcrResult } from '@/actions/ocr'
import type { ExpenseCategory } from '@/lib/supabase/types'

export interface ItemFormData {
  description:         string
  amount:              string     // string para el input
  currency:            Currency
  exchange_rate:       number
  exchange_rate_source: 'api' | 'manual'
  amount_clp:          number
  date:                string
  category_id:         string
  merchant:            string
  doc_type:            string
  doc_number:          string
  notes:               string
  ocr_raw:             object | null
  ocr_confidence:      number | null
  file:                File | null
}

const emptyForm = (): ItemFormData => ({
  description:         '',
  amount:              '',
  currency:            'CLP',
  exchange_rate:       1,
  exchange_rate_source: 'api',
  amount_clp:          0,
  date:                new Date().toISOString().split('T')[0],
  category_id:         '',
  merchant:            '',
  doc_type:            '',
  doc_number:          '',
  notes:               '',
  ocr_raw:             null,
  ocr_confidence:      null,
  file:                null,
})

interface ExpenseItemFormProps {
  categories: ExpenseCategory[]
  onSave:   (data: ItemFormData) => Promise<void>
  onCancel: () => void
}

export function ExpenseItemForm({ categories, onSave, onCancel }: ExpenseItemFormProps) {
  const [form, setForm]         = useState<ItemFormData>(emptyForm())
  const [tcLoading, setTcLoading] = useState(false)
  const [saving, setSaving]     = useState(false)
  const [errors, setErrors]     = useState<string[]>([])

  function set(field: keyof ItemFormData, value: unknown) {
    setForm(prev => ({ ...prev, [field]: value }))
  }

  // Cuando cambia moneda o fecha, buscar TC histórico
  useEffect(() => {
    if (form.currency === 'CLP') {
      set('exchange_rate', 1)
      set('exchange_rate_source', 'api')
      recalcAmountClp(form.amount, 1)
      return
    }
    if (!form.date) return

    setTcLoading(true)
    getHistoricalRate(form.currency, form.date).then(result => {
      setTcLoading(false)
      if (result) {
        set('exchange_rate', result.rate)
        set('exchange_rate_source', 'api')
        recalcAmountClp(form.amount, result.rate)
      }
    })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form.currency, form.date])

  function recalcAmountClp(amountStr: string, rate: number) {
    const val = parseFloat(amountStr.replace(/\./g, '').replace(',', '.'))
    if (!isNaN(val) && val > 0) {
      set('amount_clp', Math.round(val * rate))
    } else {
      set('amount_clp', 0)
    }
  }

  function handleAmountChange(raw: string) {
    set('amount', raw)
    recalcAmountClp(raw, form.exchange_rate)
  }

  function handleRateChange(raw: string) {
    const rate = parseFloat(raw.replace(',', '.'))
    if (!isNaN(rate) && rate > 0) {
      set('exchange_rate', rate)
      set('exchange_rate_source', 'manual')
      recalcAmountClp(form.amount, rate)
    }
  }

  function handleOcrResult(result: OcrResult | null, file: File) {
    set('file', file)
    if (!result) return  // OCR falló — usuario llena manualmente

    // Pre-llenar con datos del OCR
    if (result.amount)     set('amount', String(result.amount))
    if (result.currency)   set('currency', result.currency as Currency)
    if (result.date)       set('date', result.date)
    if (result.merchant)   set('merchant', result.merchant)
    if (result.doc_type)   set('doc_type', result.doc_type)
    if (result.doc_number) set('doc_number', result.doc_number)
    set('ocr_raw',        { amount: result.amount, currency: result.currency, date: result.date, merchant: result.merchant })
    set('ocr_confidence', result.confidence)
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()

    const localErrors: string[] = []
    if (!form.description.trim()) localErrors.push('La descripción es obligatoria')
    if (!form.amount || parseFloat(form.amount) <= 0) localErrors.push('El monto debe ser mayor a 0')
    if (!form.date) localErrors.push('La fecha es obligatoria')

    if (localErrors.length > 0) {
      setErrors(localErrors)
      return
    }
    setErrors([])

    setSaving(true)
    try {
      await onSave({
        ...form,
        amount: form.amount,
      })
    } finally {
      setSaving(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4 bg-white rounded-card shadow-card p-4">
      <h3 className="font-semibold text-slate-800">Agregar ítem</h3>

      {/* Foto + OCR */}
      <PhotoUpload onOcrResult={handleOcrResult} disabled={saving} />

      {errors.length > 0 && (
        <div className="bg-red-50 border border-red-200 rounded-item p-3">
          {errors.map(err => (
            <p key={err} className="text-sm text-red-600">{err}</p>
          ))}
        </div>
      )}

      {/* Descripción */}
      <div>
        <label className="block text-sm font-medium text-slate-700 mb-1">Descripción *</label>
        <input
          type="text"
          value={form.description}
          onChange={e => set('description', e.target.value)}
          placeholder="Ej: Almuerzo con cliente"
          className="w-full px-3 py-2.5 border border-slate-200 rounded-item text-sm focus:outline-none focus:ring-2 focus:ring-brand-600"
        />
      </div>

      {/* Monto + Moneda */}
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">Monto *</label>
          <input
            type="text"
            inputMode="decimal"
            value={form.amount}
            onChange={e => handleAmountChange(e.target.value)}
            placeholder="15000"
            className="w-full px-3 py-2.5 border border-slate-200 rounded-item text-sm focus:outline-none focus:ring-2 focus:ring-brand-600 font-manrope"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">Moneda</label>
          <select
            value={form.currency}
            onChange={e => set('currency', e.target.value as Currency)}
            className="w-full px-3 py-2.5 border border-slate-200 rounded-item text-sm focus:outline-none focus:ring-2 focus:ring-brand-600"
          >
            {CURRENCIES.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>
      </div>

      {/* Tipo de cambio (solo si moneda != CLP) */}
      {form.currency !== 'CLP' && (
        <div className="bg-amber-50 border border-amber-200 rounded-item p-3 space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-amber-700">
              Tipo de cambio al {form.date}
            </span>
            {tcLoading && (
              <span className="text-xs text-amber-600 animate-pulse">Consultando...</span>
            )}
            {form.exchange_rate_source === 'manual' && (
              <span className="text-xs bg-amber-200 text-amber-800 px-2 py-0.5 rounded-full">Manual</span>
            )}
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs text-slate-500">1 {form.currency} =</span>
            <input
              type="text"
              value={formatExchangeRate(form.exchange_rate)}
              onChange={e => handleRateChange(e.target.value)}
              className="w-28 px-2 py-1 border border-amber-300 rounded text-sm font-manrope focus:outline-none focus:ring-2 focus:ring-amber-400"
            />
            <span className="text-xs text-slate-500">CLP</span>
          </div>
          {form.amount_clp > 0 && (
            <p className="text-sm font-manrope font-bold text-slate-800">
              ≈ {formatCLP(form.amount_clp)} CLP
            </p>
          )}
        </div>
      )}

      {/* Fecha del gasto */}
      <div>
        <label className="block text-sm font-medium text-slate-700 mb-1">Fecha del gasto *</label>
        <input
          type="date"
          value={form.date}
          onChange={e => set('date', e.target.value)}
          max={new Date().toISOString().split('T')[0]}
          className="w-full px-3 py-2.5 border border-slate-200 rounded-item text-sm focus:outline-none focus:ring-2 focus:ring-brand-600"
        />
      </div>

      {/* Categoría */}
      <div>
        <label className="block text-sm font-medium text-slate-700 mb-1">Categoría</label>
        <select
          value={form.category_id}
          onChange={e => set('category_id', e.target.value)}
          className="w-full px-3 py-2.5 border border-slate-200 rounded-item text-sm focus:outline-none focus:ring-2 focus:ring-brand-600"
        >
          <option value="">Sin categoría</option>
          {categories.map(cat => (
            <option key={cat.id} value={cat.id}>{cat.icon} {cat.name}</option>
          ))}
        </select>
      </div>

      {/* Proveedor + Tipo doc (en 2 columnas) */}
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">Proveedor</label>
          <input
            type="text"
            value={form.merchant}
            onChange={e => set('merchant', e.target.value)}
            placeholder="Nombre del comercio"
            className="w-full px-3 py-2.5 border border-slate-200 rounded-item text-sm focus:outline-none focus:ring-2 focus:ring-brand-600"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">Tipo documento</label>
          <select
            value={form.doc_type}
            onChange={e => set('doc_type', e.target.value)}
            className="w-full px-3 py-2.5 border border-slate-200 rounded-item text-sm focus:outline-none focus:ring-2 focus:ring-brand-600"
          >
            <option value="">Seleccionar</option>
            {DOC_TYPES.map(d => (
              <option key={d.value} value={d.value}>{d.label}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Número de documento */}
      <div>
        <label className="block text-sm font-medium text-slate-700 mb-1">N° documento</label>
        <input
          type="text"
          value={form.doc_number}
          onChange={e => set('doc_number', e.target.value)}
          placeholder="000123"
          className="w-full px-3 py-2.5 border border-slate-200 rounded-item text-sm focus:outline-none focus:ring-2 focus:ring-brand-600"
        />
      </div>

      {/* Notas */}
      <div>
        <label className="block text-sm font-medium text-slate-700 mb-1">Nota interna</label>
        <textarea
          value={form.notes}
          onChange={e => set('notes', e.target.value)}
          placeholder="Contexto adicional para el aprobador..."
          rows={2}
          className="w-full px-3 py-2.5 border border-slate-200 rounded-item text-sm focus:outline-none focus:ring-2 focus:ring-brand-600 resize-none"
        />
      </div>

      {/* Botones */}
      <div className="flex gap-3">
        <button
          type="button"
          onClick={onCancel}
          disabled={saving}
          className="flex-1 py-2.5 px-4 border border-slate-200 rounded-item text-sm font-semibold text-slate-600 hover:bg-slate-50 disabled:opacity-50"
        >
          Cancelar
        </button>
        <button
          type="submit"
          disabled={saving}
          className="flex-1 py-2.5 px-4 bg-brand-600 hover:bg-brand-700 text-white rounded-item text-sm font-semibold disabled:opacity-50"
        >
          {saving ? 'Guardando...' : 'Agregar ítem'}
        </button>
      </div>
    </form>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/expenses/ExpenseItemForm.tsx
git commit -m "feat: ExpenseItemForm — OCR pre-fill, multi-currency TC, date-bound exchange rate"
```

---

## Task 6: Componentes de visualización de rendición

**Files:**
- Crear: `src/components/expenses/ExpenseItemCard.tsx`
- Crear: `src/components/expenses/ExpenseReportCard.tsx`

- [ ] **Step 1: Crear ExpenseItemCard**

Crear `src/components/expenses/ExpenseItemCard.tsx`:

```typescript
'use client'

import { CurrencyAmount } from '@/components/ui/CurrencyAmount'
import { ItemStatusAccent } from '@/components/ui/Badge'
import { formatDate } from '@/lib/utils'
import { DOC_TYPES } from '@/lib/constants'
import type { ExpenseItem, ExpenseCategory, Attachment } from '@/lib/supabase/types'
import type { ItemStatus, Currency } from '@/lib/constants'

interface ExpenseItemCardProps {
  item: ExpenseItem & {
    expense_categories: Pick<ExpenseCategory, 'name' | 'icon' | 'color'> | null
    attachments: Pick<Attachment, 'id' | 'storage_path' | 'file_type'>[]
  }
  canDelete?: boolean
  onDelete?: (id: string) => void
}

export function ExpenseItemCard({ item, canDelete, onDelete }: ExpenseItemCardProps) {
  const docLabel = DOC_TYPES.find(d => d.value === item.doc_type)?.label

  return (
    <ItemStatusAccent status={item.status as ItemStatus}>
      <div className="bg-white rounded-card shadow-card p-4 space-y-3">
        {/* Fila principal: descripción + monto */}
        <div className="flex items-start justify-between gap-2">
          <div className="flex-1 min-w-0">
            <p className="font-semibold text-slate-800 truncate">{item.description}</p>
            {item.merchant && (
              <p className="text-xs text-slate-400 mt-0.5">{item.merchant}</p>
            )}
          </div>
          <div className="text-right shrink-0">
            <CurrencyAmount
              amount={item.amount_clp}
              currency="CLP"
              size="md"
            />
            {item.currency !== 'CLP' && (
              <p className="text-xs text-slate-400 mt-0.5">
                {item.currency} {item.amount.toLocaleString('es-CL')}
              </p>
            )}
          </div>
        </div>

        {/* Metadatos */}
        <div className="flex flex-wrap gap-2 text-xs text-slate-500">
          <span>{formatDate(item.date)}</span>
          {item.expense_categories && (
            <span className="flex items-center gap-1">
              <span>{item.expense_categories.icon}</span>
              {item.expense_categories.name}
            </span>
          )}
          {docLabel && <span>{docLabel}</span>}
          {item.doc_number && <span>N° {item.doc_number}</span>}
          {item.attachments.length > 0 && (
            <span>📎 {item.attachments.length} adjunto{item.attachments.length !== 1 ? 's' : ''}</span>
          )}
        </div>

        {/* Rechazo */}
        {item.status === 'rejected' && item.rejection_reason && (
          <div className="bg-red-50 border border-red-200 rounded-item p-2">
            <p className="text-xs text-red-600 font-medium">Motivo de rechazo:</p>
            <p className="text-xs text-red-500 mt-0.5">{item.rejection_reason}</p>
          </div>
        )}

        {/* Notas */}
        {item.notes && (
          <p className="text-xs text-slate-400 italic">{item.notes}</p>
        )}

        {/* Eliminar */}
        {canDelete && onDelete && (
          <button
            type="button"
            onClick={() => onDelete(item.id)}
            className="text-xs text-red-400 hover:text-red-600 transition-colors"
          >
            Eliminar ítem
          </button>
        )}
      </div>
    </ItemStatusAccent>
  )
}
```

Crear `src/components/expenses/ExpenseReportCard.tsx`:

```typescript
import Link from 'next/link'
import { ReportStatusBadge } from '@/components/ui/Badge'
import { CurrencyAmount } from '@/components/ui/CurrencyAmount'
import { formatDate } from '@/lib/utils'
import type { ReportStatus } from '@/lib/constants'

interface ExpenseReportCardProps {
  report: {
    id: string
    title: string
    status: ReportStatus
    total_amount: number
    approved_amount: number
    currency: string
    submitted_at: string | null
    created_at: string
  }
}

export function ExpenseReportCard({ report }: ExpenseReportCardProps) {
  const dateLabel = report.submitted_at
    ? `Enviada ${formatDate(report.submitted_at.split('T')[0])}`
    : `Borrador desde ${formatDate(report.created_at.split('T')[0])}`

  return (
    <Link href={`/expenses/${report.id}`}>
      <div className="bg-white rounded-card shadow-card p-4 hover:shadow-md transition-shadow">
        <div className="flex items-start justify-between gap-2">
          <div className="flex-1 min-w-0">
            <p className="font-semibold text-slate-800 truncate">{report.title}</p>
            <p className="text-xs text-slate-400 mt-0.5">{dateLabel}</p>
          </div>
          <div className="flex flex-col items-end gap-1 shrink-0">
            <ReportStatusBadge status={report.status} />
            <CurrencyAmount amount={report.total_amount} currency="CLP" size="sm" />
          </div>
        </div>

        {report.status === 'partially_approved' && report.approved_amount > 0 && (
          <div className="mt-2 text-xs text-slate-500">
            Aprobado: <span className="font-manrope font-bold text-emerald-600">{report.approved_amount.toLocaleString('es-CL')}</span> de {report.total_amount.toLocaleString('es-CL')}
          </div>
        )}
      </div>
    </Link>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/expenses/
git commit -m "feat: ExpenseItemCard and ExpenseReportCard — status accents, multi-currency display"
```

---

## Task 7: Dashboard del Rendidor (página de inicio)

**Files:**
- Modificar: `src/app/(app)/page.tsx`

- [ ] **Step 1: Implementar dashboard del rendidor**

Reemplazar `src/app/(app)/page.tsx`:

```typescript
import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { Card } from '@/components/ui/Card'
import { CurrencyAmount } from '@/components/ui/CurrencyAmount'
import { ExpenseReportCard } from '@/components/expenses/ExpenseReportCard'
import { getMyReports } from '@/actions/expenses'
import type { ReportStatus } from '@/lib/constants'

export default async function DashboardPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const reports = await getMyReports()

  // KPIs
  const pending  = reports.filter(r => r.status === 'draft').reduce((s, r) => s + r.total_amount, 0)
  const inReview = reports.filter(r => ['submitted','pending_l2'].includes(r.status)).reduce((s, r) => s + r.total_amount, 0)
  const approved = reports.filter(r => ['approved','partially_approved'].includes(r.status)).reduce((s, r) => s + r.approved_amount, 0)

  const recent = reports.slice(0, 5)

  return (
    <div className="space-y-6 max-w-2xl mx-auto">

      {/* Card héroe con gradiente morado */}
      <Card hero>
        <div className="space-y-1">
          <p className="text-indigo-200 text-sm font-medium">Por cobrar (aprobado)</p>
          <CurrencyAmount amount={approved} currency="CLP" size="xl" className="text-white" />
        </div>
        <div className="mt-4 grid grid-cols-2 gap-4">
          <div>
            <p className="text-indigo-300 text-xs">En revisión</p>
            <CurrencyAmount amount={inReview} currency="CLP" size="md" className="text-white" />
          </div>
          <div>
            <p className="text-indigo-300 text-xs">Borradores</p>
            <CurrencyAmount amount={pending} currency="CLP" size="md" className="text-white" />
          </div>
        </div>
      </Card>

      {/* CTA — lenguaje del usuario */}
      <Link href="/expenses/new">
        <button className="w-full bg-brand-600 hover:bg-brand-700 text-white font-semibold py-4 px-6 rounded-card text-base flex items-center justify-center gap-3 transition-colors">
          <span className="text-2xl">📷</span>
          Tomá la foto y listo
        </button>
      </Link>

      {/* Rendiciones recientes */}
      {recent.length > 0 && (
        <div className="space-y-3">
          <h2 className="text-sm font-semibold text-slate-500 uppercase tracking-wide">
            Rendiciones recientes
          </h2>
          <div className="space-y-2">
            {recent.map(report => (
              <ExpenseReportCard
                key={report.id}
                report={{
                  ...report,
                  status: report.status as ReportStatus,
                  currency: report.currency ?? 'CLP',
                }}
              />
            ))}
          </div>
          {reports.length > 5 && (
            <Link href="/reimbursements" className="block text-center text-sm text-brand-600 hover:underline">
              Ver todas ({reports.length})
            </Link>
          )}
        </div>
      )}

      {recent.length === 0 && (
        <div className="text-center py-12 text-slate-400">
          <p className="text-4xl mb-3">🧾</p>
          <p className="font-medium">No tenés rendiciones aún</p>
          <p className="text-sm mt-1">Usá el botón de arriba para crear tu primera</p>
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 2: Verificar en navegador**

```bash
npm run dev
```

Loguearse y verificar:
- Card héroe con gradiente morado visible
- KPIs en 0 (sin datos aún)
- Botón "Tomá la foto y listo" visible y de color indigo
- Empty state cuando no hay rendiciones

- [ ] **Step 3: Commit**

```bash
git add src/app/(app)/page.tsx
git commit -m "feat: rendidor dashboard — hero card, KPIs, recent reports, CTA"
```

---

## Task 8: Página de creación de rendición

**Files:**
- Crear: `src/app/(app)/expenses/new/page.tsx`

- [ ] **Step 1: Implementar página de nueva rendición**

Crear `src/app/(app)/expenses/new/page.tsx`:

```typescript
'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createExpenseReport } from '@/actions/expenses'

export default function NewExpensePage() {
  const [loading, setLoading] = useState(false)
  const [error, setError]     = useState<string | null>(null)
  const router = useRouter()

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setLoading(true)
    setError(null)

    const form = new FormData(e.currentTarget)

    try {
      await createExpenseReport(form)
      // createExpenseReport hace redirect interno al nuevo ID
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al crear la rendición')
      setLoading(false)
    }
  }

  return (
    <div className="max-w-lg mx-auto space-y-6">
      <div>
        <h1 className="text-xl font-bold text-slate-800">Nueva rendición</h1>
        <p className="text-sm text-slate-500 mt-1">
          Primero dale un nombre, después vas a agregar los ítems con fotos
        </p>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-item p-3">
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit} className="bg-white rounded-card shadow-card p-5 space-y-4">
        <div>
          <label htmlFor="title" className="block text-sm font-semibold text-slate-700 mb-1">
            Nombre de la rendición *
          </label>
          <input
            id="title"
            name="title"
            type="text"
            required
            placeholder="Ej: Viaje a Santiago — Mayo 2026"
            className="w-full px-3 py-2.5 border border-slate-200 rounded-item text-sm focus:outline-none focus:ring-2 focus:ring-brand-600"
          />
          <p className="text-xs text-slate-400 mt-1">
            Un nombre que identifique claramente el grupo de gastos
          </p>
        </div>

        <div>
          <label htmlFor="description" className="block text-sm font-semibold text-slate-700 mb-1">
            Descripción (opcional)
          </label>
          <textarea
            id="description"
            name="description"
            rows={2}
            placeholder="Contexto adicional para quien aprueba..."
            className="w-full px-3 py-2.5 border border-slate-200 rounded-item text-sm focus:outline-none focus:ring-2 focus:ring-brand-600 resize-none"
          />
        </div>

        <div className="flex gap-3">
          <button
            type="button"
            onClick={() => router.back()}
            disabled={loading}
            className="flex-1 py-2.5 px-4 border border-slate-200 rounded-item text-sm font-semibold text-slate-600 hover:bg-slate-50"
          >
            Cancelar
          </button>
          <button
            type="submit"
            disabled={loading}
            className="flex-1 py-2.5 px-4 bg-brand-600 hover:bg-brand-700 text-white rounded-item text-sm font-semibold disabled:opacity-50"
          >
            {loading ? 'Creando...' : 'Continuar →'}
          </button>
        </div>
      </form>
    </div>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add src/app/(app)/expenses/new/page.tsx
git commit -m "feat: new expense page — title/description form, creates draft"
```

---

## Task 9: Página de detalle de rendición (agregar ítems + enviar)

**Files:**
- Crear: `src/app/(app)/expenses/[id]/page.tsx`

- [ ] **Step 1: Implementar página de detalle**

Crear `src/app/(app)/expenses/[id]/page.tsx`:

```typescript
'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { ExpenseItemForm, type ItemFormData } from '@/components/expenses/ExpenseItemForm'
import { ExpenseItemCard } from '@/components/expenses/ExpenseItemCard'
import { ReportStatusBadge } from '@/components/ui/Badge'
import { CurrencyAmount } from '@/components/ui/CurrencyAmount'
import {
  addExpenseItem,
  deleteExpenseItem,
  submitExpenseReport,
  uploadAttachment,
  getReportWithItems,
} from '@/actions/expenses'
import type { ExpenseCategory, ExpenseReport } from '@/lib/supabase/types'

type ReportWithItems = Awaited<ReturnType<typeof getReportWithItems>>

export default function ExpenseDetailPage() {
  const { id } = useParams<{ id: string }>()
  const router  = useRouter()

  const [report, setReport]           = useState<ReportWithItems>(null)
  const [categories, setCategories]   = useState<ExpenseCategory[]>([])
  const [showForm, setShowForm]       = useState(false)
  const [submitting, setSubmitting]   = useState(false)
  const [error, setError]             = useState<string | null>(null)
  const [loading, setLoading]         = useState(true)

  async function load() {
    const data = await getReportWithItems(id)
    setReport(data)
    setLoading(false)
  }

  useEffect(() => {
    load()

    const supabase = createClient()
    supabase
      .from('expense_categories')
      .select('*')
      .order('name')
      .then(({ data }) => setCategories(data ?? []))
  }, [id])

  async function handleSaveItem(data: ItemFormData) {
    if (!report) return
    setError(null)

    const amount = parseFloat(data.amount.replace(/\./g, '').replace(',', '.'))

    const itemId = await addExpenseItem(id, {
      description:         data.description,
      amount,
      currency:            data.currency,
      exchange_rate:       data.exchange_rate,
      exchange_rate_source: data.exchange_rate_source,
      amount_clp:          data.amount_clp || Math.round(amount * data.exchange_rate),
      date:                data.date,
      category_id:         data.category_id || null,
      merchant:            data.merchant || null,
      doc_type:            data.doc_type || null,
      doc_number:          data.doc_number || null,
      notes:               data.notes || null,
      ocr_raw:             data.ocr_raw,
      ocr_confidence:      data.ocr_confidence,
    })

    // Subir foto si existe
    if (data.file && itemId) {
      const supabase = createClient()
      const { data: profile } = await supabase
        .from('users').select('org_id').eq('id', (await supabase.auth.getUser()).data.user!.id).single()
      if (profile) {
        await uploadAttachment(itemId, profile.org_id, data.file).catch(console.error)
      }
    }

    setShowForm(false)
    await load()
  }

  async function handleDeleteItem(itemId: string) {
    if (!confirm('¿Eliminar este ítem?')) return
    await deleteExpenseItem(itemId, id)
    await load()
  }

  async function handleSubmit() {
    if (!confirm('¿Enviar esta rendición a revisión? No podrás editarla después.')) return
    setSubmitting(true)
    setError(null)
    try {
      await submitExpenseReport(id)
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al enviar')
    } finally {
      setSubmitting(false)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-48">
        <div className="w-8 h-8 border-2 border-brand-600 border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  if (!report) {
    return (
      <div className="text-center py-12 text-slate-400">
        <p>Rendición no encontrada</p>
        <button onClick={() => router.push('/')} className="text-brand-600 text-sm mt-2">
          Volver al inicio
        </button>
      </div>
    )
  }

  const isDraft = report.status === 'draft'
  const items   = report.expense_items ?? []

  return (
    <div className="max-w-2xl mx-auto space-y-4">
      {/* Encabezado */}
      <div className="flex items-start justify-between gap-2">
        <div>
          <h1 className="text-xl font-bold text-slate-800">{report.title}</h1>
          {report.description && (
            <p className="text-sm text-slate-500 mt-1">{report.description}</p>
          )}
        </div>
        <ReportStatusBadge status={report.status as any} />
      </div>

      {/* Total */}
      <div className="bg-white rounded-card shadow-card p-4 flex items-center justify-between">
        <span className="text-sm text-slate-500">Total rendición</span>
        <CurrencyAmount amount={report.total_amount} currency="CLP" size="lg" />
      </div>

      {/* Error */}
      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-item p-3">
          {error}
        </div>
      )}

      {/* Lista de ítems */}
      <div className="space-y-2">
        {items.map(item => (
          <ExpenseItemCard
            key={item.id}
            item={item as any}
            canDelete={isDraft}
            onDelete={handleDeleteItem}
          />
        ))}
      </div>

      {/* Formulario de nuevo ítem */}
      {showForm && isDraft && (
        <ExpenseItemForm
          categories={categories}
          onSave={handleSaveItem}
          onCancel={() => setShowForm(false)}
        />
      )}

      {/* Acciones */}
      {isDraft && (
        <div className="space-y-3 pt-2">
          {!showForm && (
            <button
              onClick={() => setShowForm(true)}
              className="w-full py-3 border-2 border-dashed border-brand-200 hover:border-brand-400 rounded-card text-brand-600 font-semibold text-sm transition-colors flex items-center justify-center gap-2"
            >
              <span>+</span> Agregar ítem
            </button>
          )}

          {items.length > 0 && !showForm && (
            <button
              onClick={handleSubmit}
              disabled={submitting}
              className="w-full py-3 bg-brand-600 hover:bg-brand-700 disabled:opacity-50 text-white font-semibold rounded-card transition-colors"
            >
              {submitting ? 'Enviando...' : `Enviar a revisión — ${items.length} ítem${items.length !== 1 ? 's' : ''}`}
            </button>
          )}
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 2: Verificar el flujo completo en navegador**

```bash
npm run dev
```

Flujo a verificar:
1. Ir a "/" → ver dashboard
2. Click "Tomá la foto y listo" → página de nueva rendición
3. Llenar título → Click "Continuar" → redirige a `/expenses/[id]`
4. Click "Agregar ítem" → aparece formulario
5. Subir foto → OCR se dispara (si ANTHROPIC_API_KEY está configurada)
6. Llenar campos manualmente → Click "Agregar ítem"
7. Ver el ítem con acento lateral en la lista
8. Click "Enviar a revisión" → estado cambia a "En revisión"

- [ ] **Step 3: Commit**

```bash
git add src/app/(app)/expenses/
git commit -m "feat: expense detail page — add items, OCR, multi-currency, submit flow"
```

---

## Task 10: Historial de reembolsos

**Files:**
- Crear: `src/app/(app)/reimbursements/page.tsx`

- [ ] **Step 1: Implementar página de reembolsos**

Crear `src/app/(app)/reimbursements/page.tsx`:

```typescript
import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { ExpenseReportCard } from '@/components/expenses/ExpenseReportCard'
import { CurrencyAmount } from '@/components/ui/CurrencyAmount'
import type { ReportStatus } from '@/lib/constants'

export default async function ReimbursementsPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: reports } = await supabase
    .from('expense_reports')
    .select('id, title, status, total_amount, approved_amount, currency, submitted_at, created_at, reimbursed_at, payment_reference')
    .eq('submitter_id', user.id)
    .order('created_at', { ascending: false })

  const all          = reports ?? []
  const reimbursed   = all.filter(r => r.status === 'reimbursed')
  const totalReimbursed = reimbursed.reduce((s, r) => s + r.approved_amount, 0)

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <h1 className="text-xl font-bold text-slate-800">Mis rendiciones</h1>

      {/* KPI total reembolsado */}
      {reimbursed.length > 0 && (
        <div className="bg-white rounded-card shadow-card p-4">
          <p className="text-sm text-slate-500">Total reembolsado</p>
          <CurrencyAmount amount={totalReimbursed} currency="CLP" size="lg" />
        </div>
      )}

      {/* Lista completa */}
      <div className="space-y-2">
        {all.map(report => (
          <div key={report.id}>
            <ExpenseReportCard
              report={{
                ...report,
                status: report.status as ReportStatus,
                currency: report.currency ?? 'CLP',
              }}
            />
            {report.status === 'reimbursed' && report.payment_reference && (
              <p className="text-xs text-slate-400 ml-2 mt-1">
                Ref: {report.payment_reference}
                {report.reimbursed_at && ` · ${new Date(report.reimbursed_at).toLocaleDateString('es-CL')}`}
              </p>
            )}
          </div>
        ))}
      </div>

      {all.length === 0 && (
        <div className="text-center py-12 text-slate-400">
          <p className="text-4xl mb-3">🧾</p>
          <p className="font-medium">Sin rendiciones aún</p>
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 2: Commit final Plan B**

```bash
git add -A
git commit -m "feat: Plan B complete — full rendidor flow: create, OCR, multi-currency, submit, history"
```

---

## Verificación final del Plan B

Antes de continuar con el Plan C, verificar que:

- [ ] `npm test` pasa (~15 tests en verde)
- [ ] `npm run build` compila sin errores
- [ ] Se puede crear una rendición con título → redirige a detalle
- [ ] Se puede agregar un ítem con foto (OCR intenta extraer datos)
- [ ] Si OCR falla, el formulario queda vacío para llenar manualmente
- [ ] El TC se consulta para monedas distintas de CLP
- [ ] Se puede enviar la rendición (estado pasa a "En revisión")
- [ ] El dashboard muestra los montos en las 3 columnas de KPI
