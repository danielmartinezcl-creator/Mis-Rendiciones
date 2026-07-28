# Informes Unificados — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Crear el módulo `/informes` — vista unificada de gastos que combina rendiciones, caja chica nueva e históricas, con filtros completos y exportación Excel/PDF, más mejora de filtros de lista en Caja Chica.

**Architecture:** Un server action central (`getUnifiedReportItems`) consulta hasta 4 fuentes en paralelo (rendición nueva, rendición histórica, caja chica nueva, caja chica histórica), normaliza los ítems a un shape común `UnifiedReportItem`, y los devuelve al cliente ya enriquecidos con nombre de empleado, categoría y datos del parent. El cliente sólo se encarga de la UI de filtros y de disparar la búsqueda; todo el filtrado ocurre server-side. La página `/informes` es una nueva ruta (NO reemplaza `/admin/reports`).

**Tech Stack:** Next.js 16 App Router, Tailwind CSS v4, Supabase (`jqtbtgduqzxkgubmzukg`), jsPDF + jspdf-autotable, SheetJS (xlsx), Lucide React, Vitest.

## Global Constraints

- Next.js 16: usar `src/proxy.ts` (NO `middleware.ts`)
- Tailwind v4: config solo en `src/app/globals.css` con `@theme {}` (NO `tailwind.config.ts`)
- Supabase: proyecto `jqtbtgduqzxkgubmzukg` — NO mezclar con `qkctqhsugcflelnsitvl` (fintrack)
- `src/actions/*.ts`: toda función exportada DEBE ser `async` — helpers puros van en `src/lib/`
- Design system: brand teal `#0D9488`, ink neutrals, `rounded-card` (18px), `rounded-item` (14px)
- Fuentes: Bricolage Grotesque (`font-display`), Hanken Grotesk (`font-hanken`), Geist Mono (`font-mono-amount`)
- Íconos: Lucide React — no emoji en UI
- NO usar `var(--color)` dentro de template literals JS
- Server Actions deben ser `async`; helpers puros en `src/lib/`, no en `src/actions/`

---

## Mapa de archivos

| Acción | Ruta |
|--------|------|
| CREAR | `src/lib/report-helpers.ts` — tipos y helpers puros |
| CREAR | `src/tests/report-helpers.test.ts` — tests de helpers |
| CREAR | `src/actions/reports.ts` — server actions del módulo |
| MODIFICAR | `src/lib/export/excel.ts` — agregar `exportUnifiedToExcel` |
| MODIFICAR | `src/lib/export/pdf.ts` — agregar `exportUnifiedToPDF` |
| CREAR | `src/app/(app)/informes/page.tsx` — Server Component |
| CREAR | `src/app/(app)/informes/client.tsx` — Client Component |
| MODIFICAR | `src/components/layout/Sidebar.tsx` — nueva entrada Informes |
| MODIFICAR | `src/app/(app)/petty-cash/client.tsx` — mejorar filtros de lista |

---

## Task 1: Helpers puros + tipos (`src/lib/report-helpers.ts`)

**Files:**
- Create: `src/lib/report-helpers.ts`
- Create: `src/tests/report-helpers.test.ts`

**Interfaces:**
- Produces: `UnifiedReportItem`, `UnifiedReportFilters`, `UnifiedItemSource`, `UnifiedKpis`, `ReportFilterOptions`, `PeriodPreset`; funciones `buildPeriodRange`, `computeUnifiedKpis`

- [ ] **Step 1: Escribir los tests (fallarán porque el módulo no existe)**

Crear `src/tests/report-helpers.test.ts`:

```typescript
import { describe, it, expect } from 'vitest'
import { buildPeriodRange, computeUnifiedKpis } from '@/lib/report-helpers'
import type { UnifiedReportItem } from '@/lib/report-helpers'

describe('buildPeriodRange', () => {
  it('retorna null para tipo custom', () => {
    expect(buildPeriodRange({ type: 'custom' })).toBeNull()
  })

  it('retorna rango completo para año 2024', () => {
    const r = buildPeriodRange({ type: 'year', year: 2024 })
    expect(r).toEqual({ dateFrom: '2024-01-01', dateTo: '2024-12-31' })
  })

  it('primer semestre 2025', () => {
    const r = buildPeriodRange({ type: 'semester', year: 2025, half: 1 })
    expect(r).toEqual({ dateFrom: '2025-01-01', dateTo: '2025-06-30' })
  })

  it('segundo semestre 2025', () => {
    const r = buildPeriodRange({ type: 'semester', year: 2025, half: 2 })
    expect(r).toEqual({ dateFrom: '2025-07-01', dateTo: '2025-12-31' })
  })
})

describe('computeUnifiedKpis', () => {
  const makeItem = (overrides: Partial<UnifiedReportItem>): UnifiedReportItem => ({
    source:                'rendicion_new',
    employee_id:           'u1',
    employee_name:         'Ana',
    department:            null,
    parent_id:             'r1',
    parent_title:          'Rendición 1',
    parent_status:         'approved',
    defontana_exported_at: null,
    reimbursed_at:         null,
    item_id:               'i1',
    description:           'Taxi',
    merchant:              null,
    date:                  '2025-01-15',
    category_id:           'c1',
    category_name:         'Transporte',
    category_color:        '#10B981',
    amount:                5000,
    currency:              'CLP',
    amount_clp:            5000,
    doc_type:              'boleta',
    doc_number:            null,
    item_status:           'approved',
    rejection_reason:      null,
    notes:                 null,
    ...overrides,
  })

  it('items vacíos retorna ceros', () => {
    const kpis = computeUnifiedKpis([])
    expect(kpis.totalItems).toBe(0)
    expect(kpis.totalCLP).toBe(0)
    expect(kpis.approvedCLP).toBe(0)
  })

  it('suma totalCLP correctamente', () => {
    const items = [
      makeItem({ amount_clp: 10000, source: 'rendicion_new' }),
      makeItem({ amount_clp: 5000,  source: 'caja_chica_new' }),
    ]
    const kpis = computeUnifiedKpis(items)
    expect(kpis.totalCLP).toBe(15000)
    expect(kpis.totalItems).toBe(2)
  })

  it('approvedCLP solo suma ítems aprobados', () => {
    const items = [
      makeItem({ amount_clp: 10000, item_status: 'approved' }),
      makeItem({ amount_clp: 5000,  item_status: 'rejected' }),
      makeItem({ amount_clp: 3000,  item_status: 'pending'  }),
    ]
    expect(computeUnifiedKpis(items).approvedCLP).toBe(10000)
  })

  it('bySource acumula por fuente', () => {
    const items = [
      makeItem({ source: 'rendicion_new',   amount_clp: 1000 }),
      makeItem({ source: 'rendicion_new',   amount_clp: 2000 }),
      makeItem({ source: 'caja_chica_hist', amount_clp: 500  }),
    ]
    const kpis = computeUnifiedKpis(items)
    expect(kpis.bySource.rendicion_new.count).toBe(2)
    expect(kpis.bySource.rendicion_new.totalCLP).toBe(3000)
    expect(kpis.bySource.caja_chica_hist.count).toBe(1)
    expect(kpis.bySource.caja_chica_new.count).toBe(0)
  })
})
```

- [ ] **Step 2: Verificar que los tests fallan**

```
npx vitest run src/tests/report-helpers.test.ts
```
Esperado: FAIL — "Cannot find module '@/lib/report-helpers'"

- [ ] **Step 3: Implementar `src/lib/report-helpers.ts`**

```typescript
// ─── Tipos exportados ────────────────────────────────────────────────────────

export type UnifiedItemSource = 'rendicion_new' | 'rendicion_hist' | 'caja_chica_new' | 'caja_chica_hist'

export interface UnifiedReportItem {
  source:                UnifiedItemSource
  employee_id:           string
  employee_name:         string
  department:            string | null
  parent_id:             string
  parent_title:          string
  parent_status:         string
  defontana_exported_at: string | null
  reimbursed_at:         string | null
  item_id:               string
  description:           string
  merchant:              string | null
  date:                  string
  category_id:           string | null
  category_name:         string | null
  category_color:        string | null
  amount:                number
  currency:              string
  amount_clp:            number
  doc_type:              string | null
  doc_number:            string | null
  item_status:           'pending' | 'approved' | 'rejected'
  rejection_reason:      string | null
  notes:                 string | null
}

export interface UnifiedReportFilters {
  sourceTypes:     ('rendicion' | 'caja_chica')[]
  dataAge:         'new' | 'historical' | 'all'
  dateFrom?:       string
  dateTo?:         string
  department?:     string
  employeeIds?:    string[]
  categoryIds?:    string[]
  reportIds?:      string[]   // rendición IDs específicas
  fundIds?:        string[]   // fondo IDs específicos
  reportStatuses?: string[]   // filtro sobre parent status
  itemStatuses?:   ('pending' | 'approved' | 'rejected')[]
  reimb?:          'all' | 'pending' | 'reimbursed'
  defontana?:      'all' | 'notExported' | 'exported'
}

export interface UnifiedKpis {
  totalItems:  number
  totalCLP:    number
  approvedCLP: number
  bySource:    Record<UnifiedItemSource, { count: number; totalCLP: number }>
}

export interface ReportFilterOptions {
  employees:   { id: string; name: string; department: string | null }[]
  categories:  { id: string; name: string; color: string | null }[]
  departments: string[]
  rendiciones: { id: string; title: string }[]
  fondos:      { id: string; name: string }[]
}

export type PeriodPreset =
  | { type: 'year';     year: number }
  | { type: 'semester'; year: number; half: 1 | 2 }
  | { type: 'custom' }

// ─── Labels y colores de fuente ──────────────────────────────────────────────

export const SOURCE_LABELS: Record<UnifiedItemSource, string> = {
  rendicion_new:   'Rendición',
  rendicion_hist:  'Rendición hist.',
  caja_chica_new:  'Caja Chica',
  caja_chica_hist: 'Caja Chica hist.',
}

export const SOURCE_COLORS: Record<UnifiedItemSource, { bg: string; text: string }> = {
  rendicion_new:   { bg: 'bg-brand-50',  text: 'text-brand-700'  },
  rendicion_hist:  { bg: 'bg-violet-50', text: 'text-violet-700' },
  caja_chica_new:  { bg: 'bg-teal-50',   text: 'text-teal-700'   },
  caja_chica_hist: { bg: 'bg-amber-50',  text: 'text-amber-700'  },
}

// ─── buildPeriodRange ────────────────────────────────────────────────────────

export function buildPeriodRange(preset: PeriodPreset): { dateFrom: string; dateTo: string } | null {
  if (preset.type === 'custom') return null
  if (preset.type === 'year') {
    return {
      dateFrom: `${preset.year}-01-01`,
      dateTo:   `${preset.year}-12-31`,
    }
  }
  // semester
  const from = preset.half === 1 ? `${preset.year}-01-01` : `${preset.year}-07-01`
  const to   = preset.half === 1 ? `${preset.year}-06-30` : `${preset.year}-12-31`
  return { dateFrom: from, dateTo: to }
}

// ─── computeUnifiedKpis ──────────────────────────────────────────────────────

export function computeUnifiedKpis(items: UnifiedReportItem[]): UnifiedKpis {
  const bySource: UnifiedKpis['bySource'] = {
    rendicion_new:   { count: 0, totalCLP: 0 },
    rendicion_hist:  { count: 0, totalCLP: 0 },
    caja_chica_new:  { count: 0, totalCLP: 0 },
    caja_chica_hist: { count: 0, totalCLP: 0 },
  }

  let totalCLP    = 0
  let approvedCLP = 0

  for (const i of items) {
    totalCLP += i.amount_clp
    if (i.item_status === 'approved') approvedCLP += i.amount_clp
    bySource[i.source].count++
    bySource[i.source].totalCLP += i.amount_clp
  }

  return { totalItems: items.length, totalCLP, approvedCLP, bySource }
}
```

- [ ] **Step 4: Verificar que los tests pasan**

```
npx vitest run src/tests/report-helpers.test.ts
```
Esperado: PASS — 9 tests

- [ ] **Step 5: Verificar TypeScript**

```
npx tsc --noEmit
```
Esperado: 0 errores

- [ ] **Step 6: Commit**

```powershell
git add src/lib/report-helpers.ts src/tests/report-helpers.test.ts
git commit -m "feat: tipos y helpers puros para módulo Informes"
```

---

## Task 2: Server action `src/actions/reports.ts`

**Files:**
- Create: `src/actions/reports.ts`

**Interfaces:**
- Consumes: `UnifiedReportItem`, `UnifiedReportFilters`, `ReportFilterOptions`, `computeUnifiedKpis` — de `@/lib/report-helpers`
- Produces: `getReportFilterOptions()`, `getUnifiedReportItems(filters)` — usados por el client component

- [ ] **Step 1: Crear `src/actions/reports.ts` con las funciones privadas de consulta**

```typescript
'use server'

import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { computeUnifiedKpis } from '@/lib/report-helpers'
import type {
  UnifiedReportItem,
  UnifiedReportFilters,
  UnifiedItemSource,
  UnifiedKpis,
  ReportFilterOptions,
} from '@/lib/report-helpers'

// Re-exportar tipos para uso en el client sin romper la regla de Server Actions
export type { UnifiedReportItem, UnifiedReportFilters, UnifiedKpis, ReportFilterOptions }

// ─── Auth helper ─────────────────────────────────────────────────────────────

async function requireAdminOrApprover() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('users')
    .select('org_id, role, can_approve')
    .eq('id', user.id)
    .single()

  if (!profile || (profile.role !== 'admin' && !profile.can_approve)) {
    throw new Error('Acceso restringido a administradores y aprobadores')
  }

  return { supabase, orgId: profile.org_id }
}

// ─── Enriquecedor de categorías (reutilizado por los 4 fetchers) ─────────────

async function enrichCategories(
  supabase: Awaited<ReturnType<typeof createClient>>,
  categoryIds: string[]
): Promise<Record<string, { name: string; color: string | null }>> {
  if (!categoryIds.length) return {}
  const { data } = await supabase
    .from('expense_categories')
    .select('id, name, color')
    .in('id', categoryIds)
  return Object.fromEntries((data ?? []).map(c => [c.id, { name: c.name, color: c.color ?? null }]))
}

// ─── Fetcher 1: Rendiciones (nueva + histórica) ───────────────────────────────

async function fetchRendicionItems(
  supabase: Awaited<ReturnType<typeof createClient>>,
  orgId: string,
  filters: UnifiedReportFilters,
  isHistorical: boolean
): Promise<UnifiedReportItem[]> {
  const source: UnifiedItemSource = isHistorical ? 'rendicion_hist' : 'rendicion_new'

  let q = supabase
    .from('expense_reports')
    .select('id, title, status, reimbursed_at, defontana_exported_at, submitter_id')
    .eq('org_id', orgId)
    .is('deleted_at', null)

  if (isHistorical) {
    q = q.eq('is_historical_import', true).eq('historical_type', 'rendicion')
  } else {
    q = q.or('is_historical_import.is.null,is_historical_import.eq.false').is('historical_type', null)
  }

  if (filters.reportStatuses?.length) q = q.in('status', filters.reportStatuses as never[])
  if (filters.reportIds?.length)      q = q.in('id', filters.reportIds)
  if (filters.employeeIds?.length)    q = q.in('submitter_id', filters.employeeIds)

  if (filters.reimb === 'pending') {
    q = q.is('reimbursed_at', null)
  } else if (filters.reimb === 'reimbursed') {
    q = q.not('reimbursed_at', 'is', null)
  }

  if (filters.defontana === 'notExported') q = q.is('defontana_exported_at', null)
  if (filters.defontana === 'exported')    q = q.not('defontana_exported_at', 'is', null)

  const { data: reports } = await q
  if (!reports?.length) return []

  // Enriquecer con datos de usuario (para filtro por departamento)
  const submitterIds = [...new Set(reports.map(r => r.submitter_id))]
  const { data: users } = await supabase
    .from('users')
    .select('id, full_name, department')
    .in('id', submitterIds)
  const userMap = Object.fromEntries(
    (users ?? []).map(u => [u.id, { name: u.full_name, department: u.department ?? null }])
  )

  const filteredReports = reports.filter(r => {
    if (filters.department && userMap[r.submitter_id]?.department !== filters.department) return false
    return true
  })
  if (!filteredReports.length) return []

  const reportMap   = Object.fromEntries(filteredReports.map(r => [r.id, r]))
  const reportIds   = filteredReports.map(r => r.id)

  // Ítems
  let itemsQ = supabase
    .from('expense_items')
    .select('id, report_id, description, amount, currency, amount_clp, date, category_id, merchant, doc_type, doc_number, notes, status, rejection_reason')
    .in('report_id', reportIds)
    .order('date', { ascending: true })

  if (filters.dateFrom)           itemsQ = itemsQ.gte('date', filters.dateFrom)
  if (filters.dateTo)             itemsQ = itemsQ.lte('date', filters.dateTo)
  if (filters.itemStatuses?.length) itemsQ = itemsQ.in('status', filters.itemStatuses)
  if (filters.categoryIds?.length)  itemsQ = itemsQ.in('category_id', filters.categoryIds)

  const { data: items } = await itemsQ
  if (!items?.length) return []

  const catIds = [...new Set(items.map(i => i.category_id).filter(Boolean))] as string[]
  const catMap = await enrichCategories(supabase, catIds)

  return items.map(i => {
    const r    = reportMap[i.report_id]
    const user = userMap[r.submitter_id]
    return {
      source,
      employee_id:           r.submitter_id,
      employee_name:         user?.name          ?? 'Desconocido',
      department:            user?.department     ?? null,
      parent_id:             i.report_id,
      parent_title:          r.title,
      parent_status:         r.status,
      defontana_exported_at: r.defontana_exported_at,
      reimbursed_at:         r.reimbursed_at,
      item_id:               i.id,
      description:           i.description,
      merchant:              i.merchant,
      date:                  i.date,
      category_id:           i.category_id,
      category_name:         i.category_id ? (catMap[i.category_id]?.name  ?? null) : null,
      category_color:        i.category_id ? (catMap[i.category_id]?.color ?? null) : null,
      amount:                i.amount,
      currency:              i.currency,
      amount_clp:            i.amount_clp,
      doc_type:              i.doc_type,
      doc_number:            i.doc_number,
      item_status:           i.status as 'pending' | 'approved' | 'rejected',
      rejection_reason:      i.rejection_reason,
      notes:                 i.notes,
    }
  })
}

// ─── Fetcher 2: Caja Chica nueva (petty_cash_funds → petty_cash_items) ────────

async function fetchCajaChicaNewItems(
  supabase: Awaited<ReturnType<typeof createClient>>,
  orgId: string,
  filters: UnifiedReportFilters
): Promise<UnifiedReportItem[]> {
  let fundsQ = supabase
    .from('petty_cash_funds')
    .select('id, name, status, employee_id, defontana_exported_at')
    .eq('org_id', orgId)

  if (filters.reportStatuses?.length) fundsQ = fundsQ.in('status', filters.reportStatuses as never[])
  if (filters.fundIds?.length)        fundsQ = fundsQ.in('id', filters.fundIds)
  if (filters.employeeIds?.length)    fundsQ = fundsQ.in('employee_id', filters.employeeIds)

  const { data: funds } = await fundsQ
  if (!funds?.length) return []

  const empIds = [...new Set(funds.map(f => f.employee_id))]
  const { data: users } = await supabase
    .from('users').select('id, full_name, department').in('id', empIds)
  const userMap = Object.fromEntries(
    (users ?? []).map(u => [u.id, { name: u.full_name, department: u.department ?? null }])
  )

  const filteredFunds = funds.filter(f => {
    if (filters.department && userMap[f.employee_id]?.department !== filters.department) return false
    return true
  })
  if (!filteredFunds.length) return []

  const fundMap = Object.fromEntries(filteredFunds.map(f => [f.id, f]))
  const fundIds = filteredFunds.map(f => f.id)

  let itemsQ = supabase
    .from('petty_cash_items')
    .select('id, fund_id, description, amount, currency, amount_clp, date, category_id, merchant, doc_type, doc_number, notes, status, rejection_reason')
    .in('fund_id', fundIds)
    .order('date', { ascending: true })

  if (filters.dateFrom)             itemsQ = itemsQ.gte('date', filters.dateFrom)
  if (filters.dateTo)               itemsQ = itemsQ.lte('date', filters.dateTo)
  if (filters.itemStatuses?.length) itemsQ = itemsQ.in('status', filters.itemStatuses)
  if (filters.categoryIds?.length)  itemsQ = itemsQ.in('category_id', filters.categoryIds)

  const { data: items } = await itemsQ
  if (!items?.length) return []

  const catIds = [...new Set(items.map(i => i.category_id).filter(Boolean))] as string[]
  const catMap = await enrichCategories(supabase, catIds)

  return items.map(i => {
    const fund = fundMap[i.fund_id]
    const user = userMap[fund.employee_id]
    return {
      source:                'caja_chica_new' as const,
      employee_id:           fund.employee_id,
      employee_name:         user?.name         ?? 'Desconocido',
      department:            user?.department    ?? null,
      parent_id:             i.fund_id,
      parent_title:          fund.name,
      parent_status:         fund.status,
      defontana_exported_at: fund.defontana_exported_at,
      reimbursed_at:         null,
      item_id:               i.id,
      description:           i.description,
      merchant:              i.merchant,
      date:                  i.date,
      category_id:           i.category_id,
      category_name:         i.category_id ? (catMap[i.category_id]?.name  ?? null) : null,
      category_color:        i.category_id ? (catMap[i.category_id]?.color ?? null) : null,
      amount:                i.amount,
      currency:              i.currency,
      amount_clp:            i.amount_clp,
      doc_type:              i.doc_type,
      doc_number:            i.doc_number,
      item_status:           i.status as 'pending' | 'approved' | 'rejected',
      rejection_reason:      i.rejection_reason,
      notes:                 i.notes,
    }
  })
}

// ─── Fetcher 3: Caja Chica histórica (expense_reports → expense_items) ────────

async function fetchCajaChicaHistItems(
  supabase: Awaited<ReturnType<typeof createClient>>,
  orgId: string,
  filters: UnifiedReportFilters
): Promise<UnifiedReportItem[]> {
  let q = supabase
    .from('expense_reports')
    .select('id, title, status, submitter_id, defontana_exported_at')
    .eq('org_id', orgId)
    .eq('is_historical_import', true)
    .eq('historical_type', 'caja_chica')
    .is('deleted_at', null)

  if (filters.reportStatuses?.length) q = q.in('status', filters.reportStatuses as never[])
  if (filters.fundIds?.length)        q = q.in('id', filters.fundIds)  // fundIds ≡ report IDs para históricas
  if (filters.employeeIds?.length)    q = q.in('submitter_id', filters.employeeIds)

  const { data: reports } = await q
  if (!reports?.length) return []

  const submitterIds = [...new Set(reports.map(r => r.submitter_id))]
  const { data: users } = await supabase
    .from('users').select('id, full_name, department').in('id', submitterIds)
  const userMap = Object.fromEntries(
    (users ?? []).map(u => [u.id, { name: u.full_name, department: u.department ?? null }])
  )

  const filteredReports = reports.filter(r => {
    if (filters.department && userMap[r.submitter_id]?.department !== filters.department) return false
    return true
  })
  if (!filteredReports.length) return []

  const reportMap = Object.fromEntries(filteredReports.map(r => [r.id, r]))
  const reportIds = filteredReports.map(r => r.id)

  let itemsQ = supabase
    .from('expense_items')
    .select('id, report_id, description, amount, currency, amount_clp, date, category_id, merchant, doc_type, doc_number, notes, status, rejection_reason')
    .in('report_id', reportIds)
    .order('date', { ascending: true })

  if (filters.dateFrom)             itemsQ = itemsQ.gte('date', filters.dateFrom)
  if (filters.dateTo)               itemsQ = itemsQ.lte('date', filters.dateTo)
  if (filters.itemStatuses?.length) itemsQ = itemsQ.in('status', filters.itemStatuses)
  if (filters.categoryIds?.length)  itemsQ = itemsQ.in('category_id', filters.categoryIds)

  const { data: items } = await itemsQ
  if (!items?.length) return []

  const catIds = [...new Set(items.map(i => i.category_id).filter(Boolean))] as string[]
  const catMap = await enrichCategories(supabase, catIds)

  return items.map(i => {
    const r    = reportMap[i.report_id]
    const user = userMap[r.submitter_id]
    return {
      source:                'caja_chica_hist' as const,
      employee_id:           r.submitter_id,
      employee_name:         user?.name         ?? 'Desconocido',
      department:            user?.department    ?? null,
      parent_id:             i.report_id,
      parent_title:          r.title,
      parent_status:         r.status,
      defontana_exported_at: r.defontana_exported_at,
      reimbursed_at:         null,
      item_id:               i.id,
      description:           i.description,
      merchant:              i.merchant,
      date:                  i.date,
      category_id:           i.category_id,
      category_name:         i.category_id ? (catMap[i.category_id]?.name  ?? null) : null,
      category_color:        i.category_id ? (catMap[i.category_id]?.color ?? null) : null,
      amount:                i.amount,
      currency:              i.currency,
      amount_clp:            i.amount_clp,
      doc_type:              i.doc_type,
      doc_number:            i.doc_number,
      item_status:           i.status as 'pending' | 'approved' | 'rejected',
      rejection_reason:      i.rejection_reason,
      notes:                 i.notes,
    }
  })
}

// ─── Exported: opciones para filtros ─────────────────────────────────────────

export async function getReportFilterOptions(): Promise<ReportFilterOptions> {
  const { supabase, orgId } = await requireAdminOrApprover()

  const [usersRes, catsRes, rendRes, fondosRes] = await Promise.all([
    supabase
      .from('users')
      .select('id, full_name, department')
      .eq('org_id', orgId),
    supabase
      .from('expense_categories')
      .select('id, name, color')
      .or(`org_id.eq.${orgId},org_id.is.null`)
      .eq('active', true)
      .order('name'),
    supabase
      .from('expense_reports')
      .select('id, title')
      .eq('org_id', orgId)
      .is('deleted_at', null)
      .or('historical_type.is.null,historical_type.eq.rendicion')
      .order('title'),
    supabase
      .from('petty_cash_funds')
      .select('id, name')
      .eq('org_id', orgId)
      .order('name'),
  ])

  const employees = (usersRes.data ?? [])
    .map(u => ({ id: u.id, name: u.full_name, department: u.department ?? null }))
    .sort((a, b) => a.name.localeCompare(b.name))

  const departments = [...new Set(
    employees.map(e => e.department).filter(Boolean) as string[]
  )].sort()

  return {
    employees,
    categories:  (catsRes.data  ?? []).map(c => ({ id: c.id, name: c.name, color: c.color ?? null })),
    departments,
    rendiciones: (rendRes.data  ?? []).map(r => ({ id: r.id, title: r.title })),
    fondos:      (fondosRes.data ?? []).map(f => ({ id: f.id, name: f.name })),
  }
}

// ─── Exported: consulta principal ────────────────────────────────────────────

export async function getUnifiedReportItems(
  filters: UnifiedReportFilters
): Promise<{ items: UnifiedReportItem[] } & UnifiedKpis> {
  const { supabase, orgId } = await requireAdminOrApprover()

  const includeRend  = filters.sourceTypes.includes('rendicion')
  const includeCC    = filters.sourceTypes.includes('caja_chica')
  const includeNew   = filters.dataAge !== 'historical'
  const includeHist  = filters.dataAge !== 'new'

  const promises: Promise<UnifiedReportItem[]>[] = []

  if (includeRend && includeNew)  promises.push(fetchRendicionItems(supabase, orgId, filters, false))
  if (includeRend && includeHist) promises.push(fetchRendicionItems(supabase, orgId, filters, true))
  if (includeCC   && includeNew)  promises.push(fetchCajaChicaNewItems(supabase, orgId, filters))
  if (includeCC   && includeHist) promises.push(fetchCajaChicaHistItems(supabase, orgId, filters))

  if (!promises.length) return { items: [], totalItems: 0, totalCLP: 0, approvedCLP: 0, bySource: { rendicion_new: { count: 0, totalCLP: 0 }, rendicion_hist: { count: 0, totalCLP: 0 }, caja_chica_new: { count: 0, totalCLP: 0 }, caja_chica_hist: { count: 0, totalCLP: 0 } } }

  const results = await Promise.all(promises)
  const items   = results.flat().sort((a, b) => a.date.localeCompare(b.date))
  const kpis    = computeUnifiedKpis(items)

  return { items, ...kpis }
}
```

- [ ] **Step 2: Verificar TypeScript**

```
npx tsc --noEmit
```
Esperado: 0 errores. Si hay errores de tipo en `.in('status', ...)`, el cast `as never[]` los resuelve — Supabase no infiere unions correctamente en estas posiciones.

- [ ] **Step 3: Commit**

```powershell
git add src/actions/reports.ts
git commit -m "feat: server actions para módulo Informes — getReportFilterOptions + getUnifiedReportItems"
```

---

## Task 3: Export functions (`excel.ts` + `pdf.ts`)

**Files:**
- Modify: `src/lib/export/excel.ts`
- Modify: `src/lib/export/pdf.ts`

**Interfaces:**
- Consumes: `UnifiedReportItem`, `UnifiedKpis` de `@/lib/report-helpers`
- Produces: `exportUnifiedToExcel(items, kpis, filename?)`, `exportUnifiedToPDF(items, kpis, title?)`

- [ ] **Step 1: Agregar `exportUnifiedToExcel` al final de `src/lib/export/excel.ts`**

Agregar después de la función `exportPettyCashToExcel` existente:

```typescript
// ─── Export Informes Unificados ───────────────────────────────────────────────

import type { UnifiedReportItem, UnifiedKpis } from '@/lib/report-helpers'

const UNIFIED_SOURCE_ES: Record<string, string> = {
  rendicion_new:   'Rendición',
  rendicion_hist:  'Rendición hist.',
  caja_chica_new:  'Caja Chica',
  caja_chica_hist: 'Caja Chica hist.',
}

const UNIFIED_ITEM_STATUS_ES: Record<string, string> = {
  pending:  'Pendiente',
  approved: 'Aprobado',
  rejected: 'Rechazado',
}

export function exportUnifiedToExcel(
  items:    UnifiedReportItem[],
  kpis:     UnifiedKpis,
  filename = 'informe-gastos'
) {
  const wb = XLSX.utils.book_new()

  // ── Hoja 1: Detalle ──────────────────────────────────────────
  const detailRows = items.map(i => ({
    Fuente:          UNIFIED_SOURCE_ES[i.source] ?? i.source,
    Empleado:        i.employee_name,
    Departamento:    i.department ?? '',
    'Fondo/Rendición': i.parent_title,
    'Estado Fondo':  i.parent_status,
    Categoría:       i.category_name ?? '',
    Descripción:     i.description,
    Proveedor:       i.merchant ?? '',
    Fecha:           formatDate(i.date),
    Monto:           i.amount,
    Moneda:          i.currency,
    'Monto CLP':     i.amount_clp,
    'Tipo doc':      i.doc_type ?? '',
    'N° doc':        i.doc_number ?? '',
    'Estado ítem':   UNIFIED_ITEM_STATUS_ES[i.item_status] ?? i.item_status,
    'Motivo rechazo': i.rejection_reason ?? '',
    Notas:           i.notes ?? '',
  }))

  const ws1 = XLSX.utils.json_to_sheet(detailRows)
  ws1['!cols'] = [
    { wch: 16 }, { wch: 22 }, { wch: 16 }, { wch: 28 }, { wch: 16 },
    { wch: 18 }, { wch: 30 }, { wch: 20 }, { wch: 12 }, { wch: 12 },
    { wch: 8  }, { wch: 12 }, { wch: 10 }, { wch: 10 }, { wch: 12 },
    { wch: 30 }, { wch: 30 },
  ]
  XLSX.utils.book_append_sheet(wb, ws1, 'Detalle')

  // ── Hoja 2: Por empleado ─────────────────────────────────────
  const byEmp: Record<string, { name: string; dept: string | null; count: number; totalCLP: number; approvedCLP: number }> = {}
  for (const i of items) {
    if (!byEmp[i.employee_id]) {
      byEmp[i.employee_id] = { name: i.employee_name, dept: i.department, count: 0, totalCLP: 0, approvedCLP: 0 }
    }
    byEmp[i.employee_id].count++
    byEmp[i.employee_id].totalCLP += i.amount_clp
    if (i.item_status === 'approved') byEmp[i.employee_id].approvedCLP += i.amount_clp
  }
  const empRows = Object.values(byEmp)
    .sort((a, b) => b.totalCLP - a.totalCLP)
    .map(e => ({
      Empleado:         e.name,
      Departamento:     e.dept ?? '',
      'N° ítems':       e.count,
      'Total CLP':      e.totalCLP,
      'Aprobado CLP':   e.approvedCLP,
    }))
  const ws2 = XLSX.utils.json_to_sheet(empRows)
  ws2['!cols'] = [{ wch: 22 }, { wch: 16 }, { wch: 10 }, { wch: 14 }, { wch: 14 }]
  XLSX.utils.book_append_sheet(wb, ws2, 'Por Empleado')

  // ── Hoja 3: Por categoría ────────────────────────────────────
  const byCat: Record<string, { count: number; totalCLP: number }> = {}
  for (const i of items) {
    const key = i.category_name ?? 'Sin categoría'
    if (!byCat[key]) byCat[key] = { count: 0, totalCLP: 0 }
    byCat[key].count++
    byCat[key].totalCLP += i.amount_clp
  }
  const catRows = Object.entries(byCat)
    .sort((a, b) => b[1].totalCLP - a[1].totalCLP)
    .map(([cat, d]) => ({ Categoría: cat, 'N° ítems': d.count, 'Total CLP': d.totalCLP }))
  const ws3 = XLSX.utils.json_to_sheet(catRows)
  ws3['!cols'] = [{ wch: 25 }, { wch: 10 }, { wch: 14 }]
  XLSX.utils.book_append_sheet(wb, ws3, 'Por Categoría')

  XLSX.writeFile(wb, `${filename}.xlsx`)
}
```

- [ ] **Step 2: Agregar `exportUnifiedToPDF` al final de `src/lib/export/pdf.ts`**

```typescript
// ─── Export Informes Unificados ───────────────────────────────────────────────

import type { UnifiedReportItem, UnifiedKpis } from '@/lib/report-helpers'

const UNIFIED_SOURCE_ES_PDF: Record<string, string> = {
  rendicion_new:   'Rendición',
  rendicion_hist:  'Rendic. hist.',
  caja_chica_new:  'Caja Chica',
  caja_chica_hist: 'CC hist.',
}

const UNIFIED_ITEM_STATUS_ES_PDF: Record<string, string> = {
  pending:  'Pendiente',
  approved: 'Aprobado',
  rejected: 'Rechazado',
}

export function exportUnifiedToPDF(
  items:  UnifiedReportItem[],
  kpis:   UnifiedKpis,
  title = 'Informe de Gastos'
) {
  const doc = new jsPDF({ orientation: 'landscape' })

  // Encabezado
  doc.setFontSize(14)
  doc.setFont('helvetica', 'bold')
  doc.text(title, 14, 16)

  doc.setFontSize(8)
  doc.setFont('helvetica', 'normal')
  doc.setTextColor(100)
  doc.text(
    `${kpis.totalItems} ítems  ·  Total: ${formatCLP(kpis.totalCLP)}  ·  Aprobado: ${formatCLP(kpis.approvedCLP)}  ·  Exportado ${new Date().toLocaleDateString('es-CL')}`,
    14, 24
  )

  // KPIs por fuente
  const sourceLines = Object.entries(kpis.bySource)
    .filter(([, d]) => d.count > 0)
    .map(([src, d]) => `${UNIFIED_SOURCE_ES_PDF[src] ?? src}: ${d.count} ítems / ${formatCLP(d.totalCLP)}`)
    .join('   ·   ')
  if (sourceLines) doc.text(sourceLines, 14, 30)
  doc.setTextColor(0)

  // Tabla principal
  autoTable(doc, {
    startY: 36,
    head: [['Fuente', 'Empleado', 'Depto', 'Fondo/Rendición', 'Categoría', 'Descripción', 'Proveedor', 'Fecha', 'Monto CLP', 'Estado ítem']],
    body: items.map(i => [
      UNIFIED_SOURCE_ES_PDF[i.source] ?? i.source,
      i.employee_name,
      i.department ?? '',
      i.parent_title,
      i.category_name ?? '',
      i.description,
      i.merchant ?? '',
      formatDate(i.date),
      formatCLP(i.amount_clp),
      UNIFIED_ITEM_STATUS_ES_PDF[i.item_status] ?? i.item_status,
    ]),
    styles:             { fontSize: 7 },
    headStyles:         { fillColor: [13, 148, 136] },
    alternateRowStyles: { fillColor: [240, 253, 250] },
    columnStyles: {
      0: { cellWidth: 22 }, 1: { cellWidth: 28 }, 2: { cellWidth: 18 },
      3: { cellWidth: 38 }, 4: { cellWidth: 22 }, 5: { cellWidth: 45 },
      6: { cellWidth: 22 }, 7: { cellWidth: 18 }, 8: { cellWidth: 20 },
      9: { cellWidth: 18 },
    },
  })

  doc.save(`${filename ?? title}.pdf`)
}
```

- [ ] **Step 3: Verificar TypeScript**

```
npx tsc --noEmit
```
Esperado: 0 errores.

- [ ] **Step 4: Commit**

```powershell
git add src/lib/export/excel.ts src/lib/export/pdf.ts
git commit -m "feat: exportUnifiedToExcel + exportUnifiedToPDF para módulo Informes"
```

---

## Task 4: Página + Client Component

**Files:**
- Create: `src/app/(app)/informes/page.tsx`
- Create: `src/app/(app)/informes/client.tsx`

**Interfaces:**
- Consumes: `getReportFilterOptions`, `getUnifiedReportItems`, `UnifiedReportFilters`, `ReportFilterOptions`, `UnifiedReportItem`, `UnifiedKpis` de `@/actions/reports`; `buildPeriodRange`, `SOURCE_LABELS`, `SOURCE_COLORS` de `@/lib/report-helpers`
- Produces: ruta `/informes` funcional

- [ ] **Step 1: Crear `src/app/(app)/informes/page.tsx`**

```tsx
import { getReportFilterOptions } from '@/actions/reports'
import { InformesClient } from './client'

export const dynamic = 'force-dynamic'

export default async function InformesPage() {
  const filterOptions = await getReportFilterOptions()
  return <InformesClient filterOptions={filterOptions} />
}
```

- [ ] **Step 2: Crear `src/app/(app)/informes/client.tsx`** (archivo completo)

```tsx
'use client'

import { useState } from 'react'
import { Search, Download, FileSpreadsheet, X, ChevronDown } from 'lucide-react'
import { getUnifiedReportItems } from '@/actions/reports'
import { buildPeriodRange, computeUnifiedKpis, SOURCE_LABELS, SOURCE_COLORS } from '@/lib/report-helpers'
import { formatCLP, formatDate } from '@/lib/utils'
import type { ReportFilterOptions, UnifiedReportItem, UnifiedReportFilters, UnifiedKpis, PeriodPreset } from '@/lib/report-helpers'

// ─── Constantes ───────────────────────────────────────────────────────────────

const CURRENT_YEAR = new Date().getFullYear()
const YEARS = [CURRENT_YEAR, CURRENT_YEAR - 1, CURRENT_YEAR - 2, CURRENT_YEAR - 3]

const REPORT_STATUS_OPTS = [
  { value: 'submitted',                  label: 'En revisión',      color: 'bg-blue-100 text-blue-700' },
  { value: 'pending_l2',                 label: 'Revisión N2',       color: 'bg-purple-100 text-purple-700' },
  { value: 'approved',                   label: 'Aprobada',          color: 'bg-emerald-100 text-emerald-700' },
  { value: 'partially_approved',         label: 'Aprobada parcial',  color: 'bg-yellow-100 text-yellow-700' },
  { value: 'rejected',                   label: 'Rechazada',         color: 'bg-red-100 text-red-700' },
  { value: 'reimbursed',                 label: 'Reembolsada',       color: 'bg-slate-100 text-slate-600' },
  { value: 'pending_approval',           label: 'En revisión (CC)',  color: 'bg-blue-100 text-blue-700' },
  { value: 'funds_sent',                 label: 'Fondos enviados',   color: 'bg-cyan-100 text-cyan-700' },
  { value: 'active',                     label: 'Activo',            color: 'bg-teal-100 text-teal-700' },
  { value: 'pending_liquidation_approval', label: 'Liquidación',    color: 'bg-orange-100 text-orange-700' },
  { value: 'settled',                    label: 'Liquidado',         color: 'bg-slate-100 text-slate-600' },
]

const ITEM_STATUS_OPTS = [
  { value: 'pending',  label: 'Pendiente', color: 'bg-amber-100 text-amber-700'   },
  { value: 'approved', label: 'Aprobado',  color: 'bg-emerald-100 text-emerald-700' },
  { value: 'rejected', label: 'Rechazado', color: 'bg-red-100 text-red-700'       },
]

// ─── Props ────────────────────────────────────────────────────────────────────

interface Props {
  filterOptions: ReportFilterOptions
}

// ─── Chip toggle helper ───────────────────────────────────────────────────────

function toggle<T>(arr: T[], val: T): T[] {
  return arr.includes(val) ? arr.filter(x => x !== val) : [...arr, val]
}

// ─── Component ───────────────────────────────────────────────────────────────

export function InformesClient({ filterOptions }: Props) {
  // ── Filtros ────────────────────────────────────────────────────────────────
  const [sourceTypes,     setSourceTypes]     = useState<('rendicion' | 'caja_chica')[]>(['rendicion', 'caja_chica'])
  const [dataAge,         setDataAge]         = useState<'new' | 'historical' | 'all'>('all')
  const [periodPreset,    setPeriodPreset]     = useState<PeriodPreset>({ type: 'custom' })
  const [dateFrom,        setDateFrom]        = useState('')
  const [dateTo,          setDateTo]          = useState('')
  const [department,      setDepartment]      = useState('')
  const [empSearch,       setEmpSearch]       = useState('')
  const [selectedEmps,    setSelectedEmps]    = useState<string[]>([])
  const [selectedCats,    setSelectedCats]    = useState<string[]>([])
  const [selectedRends,   setSelectedRends]   = useState<string[]>([])
  const [selectedFondos,  setSelectedFondos]  = useState<string[]>([])
  const [reportStatuses,  setReportStatuses]  = useState<string[]>([])
  const [itemStatuses,    setItemStatuses]    = useState<('pending' | 'approved' | 'rejected')[]>([])
  const [reimb,           setReimb]           = useState<'all' | 'pending' | 'reimbursed'>('all')
  const [defontana,       setDefontana]       = useState<'all' | 'notExported' | 'exported'>('all')

  // ── Resultado ──────────────────────────────────────────────────────────────
  const [items,     setItems]     = useState<UnifiedReportItem[] | null>(null)
  const [kpis,      setKpis]      = useState<UnifiedKpis | null>(null)
  const [searching, setSearching] = useState(false)
  const [error,     setError]     = useState<string | null>(null)
  const [exporting, setExporting] = useState<'excel' | 'pdf' | null>(null)

  // ── Helpers de período ─────────────────────────────────────────────────────
  function applyPreset(preset: PeriodPreset) {
    setPeriodPreset(preset)
    if (preset.type === 'custom') return
    const range = buildPeriodRange(preset)
    if (range) { setDateFrom(range.dateFrom); setDateTo(range.dateTo) }
  }

  // ── Buscar ─────────────────────────────────────────────────────────────────
  async function handleSearch() {
    setSearching(true)
    setError(null)
    setItems(null)
    setKpis(null)
    try {
      const filters: UnifiedReportFilters = {
        sourceTypes,
        dataAge,
        dateFrom:       dateFrom || undefined,
        dateTo:         dateTo   || undefined,
        department:     department || undefined,
        employeeIds:    selectedEmps.length   ? selectedEmps   : undefined,
        categoryIds:    selectedCats.length   ? selectedCats   : undefined,
        reportIds:      selectedRends.length  ? selectedRends  : undefined,
        fundIds:        selectedFondos.length ? selectedFondos : undefined,
        reportStatuses: reportStatuses.length ? reportStatuses : undefined,
        itemStatuses:   itemStatuses.length   ? itemStatuses   : undefined,
        reimb:          reimb     !== 'all' ? reimb     : undefined,
        defontana:      defontana !== 'all' ? defontana : undefined,
      }
      const result = await getUnifiedReportItems(filters)
      setItems(result.items)
      setKpis(computeUnifiedKpis(result.items))
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error al generar el informe')
    } finally {
      setSearching(false)
    }
  }

  // ── Exportar ───────────────────────────────────────────────────────────────
  async function handleExport(format: 'excel' | 'pdf') {
    if (!items || !kpis) return
    setExporting(format)
    try {
      const title = 'Informe Gastos'
      if (format === 'excel') {
        const { exportUnifiedToExcel } = await import('@/lib/export/excel')
        exportUnifiedToExcel(items, kpis, 'informe-gastos')
      } else {
        const { exportUnifiedToPDF } = await import('@/lib/export/pdf')
        exportUnifiedToPDF(items, kpis, title)
      }
    } finally {
      setExporting(null)
    }
  }

  // ── Filtrado local de empleados (búsqueda en dropdown) ────────────────────
  const empOptions = filterOptions.employees.filter(e =>
    !empSearch || e.name.toLowerCase().includes(empSearch.toLowerCase())
  )

  const hasResults = items !== null

  return (
    <div className="space-y-5">
      {/* Encabezado */}
      <div>
        <h1 className="font-display font-extrabold text-2xl tracking-tight text-ink-900">Informes</h1>
        <p className="text-sm text-ink-500 mt-1">Vista unificada de gastos: rendiciones, caja chica, históricos</p>
      </div>

      {/* Filtros */}
      <div className="bg-white rounded-card p-5 shadow-card space-y-5">

        {/* Fila 1: Fuente + Datos */}
        <div className="flex flex-wrap gap-4">
          <div>
            <p className="text-xs font-semibold text-ink-500 uppercase tracking-wide mb-2">Fuente</p>
            <div className="flex gap-2">
              {(['rendicion', 'caja_chica'] as const).map(src => (
                <button
                  key={src}
                  onClick={() => setSourceTypes(t => t.includes(src) ? t.filter(x => x !== src) : [...t, src])}
                  className={`px-3 py-1.5 rounded-item text-sm font-semibold transition-colors ${
                    sourceTypes.includes(src)
                      ? 'bg-brand-600 text-white'
                      : 'bg-ink-100 text-ink-500 hover:bg-ink-200'
                  }`}
                >
                  {src === 'rendicion' ? 'Rendiciones' : 'Caja Chica'}
                </button>
              ))}
            </div>
          </div>

          <div>
            <p className="text-xs font-semibold text-ink-500 uppercase tracking-wide mb-2">Datos</p>
            <div className="flex gap-2">
              {([['all','Todos'],['new','Nuevos'],['historical','Histórico']] as const).map(([val, label]) => (
                <button
                  key={val}
                  onClick={() => setDataAge(val)}
                  className={`px-3 py-1.5 rounded-item text-sm font-semibold transition-colors ${
                    dataAge === val ? 'bg-brand-600 text-white' : 'bg-ink-100 text-ink-500 hover:bg-ink-200'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Fila 2: Período */}
        <div>
          <p className="text-xs font-semibold text-ink-500 uppercase tracking-wide mb-2">Período</p>
          <div className="flex flex-wrap gap-2 items-center">
            <button
              onClick={() => applyPreset({ type: 'custom' })}
              className={`px-3 py-1.5 rounded-item text-sm font-semibold transition-colors ${
                periodPreset.type === 'custom' ? 'bg-brand-600 text-white' : 'bg-ink-100 text-ink-500 hover:bg-ink-200'
              }`}
            >
              Personalizado
            </button>
            {YEARS.map(y => (
              <button
                key={y}
                onClick={() => applyPreset({ type: 'year', year: y })}
                className={`px-3 py-1.5 rounded-item text-sm font-semibold transition-colors ${
                  periodPreset.type === 'year' && periodPreset.year === y ? 'bg-brand-600 text-white' : 'bg-ink-100 text-ink-500 hover:bg-ink-200'
                }`}
              >
                {y}
              </button>
            ))}
            {YEARS.map(y => [1, 2].map(h => (
              <button
                key={`${y}-h${h}`}
                onClick={() => applyPreset({ type: 'semester', year: y, half: h as 1|2 })}
                className={`px-3 py-1.5 rounded-item text-sm font-semibold transition-colors ${
                  periodPreset.type === 'semester' && periodPreset.year === y && periodPreset.half === h ? 'bg-brand-600 text-white' : 'bg-ink-100 text-ink-500 hover:bg-ink-200'
                }`}
              >
                S{h} {y}
              </button>
            )))}
          </div>
          <div className="flex gap-3 mt-3">
            <div>
              <label className="text-xs text-ink-500 mb-1 block">Desde</label>
              <input
                type="date"
                value={dateFrom}
                onChange={e => { setDateFrom(e.target.value); setPeriodPreset({ type: 'custom' }) }}
                className="border border-ink-200 rounded-item px-3 py-2 text-sm text-ink-800 bg-white focus:outline-none focus:ring-2 focus:ring-brand-500"
              />
            </div>
            <div>
              <label className="text-xs text-ink-500 mb-1 block">Hasta</label>
              <input
                type="date"
                value={dateTo}
                onChange={e => { setDateTo(e.target.value); setPeriodPreset({ type: 'custom' }) }}
                className="border border-ink-200 rounded-item px-3 py-2 text-sm text-ink-800 bg-white focus:outline-none focus:ring-2 focus:ring-brand-500"
              />
            </div>
          </div>
        </div>

        {/* Fila 3: Departamento + Empleados */}
        <div className="flex flex-wrap gap-4">
          <div className="min-w-[180px]">
            <label className="text-xs font-semibold text-ink-500 uppercase tracking-wide mb-2 block">Departamento</label>
            <select
              value={department}
              onChange={e => setDepartment(e.target.value)}
              className="w-full border border-ink-200 rounded-item px-3 py-2 text-sm text-ink-800 bg-white focus:outline-none focus:ring-2 focus:ring-brand-500"
            >
              <option value="">Todos</option>
              {filterOptions.departments.map(d => <option key={d} value={d}>{d}</option>)}
            </select>
          </div>

          <div className="min-w-[220px]">
            <p className="text-xs font-semibold text-ink-500 uppercase tracking-wide mb-2">Empleados</p>
            <div className="relative">
              <input
                type="text"
                placeholder="Buscar empleado..."
                value={empSearch}
                onChange={e => setEmpSearch(e.target.value)}
                className="w-full border border-ink-200 rounded-item px-3 py-2 text-sm text-ink-800 bg-white focus:outline-none focus:ring-2 focus:ring-brand-500"
              />
            </div>
            {empOptions.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-1 max-h-28 overflow-y-auto">
                {empOptions.map(e => (
                  <button
                    key={e.id}
                    onClick={() => setSelectedEmps(ids => toggle(ids, e.id))}
                    className={`px-2 py-1 rounded-item text-xs font-medium transition-colors ${
                      selectedEmps.includes(e.id) ? 'bg-brand-600 text-white' : 'bg-ink-100 text-ink-600 hover:bg-ink-200'
                    }`}
                  >
                    {e.name}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Fila 4: Categorías */}
        {filterOptions.categories.length > 0 && (
          <div>
            <p className="text-xs font-semibold text-ink-500 uppercase tracking-wide mb-2">Categorías</p>
            <div className="flex flex-wrap gap-1.5">
              {filterOptions.categories.map(c => (
                <button
                  key={c.id}
                  onClick={() => setSelectedCats(ids => toggle(ids, c.id))}
                  className={`px-2.5 py-1 rounded-item text-xs font-semibold transition-colors border ${
                    selectedCats.includes(c.id)
                      ? 'border-brand-600 bg-brand-600 text-white'
                      : 'border-ink-200 bg-white text-ink-600 hover:border-brand-400'
                  }`}
                  style={!selectedCats.includes(c.id) && c.color ? { borderLeftColor: c.color, borderLeftWidth: 3 } : undefined}
                >
                  {c.name}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Fila 5: Rendición y Fondo específicos (condicionales) */}
        <div className="flex flex-wrap gap-4">
          {sourceTypes.includes('rendicion') && filterOptions.rendiciones.length > 0 && (
            <div className="min-w-[220px] max-w-xs">
              <p className="text-xs font-semibold text-ink-500 uppercase tracking-wide mb-2">Rendición específica</p>
              <div className="max-h-28 overflow-y-auto border border-ink-200 rounded-item p-2 space-y-1">
                {filterOptions.rendiciones.map(r => (
                  <label key={r.id} className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={selectedRends.includes(r.id)}
                      onChange={() => setSelectedRends(ids => toggle(ids, r.id))}
                      className="accent-brand-600"
                    />
                    <span className="text-xs text-ink-700 truncate">{r.title}</span>
                  </label>
                ))}
              </div>
            </div>
          )}

          {sourceTypes.includes('caja_chica') && filterOptions.fondos.length > 0 && (
            <div className="min-w-[220px] max-w-xs">
              <p className="text-xs font-semibold text-ink-500 uppercase tracking-wide mb-2">Fondo específico</p>
              <div className="max-h-28 overflow-y-auto border border-ink-200 rounded-item p-2 space-y-1">
                {filterOptions.fondos.map(f => (
                  <label key={f.id} className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={selectedFondos.includes(f.id)}
                      onChange={() => setSelectedFondos(ids => toggle(ids, f.id))}
                      className="accent-brand-600"
                    />
                    <span className="text-xs text-ink-700 truncate">{f.name}</span>
                  </label>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Fila 6: Estados del informe */}
        <div>
          <p className="text-xs font-semibold text-ink-500 uppercase tracking-wide mb-2">Estado del informe</p>
          <div className="flex flex-wrap gap-1.5">
            {REPORT_STATUS_OPTS.map(o => (
              <button
                key={o.value}
                onClick={() => setReportStatuses(s => toggle(s, o.value))}
                className={`px-2.5 py-1 rounded-item text-xs font-semibold transition-colors ${
                  reportStatuses.includes(o.value) ? o.color + ' ring-1 ring-current' : 'bg-ink-100 text-ink-500 hover:bg-ink-200'
                }`}
              >
                {o.label}
              </button>
            ))}
          </div>
        </div>

        {/* Fila 7: Estado ítem + Reembolso + Defontana */}
        <div className="flex flex-wrap gap-6">
          <div>
            <p className="text-xs font-semibold text-ink-500 uppercase tracking-wide mb-2">Estado del ítem</p>
            <div className="flex gap-2">
              {ITEM_STATUS_OPTS.map(o => (
                <button
                  key={o.value}
                  onClick={() => setItemStatuses(s => toggle(s, o.value as 'pending'|'approved'|'rejected'))}
                  className={`px-2.5 py-1 rounded-item text-xs font-semibold transition-colors ${
                    itemStatuses.includes(o.value as 'pending'|'approved'|'rejected') ? o.color : 'bg-ink-100 text-ink-500 hover:bg-ink-200'
                  }`}
                >
                  {o.label}
                </button>
              ))}
            </div>
          </div>

          {sourceTypes.includes('rendicion') && (
            <>
              <div>
                <p className="text-xs font-semibold text-ink-500 uppercase tracking-wide mb-2">Reembolso</p>
                <div className="flex gap-2">
                  {([['all','Todos'],['pending','Pendiente'],['reimbursed','Reembolsado']] as const).map(([val, lbl]) => (
                    <button
                      key={val}
                      onClick={() => setReimb(val)}
                      className={`px-2.5 py-1 rounded-item text-xs font-semibold transition-colors ${
                        reimb === val ? 'bg-brand-600 text-white' : 'bg-ink-100 text-ink-500 hover:bg-ink-200'
                      }`}
                    >{lbl}</button>
                  ))}
                </div>
              </div>

              <div>
                <p className="text-xs font-semibold text-ink-500 uppercase tracking-wide mb-2">Defontana</p>
                <div className="flex gap-2">
                  {([['all','Todos'],['notExported','Sin exportar'],['exported','Exportado']] as const).map(([val, lbl]) => (
                    <button
                      key={val}
                      onClick={() => setDefontana(val)}
                      className={`px-2.5 py-1 rounded-item text-xs font-semibold transition-colors ${
                        defontana === val ? 'bg-brand-600 text-white' : 'bg-ink-100 text-ink-500 hover:bg-ink-200'
                      }`}
                    >{lbl}</button>
                  ))}
                </div>
              </div>
            </>
          )}
        </div>

        {/* Botón de búsqueda */}
        <div className="flex justify-end pt-1">
          <button
            onClick={handleSearch}
            disabled={searching || sourceTypes.length === 0}
            className="flex items-center gap-2 px-5 py-2.5 bg-brand-600 hover:bg-brand-700 disabled:opacity-50 text-white rounded-item text-sm font-semibold transition-colors"
          >
            <Search size={16} />
            {searching ? 'Buscando…' : 'Generar informe'}
          </button>
        </div>
      </div>

      {/* Error */}
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-card p-4 text-sm text-red-700">{error}</div>
      )}

      {/* Resultados */}
      {hasResults && kpis && (
        <div className="space-y-4">
          {/* KPI cards */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <div className="bg-white rounded-card p-4 shadow-card">
              <p className="text-xs text-ink-500 font-medium">Total ítems</p>
              <p className="text-2xl font-mono-amount font-bold text-ink-900 mt-1">{kpis.totalItems.toLocaleString('es-CL')}</p>
            </div>
            <div className="bg-white rounded-card p-4 shadow-card">
              <p className="text-xs text-ink-500 font-medium">Total CLP</p>
              <p className="text-2xl font-mono-amount font-bold text-ink-900 mt-1">{formatCLP(kpis.totalCLP)}</p>
            </div>
            <div className="bg-white rounded-card p-4 shadow-card">
              <p className="text-xs text-ink-500 font-medium">Monto aprobado</p>
              <p className="text-2xl font-mono-amount font-bold text-emerald-600 mt-1">{formatCLP(kpis.approvedCLP)}</p>
            </div>
            <div className="bg-white rounded-card p-4 shadow-card">
              <p className="text-xs text-ink-500 font-medium mb-2">Por fuente</p>
              <div className="space-y-1">
                {(Object.entries(kpis.bySource) as [keyof typeof kpis.bySource, { count: number; totalCLP: number }][])
                  .filter(([, d]) => d.count > 0)
                  .map(([src, d]) => (
                    <div key={src} className="flex justify-between text-xs">
                      <span className={`px-1.5 py-0.5 rounded ${SOURCE_COLORS[src].bg} ${SOURCE_COLORS[src].text} font-medium`}>
                        {SOURCE_LABELS[src]}
                      </span>
                      <span className="font-mono-amount text-ink-600">{d.count} · {formatCLP(d.totalCLP)}</span>
                    </div>
                  ))}
              </div>
            </div>
          </div>

          {/* Acciones de export */}
          {items!.length > 0 && (
            <div className="flex justify-end gap-2">
              <button
                onClick={() => handleExport('excel')}
                disabled={!!exporting}
                className="flex items-center gap-2 px-4 py-2 border border-ink-200 rounded-item text-sm font-semibold text-ink-700 bg-white hover:bg-ink-50 disabled:opacity-50 transition-colors"
              >
                <FileSpreadsheet size={15} />
                {exporting === 'excel' ? 'Generando…' : 'Excel'}
              </button>
              <button
                onClick={() => handleExport('pdf')}
                disabled={!!exporting}
                className="flex items-center gap-2 px-4 py-2 border border-ink-200 rounded-item text-sm font-semibold text-ink-700 bg-white hover:bg-ink-50 disabled:opacity-50 transition-colors"
              >
                <Download size={15} />
                {exporting === 'pdf' ? 'Generando…' : 'PDF'}
              </button>
            </div>
          )}

          {/* Tabla */}
          {items!.length === 0 ? (
            <div className="bg-white rounded-card p-10 text-center text-ink-400 text-sm shadow-card">
              No hay ítems que coincidan con los filtros seleccionados.
            </div>
          ) : (
            <div className="bg-white rounded-card shadow-card overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-ink-100 text-xs text-ink-500 font-semibold uppercase tracking-wide">
                      <th className="text-left px-4 py-3">Fuente</th>
                      <th className="text-left px-4 py-3">Empleado</th>
                      <th className="text-left px-4 py-3">Depto</th>
                      <th className="text-left px-4 py-3">Fondo/Rendición</th>
                      <th className="text-left px-4 py-3">Categoría</th>
                      <th className="text-left px-4 py-3">Descripción</th>
                      <th className="text-left px-4 py-3">Proveedor</th>
                      <th className="text-left px-4 py-3">Fecha</th>
                      <th className="text-right px-4 py-3">Monto CLP</th>
                      <th className="text-left px-4 py-3">Estado</th>
                    </tr>
                  </thead>
                  <tbody>
                    {items!.map((item, idx) => (
                      <tr key={item.item_id} className={idx % 2 === 0 ? 'bg-white' : 'bg-ink-50/40'}>
                        <td className="px-4 py-2.5">
                          <span className={`px-1.5 py-0.5 rounded text-xs font-medium ${SOURCE_COLORS[item.source].bg} ${SOURCE_COLORS[item.source].text}`}>
                            {SOURCE_LABELS[item.source]}
                          </span>
                        </td>
                        <td className="px-4 py-2.5 text-ink-800 font-medium">{item.employee_name}</td>
                        <td className="px-4 py-2.5 text-ink-500">{item.department ?? '—'}</td>
                        <td className="px-4 py-2.5 text-ink-700 max-w-[160px] truncate" title={item.parent_title}>{item.parent_title}</td>
                        <td className="px-4 py-2.5">
                          {item.category_name ? (
                            <span className="text-xs text-ink-600" style={item.category_color ? { borderLeft: `3px solid ${item.category_color}`, paddingLeft: 6 } : undefined}>
                              {item.category_name}
                            </span>
                          ) : <span className="text-ink-300">—</span>}
                        </td>
                        <td className="px-4 py-2.5 text-ink-700 max-w-[180px] truncate" title={item.description}>{item.description}</td>
                        <td className="px-4 py-2.5 text-ink-500">{item.merchant ?? '—'}</td>
                        <td className="px-4 py-2.5 text-ink-500 whitespace-nowrap">{formatDate(item.date)}</td>
                        <td className="px-4 py-2.5 text-right font-mono-amount text-ink-800">{formatCLP(item.amount_clp)}</td>
                        <td className="px-4 py-2.5">
                          <span className={`px-2 py-0.5 rounded-item text-xs font-medium ${
                            item.item_status === 'approved' ? 'bg-emerald-100 text-emerald-700' :
                            item.item_status === 'rejected' ? 'bg-red-100 text-red-700' :
                            'bg-amber-100 text-amber-700'
                          }`}>
                            {item.item_status === 'approved' ? 'Aprobado' : item.item_status === 'rejected' ? 'Rechazado' : 'Pendiente'}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="border-t border-ink-100 px-4 py-3 flex justify-between text-xs text-ink-500">
                <span>{items!.length.toLocaleString('es-CL')} ítem{items!.length !== 1 ? 's' : ''}</span>
                <span className="font-mono-amount font-semibold text-ink-800">Total: {formatCLP(kpis.totalCLP)}</span>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 3: Verificar TypeScript**

```
npx tsc --noEmit
```
Esperado: 0 errores

- [ ] **Step 4: Commit**

```powershell
git add "src/app/(app)/informes/"
git commit -m "feat: página /informes — Client Component con todos los filtros y tabla de resultados"
```

---

## Task 5: Sidebar + mejora filtros Caja Chica

**Files:**
- Modify: `src/components/layout/Sidebar.tsx`
- Modify: `src/app/(app)/petty-cash/client.tsx`

**Interfaces:**
- Consumes: nada nuevo — usa `user.role` y `user.can_approve` ya disponibles en `Sidebar`
- Produces: "Informes" visible para admin + approver; filtros de lista en Caja Chica mejorados

- [ ] **Step 1: Agregar entrada "Informes" al sidebar**

En `src/components/layout/Sidebar.tsx`, agregar en `NAV_ITEMS` después de la entrada `/admin`:

```typescript
// ANTES (línea ~37):
{ href: '/admin',           label: 'Dashboard',       Icon: BarChart3,        roles: ['admin'] as const },

// DESPUÉS:
{ href: '/admin',           label: 'Dashboard',       Icon: BarChart3,        roles: ['admin'] as const },
{ href: '/informes',        label: 'Informes',         Icon: BarChart2,        roles: ['admin', 'approver'] as const },
```

Verificar que `BarChart2` ya está importado (si no, agregarlo al import de Lucide):
```typescript
import {
  LayoutDashboard, ScanLine, CheckCircle2, BarChart3, BarChart2,
  ReceiptText, Users, Settings2, GripVertical, RotateCcw,
  Wallet, Lightbulb, Trash2, Clock,
} from 'lucide-react'
```

- [ ] **Step 2: Mejorar filtros de lista en `src/app/(app)/petty-cash/client.tsx`**

**2a.** Reemplazar el estado `employeeSearch` por `selectedEmpIds` para la lista:

```typescript
// ANTES (línea ~309):
const [employeeSearch, setEmployeeSearch] = useState('')

// DESPUÉS:
const [selectedEmpIds_list, setSelectedEmpIds_list] = useState<string[]>([])
const [empSearch_list,      setEmpSearch_list]       = useState('')
```

**2b.** Agregar estado de período para la lista:

```typescript
// Agregar después del estado de filtros de lista (línea ~310):
const [periodPreset_list, setPeriodPreset_list] = useState<PeriodPreset>({ type: 'custom' })
```

**2c.** Agregar import de `buildPeriodRange` y `PeriodPreset`:

```typescript
import { buildPeriodRange } from '@/lib/report-helpers'
import type { PeriodPreset } from '@/lib/report-helpers'
```

**2d.** Actualizar el filtrado de la lista para usar `selectedEmpIds_list`:

```typescript
// ANTES (línea ~338):
if (employeeSearch && !f.employee_name.toLowerCase().includes(employeeSearch.toLowerCase())) return false

// DESPUÉS:
if (selectedEmpIds_list.length && !selectedEmpIds_list.includes(f.employee_id)) return false
```

**2e.** Actualizar `activeFilters`:

```typescript
// ANTES (línea ~344):
const activeFilters = statusFilter !== 'all' || dateFrom || dateTo || employeeSearch

// DESPUÉS:
const activeFilters = statusFilter !== 'all' || dateFrom || dateTo || selectedEmpIds_list.length > 0
```

**2f.** En el JSX, reemplazar el input de búsqueda de empleado por un dropdown + chips de período.

Buscar la sección del filtro `employeeSearch` en el JSX (cerca de donde aparece el input de texto para buscar empleado) y reemplazarla con:

```tsx
{/* Período shortcuts */}
<div className="flex flex-wrap gap-1.5">
  {[CURRENT_YEAR, CURRENT_YEAR - 1].map(y => (
    <button
      key={y}
      onClick={() => {
        const range = buildPeriodRange({ type: 'year', year: y })
        if (range) { setDateFrom(range.dateFrom); setDateTo(range.dateTo); setPeriodPreset_list({ type: 'year', year: y }) }
      }}
      className={`px-2.5 py-1 rounded-item text-xs font-semibold transition-colors ${
        periodPreset_list.type === 'year' && (periodPreset_list as any).year === y
          ? 'bg-brand-600 text-white'
          : 'bg-ink-100 text-ink-500 hover:bg-ink-200'
      }`}
    >
      {y}
    </button>
  ))}
  {[1, 2].map(h => (
    <button
      key={h}
      onClick={() => {
        const range = buildPeriodRange({ type: 'semester', year: CURRENT_YEAR, half: h as 1|2 })
        if (range) { setDateFrom(range.dateFrom); setDateTo(range.dateTo); setPeriodPreset_list({ type: 'semester', year: CURRENT_YEAR, half: h as 1|2 }) }
      }}
      className={`px-2.5 py-1 rounded-item text-xs font-semibold transition-colors ${
        periodPreset_list.type === 'semester' && (periodPreset_list as any).half === h
          ? 'bg-brand-600 text-white'
          : 'bg-ink-100 text-ink-500 hover:bg-ink-200'
      }`}
    >
      S{h} {CURRENT_YEAR}
    </button>
  ))}
  {(dateFrom || dateTo || selectedEmpIds_list.length > 0) && (
    <button
      onClick={() => { setDateFrom(''); setDateTo(''); setSelectedEmpIds_list([]); setPeriodPreset_list({ type: 'custom' }) }}
      className="px-2.5 py-1 rounded-item text-xs font-semibold text-red-500 hover:bg-red-50 transition-colors"
    >
      Limpiar
    </button>
  )}
</div>

{/* Dropdown de empleados */}
<div className="mt-2">
  <input
    type="text"
    placeholder="Buscar empleado..."
    value={empSearch_list}
    onChange={e => setEmpSearch_list(e.target.value)}
    className="border border-ink-200 rounded-item px-3 py-1.5 text-sm text-ink-800 bg-white focus:outline-none focus:ring-2 focus:ring-brand-500 w-48"
  />
  {empSearch_list && (
    <div className="mt-1 flex flex-wrap gap-1">
      {employees
        .filter(e => e.name.toLowerCase().includes(empSearch_list.toLowerCase()))
        .slice(0, 8)
        .map(e => (
          <button
            key={e.id}
            onClick={() => { setSelectedEmpIds_list(ids => toggle_ids(ids, e.id)); setEmpSearch_list('') }}
            className={`px-2 py-0.5 rounded-item text-xs font-medium transition-colors ${
              selectedEmpIds_list.includes(e.id) ? 'bg-brand-600 text-white' : 'bg-ink-100 text-ink-600 hover:bg-ink-200'
            }`}
          >
            {e.name}
          </button>
        ))}
    </div>
  )}
  {selectedEmpIds_list.length > 0 && (
    <div className="mt-1 flex flex-wrap gap-1">
      {selectedEmpIds_list.map(id => {
        const emp = employees.find(e => e.id === id)
        return emp ? (
          <span key={id} className="flex items-center gap-1 px-2 py-0.5 bg-brand-100 text-brand-700 rounded-item text-xs font-medium">
            {emp.name}
            <button onClick={() => setSelectedEmpIds_list(ids => ids.filter(x => x !== id))} className="hover:text-brand-900">×</button>
          </span>
        ) : null
      })}
    </div>
  )}
</div>
```

Agregar el helper `toggle_ids` cerca de `toggleCat` / `toggleEmp`:
```typescript
function toggle_ids(arr: string[], val: string): string[] {
  return arr.includes(val) ? arr.filter(x => x !== val) : [...arr, val]
}
```

Agregar la constante:
```typescript
const CURRENT_YEAR = new Date().getFullYear()
```

- [ ] **Step 3: Verificar TypeScript**

```
npx tsc --noEmit
```
Esperado: 0 errores

- [ ] **Step 4: Tests generales**

```
npx vitest run
```
Esperado: todos los tests existentes siguen pasando (cambios son solo UI)

- [ ] **Step 5: Commit final**

```powershell
git add src/components/layout/Sidebar.tsx "src/app/(app)/petty-cash/client.tsx"
git commit -m "feat: Informes en sidebar; filtros empleado y período mejorados en Caja Chica"
```

- [ ] **Step 6: Push para deploy**

```powershell
git push origin main
```

---

## Verificación end-to-end

### TypeScript (correr después de cada task)
```
npx tsc --noEmit
```

### Tests
```
npx vitest run
```
Esperado al final: todos los tests anteriores pasan + 9 nuevos tests de `report-helpers`.

### Manual — flujo principal
1. Login como admin → sidebar muestra "Informes" entre Dashboard y Rendiciones
2. Login como approver → sidebar también muestra "Informes"
3. Login como employee sin can_approve → NO ve "Informes" en sidebar
4. En `/informes`: seleccionar fuente "Rendiciones + Caja Chica", datos "Todos", año 2025 → click "Generar informe"
5. Verificar KPI cards con totales correctos y breakdown por fuente
6. Exportar Excel → 3 hojas: Detalle, Por Empleado, Por Categoría con datos correctos
7. Exportar PDF → tabla landscape con KPI resumen en encabezado
8. Filtrar solo por una categoría (ej: Transporte) → solo aparecen ítems de esa categoría en todas las fuentes
9. Filtrar "Caja Chica + Histórico" → solo aparecen ítems de cajas chicas históricas (expense_items de expense_reports con historical_type='caja_chica')
10. En Caja Chica → filtros de lista: usar shortcuts de año, buscar empleado por nombre → chips aparecen y filtran la lista

### Verificar que datos históricos aparecen en el informe
Si hay carga histórica de tipo 'caja_chica':
1. En `/informes`: seleccionar Caja Chica + Datos: Histórico → Generar
2. Los ítems deben aparecer (antes del fix, este filtro devolvía vacío)
