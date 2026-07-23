# Importador Histórico Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Permitir al admin cargar rendiciones y cajas chicas de períodos anteriores para exportarlas a Defontana y generar informes de año completo.

**Architecture:** Todo el dato histórico (rendiciones y cajas chicas) se almacena como `expense_reports` + `expense_items` en estado `approved`, con el flag `is_historical_import = true`. Esto reutiliza el pipeline de Defontana sin modificarlo. El parser extrae la tabla del Excel existente del cliente; Claude sugiere categorías por descripción; el admin completa los campos faltantes en una grilla editable antes de confirmar.

**Tech Stack:** Next.js 16 App Router, Supabase, xlsx (SheetJS ya instalado), Anthropic SDK (ya instalado), Tailwind v4, Lucide React, Vitest.

## Global Constraints

- Next.js 16: protección de rutas vía `src/proxy.ts`, NO `middleware.ts`
- Tailwind v4: config en `globals.css` vía `@theme {}`, NO `tailwind.config.*`
- Supabase proyecto `jqtbtgduqzxkgubmzukg`
- Toda función exportada en `src/actions/*.ts` debe ser `async`
- Helpers puros SIEMPRE en `src/lib/`, nunca en `src/actions/`
- `'use server'` solo en `src/actions/`; los tests importan desde `src/lib/`
- Fuentes: `font-display` (Bricolage), `font-hanken` (body), `font-mono-amount` (montos)
- Color primario: `brand-*` (teal), nunca `indigo-*`
- Radios: `rounded-card` (18px) en cards, `rounded-item` (14px) en ítems
- Centro de costo por defecto: `EMPGESINGING`
- Ambos tipos de documento histórico (rendición + caja chica) se almacenan como `expense_reports`

---

## File Map

| Archivo | Acción | Responsabilidad |
|---------|--------|-----------------|
| `supabase/migrations/007_historical_import_flag.sql` | Crear | Agrega `is_historical_import` a las dos tablas |
| `src/lib/supabase/types.ts` | Modificar | Tipado de `is_historical_import` |
| `src/lib/historical-import/parser.ts` | Crear | Parser puro del Excel → estructura tipada |
| `src/lib/historical-import/categorizer.ts` | Crear | Helpers puros para prompt + parse de respuesta Claude |
| `src/tests/historical-import-parser.test.ts` | Crear | Tests del parser |
| `src/tests/historical-import-categorizer.test.ts` | Crear | Tests del categorizer |
| `src/actions/historical-import.ts` | Crear | Server Actions: parse Excel, categorizar IA, confirmar importación |
| `src/app/(app)/admin/carga-historica/page.tsx` | Crear | Server Component: carga categorías, empleados, centros de costo |
| `src/app/(app)/admin/carga-historica/client.tsx` | Crear | Client Component: grilla completa con tabs Excel/Manual |
| `src/components/layout/Sidebar.tsx` | Modificar | Añadir enlace "Carga Histórica" |
| `src/components/layout/MobileNav.tsx` | Modificar | Idem para mobile |

---

## Task 1: Migración DB y tipos TypeScript

**Files:**
- Create: `supabase/migrations/007_historical_import_flag.sql`
- Modify: `src/lib/supabase/types.ts`

**Interfaces:**
- Produce: `expense_reports.Row.is_historical_import: boolean`, `petty_cash_funds.Row.is_historical_import: boolean`

- [ ] **Step 1: Escribir la migración SQL**

```sql
-- supabase/migrations/007_historical_import_flag.sql
ALTER TABLE public.expense_reports
  ADD COLUMN IF NOT EXISTS is_historical_import BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE public.petty_cash_funds
  ADD COLUMN IF NOT EXISTS is_historical_import BOOLEAN NOT NULL DEFAULT false;
```

- [ ] **Step 2: Aplicar la migración en Supabase Dashboard**

Ir a https://supabase.com/dashboard/project/jqtbtgduqzxkgubmzukg → SQL Editor → pegar y ejecutar la migración.
Verificar: `SELECT column_name FROM information_schema.columns WHERE table_name = 'expense_reports' AND column_name = 'is_historical_import';` debe retornar una fila.

- [ ] **Step 3: Actualizar `src/lib/supabase/types.ts`**

En el bloque `expense_reports`, agregar en `Row`, `Insert` y `Update`:

```typescript
// En Row (después de defontana_export_ref:):
is_historical_import: boolean

// En Insert (después de defontana_export_ref?:):
is_historical_import?: boolean

// En Update (después de defontana_export_ref?:):
is_historical_import?: boolean
```

En el bloque `petty_cash_funds`, agregar en `Row`, `Insert` y `Update`:

```typescript
// En Row (después de deleted_at:):
is_historical_import: boolean

// En Insert:
is_historical_import?: boolean

// En Update:
is_historical_import?: boolean
```

- [ ] **Step 4: Verificar TypeScript**

```bash
npx tsc --noEmit
```

Esperado: sin errores.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/007_historical_import_flag.sql src/lib/supabase/types.ts
git commit -m "feat: add is_historical_import flag to expense_reports and petty_cash_funds"
```

---

## Task 2: Parser de Excel — librería pura

**Files:**
- Create: `src/lib/historical-import/parser.ts`
- Create: `src/tests/historical-import-parser.test.ts`

**Interfaces:**
- Produce:
  ```typescript
  interface ParsedItem {
    employeeName: string     // "ESTEBAN VARAS"
    description: string      // "TAXI CONCEPCION IDA Y VUELTA"
    date: string             // "2026-01-30" — ya convertido de serial Excel
    amountCLP: number        // 31000
    projectCode: string | null // "2964" o null
  }
  interface ParsedHistoricalImport {
    importType: 'rendicion' | 'caja_chica'
    fundNumber: string       // "173"
    officeName: string       // "OFICINA DE INGENIERÍA"
    rendicionDate: string    // "2026-02-24"
    totalAmount: number      // 214100
    items: ParsedItem[]
  }
  export function parseExcelBuffer(buffer: ArrayBuffer): ParsedHistoricalImport
  export function xlSerialToDate(serial: number): string
  ```

- [ ] **Step 1: Escribir los tests primero**

```typescript
// src/tests/historical-import-parser.test.ts
import { describe, it, expect } from 'vitest'
import { xlSerialToDate, parseExcelBuffer } from '@/lib/historical-import/parser'
import * as XLSX from 'xlsx'

describe('xlSerialToDate', () => {
  it('convierte serial Excel 46077 a 2026-02-24', () => {
    expect(xlSerialToDate(46077)).toBe('2026-02-24')
  })
  it('convierte serial 46045 a 2026-01-23', () => {
    expect(xlSerialToDate(46045)).toBe('2026-01-23')
  })
  it('convierte serial 46052 a 2026-01-30', () => {
    expect(xlSerialToDate(46052)).toBe('2026-01-30')
  })
})

describe('parseExcelBuffer', () => {
  function makeWorkbook(rows: unknown[][]): ArrayBuffer {
    const ws = XLSX.utils.aoa_to_sheet(rows)
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Rendición')
    const buf = XLSX.write(wb, { type: 'array', bookType: 'xlsx' })
    return buf
  }

  it('extrae el tipo caja_chica cuando el encabezado dice CAJA CHICA', () => {
    const rows = buildTestRows()
    const result = parseExcelBuffer(makeWorkbook(rows))
    expect(result.importType).toBe('caja_chica')
  })

  it('extrae número de fondo y nombre de oficina', () => {
    const rows = buildTestRows()
    const result = parseExcelBuffer(makeWorkbook(rows))
    expect(result.fundNumber).toBe('173')
    expect(result.officeName).toBe('OFICINA DE INGENIERÍA')
  })

  it('convierte la fecha de rendición a YYYY-MM-DD', () => {
    const rows = buildTestRows()
    const result = parseExcelBuffer(makeWorkbook(rows))
    expect(result.rendicionDate).toBe('2026-02-24')
  })

  it('extrae 6 ítems con sus datos correctos', () => {
    const rows = buildTestRows()
    const result = parseExcelBuffer(makeWorkbook(rows))
    expect(result.items).toHaveLength(6)
    expect(result.items[0].employeeName).toBe('ESTEBAN VARAS')
    expect(result.items[0].description).toBe('TAXI CONCEPCION VUELTA')
    expect(result.items[0].date).toBe('2026-01-23')
    expect(result.items[0].amountCLP).toBe(13000)
    expect(result.items[0].projectCode).toBe('2982')
  })

  it('ignora filas vacías de la tabla (Item sin Gastos)', () => {
    const rows = buildTestRows()
    const result = parseExcelBuffer(makeWorkbook(rows))
    // Solo 6 items tienen monto, el resto están vacíos
    expect(result.items.every(i => i.amountCLP > 0)).toBe(true)
  })

  it('calcula el totalAmount como suma de gastos', () => {
    const rows = buildTestRows()
    const result = parseExcelBuffer(makeWorkbook(rows))
    expect(result.totalAmount).toBe(214100)
  })
})

// Helper que construye una hoja con la misma estructura que Caja Chica 173.xlsx
function buildTestRows(): unknown[][] {
  // Posiciones: fila base 0-indexed, columnas A=0 B=1 C=2 D=3 E=4 F=5 G=6 H=7 I=8
  const rows: unknown[][] = Array.from({ length: 55 }, () => Array(11).fill(''))

  // Fila 5 (index 5): Nombre tipo + N°
  rows[5][3] = 'CAJA CHICA'
  rows[5][7] = 'N°'
  rows[5][8] = 173

  // Fila 7 (index 7): Oficina + fecha rendición
  rows[7][3] = 'OFICINA DE INGENIERÍA'
  rows[7][4] = 'Fecha de Rendición'
  rows[7][6] = 46077  // 2026-02-24

  // Fila 10 (index 10): Headers
  rows[10][1] = 'Item'
  rows[10][2] = 'Usuario'
  rows[10][3] = 'Razón'
  rows[10][4] = 'Proyecto'
  rows[10][5] = 'Fecha'
  rows[10][6] = 'Gastos'
  rows[10][7] = 'Ingresos'
  rows[10][8] = 'Saldo'

  // Fila 12 (index 12): Saldo inicial
  rows[12][8] = 200000

  // Items desde fila 14 (index 14)
  const items = [
    [1, 'ESTEBAN VARAS', 'TAXI CONCEPCION VUELTA', 2982, 46045, 13000],
    [2, 'ESTEBAN VARAS', 'TAXI CONCEPCION IDA Y  VUELTA', 2964, 46052, 31000],
    [3, 'CLAUDIA LOBOS', 'DESAYUNO ALEXIS VILLA', '', 46058, 34900],
    [4, 'CAMILA NAVARRO', 'DESAYUNO ERICK PIZARRO', '', 46064, 34400],
    [5, 'ESTEBAN VARAS', 'EXAMEN ALCOHOL Y DROGAS', 2964, 46064, 50400],
    [6, 'LEONEL CACERES', 'EXAMEN ALCOHOL Y DROGAS', 2964, 46065, 50400],
  ]
  items.forEach(([num, usuario, razon, proyecto, fecha, gastos], i) => {
    const r = rows[14 + i]
    r[1] = num; r[2] = usuario; r[3] = razon
    r[4] = proyecto; r[5] = fecha; r[6] = gastos
  })

  // Resumen fila 47 (index 47)
  rows[47][2] = 'Total Gastos'
  rows[47][6] = 214100

  return rows
}
```

- [ ] **Step 2: Correr tests y verificar que FALLAN (módulo no existe aún)**

```bash
npx vitest run src/tests/historical-import-parser.test.ts
```

Esperado: Error "Cannot find module '@/lib/historical-import/parser'"

- [ ] **Step 3: Implementar el parser**

```typescript
// src/lib/historical-import/parser.ts
import * as XLSX from 'xlsx'

export interface ParsedItem {
  employeeName: string
  description: string
  date: string
  amountCLP: number
  projectCode: string | null
}

export interface ParsedHistoricalImport {
  importType: 'rendicion' | 'caja_chica'
  fundNumber: string
  officeName: string
  rendicionDate: string
  totalAmount: number
  items: ParsedItem[]
}

/** Convierte serial de fecha Excel (epoch 1899-12-30) a YYYY-MM-DD */
export function xlSerialToDate(serial: number): string {
  const ms = Date.UTC(1899, 11, 30) + serial * 86_400_000
  return new Date(ms).toISOString().split('T')[0]
}

/** Parsea un ArrayBuffer de .xlsx con la estructura de los archivos del cliente */
export function parseExcelBuffer(buffer: ArrayBuffer): ParsedHistoricalImport {
  const wb = XLSX.read(buffer, { type: 'array' })
  const ws = wb.Sheets[wb.SheetNames[0]]
  // Leer como array 2D; defval '' para celdas vacías
  const rows = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, defval: '' }) as unknown[][]

  // ── Encabezado ────────────────────────────────────────────────────────────
  // Fila 5 (index 5): col D (3) = "CAJA CHICA" o "RENDICIÓN", col I (8) = número
  const typeCell = String(rows[5]?.[3] ?? '').trim().toUpperCase()
  const importType: 'rendicion' | 'caja_chica' =
    typeCell.includes('RENDIC') ? 'rendicion' : 'caja_chica'
  const fundNumber = String(rows[5]?.[8] ?? '').trim()

  // Fila 7 (index 7): col D (3) = nombre oficina/empleado, col G (6) = fecha serial
  const officeName = String(rows[7]?.[3] ?? '').trim()
  const dateSerial = rows[7]?.[6]
  const rendicionDate = typeof dateSerial === 'number' ? xlSerialToDate(dateSerial) : ''

  // ── Items ─────────────────────────────────────────────────────────────────
  // Buscar la fila con encabezados "Item" / "Usuario" (col B = index 1)
  let dataStart = -1
  for (let i = 0; i < Math.min(rows.length, 20); i++) {
    if (String(rows[i]?.[1] ?? '').trim().toLowerCase() === 'item') {
      dataStart = i + 2  // primera fila de datos es 2 después del header (hay fila de saldo inicial)
      break
    }
  }
  if (dataStart === -1) dataStart = 14  // fallback posición conocida

  const items: ParsedItem[] = []
  let totalAmount = 0

  for (let i = dataStart; i < rows.length; i++) {
    const row = rows[i]
    const itemNum = row?.[1]
    const usuario = String(row?.[2] ?? '').trim()
    const razon   = String(row?.[3] ?? '').trim()
    const proyecto = row?.[4]
    const fechaSerial = row?.[5]
    const gastos  = row?.[6]

    // Una fila de datos válida tiene: número de item, empleado, razón y monto
    if (typeof itemNum !== 'number' || !usuario || !razon) continue
    const amount = typeof gastos === 'number' && gastos > 0 ? gastos : 0
    if (amount === 0) continue

    const date = typeof fechaSerial === 'number'
      ? xlSerialToDate(fechaSerial)
      : rendicionDate  // fallback a fecha de rendición

    items.push({
      employeeName: usuario,
      description:  razon,
      date,
      amountCLP:    amount,
      projectCode:  proyecto && typeof proyecto === 'number' ? String(proyecto) : null,
    })
    totalAmount += amount
  }

  return { importType, fundNumber, officeName, rendicionDate, totalAmount, items }
}
```

- [ ] **Step 4: Correr tests y verificar que PASAN**

```bash
npx vitest run src/tests/historical-import-parser.test.ts
```

Esperado: ✓ 8 tests passed

- [ ] **Step 5: Commit**

```bash
git add src/lib/historical-import/parser.ts src/tests/historical-import-parser.test.ts
git commit -m "feat: Excel parser for historical import (pure lib, tested)"
```

---

## Task 3: Categorizer — helpers puros para Claude

**Files:**
- Create: `src/lib/historical-import/categorizer.ts`
- Create: `src/tests/historical-import-categorizer.test.ts`

**Interfaces:**
- Consume: `ParsedItem[]` de Task 2
- Produce:
  ```typescript
  interface CategorySuggestion {
    index: number          // índice del item en el array de entrada
    categoryId: string | null
    confidence: number     // 0-1
  }
  export function buildCategorizerPrompt(
    items: Array<{ description: string; merchantHint?: string }>,
    categories: Array<{ id: string; name: string }>
  ): string
  export function parseCategorizeResponse(text: string): CategorySuggestion[]
  ```

- [ ] **Step 1: Escribir los tests**

```typescript
// src/tests/historical-import-categorizer.test.ts
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
```

- [ ] **Step 2: Correr tests y verificar que FALLAN**

```bash
npx vitest run src/tests/historical-import-categorizer.test.ts
```

Esperado: Error "Cannot find module '@/lib/historical-import/categorizer'"

- [ ] **Step 3: Implementar el categorizer**

```typescript
// src/lib/historical-import/categorizer.ts

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
```

- [ ] **Step 4: Correr tests y verificar que PASAN**

```bash
npx vitest run src/tests/historical-import-categorizer.test.ts
```

Esperado: ✓ 7 tests passed

- [ ] **Step 5: Commit**

```bash
git add src/lib/historical-import/categorizer.ts src/tests/historical-import-categorizer.test.ts
git commit -m "feat: AI categorizer helpers for historical import (pure lib, tested)"
```

---

## Task 4: Server Actions para importación histórica

**Files:**
- Create: `src/actions/historical-import.ts`

**Interfaces:**
- Consume: `ParsedHistoricalImport` de Task 2, `CategorySuggestion[]` de Task 3
- Produce:
  ```typescript
  export async function parseUploadedExcel(formData: FormData): Promise<ParsedHistoricalImport>
  export async function categorizeItems(
    items: Array<{ description: string; merchantHint?: string }>
  ): Promise<CategorySuggestion[]>
  export async function commitHistoricalImport(data: {
    title: string
    responsibleUserId: string
    approvedDate: string
    rows: HistoricalGridRow[]
  }): Promise<{ reportId: string }>
  
  interface HistoricalGridRow {
    employeeName: string
    description: string
    date: string
    amountCLP: number
    categoryId: string | null
    costCenterId: string
    docType: 'boleta' | 'factura' | 'factura_exenta' | 'ticket' | 'otro'
    docNumber: string | null
    supplierRut: string | null
  }
  ```

- [ ] **Step 1: Crear `src/actions/historical-import.ts`**

```typescript
'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import Anthropic from '@anthropic-ai/sdk'
import { parseExcelBuffer, type ParsedHistoricalImport } from '@/lib/historical-import/parser'
import { buildCategorizerPrompt, parseCategorizeResponse, type CategorySuggestion } from '@/lib/historical-import/categorizer'

export type { ParsedHistoricalImport } from '@/lib/historical-import/parser'
export type { CategorySuggestion } from '@/lib/historical-import/categorizer'

export interface HistoricalGridRow {
  employeeName:  string
  description:   string
  date:          string
  amountCLP:     number
  categoryId:    string | null
  costCenterId:  string
  docType:       'boleta' | 'factura' | 'factura_exenta' | 'ticket' | 'otro'
  docNumber:     string | null
  supplierRut:   string | null
}

async function requireAdmin() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')
  const { data: profile } = await supabase
    .from('users').select('org_id, role').eq('id', user.id).single()
  if (!profile || profile.role !== 'admin') throw new Error('Solo administradores')
  return { supabase, userId: user.id, orgId: profile.org_id }
}

/** Recibe el FormData con el archivo y retorna la estructura parseada */
export async function parseUploadedExcel(formData: FormData): Promise<ParsedHistoricalImport> {
  await requireAdmin()  // verifica que sea admin antes de procesar
  const file = formData.get('file') as File | null
  if (!file) throw new Error('No se recibió ningún archivo')
  const buffer = await file.arrayBuffer()
  return parseExcelBuffer(buffer)
}

/** Llama a Claude para sugerir categorías de los ítems */
export async function categorizeItems(
  items: Array<{ description: string; merchantHint?: string }>,
): Promise<CategorySuggestion[]> {
  const { supabase, orgId } = await requireAdmin()

  // Cargar categorías de la org
  const { data: cats } = await supabase
    .from('expense_categories')
    .select('id, name')
    .or(`org_id.eq.${orgId},org_id.is.null`)
    .eq('is_active', true)

  if (!cats?.length) return []

  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! })

  const prompt = buildCategorizerPrompt(items, cats)

  try {
    const response = await client.messages.create({
      model:      'claude-haiku-4-5-20251001',  // Haiku es suficiente y más barato para clasificación
      max_tokens: 1024,
      messages:   [{ role: 'user', content: prompt }],
    })
    const text = response.content[0].type === 'text' ? response.content[0].text : ''
    return parseCategorizeResponse(text)
  } catch (err) {
    console.error('[CATEGORIZE] Error:', err)
    return []
  }
}

/** Crea el expense_report + expense_items en estado aprobado */
export async function commitHistoricalImport(data: {
  title:              string
  responsibleUserId:  string
  approvedDate:       string  // YYYY-MM-DD — fecha de rendición del documento fuente
  rows:               HistoricalGridRow[]
}): Promise<{ reportId: string }> {
  const { supabase, orgId } = await requireAdmin()

  if (!data.rows.length) throw new Error('No hay ítems para importar')
  if (!data.approvedDate) throw new Error('La fecha de rendición es obligatoria')

  const totalAmount = data.rows.reduce((s, r) => s + r.amountCLP, 0)

  // 1. Crear el expense_report directamente en estado 'approved'
  const { data: report, error: repErr } = await supabase
    .from('expense_reports')
    .insert({
      org_id:               orgId,
      submitter_id:         data.responsibleUserId,
      title:                data.title.trim(),
      status:               'approved',
      current_level:        1,
      total_amount:         totalAmount,
      approved_amount:      totalAmount,
      currency:             'CLP',
      approved_at:          data.approvedDate + 'T12:00:00Z',
      is_historical_import: true,
    })
    .select('id')
    .single()

  if (repErr) throw new Error(`Error creando reporte: ${repErr.message}`)
  const reportId = report.id

  // 2. Crear los ítems en estado 'approved'
  const itemInserts = data.rows.map(row => ({
    report_id:            reportId,
    org_id:               orgId,
    description:          row.description.trim(),
    amount:               row.amountCLP,
    currency:             'CLP',
    exchange_rate:        1,
    exchange_rate_source: 'manual' as const,
    amount_clp:           row.amountCLP,
    date:                 row.date,
    category_id:          row.categoryId,
    cost_center_id:       row.costCenterId || null,
    doc_type:             row.docType,
    doc_number:           row.docNumber || null,
    supplier_rut:         row.supplierRut || null,
    merchant:             row.employeeName || null,  // empleado como merchant para trazabilidad
    status:               'approved' as const,
  }))

  const { error: itemErr } = await supabase.from('expense_items').insert(itemInserts)
  if (itemErr) {
    // Rollback: borrar el report si falla la inserción de ítems
    await supabase.from('expense_reports').delete().eq('id', reportId)
    throw new Error(`Error creando ítems: ${itemErr.message}`)
  }

  revalidatePath('/admin/reports')
  revalidatePath('/admin/carga-historica')
  return { reportId }
}
```

- [ ] **Step 2: Verificar TypeScript**

```bash
npx tsc --noEmit
```

Esperado: sin errores.

- [ ] **Step 3: Commit**

```bash
git add src/actions/historical-import.ts
git commit -m "feat: server actions for historical import (parse, categorize, commit)"
```

---

## Task 5: Página admin — Server Component + Client Component

**Files:**
- Create: `src/app/(app)/admin/carga-historica/page.tsx`
- Create: `src/app/(app)/admin/carga-historica/client.tsx`

**Interfaces:**
- Consume: `parseUploadedExcel`, `categorizeItems`, `commitHistoricalImport` de Task 4
- Consume: `getCostCenters`, `getOrgCategories`, `getOrgEmployees` de `src/actions/admin`

- [ ] **Step 1: Crear el Server Component**

```typescript
// src/app/(app)/admin/carga-historica/page.tsx
import { getOrgCategories, getOrgEmployees, getCostCenters } from '@/actions/admin'
import { HistoricalImportClient } from './client'

export default async function CargaHistoricaPage() {
  const [categories, employeesRes, costCenters] = await Promise.all([
    getOrgCategories(),
    getOrgEmployees(),
    getCostCenters(),
  ])

  return (
    <HistoricalImportClient
      categories={categories}
      employees={employeesRes}
      costCenters={costCenters}
    />
  )
}
```

- [ ] **Step 2: Crear el Client Component (parte 1 — tipos, estado y layout)**

```typescript
// src/app/(app)/admin/carga-historica/client.tsx
'use client'

import { useState, useRef } from 'react'
import { Upload, Plus, Trash2, CheckCircle2, AlertTriangle, History, X } from 'lucide-react'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { CurrencyAmount } from '@/components/ui/CurrencyAmount'
import {
  parseUploadedExcel,
  categorizeItems,
  commitHistoricalImport,
  type ParsedHistoricalImport,
  type HistoricalGridRow,
  type CategorySuggestion,
} from '@/actions/historical-import'
import type { ExpenseCategory, UserProfile, CostCenter } from '@/lib/supabase/types'

const DEFAULT_COST_CENTER = 'EMPGESINGING'
const DOC_TYPES = [
  { value: 'boleta',          label: 'Boleta' },
  { value: 'factura',         label: 'Factura' },
  { value: 'factura_exenta',  label: 'Factura Exenta' },
  { value: 'ticket',          label: 'Ticket' },
  { value: 'otro',            label: 'Otro' },
] as const

interface Props {
  categories:  ExpenseCategory[]
  employees:   UserProfile[]
  costCenters: CostCenter[]
}

interface GridRow extends HistoricalGridRow {
  _key: string  // key local para React
}

function emptyRow(): GridRow {
  return {
    _key:         crypto.randomUUID(),
    employeeName: '',
    description:  '',
    date:         new Date().toISOString().split('T')[0],
    amountCLP:    0,
    categoryId:   null,
    costCenterId: DEFAULT_COST_CENTER,
    docType:      'boleta',
    docNumber:    null,
    supplierRut:  null,
  }
}

export function HistoricalImportClient({ categories, employees, costCenters }: Props) {
  const [tab, setTab] = useState<'excel' | 'manual'>('excel')
  const [parsed, setParsed] = useState<ParsedHistoricalImport | null>(null)
  const [rows, setRows] = useState<GridRow[]>([emptyRow()])
  const [title, setTitle] = useState('')
  const [responsibleId, setResponsibleId] = useState(employees[0]?.id ?? '')
  const [approvedDate, setApprovedDate] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [isCategorizing, setIsCategorizing] = useState(false)
  const [isCommitting, setIsCommitting] = useState(false)
  const [successId, setSuccessId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  const totalAmount = rows.reduce((s, r) => s + (Number(r.amountCLP) || 0), 0)
  const warnings = rows.filter(r => !r.categoryId).length

  function updateRow(key: string, patch: Partial<GridRow>) {
    setRows(prev => prev.map(r => r._key === key ? { ...r, ...patch } : r))
  }

  function addRow() {
    setRows(prev => [...prev, emptyRow()])
  }

  function removeRow(key: string) {
    setRows(prev => prev.filter(r => r._key !== key))
  }

  async function handleExcelUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setIsLoading(true)
    setError(null)
    try {
      const fd = new FormData()
      fd.append('file', file)
      const result = await parseUploadedExcel(fd)
      setParsed(result)

      // Pre-llenar header
      const prefix = result.importType === 'caja_chica' ? 'Caja Chica' : 'Rendición'
      setTitle(`${prefix} N°${result.fundNumber} — ${result.officeName}`)
      setApprovedDate(result.rendicionDate)

      // Pre-llenar filas
      const newRows: GridRow[] = result.items.map(item => ({
        _key:         crypto.randomUUID(),
        employeeName: item.employeeName,
        description:  item.description,
        date:         item.date,
        amountCLP:    item.amountCLP,
        categoryId:   null,
        costCenterId: DEFAULT_COST_CENTER,
        docType:      'boleta',
        docNumber:    null,
        supplierRut:  null,
      }))
      setRows(newRows)

      // Categorizar con IA
      setIsCategorizing(true)
      const suggestions: CategorySuggestion[] = await categorizeItems(
        result.items.map(i => ({ description: i.description }))
      )
      setRows(prev =>
        prev.map((row, idx) => {
          const sug = suggestions.find(s => s.index === idx)
          if (sug && sug.categoryId && sug.confidence >= 0.7) {
            return { ...row, categoryId: sug.categoryId }
          }
          return row
        })
      )
    } catch (err) {
      setError(String(err))
    } finally {
      setIsLoading(false)
      setIsCategorizing(false)
    }
  }

  async function handleCommit() {
    if (!title.trim()) { setError('El título es obligatorio'); return }
    if (!approvedDate) { setError('La fecha de rendición es obligatoria'); return }
    if (!responsibleId) { setError('El responsable es obligatorio'); return }
    if (rows.length === 0) { setError('Agregá al menos un ítem'); return }

    setIsCommitting(true)
    setError(null)
    try {
      const result = await commitHistoricalImport({
        title,
        responsibleUserId: responsibleId,
        approvedDate,
        rows: rows.map(({ _key, ...rest }) => rest),
      })
      setSuccessId(result.reportId)
    } catch (err) {
      setError(String(err))
    } finally {
      setIsCommitting(false)
    }
  }

  // ── Pantalla de éxito ──────────────────────────────────────────────────────
  if (successId) {
    return (
      <div className="max-w-lg mx-auto py-16 text-center space-y-4">
        <CheckCircle2 size={48} className="mx-auto text-brand-500" />
        <h2 className="font-display font-extrabold text-2xl text-ink-900">
          Importación completada
        </h2>
        <p className="text-ink-500">
          La rendición histórica fue creada en estado <strong>Aprobada</strong> y ya
          aparece en el panel de admin y en el exportador a Defontana.
        </p>
        <div className="flex gap-3 justify-center pt-2">
          <Button variant="ghost" onClick={() => { setSuccessId(null); setRows([emptyRow()]); setParsed(null); setTitle(''); setApprovedDate('') }}>
            Importar otra
          </Button>
          <a href={`/admin/reports`}>
            <Button>Ver en reportes</Button>
          </a>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6 max-w-5xl mx-auto">
      {/* Header */}
      <div>
        <div className="flex items-center gap-2 mb-1">
          <History size={20} className="text-brand-600" />
          <h1 className="font-display font-extrabold text-2xl tracking-tight text-ink-900">
            Carga Histórica
          </h1>
        </div>
        <p className="text-sm text-ink-500">
          Importá rendiciones y cajas chicas de períodos anteriores para exportarlas a Defontana.
        </p>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-ink-100 p-1 rounded-item w-fit">
        {([['excel', 'Subir Excel'], ['manual', 'Ingreso Manual']] as const).map(([key, label]) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={`px-4 py-1.5 rounded-[10px] text-sm font-medium transition-colors ${
              tab === key
                ? 'bg-white text-ink-900 shadow-sm'
                : 'text-ink-500 hover:text-ink-700'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Upload zone (solo en tab excel) */}
      {tab === 'excel' && (
        <Card>
          <div
            className="border-2 border-dashed border-ink-200 rounded-item p-10 text-center cursor-pointer hover:border-brand-400 hover:bg-brand-50/30 transition-colors"
            onClick={() => fileRef.current?.click()}
          >
            <Upload size={32} className="mx-auto mb-3 text-ink-300" />
            <p className="font-medium text-ink-700">
              {isLoading ? 'Procesando…' : 'Hacé clic o arrastrá el archivo Excel aquí'}
            </p>
            <p className="text-xs text-ink-400 mt-1">Formato .xlsx — Caja Chica o Rendición</p>
            <input
              ref={fileRef}
              type="file"
              accept=".xlsx,.xls"
              className="hidden"
              onChange={handleExcelUpload}
            />
          </div>
          {isCategorizing && (
            <p className="text-xs text-brand-600 mt-3 text-center animate-pulse">
              ✦ Claude está sugiriendo categorías…
            </p>
          )}
          {parsed && (
            <div className="mt-3 text-xs text-ink-500 flex gap-4">
              <span>✓ Detectado: <strong>{parsed.importType === 'caja_chica' ? 'Caja Chica' : 'Rendición'} N°{parsed.fundNumber}</strong></span>
              <span>· {parsed.items.length} ítems</span>
              <span>· <CurrencyAmount amount={parsed.totalAmount} currency="CLP" size="sm" /></span>
            </div>
          )}
        </Card>
      )}

      {/* Sección de header del reporte */}
      <Card>
        <h2 className="font-semibold text-ink-800 mb-4">Datos del documento</h2>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="sm:col-span-3">
            <label className="block text-xs font-medium text-ink-600 mb-1">Título</label>
            <input
              type="text"
              value={title}
              onChange={e => setTitle(e.target.value)}
              placeholder="ej: Caja Chica N°173 — OFICINA DE INGENIERÍA"
              className="w-full border border-ink-200 rounded-item px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-ink-600 mb-1">Responsable</label>
            <select
              value={responsibleId}
              onChange={e => setResponsibleId(e.target.value)}
              className="w-full border border-ink-200 rounded-item px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
            >
              {employees.map(emp => (
                <option key={emp.id} value={emp.id}>{emp.full_name}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-ink-600 mb-1">Fecha de rendición</label>
            <input
              type="date"
              value={approvedDate}
              onChange={e => setApprovedDate(e.target.value)}
              className="w-full border border-ink-200 rounded-item px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
            />
          </div>
          <div className="flex items-end">
            <div className="text-xs text-ink-500">
              Total: <span className="font-mono-amount font-bold text-ink-900">
                ${totalAmount.toLocaleString('es-CL')}
              </span>
            </div>
          </div>
        </div>
      </Card>

      {/* Grilla de ítems */}
      <Card>
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-semibold text-ink-800">
            Ítems <span className="text-ink-400 font-normal text-sm">({rows.length})</span>
          </h2>
          {warnings > 0 && (
            <span className="flex items-center gap-1 text-xs text-amber-600 bg-amber-50 px-2 py-1 rounded-full">
              <AlertTriangle size={12} />
              {warnings} sin categoría
            </span>
          )}
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-ink-100">
                {['Empleado', 'Descripción', 'Fecha', 'Monto CLP', 'Categoría', 'Centro', 'Doc', ''].map(h => (
                  <th key={h} className="text-left text-xs font-medium text-ink-500 pb-2 pr-2 whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-ink-50">
              {rows.map(row => (
                <GridRowEditor
                  key={row._key}
                  row={row}
                  categories={categories}
                  costCenters={costCenters}
                  onChange={patch => updateRow(row._key, patch)}
                  onRemove={() => removeRow(row._key)}
                />
              ))}
            </tbody>
          </table>
        </div>

        <button
          onClick={addRow}
          className="mt-3 flex items-center gap-1 text-sm text-brand-600 hover:text-brand-700 font-medium"
        >
          <Plus size={14} /> Agregar ítem
        </button>
      </Card>

      {/* Error */}
      {error && (
        <div className="flex items-start gap-2 bg-red-50 border border-red-200 rounded-item p-3 text-sm text-red-700">
          <X size={16} className="shrink-0 mt-0.5" />
          {error}
        </div>
      )}

      {/* Confirmar */}
      <div className="flex justify-end">
        <Button
          onClick={handleCommit}
          disabled={isCommitting || rows.length === 0}
          className="min-w-[180px]"
        >
          {isCommitting ? 'Importando…' : `Confirmar importación (${rows.length} ítems)`}
        </Button>
      </div>
    </div>
  )
}

// ── Sub-componente por fila ────────────────────────────────────────────────────

interface GridRowEditorProps {
  row:         GridRow
  categories:  ExpenseCategory[]
  costCenters: CostCenter[]
  onChange:    (patch: Partial<GridRow>) => void
  onRemove:    () => void
}

function GridRowEditor({ row, categories, costCenters, onChange, onRemove }: GridRowEditorProps) {
  const isFactura = row.docType === 'factura' || row.docType === 'factura_exenta'

  return (
    <tr className="group hover:bg-ink-50/50">
      <td className="py-1.5 pr-2">
        <input
          type="text"
          value={row.employeeName}
          onChange={e => onChange({ employeeName: e.target.value })}
          placeholder="Nombre"
          className="w-28 border border-ink-200 rounded-[8px] px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-brand-400"
        />
      </td>
      <td className="py-1.5 pr-2">
        <input
          type="text"
          value={row.description}
          onChange={e => onChange({ description: e.target.value })}
          placeholder="Descripción"
          className="w-44 border border-ink-200 rounded-[8px] px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-brand-400"
        />
      </td>
      <td className="py-1.5 pr-2">
        <input
          type="date"
          value={row.date}
          onChange={e => onChange({ date: e.target.value })}
          className="border border-ink-200 rounded-[8px] px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-brand-400"
        />
      </td>
      <td className="py-1.5 pr-2">
        <input
          type="number"
          value={row.amountCLP || ''}
          onChange={e => onChange({ amountCLP: Number(e.target.value) || 0 })}
          placeholder="0"
          className="w-24 border border-ink-200 rounded-[8px] px-2 py-1 text-xs font-mono-amount text-right focus:outline-none focus:ring-1 focus:ring-brand-400"
        />
      </td>
      <td className="py-1.5 pr-2">
        <select
          value={row.categoryId ?? ''}
          onChange={e => onChange({ categoryId: e.target.value || null })}
          className={`w-36 border rounded-[8px] px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-brand-400 ${
            !row.categoryId ? 'border-amber-300 bg-amber-50' : 'border-ink-200'
          }`}
        >
          <option value="">— Sin asignar —</option>
          {categories.map(c => (
            <option key={c.id} value={c.id}>{c.name}</option>
          ))}
        </select>
      </td>
      <td className="py-1.5 pr-2">
        <select
          value={row.costCenterId}
          onChange={e => onChange({ costCenterId: e.target.value })}
          className="w-36 border border-ink-200 rounded-[8px] px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-brand-400"
        >
          {costCenters.filter(c => c.imputable).map(c => (
            <option key={c.id} value={c.id}>{c.id} — {c.descripcion}</option>
          ))}
        </select>
      </td>
      <td className="py-1.5 pr-2">
        <div className="flex flex-col gap-1">
          <select
            value={row.docType}
            onChange={e => onChange({ docType: e.target.value as GridRow['docType'] })}
            className="w-28 border border-ink-200 rounded-[8px] px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-brand-400"
          >
            {DOC_TYPES.map(d => (
              <option key={d.value} value={d.value}>{d.label}</option>
            ))}
          </select>
          {isFactura && (
            <>
              <input
                type="text"
                value={row.docNumber ?? ''}
                onChange={e => onChange({ docNumber: e.target.value || null })}
                placeholder="Nro. doc"
                className="w-28 border border-ink-200 rounded-[8px] px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-brand-400"
              />
              <input
                type="text"
                value={row.supplierRut ?? ''}
                onChange={e => onChange({ supplierRut: e.target.value || null })}
                placeholder="RUT proveedor"
                className={`w-28 border rounded-[8px] px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-brand-400 ${
                  !row.supplierRut ? 'border-red-300' : 'border-ink-200'
                }`}
              />
            </>
          )}
        </div>
      </td>
      <td className="py-1.5">
        <button
          onClick={onRemove}
          className="opacity-0 group-hover:opacity-100 p-1 text-ink-300 hover:text-red-500 transition-opacity"
        >
          <Trash2 size={14} />
        </button>
      </td>
    </tr>
  )
}
```

- [ ] **Step 3: Verificar TypeScript**

```bash
npx tsc --noEmit
```

Esperado: sin errores.

- [ ] **Step 4: Commit**

```bash
git add "src/app/(app)/admin/carga-historica/page.tsx" "src/app/(app)/admin/carga-historica/client.tsx"
git commit -m "feat: historical import page with Excel upload, AI categorization, and review grid"
```

---

## Task 6: Navegación — Sidebar y MobileNav

**Files:**
- Modify: `src/components/layout/Sidebar.tsx`
- Modify: `src/components/layout/MobileNav.tsx`

- [ ] **Step 1: Agregar entrada en Sidebar.tsx**

En `src/components/layout/Sidebar.tsx`, buscar el array de navigation items y agregar después de `'/admin/trash'`:

```typescript
// Agregar el import del ícono si no está
import { ..., Clock } from 'lucide-react'

// En el array NAV_ITEMS, después de la entrada '/admin/trash':
{ href: '/admin/carga-historica', label: 'Carga Histórica', Icon: Clock, roles: ['admin'] as const },
```

- [ ] **Step 2: Agregar entrada en MobileNav.tsx**

En `src/components/layout/MobileNav.tsx`, mismo patrón:

```typescript
import { ..., Clock } from 'lucide-react'

// En el array correspondiente de admin:
{ href: '/admin/carga-historica', label: 'Carga Histórica', Icon: Clock, roles: ['admin'] as const },
```

- [ ] **Step 3: Verificar TypeScript**

```bash
npx tsc --noEmit
```

- [ ] **Step 4: Correr todos los tests**

```bash
npx vitest run
```

Esperado: todos los tests pasan (incluidos los nuevos de parser y categorizer).

- [ ] **Step 5: Commit + deploy**

```bash
git add src/components/layout/Sidebar.tsx src/components/layout/MobileNav.tsx
git commit -m "feat: add Carga Histórica to admin navigation"
vercel --prod
```

---

## Verificación end-to-end

Una vez desplegado, verificar manualmente:

1. **Login como admin** → sidebar muestra "Carga Histórica" en sección admin
2. **Tab Excel** → arrastrar `Caja Chica 173.xlsx` → sistema procesa y muestra 6 filas pre-llenadas con empleados, fechas, montos
3. **Categorización IA** → después de ~2s aparecen categorías sugeridas (taxi → Movilización, desayuno → Alimentación)
4. **Grilla editable** → cambiar una categoría, cambiar un doc_type a "factura" → aparecen campos Nro. Doc y RUT
5. **Confirmar** → pantalla de éxito → ir a `/admin/reports` → rendición histórica visible con badge "Histórico"
6. **Export Defontana** → la rendición histórica aparece disponible en el exportador y genera líneas correctas en el XLSX

---

## Self-Review Checklist

- ✅ Spec: DB migration, types, parser, categorizer, actions, page, navigation — todo cubierto
- ✅ Sin placeholders: todas las tareas tienen código real
- ✅ Tipos consistentes: `HistoricalGridRow` definido en Task 4, consumido en Task 5
- ✅ `GridRow._key` es solo para React, se omite al llamar `commitHistoricalImport` (`.map(({ _key, ...rest }) => rest)`)
- ✅ Rollback en `commitHistoricalImport`: si el insert de items falla, se borra el report
- ✅ Claude Haiku (no Sonnet) para categorización — más barato, suficiente para clasificación de texto
- ✅ `costCenters.filter(c => c.imputable)` — solo muestra los imputables en el selector
- ✅ `approved_at` se establece con la fecha del documento fuente, no la de importación
- ✅ `merchant` en expense_items guarda el nombre del empleado para trazabilidad multi-empleado en cajas chicas
