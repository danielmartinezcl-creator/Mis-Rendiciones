# Política de Gastos en Tiempo Real + Aprobación Inteligente con IA — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Añadir políticas de gasto por categoría/departamento/empleado con validación inline en el formulario, y análisis automático de Claude antes de que el aprobador revise cada rendición.

**Architecture:** Feature 1 almacena políticas en `expense_policies` y viola­ciones en `expense_items.policy_violations`; Feature 2 usa esos datos en el prompt de Claude y cachea el JSON de análisis en `expense_reports.ai_analysis`. Helpers puros son testeables con Vitest; los Server Actions usan el cliente Supabase server-side. La validación de políticas se llama inline desde `ExpenseItemForm` vía Server Action con debounce de 600ms.

**Tech Stack:** Next.js 16 App Router · Server Actions (`'use server'`) · Supabase (proyecto `jqtbtgduqzxkgubmzukg`, RLS con `get_my_org_id()`) · Anthropic SDK (Sonnet 4.6) · Vitest · Tailwind v4 · TypeScript strict

## Global Constraints

- **Next.js 16**: protección de rutas en `src/proxy.ts`, NO `middleware.ts`
- **Tailwind v4**: config en `src/app/globals.css` vía `@theme {}`, NO `tailwind.config.ts`
- **Supabase**: proyecto `jqtbtgduqzxkgubmzukg` · RLS siempre con `get_my_org_id()` / `is_admin()`, NUNCA subquery directa en policies
- **Server Actions**: toda función exportada debe ser `async`; helpers puros en `src/lib/`, no en `src/actions/`
- **Exportar tipos** desde archivos `'use server'` causa error runtime en Turbopack — importar tipos desde `@/lib/` directamente
- **Colores**: usar siempre clases `brand-*`, nunca `indigo-*` o `teal-*` directamente
- **Radios**: usar `rounded-item` (14px) y `rounded-card` (18px), nunca `rounded-[14px]` hardcodeado
- **Tipografía montos**: clase `font-mono-amount` (Geist Mono)
- **Íconos**: Lucide React, no emojis en UI
- **Modelos Claude**: Sonnet 4.6 (`claude-sonnet-4-6`) para todas las llamadas IA
- **Supabase types**: tablas nuevas DEBEN tener `Relationships: []`; tablas append-only: `Update: Record<string, never>`; selects anidados: castear con `as unknown as T`

---

## File Structure

**Archivos nuevos:**
- `supabase/migrations/011_expense_policies_and_ai_analysis.sql` — DDL: tabla expense_policies + columnas en expense_items y expense_reports
- `src/lib/policy-helpers.ts` — helpers puros: resolución, verificación de límites, formato de mensajes
- `src/lib/approval-analysis-helpers.ts` — helpers puros: buildAnalysisPrompt, parseAnalysisResponse
- `src/actions/policies.ts` — Server Actions: CRUD políticas + checkPolicyViolations
- `src/tests/policy-helpers.test.ts` — tests Vitest para policy-helpers
- `src/tests/approval-analysis-helpers.test.ts` — tests Vitest para approval-analysis-helpers

**Archivos modificados:**
- `src/lib/supabase/types.ts` — tabla expense_policies + columnas nuevas + exports
- `src/actions/approvals.ts` — añadir getOrGenerateApprovalAnalysis + bulkApproveItems
- `src/actions/expenses.ts` — addExpenseItem guarda policy_violations/justification; invalidar ai_analysis en add/delete
- `src/components/expenses/ExpenseItemForm.tsx` — state de policy check, debounce, banners, campo justificación
- `src/app/(app)/admin/settings/page.tsx` — tab "Políticas" + componente PoliciesTab
- `src/app/(app)/approvals/[id]/page.tsx` — cargar getOrGenerateApprovalAnalysis en paralelo
- `src/app/(app)/approvals/[id]/client.tsx` — tarjeta IA + reordenamiento de ítems + bulk approve

---

## Task 1: Migración SQL + Types TypeScript

**Files:**
- Create: `supabase/migrations/011_expense_policies_and_ai_analysis.sql`
- Modify: `src/lib/supabase/types.ts`

**Interfaces:**
- Produces: `ExpensePolicy` type, columnas `policy_violations: Json | null`, `policy_justification: string | null` en `ExpenseItem`, columnas `ai_analysis: Json | null`, `ai_analysis_at: string | null` en `ExpenseReport`

- [ ] **Step 1: Crear archivo de migración**

```sql
-- supabase/migrations/011_expense_policies_and_ai_analysis.sql

-- 1. Tabla expense_policies
CREATE TABLE public.expense_policies (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id                uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name                  text NOT NULL,
  category_id           uuid REFERENCES expense_categories(id),
  department            text,
  target_user_id        uuid REFERENCES users(id),
  item_limit            numeric,
  item_enforcement      text CHECK (item_enforcement IN ('warn','require_justification','block')),
  monthly_limit         numeric,
  monthly_enforcement   text CHECK (monthly_enforcement IN ('warn','require_justification','block')),
  quarterly_limit       numeric,
  quarterly_enforcement text CHECK (quarterly_enforcement IN ('warn','require_justification','block')),
  annual_limit          numeric,
  annual_enforcement    text CHECK (annual_enforcement IN ('warn','require_justification','block')),
  is_active             boolean NOT NULL DEFAULT true,
  created_at            timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.expense_policies ENABLE ROW LEVEL SECURITY;

CREATE POLICY "admins_manage_policies" ON public.expense_policies
  FOR ALL
  USING (is_admin() AND org_id = get_my_org_id())
  WITH CHECK (is_admin() AND org_id = get_my_org_id());

CREATE POLICY "employees_read_org_policies" ON public.expense_policies
  FOR SELECT
  USING (org_id = get_my_org_id());

CREATE INDEX idx_expense_policies_org      ON public.expense_policies(org_id, is_active);
CREATE INDEX idx_expense_policies_category ON public.expense_policies(category_id);

-- 2. Nuevas columnas en expense_items
ALTER TABLE public.expense_items
  ADD COLUMN IF NOT EXISTS policy_justification text,
  ADD COLUMN IF NOT EXISTS policy_violations     jsonb;

-- 3. Nuevas columnas en expense_reports
ALTER TABLE public.expense_reports
  ADD COLUMN IF NOT EXISTS ai_analysis    jsonb,
  ADD COLUMN IF NOT EXISTS ai_analysis_at timestamptz;
```

- [ ] **Step 2: Aplicar la migración en Supabase Dashboard**

Ir a: https://app.supabase.com → proyecto `jqtbtgduqzxkgubmzukg` → SQL Editor → pegar y ejecutar el contenido del archivo.

Verificar que no hay errores y que la tabla `expense_policies` aparece en Table Editor.

- [ ] **Step 3: Actualizar `src/lib/supabase/types.ts` — agregar tabla expense_policies**

Después de la tabla `defontana_suppliers` (línea ~712), insertar el bloque completo:

```typescript
      expense_policies: {
        Row: {
          id:                    string
          org_id:                string
          name:                  string
          category_id:           string | null
          department:            string | null
          target_user_id:        string | null
          item_limit:            number | null
          item_enforcement:      'warn' | 'require_justification' | 'block' | null
          monthly_limit:         number | null
          monthly_enforcement:   'warn' | 'require_justification' | 'block' | null
          quarterly_limit:       number | null
          quarterly_enforcement: 'warn' | 'require_justification' | 'block' | null
          annual_limit:          number | null
          annual_enforcement:    'warn' | 'require_justification' | 'block' | null
          is_active:             boolean
          created_at:            string
        }
        Insert: {
          id?:                    string
          org_id:                 string
          name:                   string
          category_id?:           string | null
          department?:            string | null
          target_user_id?:        string | null
          item_limit?:            number | null
          item_enforcement?:      'warn' | 'require_justification' | 'block' | null
          monthly_limit?:         number | null
          monthly_enforcement?:   'warn' | 'require_justification' | 'block' | null
          quarterly_limit?:       number | null
          quarterly_enforcement?: 'warn' | 'require_justification' | 'block' | null
          annual_limit?:          number | null
          annual_enforcement?:    'warn' | 'require_justification' | 'block' | null
          is_active?:             boolean
          created_at?:            string
        }
        Update: {
          name?:                  string
          category_id?:           string | null
          department?:            string | null
          target_user_id?:        string | null
          item_limit?:            number | null
          item_enforcement?:      'warn' | 'require_justification' | 'block' | null
          monthly_limit?:         number | null
          monthly_enforcement?:   'warn' | 'require_justification' | 'block' | null
          quarterly_limit?:       number | null
          quarterly_enforcement?: 'warn' | 'require_justification' | 'block' | null
          annual_limit?:          number | null
          annual_enforcement?:    'warn' | 'require_justification' | 'block' | null
          is_active?:             boolean
        }
        Relationships: []
      }
```

- [ ] **Step 4: Agregar columnas a `expense_items` en types.ts**

En `expense_items.Row`, después de `ocr_confidence: number | null`, agregar:
```typescript
          policy_justification: string | null
          policy_violations:    Json | null
```

En `expense_items.Insert`, después de `ocr_confidence?: number | null`:
```typescript
          policy_justification?: string | null
          policy_violations?:    Json | null
```

En `expense_items.Update`, después de `ocr_confidence?: number | null`:
```typescript
          policy_justification?: string | null
          policy_violations?:    Json | null
```

- [ ] **Step 5: Agregar columnas a `expense_reports` en types.ts**

En `expense_reports.Row`, después de `deleted_at: string | null`:
```typescript
          ai_analysis:    Json | null
          ai_analysis_at: string | null
```

En `expense_reports.Insert`, después de `deleted_at?: string | null`:
```typescript
          ai_analysis?:    Json | null
          ai_analysis_at?: string | null
```

En `expense_reports.Update`, después de `deleted_at?: string | null`:
```typescript
          ai_analysis?:    Json | null
          ai_analysis_at?: string | null
```

- [ ] **Step 6: Agregar export al final de types.ts**

Al final del archivo, después de `export type FundTransfer`:
```typescript
export type ExpensePolicy = Database['public']['Tables']['expense_policies']['Row']
```

- [ ] **Step 7: Verificar tipos con TypeScript**

```powershell
npx tsc --noEmit
```

Esperado: sin errores. Si hay errores de tipo, revisar que todos los campos nuevos tienen los tipos correctos y que `Relationships: []` está presente en `expense_policies`.

- [ ] **Step 8: Commit**

```powershell
git add supabase/migrations/011_expense_policies_and_ai_analysis.sql src/lib/supabase/types.ts
git commit -m "feat: migration 011 + types for expense_policies and AI analysis columns"
```

---

## Task 2: Policy Helpers + Tests

**Files:**
- Create: `src/lib/policy-helpers.ts`
- Create: `src/tests/policy-helpers.test.ts`

**Interfaces:**
- Produces: `Enforcement` · `PolicyViolation` · `resolveApplicablePolicy(policies, employeeId, department, categoryId)` · `checkItemLimit(policy, amount)` · `checkPeriodLimit(policy, accumulated, amount, dimension)` · `formatViolationMessage(v)`
- Consumes: `ExpensePolicy` from `@/lib/supabase/types` · `formatCLP` from `@/lib/utils`

- [ ] **Step 1: Escribir test primero**

```typescript
// src/tests/policy-helpers.test.ts
import { describe, it, expect } from 'vitest'
import {
  resolveApplicablePolicy,
  checkItemLimit,
  checkPeriodLimit,
  formatViolationMessage,
} from '@/lib/policy-helpers'
import type { ExpensePolicy } from '@/lib/supabase/types'

function makePolicy(overrides: Partial<ExpensePolicy> = {}): ExpensePolicy {
  return {
    id: 'p1',
    org_id: 'org1',
    name: 'Política base',
    category_id: null,
    department: null,
    target_user_id: null,
    item_limit: null,
    item_enforcement: null,
    monthly_limit: null,
    monthly_enforcement: null,
    quarterly_limit: null,
    quarterly_enforcement: null,
    annual_limit: null,
    annual_enforcement: null,
    is_active: true,
    created_at: '2026-01-01T00:00:00Z',
    ...overrides,
  }
}

describe('resolveApplicablePolicy', () => {
  it('returns null when no policies', () => {
    expect(resolveApplicablePolicy([], 'u1', null, null)).toBeNull()
  })

  it('returns null when no active policies', () => {
    const p = makePolicy({ is_active: false })
    expect(resolveApplicablePolicy([p], 'u1', null, null)).toBeNull()
  })

  it('returns catch-all policy when nothing else matches', () => {
    const p = makePolicy({ name: 'Global' })
    expect(resolveApplicablePolicy([p], 'u1', null, null)?.name).toBe('Global')
  })

  it('user-specific beats department', () => {
    const dept = makePolicy({ name: 'Dept', department: 'IT' })
    const user = makePolicy({ name: 'User', target_user_id: 'u1' })
    expect(resolveApplicablePolicy([dept, user], 'u1', 'IT', null)?.name).toBe('User')
  })

  it('department beats category global', () => {
    const cat = makePolicy({ name: 'Cat', category_id: 'c1' })
    const dept = makePolicy({ name: 'Dept', department: 'IT' })
    expect(resolveApplicablePolicy([cat, dept], 'u1', 'IT', 'c1')?.name).toBe('Dept')
  })

  it('category-global beats catch-all', () => {
    const all = makePolicy({ name: 'All' })
    const cat = makePolicy({ name: 'Cat', category_id: 'c1' })
    expect(resolveApplicablePolicy([all, cat], 'u1', null, 'c1')?.name).toBe('Cat')
  })

  it('picks lowest item_limit when tied', () => {
    const p1 = makePolicy({ name: 'High', item_limit: 100000 })
    const p2 = makePolicy({ name: 'Low',  item_limit: 30000  })
    const result = resolveApplicablePolicy([p1, p2], 'u1', null, null)
    expect(result?.name).toBe('Low')
  })
})

describe('checkItemLimit', () => {
  it('returns null when no item_limit', () => {
    const p = makePolicy({ item_limit: null, item_enforcement: null })
    expect(checkItemLimit(p, 50000)).toBeNull()
  })

  it('returns null when amount below limit', () => {
    const p = makePolicy({ item_limit: 50000, item_enforcement: 'warn' })
    expect(checkItemLimit(p, 49999)).toBeNull()
  })

  it('returns null when amount equals limit', () => {
    const p = makePolicy({ item_limit: 50000, item_enforcement: 'warn' })
    expect(checkItemLimit(p, 50000)).toBeNull()
  })

  it('returns violation when amount exceeds limit', () => {
    const p = makePolicy({ id: 'p1', name: 'Test', item_limit: 50000, item_enforcement: 'block' })
    const v = checkItemLimit(p, 60000)
    expect(v).not.toBeNull()
    expect(v?.dimension).toBe('item')
    expect(v?.enforcement).toBe('block')
    expect(v?.limit).toBe(50000)
    expect(v?.actual).toBe(60000)
    expect(v?.policyId).toBe('p1')
  })
})

describe('checkPeriodLimit', () => {
  it('returns null when no monthly_limit', () => {
    const p = makePolicy({ monthly_limit: null })
    expect(checkPeriodLimit(p, 0, 50000, 'monthly')).toBeNull()
  })

  it('returns null when accumulated + amount <= limit', () => {
    const p = makePolicy({ monthly_limit: 100000, monthly_enforcement: 'warn' })
    expect(checkPeriodLimit(p, 50000, 50000, 'monthly')).toBeNull()
  })

  it('returns violation when accumulated + amount exceeds limit', () => {
    const p = makePolicy({ monthly_limit: 100000, monthly_enforcement: 'require_justification' })
    const v = checkPeriodLimit(p, 80000, 30000, 'monthly')
    expect(v).not.toBeNull()
    expect(v?.dimension).toBe('monthly')
    expect(v?.limit).toBe(100000)
    expect(v?.actual).toBe(110000)
    expect(v?.accumulated).toBe(80000)
    expect(v?.enforcement).toBe('require_justification')
  })

  it('checks quarterly dimension', () => {
    const p = makePolicy({ quarterly_limit: 200000, quarterly_enforcement: 'block' })
    const v = checkPeriodLimit(p, 180000, 30000, 'quarterly')
    expect(v?.dimension).toBe('quarterly')
  })

  it('checks annual dimension', () => {
    const p = makePolicy({ annual_limit: 1000000, annual_enforcement: 'warn' })
    const v = checkPeriodLimit(p, 990000, 20000, 'annual')
    expect(v?.dimension).toBe('annual')
  })
})

describe('formatViolationMessage', () => {
  it('formats item violation', () => {
    const v = {
      policyId: 'p1', policyName: 'Test', dimension: 'item' as const,
      limit: 50000, actual: 60000, enforcement: 'block' as const,
    }
    const msg = formatViolationMessage(v)
    expect(msg).toContain('límite por ítem')
    expect(msg).toContain('50.000')
  })

  it('formats monthly violation with accumulated', () => {
    const v = {
      policyId: 'p1', policyName: 'Test', dimension: 'monthly' as const,
      limit: 100000, actual: 110000, accumulated: 80000, enforcement: 'warn' as const,
    }
    const msg = formatViolationMessage(v)
    expect(msg).toContain('mensual')
    expect(msg).toContain('80.000')
  })
})
```

- [ ] **Step 2: Verificar que los tests fallan**

```powershell
npx vitest run src/tests/policy-helpers.test.ts
```

Esperado: FAIL con "Cannot find module '@/lib/policy-helpers'"

- [ ] **Step 3: Implementar `src/lib/policy-helpers.ts`**

```typescript
import { formatCLP } from '@/lib/utils'
import type { ExpensePolicy } from '@/lib/supabase/types'

export type Enforcement = 'warn' | 'require_justification' | 'block'

export interface PolicyViolation {
  policyId:    string
  policyName:  string
  dimension:   'item' | 'monthly' | 'quarterly' | 'annual'
  limit:       number
  actual:      number
  accumulated?: number
  enforcement: Enforcement
}

export function resolveApplicablePolicy(
  policies: ExpensePolicy[],
  employeeId: string,
  department: string | null,
  categoryId: string | null,
): ExpensePolicy | null {
  const active = policies.filter(p => p.is_active)

  // Nivel 1: override individual por empleado
  const userPolicies = active.filter(p =>
    p.target_user_id === employeeId &&
    (p.category_id === null || p.category_id === categoryId)
  )
  if (userPolicies.length > 0) return pickLowest(userPolicies)

  // Nivel 2: override por departamento
  if (department) {
    const deptPolicies = active.filter(p =>
      p.target_user_id === null &&
      p.department === department &&
      (p.category_id === null || p.category_id === categoryId)
    )
    if (deptPolicies.length > 0) return pickLowest(deptPolicies)
  }

  // Nivel 3: global por categoría
  if (categoryId) {
    const catPolicies = active.filter(p =>
      p.target_user_id === null &&
      p.department === null &&
      p.category_id === categoryId
    )
    if (catPolicies.length > 0) return pickLowest(catPolicies)
  }

  // Nivel 4: catch-all (sin restricción de categoría, dept ni empleado)
  const catchAll = active.filter(p =>
    p.target_user_id === null &&
    p.department === null &&
    p.category_id === null
  )
  if (catchAll.length > 0) return pickLowest(catchAll)

  return null
}

// En el mismo nivel de especificidad, gana la política con el item_limit más bajo.
function pickLowest(policies: ExpensePolicy[]): ExpensePolicy {
  return policies.reduce((best, p) => {
    const bestVal = best.item_limit ?? Infinity
    const pVal    = p.item_limit    ?? Infinity
    return pVal < bestVal ? p : best
  })
}

export function checkItemLimit(policy: ExpensePolicy, amount: number): PolicyViolation | null {
  if (policy.item_limit == null || policy.item_enforcement == null) return null
  if (amount <= policy.item_limit) return null
  return {
    policyId:   policy.id,
    policyName: policy.name,
    dimension:  'item',
    limit:      policy.item_limit,
    actual:     amount,
    enforcement: policy.item_enforcement as Enforcement,
  }
}

export function checkPeriodLimit(
  policy: ExpensePolicy,
  accumulated: number,
  amount: number,
  dimension: 'monthly' | 'quarterly' | 'annual',
): PolicyViolation | null {
  const limit       = policy[`${dimension}_limit`]       as number | null
  const enforcement = policy[`${dimension}_enforcement`] as Enforcement | null
  if (limit == null || enforcement == null) return null
  const total = accumulated + amount
  if (total <= limit) return null
  return {
    policyId:    policy.id,
    policyName:  policy.name,
    dimension,
    limit,
    actual:      total,
    accumulated,
    enforcement,
  }
}

export function formatViolationMessage(v: PolicyViolation): string {
  if (v.dimension === 'item') {
    return `El monto supera el límite por ítem (${formatCLP(v.limit)}). Monto ingresado: ${formatCLP(v.actual)}.`
  }
  const label =
    v.dimension === 'monthly'   ? 'mensual' :
    v.dimension === 'quarterly' ? 'trimestral' : 'anual'
  return `Supera el límite ${label} (${formatCLP(v.limit)}). Llevas ${formatCLP(v.accumulated ?? 0)} + este ítem (${formatCLP(v.actual)} total).`
}
```

- [ ] **Step 4: Verificar que los tests pasan**

```powershell
npx vitest run src/tests/policy-helpers.test.ts
```

Esperado: 17 tests pasando, 0 fallos.

- [ ] **Step 5: Commit**

```powershell
git add src/lib/policy-helpers.ts src/tests/policy-helpers.test.ts
git commit -m "feat: policy-helpers pure functions + 17 tests"
```

---

## Task 3: Approval Analysis Helpers + Tests

**Files:**
- Create: `src/lib/approval-analysis-helpers.ts`
- Create: `src/tests/approval-analysis-helpers.test.ts`

**Interfaces:**
- Produces: `AiAnalysis` · `AttentionItem` · `HistoricalItem` · `ReportForAnalysis` · `buildAnalysisPrompt(report, history)` · `parseAnalysisResponse(raw)`
- Consumes: nothing external (helpers puros, sin imports de Supabase)

- [ ] **Step 1: Escribir test primero**

```typescript
// src/tests/approval-analysis-helpers.test.ts
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
```

- [ ] **Step 2: Verificar que los tests fallan**

```powershell
npx vitest run src/tests/approval-analysis-helpers.test.ts
```

Esperado: FAIL con "Cannot find module '@/lib/approval-analysis-helpers'"

- [ ] **Step 3: Implementar `src/lib/approval-analysis-helpers.ts`**

```typescript
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
```

- [ ] **Step 4: Verificar que los tests pasan**

```powershell
npx vitest run src/tests/approval-analysis-helpers.test.ts
```

Esperado: 10 tests pasando, 0 fallos.

- [ ] **Step 5: Verificar tipos completos**

```powershell
npx tsc --noEmit
```

Esperado: sin errores.

- [ ] **Step 6: Commit**

```powershell
git add src/lib/approval-analysis-helpers.ts src/tests/approval-analysis-helpers.test.ts
git commit -m "feat: approval-analysis-helpers pure functions + 10 tests"
```

---

## Task 4: Server Action — `src/actions/policies.ts`

**Files:**
- Create: `src/actions/policies.ts`

**Interfaces:**
- Consumes: `resolveApplicablePolicy`, `checkItemLimit`, `checkPeriodLimit` from `@/lib/policy-helpers` · `ExpensePolicy` from `@/lib/supabase/types`
- Produces: `getOrgPolicies()` · `PolicyInput` · `createPolicy()` · `updatePolicy()` · `togglePolicyActive()` · `deletePolicy()` · `PolicyCheckResult` · `checkPolicyViolations()`

- [ ] **Step 1: Crear `src/actions/policies.ts`**

```typescript
'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { resolveApplicablePolicy, checkItemLimit, checkPeriodLimit } from '@/lib/policy-helpers'
import type { PolicyViolation } from '@/lib/policy-helpers'
import type { ExpensePolicy } from '@/lib/supabase/types'

async function requireAdmin() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')
  const { data: profile } = await supabase
    .from('users').select('org_id, role').eq('id', user.id).single()
  if (!profile || profile.role !== 'admin') throw new Error('Solo los administradores pueden gestionar políticas')
  return { supabase, user, org_id: profile.org_id }
}

export async function getOrgPolicies(): Promise<ExpensePolicy[]> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')
  const { data: profile } = await supabase
    .from('users').select('org_id').eq('id', user.id).single()
  if (!profile) return []
  const { data } = await supabase
    .from('expense_policies')
    .select('*')
    .eq('org_id', profile.org_id)
    .order('created_at', { ascending: true })
  return (data ?? []) as ExpensePolicy[]
}

export interface PolicyInput {
  name:                  string
  category_id?:          string | null
  department?:           string | null
  target_user_id?:       string | null
  item_limit?:           number | null
  item_enforcement?:     'warn' | 'require_justification' | 'block' | null
  monthly_limit?:        number | null
  monthly_enforcement?:  'warn' | 'require_justification' | 'block' | null
  quarterly_limit?:      number | null
  quarterly_enforcement?:'warn' | 'require_justification' | 'block' | null
  annual_limit?:         number | null
  annual_enforcement?:   'warn' | 'require_justification' | 'block' | null
}

export async function createPolicy(data: PolicyInput): Promise<void> {
  const { supabase, org_id } = await requireAdmin()
  const { error } = await supabase.from('expense_policies').insert({ org_id, ...data })
  if (error) throw new Error(error.message)
  revalidatePath('/admin/settings')
}

export async function updatePolicy(id: string, data: Partial<PolicyInput>): Promise<void> {
  const { supabase } = await requireAdmin()
  const { error } = await supabase.from('expense_policies').update(data).eq('id', id)
  if (error) throw new Error(error.message)
  revalidatePath('/admin/settings')
}

export async function togglePolicyActive(id: string, active: boolean): Promise<void> {
  const { supabase } = await requireAdmin()
  const { error } = await supabase.from('expense_policies').update({ is_active: active }).eq('id', id)
  if (error) throw new Error(error.message)
  revalidatePath('/admin/settings')
}

export async function deletePolicy(id: string): Promise<void> {
  const { supabase } = await requireAdmin()
  const { error } = await supabase.from('expense_policies').delete().eq('id', id)
  if (error) throw new Error(error.message)
  revalidatePath('/admin/settings')
}

export interface PolicyCheckResult {
  violations:                PolicyViolation[]
  hasBlock:                  boolean
  hasJustificationRequired:  boolean
}

export async function checkPolicyViolations(params: {
  categoryId: string | null
  amount:     number
  date:       string
}): Promise<PolicyCheckResult> {
  const { categoryId, amount, date } = params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { violations: [], hasBlock: false, hasJustificationRequired: false }

  const { data: profile } = await supabase
    .from('users').select('org_id, department').eq('id', user.id).single()
  if (!profile) return { violations: [], hasBlock: false, hasJustificationRequired: false }

  const { data: policiesData } = await supabase
    .from('expense_policies')
    .select('*')
    .eq('org_id', profile.org_id)
    .eq('is_active', true)

  const policies = (policiesData ?? []) as ExpensePolicy[]
  const policy = resolveApplicablePolicy(policies, user.id, profile.department, categoryId)
  if (!policy) return { violations: [], hasBlock: false, hasJustificationRequired: false }

  const violations: PolicyViolation[] = []

  // Límite por ítem
  const itemV = checkItemLimit(policy, amount)
  if (itemV) violations.push(itemV)

  // Rangos de período
  const d = new Date(date)
  const year    = d.getFullYear()
  const month   = d.getMonth() + 1  // 1-12
  const quarter = Math.ceil(month / 3)
  const qStartM = (quarter - 1) * 3 + 1
  const qEndM   = quarter * 3

  const monthStart   = `${year}-${String(month).padStart(2, '0')}-01`
  const monthEnd     = new Date(year, month, 0).toISOString().split('T')[0]
  const quarterStart = `${year}-${String(qStartM).padStart(2, '0')}-01`
  const quarterEnd   = new Date(year, qEndM, 0).toISOString().split('T')[0]
  const annualStart  = `${year}-01-01`
  const annualEnd    = `${year}-12-31`

  // Obtener rendiciones activas del empleado para calcular acumulados
  const { data: empReports } = await supabase
    .from('expense_reports')
    .select('id')
    .eq('submitter_id', user.id)
    .in('status', ['submitted', 'pending_l2', 'approved', 'partially_approved', 'reimbursed'])

  const rids = (empReports ?? []).map((r: { id: string }) => r.id)

  let monthlyAcc = 0, quarterlyAcc = 0, annualAcc = 0

  if (rids.length > 0) {
    let q = supabase
      .from('expense_items')
      .select('amount_clp, date')
      .in('report_id', rids)
      .neq('status', 'rejected')
      .gte('date', annualStart)
      .lte('date', annualEnd)

    if (categoryId) q = q.eq('category_id', categoryId)

    const { data: periodItems } = await q
    const items = (periodItems ?? []) as { amount_clp: number; date: string }[]

    monthlyAcc   = items.filter(i => i.date >= monthStart   && i.date <= monthEnd).reduce((s, i) => s + i.amount_clp, 0)
    quarterlyAcc = items.filter(i => i.date >= quarterStart && i.date <= quarterEnd).reduce((s, i) => s + i.amount_clp, 0)
    annualAcc    = items.reduce((s, i) => s + i.amount_clp, 0)
  }

  const monthV = checkPeriodLimit(policy, monthlyAcc, amount, 'monthly')
  if (monthV) violations.push(monthV)
  const quarterV = checkPeriodLimit(policy, quarterlyAcc, amount, 'quarterly')
  if (quarterV) violations.push(quarterV)
  const annualV = checkPeriodLimit(policy, annualAcc, amount, 'annual')
  if (annualV) violations.push(annualV)

  return {
    violations,
    hasBlock:                  violations.some(v => v.enforcement === 'block'),
    hasJustificationRequired:  violations.some(v => v.enforcement === 'require_justification'),
  }
}
```

- [ ] **Step 2: Verificar tipos**

```powershell
npx tsc --noEmit
```

Esperado: sin errores.

- [ ] **Step 3: Commit**

```powershell
git add src/actions/policies.ts
git commit -m "feat: policies server actions — CRUD + checkPolicyViolations"
```

---

## Task 5: Extender `approvals.ts` + `expenses.ts`

**Files:**
- Modify: `src/actions/approvals.ts`
- Modify: `src/actions/expenses.ts`

**Interfaces:**
- Consumes: `buildAnalysisPrompt`, `parseAnalysisResponse`, `AiAnalysis`, `ReportForAnalysis`, `HistoricalItem` from `@/lib/approval-analysis-helpers` · `computeReportStatus`, `computeApprovedAmount` from `@/lib/approval-helpers`
- Produces: `getOrGenerateApprovalAnalysis(reportId)` · `bulkApproveItems(reportId, itemIds)`

- [ ] **Step 1: Añadir imports en `approvals.ts`**

Al inicio de `src/actions/approvals.ts`, agregar:
```typescript
import Anthropic from '@anthropic-ai/sdk'
import { buildAnalysisPrompt, parseAnalysisResponse } from '@/lib/approval-analysis-helpers'
import type { AiAnalysis, ReportForAnalysis, HistoricalItem } from '@/lib/approval-analysis-helpers'
import type { Json } from '@/lib/supabase/types'
```

- [ ] **Step 2: Añadir `getOrGenerateApprovalAnalysis` al final de `approvals.ts`** (antes del último cierre del archivo)

```typescript
export async function getOrGenerateApprovalAnalysis(reportId: string): Promise<AiAnalysis | null> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null

  const { data: report } = await supabase
    .from('expense_reports')
    .select('id, title, total_amount, submitter_id, ai_analysis, ai_analysis_at, updated_at')
    .eq('id', reportId)
    .single()
  if (!report) return null

  // Usar análisis cacheado si está actualizado
  if (report.ai_analysis && report.ai_analysis_at) {
    const analysisAt = new Date(report.ai_analysis_at as string).getTime()
    const updatedAt  = new Date(report.updated_at as string).getTime()
    if (analysisAt > updatedAt) {
      return report.ai_analysis as AiAnalysis
    }
  }

  // Cargar ítems actuales
  const { data: itemsRaw } = await supabase
    .from('expense_items')
    .select(`id, description, amount_clp, merchant, doc_type, doc_number, policy_violations, expense_categories (name)`)
    .eq('report_id', reportId)
    .order('created_at', { ascending: true })

  const submitterData = await supabase
    .from('users').select('full_name').eq('id', report.submitter_id as string).single()

  // Historial de 6 meses
  const sixMonthsAgo = new Date()
  sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6)

  const { data: histReports } = await supabase
    .from('expense_reports')
    .select('id')
    .eq('submitter_id', report.submitter_id as string)
    .neq('id', reportId)
    .gte('created_at', sixMonthsAgo.toISOString())

  const histRids = (histReports ?? []).map((r: { id: string }) => r.id)
  let historyItems: HistoricalItem[] = []

  if (histRids.length > 0) {
    const { data: histItemsRaw } = await supabase
      .from('expense_items')
      .select(`description, amount_clp, merchant, status, rejection_reason, expense_categories (name)`)
      .in('report_id', histRids)

    historyItems = (histItemsRaw ?? []).map(h => {
      const raw = h as unknown as {
        description: string; amount_clp: number; merchant: string | null; status: string
        rejection_reason: string | null; expense_categories: { name: string } | null
      }
      return {
        description:      raw.description,
        amount_clp:       raw.amount_clp,
        merchant:         raw.merchant,
        category_name:    raw.expense_categories?.name ?? null,
        status:           raw.status,
        rejection_reason: raw.rejection_reason,
      }
    })
  }

  const reportForAnalysis: ReportForAnalysis = {
    id:             reportId,
    title:          report.title as string,
    submitter_name: submitterData.data?.full_name ?? 'Empleado',
    expense_items:  (itemsRaw ?? []).map(i => {
      const raw = i as unknown as {
        id: string; description: string; amount_clp: number; merchant: string | null
        doc_type: string | null; doc_number: string | null; policy_violations: unknown
        expense_categories: { name: string } | null
      }
      return {
        id:                raw.id,
        description:       raw.description,
        amount_clp:        raw.amount_clp,
        category_name:     raw.expense_categories?.name ?? null,
        merchant:          raw.merchant,
        doc_type:          raw.doc_type,
        doc_number:        raw.doc_number,
        policy_violations: raw.policy_violations,
      }
    }),
  }

  const prompt = buildAnalysisPrompt(reportForAnalysis, historyItems)
  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! })

  const response = await anthropic.messages.create({
    model:      'claude-sonnet-4-6',
    max_tokens: 1024,
    messages:   [{ role: 'user', content: prompt }],
  })

  const rawText = response.content[0].type === 'text' ? response.content[0].text : ''
  const analysis = parseAnalysisResponse(rawText)

  await supabase
    .from('expense_reports')
    .update({
      ai_analysis:    analysis as unknown as Json,
      ai_analysis_at: new Date().toISOString(),
    })
    .eq('id', reportId)

  return analysis
}
```

- [ ] **Step 3: Añadir `bulkApproveItems` al final de `approvals.ts`**

```typescript
export async function bulkApproveItems(reportId: string, itemIds: string[]): Promise<void> {
  if (itemIds.length === 0) return
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('users').select('org_id, can_approve, role').eq('id', user.id).single()
  if (!profile || (!profile.can_approve && profile.role !== 'admin')) {
    throw new Error('Sin permiso para aprobar rendiciones')
  }

  const { data: report } = await supabase
    .from('expense_reports')
    .select('status, submitter_id, org_id')
    .eq('id', reportId)
    .single()
  if (!report || report.org_id !== profile.org_id) throw new Error('Rendición no encontrada')

  // Aprobar ítems indicados
  await supabase
    .from('expense_items')
    .update({ status: 'approved' })
    .in('id', itemIds)

  // Leer todos los ítems para calcular estado global
  const { data: allItems } = await supabase
    .from('expense_items').select('id, status, amount_clp').eq('report_id', reportId)
  const items = allItems ?? []

  const allApproved  = items.every(i => i.status === 'approved')
  const approvedAmt  = computeApprovedAmount(items)

  if (!allApproved) {
    // Quedan ítems pendientes (attention items) — actualizar monto aprobado parcial
    await supabase
      .from('expense_reports')
      .update({ approved_amount: approvedAmt })
      .eq('id', reportId)
  } else {
    // Todos aprobados — verificar cadena L2
    const { data: submitter } = await supabase
      .from('users').select('approver_l2_id').eq('id', report.submitter_id as string).single()
    const isL1 = report.status === 'submitted'
    const hasL2 = !!submitter?.approver_l2_id

    let newStatus: string
    if (isL1 && hasL2) {
      newStatus = 'pending_l2'
      await supabase
        .from('expense_items')
        .update({ status: 'pending', rejection_reason: null })
        .eq('report_id', reportId)
    } else {
      newStatus = 'approved'
    }

    await supabase
      .from('expense_reports')
      .update({
        status:          newStatus,
        approved_amount: approvedAmt,
        approved_at:     newStatus === 'approved' ? new Date().toISOString() : null,
      })
      .eq('id', reportId)

    await supabase.from('expense_report_approvals').insert({
      report_id:      reportId,
      approver_id:    user.id,
      level:          isL1 ? 1 : 2,
      action:         'approved',
      items_approved: itemIds,
      notes:          'Aprobación masiva de ítems rutinarios (análisis IA)',
    })
  }

  revalidatePath(`/approvals/${reportId}`)
  revalidatePath('/approvals')
  revalidatePath('/')
}
```

- [ ] **Step 4: Modificar `addExpenseItem` en `expenses.ts` — guardar policy_violations y invalidar ai_analysis**

En `addExpenseItem`, actualizar el tipo del parámetro `item` para incluir los campos nuevos. Después de `ocr_confidence?:` en la declaración del parámetro:
```typescript
    policy_justification?: string | null
    policy_violations?:    Json | null
```

En el bloque `.insert({...})`, después de `ocr_confidence:`:
```typescript
      policy_justification: item.policy_justification ?? null,
      policy_violations:    item.policy_violations    ?? null,
```

Después del `revalidatePath` al final de `addExpenseItem`, agregar:
```typescript
  // Invalidar análisis IA cacheado — el reporte cambió
  await supabase
    .from('expense_reports')
    .update({ ai_analysis: null, ai_analysis_at: null })
    .eq('id', reportId)
```

- [ ] **Step 5: Modificar `deleteExpenseItem` en `expenses.ts` — invalidar ai_analysis**

Después del bloque que actualiza `total_amount` y antes del `revalidatePath`:
```typescript
  // Invalidar análisis IA cacheado
  await supabase
    .from('expense_reports')
    .update({ ai_analysis: null, ai_analysis_at: null })
    .eq('id', reportId)
```

- [ ] **Step 6: Verificar tipos**

```powershell
npx tsc --noEmit
```

Esperado: sin errores.

- [ ] **Step 7: Commit**

```powershell
git add src/actions/approvals.ts src/actions/expenses.ts
git commit -m "feat: getOrGenerateApprovalAnalysis + bulkApproveItems + policy fields in addExpenseItem"
```

---

## Task 6: Settings Tab "Políticas de Gastos"

**Files:**
- Modify: `src/app/(app)/admin/settings/page.tsx`

**Interfaces:**
- Consumes: `getOrgPolicies`, `createPolicy`, `updatePolicy`, `togglePolicyActive`, `deletePolicy`, `PolicyInput` from `@/actions/policies` · `getOrgCategories` from `@/actions/admin` · `ExpensePolicy`, `ExpenseCategory` from `@/lib/supabase/types`

- [ ] **Step 1: Agregar import de actions de políticas en settings/page.tsx**

En la sección de imports (junto a los imports de admin), agregar:
```typescript
import {
  getOrgPolicies,
  createPolicy,
  updatePolicy,
  togglePolicyActive,
  deletePolicy,
} from '@/actions/policies'
import type { ExpensePolicy } from '@/lib/supabase/types'
```

- [ ] **Step 2: Agregar 'policies' al type Tab**

Cambiar la línea:
```typescript
type Tab = 'categories' | 'employees' | 'chains' | 'limits' | 'defontana'
```
por:
```typescript
type Tab = 'categories' | 'employees' | 'chains' | 'limits' | 'defontana' | 'policies'
```

- [ ] **Step 3: Agregar el tab button en el selector de tabs**

En el array de tabs (donde están `{ id: 'defontana', label: 'Defontana' }`), agregar al final:
```typescript
{ id: 'policies', label: 'Políticas' },
```

- [ ] **Step 4: Agregar render del tab en la sección de contenido**

Después de la línea `{activeTab === 'defontana' && <DefontanaTab />}`, agregar:
```typescript
      {activeTab === 'policies' && <PoliciesTab />}
```

- [ ] **Step 5: Implementar el componente PoliciesTab**

Agregar al final del archivo (después del componente `DefontanaTab` o `Spinner`):

```typescript
/* ── Helpers locales de Políticas ─────────────────────────────────────── */
const ENFORCEMENT_OPTS = [
  { value: '',                     label: 'Sin límite' },
  { value: 'warn',                 label: 'Advertencia (sin bloqueo)' },
  { value: 'require_justification',label: 'Requerir justificación' },
  { value: 'block',                label: 'Bloquear ítem' },
] as const

type EnforcementValue = '' | 'warn' | 'require_justification' | 'block'

function enforcementBadge(e: string | null) {
  if (!e) return null
  const label =
    e === 'warn'                  ? 'Aviso' :
    e === 'require_justification' ? 'Justif.' : 'Bloqueo'
  const cls =
    e === 'warn'                  ? 'bg-amber-100 text-amber-700' :
    e === 'require_justification' ? 'bg-orange-100 text-orange-700' :
                                    'bg-rose-100 text-rose-600'
  return <span className={`text-xs px-1.5 py-0.5 rounded-full font-medium ${cls}`}>{label}</span>
}

interface PolicyFormState {
  name:                  string
  category_id:           string
  scope:                 'org' | 'dept' | 'user'
  department:            string
  target_user_id:        string
  item_limit:            string
  item_enforcement:      EnforcementValue
  monthly_limit:         string
  monthly_enforcement:   EnforcementValue
  quarterly_limit:       string
  quarterly_enforcement: EnforcementValue
  annual_limit:          string
  annual_enforcement:    EnforcementValue
}

const emptyPolicyForm = (): PolicyFormState => ({
  name: '', category_id: '', scope: 'org', department: '',
  target_user_id: '', item_limit: '', item_enforcement: '',
  monthly_limit: '', monthly_enforcement: '',
  quarterly_limit: '', quarterly_enforcement: '',
  annual_limit: '', annual_enforcement: '',
})

function parseLimitNum(s: string): number | null {
  const n = parseInt(s.replace(/\./g, ''), 10)
  return isNaN(n) || n <= 0 ? null : n
}

/* ── Tab: Políticas de Gastos ──────────────────────────────────────────── */
function PoliciesTab() {
  const [policies,   setPolicies]   = useState<ExpensePolicy[]>([])
  const [categories, setCategories] = useState<ExpenseCategory[]>([])
  const [employees,  setEmployees]  = useState<{ id: string; full_name: string; department: string | null }[]>([])
  const [loading,    setLoading]    = useState(true)
  const [showForm,   setShowForm]   = useState(false)
  const [editingId,  setEditingId]  = useState<string | null>(null)
  const [form,       setForm]       = useState<PolicyFormState>(emptyPolicyForm())
  const [saving,     setSaving]     = useState(false)
  const [error,      setError]      = useState<string | null>(null)

  useEffect(() => {
    Promise.all([
      getOrgPolicies(),
      getOrgCategories(),
      getOrgEmployees(),
    ]).then(([pol, cats, emps]) => {
      setPolicies(pol)
      setCategories(cats)
      setEmployees((emps as { id: string; full_name: string; department: string | null }[]).filter(e => e !== null))
      setLoading(false)
    })
  }, [])

  function setF(field: keyof PolicyFormState, value: string) {
    setForm(prev => ({ ...prev, [field]: value }))
  }

  function startEdit(policy: ExpensePolicy) {
    setForm({
      name:                  policy.name,
      category_id:           policy.category_id ?? '',
      scope:                 policy.target_user_id ? 'user' : policy.department ? 'dept' : 'org',
      department:            policy.department ?? '',
      target_user_id:        policy.target_user_id ?? '',
      item_limit:            policy.item_limit != null ? String(policy.item_limit) : '',
      item_enforcement:      (policy.item_enforcement ?? '') as EnforcementValue,
      monthly_limit:         policy.monthly_limit != null ? String(policy.monthly_limit) : '',
      monthly_enforcement:   (policy.monthly_enforcement ?? '') as EnforcementValue,
      quarterly_limit:       policy.quarterly_limit != null ? String(policy.quarterly_limit) : '',
      quarterly_enforcement: (policy.quarterly_enforcement ?? '') as EnforcementValue,
      annual_limit:          policy.annual_limit != null ? String(policy.annual_limit) : '',
      annual_enforcement:    (policy.annual_enforcement ?? '') as EnforcementValue,
    })
    setEditingId(policy.id)
    setShowForm(true)
  }

  function cancelForm() {
    setShowForm(false)
    setEditingId(null)
    setForm(emptyPolicyForm())
    setError(null)
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault()
    if (!form.name.trim()) { setError('El nombre es obligatorio'); return }
    setSaving(true)
    setError(null)
    try {
      const data = {
        name:                  form.name.trim(),
        category_id:           form.category_id || null,
        department:            form.scope === 'dept' ? form.department || null : null,
        target_user_id:        form.scope === 'user' ? form.target_user_id || null : null,
        item_limit:            form.item_enforcement ? parseLimitNum(form.item_limit) : null,
        item_enforcement:      (form.item_enforcement || null) as 'warn' | 'require_justification' | 'block' | null,
        monthly_limit:         form.monthly_enforcement ? parseLimitNum(form.monthly_limit) : null,
        monthly_enforcement:   (form.monthly_enforcement || null) as 'warn' | 'require_justification' | 'block' | null,
        quarterly_limit:       form.quarterly_enforcement ? parseLimitNum(form.quarterly_limit) : null,
        quarterly_enforcement: (form.quarterly_enforcement || null) as 'warn' | 'require_justification' | 'block' | null,
        annual_limit:          form.annual_enforcement ? parseLimitNum(form.annual_limit) : null,
        annual_enforcement:    (form.annual_enforcement || null) as 'warn' | 'require_justification' | 'block' | null,
      }
      if (editingId) {
        await updatePolicy(editingId, data)
      } else {
        await createPolicy(data)
      }
      const updated = await getOrgPolicies()
      setPolicies(updated)
      cancelForm()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al guardar')
    } finally {
      setSaving(false)
    }
  }

  async function handleToggle(id: string, active: boolean) {
    await togglePolicyActive(id, active)
    setPolicies(prev => prev.map(p => p.id === id ? { ...p, is_active: active } : p))
  }

  async function handleDelete(id: string) {
    if (!confirm('¿Eliminar esta política? Los ítems existentes conservan sus violaciones registradas.')) return
    await deletePolicy(id)
    setPolicies(prev => prev.filter(p => p.id !== id))
  }

  if (loading) return <Spinner />

  const inputCls = 'w-full border border-ink-200 rounded-item px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-600'
  const selectCls = `${inputCls} bg-white`

  return (
    <section className="space-y-4">
      <div className="flex items-start justify-between">
        <div>
          <h2 className="text-base font-display font-bold text-ink-900">Políticas de gastos</h2>
          <p className="text-sm text-ink-500 mt-0.5">
            Define límites por ítem o por período. Cada política puede aplicar a toda la org, a un departamento o a un empleado específico.
          </p>
        </div>
        {!showForm && (
          <button
            onClick={() => setShowForm(true)}
            className="shrink-0 px-4 py-2 bg-brand-600 hover:bg-brand-700 text-white rounded-item text-sm font-semibold transition-colors"
          >
            Nueva política
          </button>
        )}
      </div>

      {/* Formulario de creación/edición */}
      {showForm && (
        <form onSubmit={handleSave} className="bg-white rounded-card shadow-card p-5 space-y-4 border-t-[3px] border-t-brand-600">
          <h3 className="font-semibold text-ink-900 text-sm">{editingId ? 'Editar política' : 'Nueva política'}</h3>

          {error && <p className="text-sm text-rose-600">{error}</p>}

          <div>
            <label className="block text-xs font-semibold text-ink-600 mb-1">Nombre *</label>
            <input type="text" value={form.name} onChange={e => setF('name', e.target.value)}
              placeholder="Ej: Límite almuerzos" className={inputCls} />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-ink-600 mb-1">Categoría (opcional)</label>
              <select value={form.category_id} onChange={e => setF('category_id', e.target.value)} className={selectCls}>
                <option value="">Todas las categorías</option>
                {categories.filter(c => c.is_active).map(c => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-ink-600 mb-1">Aplica a</label>
              <select value={form.scope} onChange={e => setF('scope', e.target.value as 'org' | 'dept' | 'user')} className={selectCls}>
                <option value="org">Toda la organización</option>
                <option value="dept">Departamento específico</option>
                <option value="user">Empleado específico</option>
              </select>
            </div>
          </div>

          {form.scope === 'dept' && (
            <div>
              <label className="block text-xs font-semibold text-ink-600 mb-1">Nombre del departamento</label>
              <input type="text" value={form.department} onChange={e => setF('department', e.target.value)}
                placeholder="Ej: Comercial" className={inputCls} />
            </div>
          )}

          {form.scope === 'user' && (
            <div>
              <label className="block text-xs font-semibold text-ink-600 mb-1">Empleado</label>
              <select value={form.target_user_id} onChange={e => setF('target_user_id', e.target.value)} className={selectCls}>
                <option value="">Seleccionar empleado...</option>
                {employees.map(e => (
                  <option key={e.id} value={e.id}>{e.full_name}{e.department ? ` (${e.department})` : ''}</option>
                ))}
              </select>
            </div>
          )}

          {/* Dimensiones de límite */}
          {(['item', 'monthly', 'quarterly', 'annual'] as const).map(dim => {
            const labels: Record<typeof dim, string> = {
              item: 'Límite por ítem', monthly: 'Límite mensual',
              quarterly: 'Límite trimestral', annual: 'Límite anual',
            }
            const enfField = `${dim}_enforcement` as keyof PolicyFormState
            const limField = `${dim}_limit` as keyof PolicyFormState
            return (
              <div key={dim} className="grid grid-cols-2 gap-3 items-end">
                <div>
                  <label className="block text-xs font-semibold text-ink-600 mb-1">{labels[dim]}</label>
                  <div className="flex items-center gap-1">
                    <span className="text-sm text-ink-500 font-mono-amount">$</span>
                    <input
                      type="text" inputMode="numeric"
                      value={form[limField] as string}
                      onChange={e => setF(limField, e.target.value.replace(/\D/g, ''))}
                      placeholder="Sin límite" className={`${inputCls} font-mono-amount`}
                      disabled={!form[enfField]}
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-ink-600 mb-1">Tipo de restricción</label>
                  <select value={form[enfField] as string} onChange={e => setF(enfField, e.target.value)} className={selectCls}>
                    {ENFORCEMENT_OPTS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                  </select>
                </div>
              </div>
            )
          })}

          <div className="flex gap-2 pt-1">
            <button type="button" onClick={cancelForm}
              className="flex-1 py-2 border border-ink-200 rounded-item text-sm font-semibold text-ink-600 hover:bg-ink-50 transition-colors">
              Cancelar
            </button>
            <button type="submit" disabled={saving}
              className="flex-1 py-2 bg-brand-600 hover:bg-brand-700 disabled:opacity-50 text-white rounded-item text-sm font-semibold transition-colors">
              {saving ? 'Guardando...' : editingId ? 'Actualizar' : 'Crear política'}
            </button>
          </div>
        </form>
      )}

      {/* Lista de políticas */}
      {policies.length === 0 ? (
        <div className="bg-white rounded-card shadow-card p-8 text-center text-ink-400 text-sm">
          No hay políticas configuradas. Las políticas permiten controlar los gastos por categoría, departamento o empleado.
        </div>
      ) : (
        <div className="space-y-2">
          {policies.map(p => {
            const catName = categories.find(c => c.id === p.category_id)?.name
            const empName = employees.find(e => e.id === p.target_user_id)?.full_name
            const scope = p.target_user_id ? `👤 ${empName ?? p.target_user_id}` :
                          p.department     ? `🏢 ${p.department}` : '🌐 Toda la org'
            return (
              <div key={p.id} className={`bg-white rounded-card shadow-card p-4 flex gap-3 items-start ${!p.is_active ? 'opacity-50' : ''}`}>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-semibold text-sm text-ink-900">{p.name}</span>
                    {catName && <span className="text-xs bg-brand-50 text-brand-700 px-1.5 py-0.5 rounded-full">{catName}</span>}
                    <span className="text-xs text-ink-400">{scope}</span>
                  </div>
                  <div className="flex gap-2 flex-wrap mt-1.5">
                    {p.item_limit && <span className="text-xs text-ink-500">Ítem: ${p.item_limit.toLocaleString('es-CL')} {enforcementBadge(p.item_enforcement)}</span>}
                    {p.monthly_limit && <span className="text-xs text-ink-500">Mensual: ${p.monthly_limit.toLocaleString('es-CL')} {enforcementBadge(p.monthly_enforcement)}</span>}
                    {p.quarterly_limit && <span className="text-xs text-ink-500">Trimestral: ${p.quarterly_limit.toLocaleString('es-CL')} {enforcementBadge(p.quarterly_enforcement)}</span>}
                    {p.annual_limit && <span className="text-xs text-ink-500">Anual: ${p.annual_limit.toLocaleString('es-CL')} {enforcementBadge(p.annual_enforcement)}</span>}
                  </div>
                </div>
                <div className="flex gap-1 shrink-0">
                  <button
                    onClick={() => handleToggle(p.id, !p.is_active)}
                    className={`px-2 py-1 rounded-item text-xs font-semibold transition-colors ${p.is_active ? 'bg-emerald-100 text-emerald-700 hover:bg-emerald-200' : 'bg-ink-100 text-ink-500 hover:bg-ink-200'}`}
                  >
                    {p.is_active ? 'Activa' : 'Inactiva'}
                  </button>
                  <button onClick={() => startEdit(p)} className="p-1.5 text-ink-400 hover:text-brand-600 transition-colors">
                    <Pencil size={14} />
                  </button>
                  <button onClick={() => handleDelete(p.id)} className="p-1.5 text-ink-400 hover:text-rose-600 transition-colors">
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </section>
  )
}
```

- [ ] **Step 6: Agregar `getOrgEmployees` y `getOrgCategories` a los imports de admin si no están ya**

Verificar que `getOrgEmployees` ya está en los imports (sí está por la línea 15). OK.

- [ ] **Step 7: Verificar tipos**

```powershell
npx tsc --noEmit
```

Esperado: sin errores.

- [ ] **Step 8: Commit**

```powershell
git add src/app/(app)/admin/settings/page.tsx
git commit -m "feat: settings tab Políticas de Gastos — CRUD completo"
```

---

## Task 7: ExpenseItemForm — Validación Inline de Políticas

**Files:**
- Modify: `src/components/expenses/ExpenseItemForm.tsx`
- Modify: `src/app/(app)/expenses/[id]/page.tsx` (para pasar policy_violations al addExpenseItem)

**Interfaces:**
- Consumes: `checkPolicyViolations`, `PolicyCheckResult` from `@/actions/policies` · `formatViolationMessage`, `PolicyViolation` from `@/lib/policy-helpers`
- Produces: `ItemFormData` extendida con `policy_violations: Json | null`, `policy_justification: string`

- [ ] **Step 1: Actualizar `ItemFormData` en `ExpenseItemForm.tsx`**

En la interfaz `ItemFormData`, agregar dos campos al final (después de `file: File | null`):
```typescript
  policy_violations:    Json | null
  policy_justification: string
```

En la función `emptyForm()`, agregar al objeto retornado:
```typescript
  policy_violations:    null,
  policy_justification: '',
```

- [ ] **Step 2: Agregar imports en `ExpenseItemForm.tsx`**

Al inicio del archivo, agregar:
```typescript
import { checkPolicyViolations } from '@/actions/policies'
import { formatViolationMessage } from '@/lib/policy-helpers'
import type { PolicyCheckResult } from '@/actions/policies'
```

También agregar el ícono `ShieldAlert` a los imports de lucide-react:
```typescript
import { AlertTriangle, ShieldAlert } from 'lucide-react'
```

- [ ] **Step 3: Añadir estado de policy check en el componente**

Después de las declaraciones de `useState` existentes, agregar:
```typescript
  const [policyResult,       setPolicyResult]       = useState<PolicyCheckResult | null>(null)
  const [policyJustification,setPolicyJustification] = useState('')
  const [policyChecking,     setPolicyChecking]      = useState(false)
```

- [ ] **Step 4: Añadir efecto de validación con debounce**

Después del `useEffect` del tipo de cambio (que reacciona a `form.currency, form.date`), agregar:

```typescript
  // Debounce 600ms para validar políticas al cambiar monto
  useEffect(() => {
    if (!form.amount_clp || form.amount_clp <= 0) {
      setPolicyResult(null)
      return
    }
    const timer = setTimeout(() => {
      setPolicyChecking(true)
      checkPolicyViolations({
        categoryId: form.category_id || null,
        amount:     form.amount_clp,
        date:       form.date || new Date().toISOString().split('T')[0],
      }).then(result => {
        setPolicyResult(result.violations.length > 0 ? result : null)
        // Limpiar justificación si ya no se necesita
        if (!result.hasJustificationRequired) setPolicyJustification('')
      }).finally(() => setPolicyChecking(false))
    }, 600)
    return () => clearTimeout(timer)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form.amount_clp, form.category_id])
```

- [ ] **Step 5: Actualizar `doSave` para incluir datos de políticas**

La función `doSave` llama a `onSave(form)`. Antes de esa llamada, actualizar el form con los valores de policy:

Reemplazar la función `doSave` completa:
```typescript
  async function doSave() {
    setSaving(true)
    try {
      const formWithPolicy: ItemFormData = {
        ...form,
        policy_violations:    policyResult ? (policyResult.violations as unknown as Json) : null,
        policy_justification: policyJustification,
      }
      await onSave(formWithPolicy)
      setDuplicateWarning(null)
    } finally {
      setSaving(false)
    }
  }
```

- [ ] **Step 6: Actualizar validación en `handleSubmit`**

En `handleSubmit`, antes de llamar a `checkItemDuplicate`, agregar validación de justificación requerida:

```typescript
    // Justificación requerida si hay política de tipo 'require_justification'
    if (policyResult?.hasJustificationRequired && !policyJustification.trim()) {
      localErrors.push('Se requiere justificación para este gasto según la política de la organización')
    }
    // Bloqueo duro por política
    if (policyResult?.hasBlock) {
      localErrors.push('Este gasto está bloqueado por la política de la organización. Contacta al administrador.')
    }
```

Agregar esto después de las validaciones de `form.date`, antes del `if (localErrors.length > 0)`.

- [ ] **Step 7: Añadir el bloque de UI de policy check antes del botón guardar**

En el JSX, antes del bloque del botón de submit (busca el `<div className="flex gap-2 pt-2">` al final del return), insertar:

```tsx
      {/* Verificación de política */}
      {policyChecking && (
        <div className="flex items-center gap-2 text-xs text-ink-400">
          <div className="w-3 h-3 border border-ink-300 border-t-transparent rounded-full animate-spin" />
          Verificando política de gastos...
        </div>
      )}

      {policyResult && policyResult.violations.length > 0 && (
        <div className={`rounded-item p-3 space-y-2 ${policyResult.hasBlock ? 'bg-rose-50 border border-rose-200' : 'bg-amber-50 border border-amber-200'}`}>
          <div className="flex items-start gap-2">
            <ShieldAlert size={15} className={`mt-0.5 shrink-0 ${policyResult.hasBlock ? 'text-rose-600' : 'text-amber-600'}`} />
            <div className="space-y-1 flex-1">
              {policyResult.violations.map((v, i) => (
                <p key={i} className={`text-xs font-medium ${policyResult.hasBlock ? 'text-rose-700' : 'text-amber-800'}`}>
                  {formatViolationMessage(v)}
                </p>
              ))}
            </div>
          </div>
          {policyResult.hasJustificationRequired && !policyResult.hasBlock && (
            <div>
              <label className="block text-xs font-semibold text-amber-800 mb-1">
                Justificación requerida *
              </label>
              <textarea
                value={policyJustification}
                onChange={e => setPolicyJustification(e.target.value)}
                placeholder="Explica por qué este gasto supera el límite establecido..."
                rows={2}
                className="w-full px-2 py-1.5 text-xs border border-amber-300 rounded-item focus:outline-none focus:ring-2 focus:ring-amber-500 resize-none"
              />
            </div>
          )}
          {policyResult.hasBlock && (
            <p className="text-xs text-rose-600 font-semibold">
              Este gasto no puede registrarse. Contacta al administrador si necesitas una excepción.
            </p>
          )}
        </div>
      )}
```

- [ ] **Step 8: Deshabilitar botón de submit cuando hay bloqueo**

En el botón de submit, añadir `policyResult?.hasBlock` a la condición `disabled`:

Buscar el botón con `type="submit"` que tiene `disabled={saving}` y cambiar a:
```tsx
disabled={saving || policyResult?.hasBlock === true || (policyResult?.hasJustificationRequired && !policyJustification.trim())}
```

- [ ] **Step 9: Actualizar `handleSaveItem` en `expenses/[id]/page.tsx`**

En la función `handleSaveItem`, añadir los campos de policy al llamado de `addExpenseItem`:

Después de `ocr_confidence: data.ocr_confidence,`, agregar:
```typescript
      policy_justification: data.policy_justification || null,
      policy_violations:    data.policy_violations,
```

- [ ] **Step 10: Verificar tipos**

```powershell
npx tsc --noEmit
```

Esperado: sin errores.

- [ ] **Step 11: Commit**

```powershell
git add src/components/expenses/ExpenseItemForm.tsx "src/app/(app)/expenses/[id]/page.tsx"
git commit -m "feat: policy violation inline check in ExpenseItemForm — warn/justify/block"
```

---

## Task 8: UI Aprobación — Tarjeta IA + Bulk Approve

**Files:**
- Modify: `src/app/(app)/approvals/[id]/page.tsx`
- Modify: `src/app/(app)/approvals/[id]/client.tsx`

**Interfaces:**
- Consumes: `getOrGenerateApprovalAnalysis` from `@/actions/approvals` · `bulkApproveItems` from `@/actions/approvals` · `AiAnalysis` from `@/lib/approval-analysis-helpers`
- Produces: tarjeta de análisis IA con risk_level, headline, stats, botón bulk approve; reordenamiento de ítems attention-first

- [ ] **Step 1: Actualizar `page.tsx` para cargar análisis en paralelo**

Reemplazar el contenido de `src/app/(app)/approvals/[id]/page.tsx`:

```typescript
import { getReportForApproval, getOrGenerateApprovalAnalysis } from '@/actions/approvals'
import { getApprovalAttachments } from '@/actions/approval-attachments'
import { ApprovalDetailClient } from './client'

export default async function ApprovalDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const [initialReport, initialAttachments, initialAnalysis] = await Promise.all([
    getReportForApproval(id),
    getApprovalAttachments({ reportId: id }),
    getOrGenerateApprovalAnalysis(id).catch(() => null),
  ])
  return (
    <ApprovalDetailClient
      id={id}
      initialReport={initialReport}
      initialAttachments={initialAttachments}
      initialAnalysis={initialAnalysis}
    />
  )
}
```

- [ ] **Step 2: Actualizar imports en `client.tsx`**

Agregar al principio de los imports:
```typescript
import { bulkApproveItems } from '@/actions/approvals'
import { CheckCheck, ShieldAlert, AlertTriangle as AlertIcon, TrendingUp, FileX, Store } from 'lucide-react'
import type { AiAnalysis } from '@/lib/approval-analysis-helpers'
```

(Si `AlertTriangle` ya está importado como `AlertTriangle`, renombrar el nuevo import para evitar conflicto.)

- [ ] **Step 3: Actualizar la interfaz `Props` en `client.tsx`**

En la interfaz Props, agregar:
```typescript
  initialAnalysis: AiAnalysis | null
```

- [ ] **Step 4: Añadir state de análisis IA en el componente**

En la función `ApprovalDetailClient`, después de `const [notes, setNotes] = useState('')`, agregar:
```typescript
  const [analysis,     setAnalysis]     = useState<AiAnalysis | null>(initialAnalysis)
  const [bulkApproving,setBulkApproving] = useState(false)
```

Actualizar la desestructuración de props para incluir `initialAnalysis`:
```typescript
export function ApprovalDetailClient({ id, initialReport, initialAttachments, initialAnalysis }: Props) {
```

- [ ] **Step 5: Implementar handler de bulk approve**

Antes del `return`, agregar:
```typescript
  async function handleBulkApproveRoutine() {
    if (!analysis) return
    setBulkApproving(true)
    try {
      await bulkApproveItems(id, analysis.routine_item_ids)
      // Recargar reporte
      const updated = await getReportForApproval(id)
      setReport(updated)
      // Quitar ítems aprobados de decisions
      setDecisions(prev => {
        const next = { ...prev }
        for (const itemId of analysis.routine_item_ids) delete next[itemId]
        return next
      })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al aprobar')
    } finally {
      setBulkApproving(false)
    }
  }
```

- [ ] **Step 6: Añadir la tarjeta de análisis IA en el JSX**

En el componente, buscar el punto donde se muestra el encabezado del reporte (`<h1>` con el título). Justo ANTES de la lista de ítems, insertar el bloque de la tarjeta IA:

```tsx
      {/* Tarjeta de análisis IA */}
      {analysis && (
        <div className={`rounded-card p-4 space-y-3 border ${
          analysis.risk_level === 'high'   ? 'bg-rose-50 border-rose-200' :
          analysis.risk_level === 'medium' ? 'bg-amber-50 border-amber-200' :
                                             'bg-emerald-50 border-emerald-200'
        }`}>
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-center gap-2">
              <ShieldAlert size={16} className={
                analysis.risk_level === 'high'   ? 'text-rose-600' :
                analysis.risk_level === 'medium' ? 'text-amber-600' : 'text-emerald-600'
              } />
              <span className="text-xs font-semibold uppercase tracking-wide text-ink-500">Análisis IA</span>
              <span className={`text-xs px-2 py-0.5 rounded-full font-semibold ${
                analysis.risk_level === 'high'   ? 'bg-rose-100 text-rose-700' :
                analysis.risk_level === 'medium' ? 'bg-amber-100 text-amber-700' :
                                                   'bg-emerald-100 text-emerald-700'
              }`}>
                Riesgo {analysis.risk_level === 'high' ? 'alto' : analysis.risk_level === 'medium' ? 'medio' : 'bajo'}
              </span>
            </div>
          </div>

          <p className="text-sm font-medium text-ink-800">{analysis.headline}</p>

          <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-ink-500">
            <span className="font-mono-amount">${analysis.stats.total_clp.toLocaleString('es-CL')} CLP</span>
            <span className="flex items-center gap-1"><TrendingUp size={11} /> {analysis.stats.vs_employee_avg} vs promedio</span>
            {analysis.stats.policy_violations > 0 && (
              <span className="flex items-center gap-1 text-amber-600"><AlertIcon size={11} /> {analysis.stats.policy_violations} violación{analysis.stats.policy_violations > 1 ? 'es' : ''} de política</span>
            )}
            {analysis.stats.missing_docs > 0 && (
              <span className="flex items-center gap-1 text-rose-600"><FileX size={11} /> {analysis.stats.missing_docs} doc faltante{analysis.stats.missing_docs > 1 ? 's' : ''}</span>
            )}
            {analysis.stats.new_merchants > 0 && (
              <span className="flex items-center gap-1 text-violet-600"><Store size={11} /> {analysis.stats.new_merchants} merchant nuevo{analysis.stats.new_merchants > 1 ? 's' : ''}</span>
            )}
          </div>

          {analysis.routine_item_ids.length > 0 && report?.status !== 'approved' && (
            <button
              onClick={handleBulkApproveRoutine}
              disabled={bulkApproving}
              className="flex items-center gap-2 px-4 py-2 bg-brand-600 hover:bg-brand-700 disabled:opacity-50 text-white rounded-item text-sm font-semibold transition-colors"
            >
              <CheckCheck size={15} />
              {bulkApproving
                ? 'Aprobando...'
                : `Aprobar los ${analysis.routine_item_ids.length} ítems rutinarios`}
            </button>
          )}
        </div>
      )}
```

- [ ] **Step 7: Reordenar ítems — attention items primero**

En el JSX donde se itera `report.expense_items` para renderizar cada ítem, crear el array ordenado antes del render.

Buscar donde se usa `(report?.expense_items ?? []) as ItemWithRelations[]` y reemplazar por:

```typescript
  const rawItems = (report?.expense_items ?? []) as ItemWithRelations[]
  const attentionIds = new Set((analysis?.attention_items ?? []).map(a => a.item_id))
  const orderedItems = [
    ...rawItems.filter(i => attentionIds.has(i.id)),
    ...rawItems.filter(i => !attentionIds.has(i.id)),
  ]
```

Luego usar `orderedItems` en el map de renderizado en vez de `rawItems`.

- [ ] **Step 8: Añadir indicadores visuales de atención en cada ítem**

En el render de cada ítem de la lista, buscar el contenedor del ítem individual. Añadir borde de atención y razones de la IA. Envolver el render del ítem con:

```tsx
{orderedItems.map(item => {
  const attentionInfo = analysis?.attention_items.find(a => a.item_id === item.id)
  return (
    <div key={item.id} className={attentionInfo ? 'ring-2 ring-amber-400 ring-offset-1 rounded-card' : ''}>
      {attentionInfo && (
        <div className="bg-amber-50 border border-amber-200 border-b-0 rounded-t-card px-4 py-2 flex items-start gap-2">
          <AlertIcon size={13} className="text-amber-600 mt-0.5 shrink-0" />
          <div className="flex-1">
            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold text-amber-800">Requiere atención</span>
              <span className={`text-xs px-1.5 py-0.5 rounded-full font-medium ${
                attentionInfo.suggestion === 'rechazar' ? 'bg-rose-100 text-rose-700' :
                attentionInfo.suggestion === 'aprobar'  ? 'bg-emerald-100 text-emerald-700' :
                                                          'bg-amber-100 text-amber-700'
              }`}>
                Sugerencia IA: {attentionInfo.suggestion}
              </span>
            </div>
            <ul className="mt-0.5 space-y-0.5">
              {attentionInfo.reasons.map((r, i) => (
                <li key={i} className="text-xs text-amber-700">• {r}</li>
              ))}
            </ul>
          </div>
        </div>
      )}
      {/* El render del ítem individual va aquí — mantener el código existente */}
      {/* ... código existente de cada ítem (foto, descripción, monto, botones aprobar/rechazar) ... */}
    </div>
  )
})}
```

**Nota importante para el implementador:** el "código existente de cada ítem" es el bloque `.map()` existente en `client.tsx`. Este step consiste en reemplazar el `map` existente envolviéndolo en el div con el anillo de atención y el header de IA, sin modificar el render interno del ítem.

- [ ] **Step 9: Verificar tipos**

```powershell
npx tsc --noEmit
```

Esperado: sin errores.

- [ ] **Step 10: Verificar build completo**

```powershell
npx next build 2>&1 | tail -30
```

Esperado: build exitoso sin errores de compilación.

- [ ] **Step 11: Correr todos los tests**

```powershell
npx vitest run
```

Esperado: todos los tests pasando (mínimo 27 = existentes + 17 policy-helpers + 10 approval-analysis).

- [ ] **Step 12: Commit final**

```powershell
git add "src/app/(app)/approvals/[id]/page.tsx" "src/app/(app)/approvals/[id]/client.tsx"
git commit -m "feat: AI analysis card + attention-first ordering + bulk approve routine items"
```

---

## Estado final del plan

**Tasks 1–8: ✅ COMPLETAS** (2026-07-24)

- 76 tests pasando, TypeScript limpio, build OK
- Deploy automático en Vercel en cada push a `main`

---

## Tareas pendientes de revisión manual

### ⏳ Revisar Excel de exportación Defontana

Después de validar en Defontana que el archivo importa correctamente, confirmar o corregir:

1. **`Codigo Legal`** — en la contrapartida (línea Haber / Fondos por Rendir): actualmente lleva el RUT del rendidor (`employeeRut`). En la línea de proveedor de facturas: actualmente vacío. Confirmar si Defontana lo requiere en alguna de estas líneas.
2. **Formato de fechas** — verificar que Defontana acepta el serial Excel generado por `toExcelSerial()`.
3. **Columnas vacías** — verificar que las 2 columnas vacías al final no causan error en el importador.
4. **Redondeo de montos** — verificar que Defontana acepta enteros CLP sin decimales.
5. **Boletas agrupadas vs. individuales** — confirmar que la agrupación por `(cuenta, centro de negocios)` es correcta para el libro contable.

Archivos relevantes:
- `src/lib/export/defontana.ts` — lógica de construcción y serialización
- `src/app/(app)/petty-cash/client.tsx` — panel de exportación de cajas chicas
