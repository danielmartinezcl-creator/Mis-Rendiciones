# Auditoría · Seguridad · Robustez — Plan de implementación

> **Para agentes:** usar superpowers:subagent-driven-development o superpowers:executing-plans.

**Goal:** Implementar las 20 mejoras identificadas en el análisis del 2026-08-11 — auditoría completa, brechas de seguridad, robustez, y nuevas funcionalidades — sin romper funcionalidad existente.

**Architecture:** 5 fases ordenadas por dependencias. La Fase 1 establece la infraestructura (schema, validadores, helpers de auditoría) de la que dependen todas las fases siguientes. Cada tarea termina con `npx tsc --noEmit` limpio y commit.

**Tech Stack:** Next.js 16.2.7 · TypeScript · Tailwind v4 · Supabase `jqtbtgduqzxkgubmzukg` · jsPDF · Lucide React

---

## Global Constraints

- `src/proxy.ts` con `export async function proxy()` — NO `middleware.ts`
- NO `tailwind.config.ts` — config solo en `src/app/globals.css` vía `@theme {}`
- Supabase project `jqtbtgduqzxkgubmzukg` — NO mezclar con fintrack
- Todas las funciones en `src/actions/` deben ser `async`
- Helpers puros SIEMPRE en `src/lib/`, nunca en `src/actions/`
- `rounded-item` (14px) y `rounded-card` (18px) — no valores hardcodeados
- Color brand teal `#0D9488` — usar clases `brand-*`, nunca `indigo-*`
- `npx tsc --noEmit` debe pasar sin errores después de cada tarea
- Iconos: Lucide React — no emoji en UI
- `audit_log` es append-only — no update, no delete a nivel SQL (igual que `expense_report_approvals`)

---

## FASE 1 — Fundamentos críticos (Tasks 1–5)

> Estas 5 tareas establecen la infraestructura que usan todas las demás. Deben completarse en orden.

---

### Task 1: Schema — `audit_log` + extensiones soft-delete

**Files:**
- Create: `supabase/migrations/016_audit_log.sql`
- Create: `supabase/migrations/017_soft_delete_extensions.sql`
- Modify: `src/lib/supabase/types.ts` (agregar tablas nuevas + columnas nuevas)

**Interfaces:**
- Produces: tabla `audit_log` disponible en DB; columnas `deleted_by`, `modified_by` en tablas existentes; campo `dedup_key` en `notifications`; campo `monthly_budget_clp` en `expense_categories`

- [ ] **Step 1: Crear migración 016 — audit_log**

```sql
-- supabase/migrations/016_audit_log.sql

create table public.audit_log (
  id            uuid        primary key default gen_random_uuid(),
  org_id        uuid        not null references public.organizations(id) on delete cascade,
  actor_id      uuid        references public.users(id) on delete set null,
  actor_name    text,                          -- desnormalizado para no perder info si actor se borra
  action        text        not null,          -- 'deleted'|'restored'|'updated'|'created'|'config_changed'|'bulk_updated'
  entity_type   text        not null,          -- 'expense_report'|'expense_item'|'petty_cash_fund'|'user'|'category'|'policy'|'travel_policy'|'defontana_settings'|'cost_center_assignment'|'approver_assignment'
  entity_id     text        not null,          -- UUID o identificador de la entidad
  entity_label  text,                          -- descripción legible: nombre de la rendición, del empleado, etc.
  old_value     jsonb,                         -- estado antes del cambio (null si es creación)
  new_value     jsonb,                         -- estado después del cambio (null si es borrado)
  notes         text,                          -- motivo o contexto adicional
  created_at    timestamptz not null default now()
);

-- Append-only a nivel SQL
create rule no_update_audit_log as on update to public.audit_log do instead nothing;
create rule no_delete_audit_log as on delete to public.audit_log do instead nothing;

alter table public.audit_log enable row level security;

-- Solo admins de la misma org pueden leer
create policy "admins_read_audit_log" on public.audit_log
  for select using (is_admin() and org_id = get_my_org_id());

-- Insert: cualquier función server-side con service role (admin client)
create policy "service_role_insert_audit_log" on public.audit_log
  for insert with check (true);

-- Índices para consultas frecuentes
create index idx_audit_log_org_created  on public.audit_log(org_id, created_at desc);
create index idx_audit_log_entity       on public.audit_log(entity_type, entity_id);
create index idx_audit_log_actor        on public.audit_log(actor_id);
create index idx_audit_log_action       on public.audit_log(action);
```

- [ ] **Step 2: Crear migración 017 — extensiones**

```sql
-- supabase/migrations/017_soft_delete_extensions.sql

-- deleted_by / modified_by en tablas que tienen soft delete
alter table public.expense_reports
  add column if not exists deleted_by  uuid references public.users(id) on delete set null,
  add column if not exists modified_by uuid references public.users(id) on delete set null;

alter table public.petty_cash_funds
  add column if not exists deleted_by  uuid references public.users(id) on delete set null;

-- Soft delete en expense_items (actualmente es hard delete)
alter table public.expense_items
  add column if not exists deleted_at  timestamptz,
  add column if not exists deleted_by  uuid references public.users(id) on delete set null;

-- Soft delete en expense_categories
alter table public.expense_categories
  add column if not exists deleted_at  timestamptz,
  add column if not exists deleted_by  uuid references public.users(id) on delete set null;

-- Presupuesto mensual por categoría
alter table public.expense_categories
  add column if not exists monthly_budget_clp numeric;

-- Dedup key para notificaciones
alter table public.notifications
  add column if not exists dedup_key varchar(150);

create unique index if not exists idx_notifications_dedup
  on public.notifications(org_id, dedup_key)
  where dedup_key is not null;

-- Rate limiting (ventana deslizante por user+action)
create table if not exists public.rate_limit_log (
  id         bigserial   primary key,
  user_id    uuid        not null references public.users(id) on delete cascade,
  action     varchar(50) not null,
  created_at timestamptz not null default now()
);
create index idx_rate_limit_log_lookup on public.rate_limit_log(user_id, action, created_at desc);
-- Auto-limpieza: registros > 2h son irrelevantes
```

- [ ] **Step 3: Aplicar migraciones en Supabase**

```
Supabase Dashboard → SQL Editor → pegar y ejecutar 016_audit_log.sql
Supabase Dashboard → SQL Editor → pegar y ejecutar 017_soft_delete_extensions.sql
```

- [ ] **Step 4: Actualizar `src/lib/supabase/types.ts`**

Agregar al final de la sección de tablas:

```typescript
audit_log: {
  Row: {
    id: string
    org_id: string
    actor_id: string | null
    actor_name: string | null
    action: string
    entity_type: string
    entity_id: string
    entity_label: string | null
    old_value: Record<string, unknown> | null
    new_value: Record<string, unknown> | null
    notes: string | null
    created_at: string
  }
  Insert: {
    id?: string
    org_id: string
    actor_id?: string | null
    actor_name?: string | null
    action: string
    entity_type: string
    entity_id: string
    entity_label?: string | null
    old_value?: Record<string, unknown> | null
    new_value?: Record<string, unknown> | null
    notes?: string | null
    created_at?: string
  }
  Update: Record<string, never>
  Relationships: [{ foreignKeyName: 'audit_log_org_id_fkey'; columns: ['org_id']; referencedRelation: 'organizations'; referencedColumns: ['id'] }]
}
rate_limit_log: {
  Row:    { id: number; user_id: string; action: string; created_at: string }
  Insert: { id?: number; user_id: string; action: string; created_at?: string }
  Update: Record<string, never>
  Relationships: []
}
```

En las tablas existentes, agregar las nuevas columnas a `Row`/`Insert`/`Update`:
- `expense_reports.Row`: `+ deleted_by: string | null; modified_by: string | null`
- `expense_items.Row`: `+ deleted_at: string | null; deleted_by: string | null`
- `expense_categories.Row`: `+ deleted_at: string | null; deleted_by: string | null; monthly_budget_clp: number | null`
- `notifications.Row`: `+ dedup_key: string | null`

- [ ] **Step 5: Verificar TypeScript**

```bash
npx tsc --noEmit
```
Expected: no output (cero errores)

- [ ] **Step 6: Commit**

```
git add supabase/migrations/016_audit_log.sql supabase/migrations/017_soft_delete_extensions.sql src/lib/supabase/types.ts
git commit -m "feat: schema audit_log + soft-delete extensions + rate_limit_log"
```

---

### Task 2: `src/lib/audit.ts` + `src/lib/validators.ts`

**Files:**
- Create: `src/lib/audit.ts`
- Create: `src/lib/validators.ts`

**Interfaces:**
- Produces: `logAudit(params)` usado por Tasks 6 y 7; `validateRut()`, `validateStringLength()`, etc. usados por Task 13

- [ ] **Step 1: Escribir test para validators**

```typescript
// src/tests/validators.test.ts
import { describe, it, expect } from 'vitest'
import { validateRut, validateStringLength, validateAmount, validateDateRange } from '@/lib/validators'

describe('validateRut', () => {
  it('acepta RUT válido con guión', () => expect(validateRut('12.345.678-9')).toBe(true))
  it('acepta RUT sin puntos', ()    => expect(validateRut('12345678-9')).toBe(true))
  it('acepta RUT con K', ()         => expect(validateRut('15.381.452-K')).toBe(true))
  it('rechaza RUT con dígito incorrecto', () => expect(validateRut('12.345.678-0')).toBe(false))
  it('rechaza string vacío', ()     => expect(validateRut('')).toBe(false))
})

describe('validateStringLength', () => {
  it('acepta string dentro del límite', () => expect(validateStringLength('hola', 10)).toBe(true))
  it('rechaza string vacío',            () => expect(validateStringLength('', 10)).toBe(false))
  it('rechaza string sobre el límite',  () => expect(validateStringLength('a'.repeat(11), 10)).toBe(false))
})

describe('validateAmount', () => {
  it('acepta monto positivo',   () => expect(validateAmount(1000)).toBe(true))
  it('rechaza cero',            () => expect(validateAmount(0)).toBe(false))
  it('rechaza negativo',        () => expect(validateAmount(-100)).toBe(false))
})

describe('validateDateRange', () => {
  it('acepta rango válido',        () => expect(validateDateRange('2026-01-01', '2026-01-31')).toBe(true))
  it('rechaza rango invertido',    () => expect(validateDateRange('2026-01-31', '2026-01-01')).toBe(false))
  it('acepta misma fecha',         () => expect(validateDateRange('2026-01-01', '2026-01-01')).toBe(true))
})
```

- [ ] **Step 2: Ejecutar test para ver fallo**

```bash
npx vitest run src/tests/validators.test.ts
```
Expected: FAIL (módulo no existe)

- [ ] **Step 3: Implementar `src/lib/validators.ts`**

```typescript
// Dígito verificador chileno (módulo 11)
function rutDigit(body: string): string {
  const digits = body.replace(/\./g, '').split('').reverse().map(Number)
  const sum = digits.reduce((acc, d, i) => acc + d * ((i % 6) + 2), 0)
  const rem = 11 - (sum % 11)
  if (rem === 11) return '0'
  if (rem === 10) return 'K'
  return String(rem)
}

export function validateRut(rut: string): boolean {
  if (!rut || rut.trim() === '') return false
  const clean = rut.trim().toUpperCase().replace(/\./g, '')
  const match = clean.match(/^(\d{1,8})-([0-9K])$/)
  if (!match) return false
  return rutDigit(match[1]) === match[2]
}

export function validateStringLength(str: string, max: number, min = 1): boolean {
  if (!str || str.trim().length < min) return false
  return str.trim().length <= max
}

export function validateAmount(amount: number): boolean {
  return typeof amount === 'number' && amount > 0 && isFinite(amount)
}

export function validatePositiveNumber(n: number): boolean {
  return typeof n === 'number' && n >= 0 && isFinite(n)
}

export function validateDateRange(from: string, to: string): boolean {
  if (!from || !to) return false
  return new Date(from) <= new Date(to)
}

export function validateHexColor(color: string): boolean {
  return /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(color)
}

export function normalizeRut(rut: string): string {
  return rut.trim().toUpperCase().replace(/\./g, '')
}
```

- [ ] **Step 4: Implementar `src/lib/audit.ts`**

```typescript
'use server'
import { createAdminClient } from '@/lib/supabase/admin'

export type AuditAction =
  | 'deleted' | 'restored' | 'permanently_deleted'
  | 'created'  | 'updated'  | 'bulk_updated'
  | 'config_changed' | 'exported' | 'submitted' | 'approved' | 'rejected'

export type AuditEntityType =
  | 'expense_report' | 'expense_item'
  | 'petty_cash_fund' | 'petty_cash_item'
  | 'user' | 'category' | 'policy' | 'travel_policy'
  | 'defontana_settings' | 'defontana_supplier'
  | 'cost_center_assignment' | 'approver_assignment'
  | 'webhook'

export interface AuditLogEntry {
  orgId:       string
  actorId:     string | null
  actorName:   string | null
  action:      AuditAction
  entityType:  AuditEntityType
  entityId:    string
  entityLabel?: string
  oldValue?:   Record<string, unknown> | null
  newValue?:   Record<string, unknown> | null
  notes?:      string
}

export async function logAudit(entry: AuditLogEntry): Promise<void> {
  try {
    const admin = createAdminClient()
    await admin.from('audit_log').insert({
      org_id:       entry.orgId,
      actor_id:     entry.actorId,
      actor_name:   entry.actorName,
      action:       entry.action,
      entity_type:  entry.entityType,
      entity_id:    entry.entityId,
      entity_label: entry.entityLabel ?? null,
      old_value:    entry.oldValue  ?? null,
      new_value:    entry.newValue  ?? null,
      notes:        entry.notes     ?? null,
    })
  } catch (err) {
    // Audit failures NUNCA deben bloquear la operación principal
    console.error('[audit] Failed to write audit log:', err)
  }
}
```

**IMPORTANTE:** `logAudit` usa `try/catch` silencioso — un fallo de auditoría nunca debe bloquear la operación de negocio.

- [ ] **Step 5: Ejecutar tests**

```bash
npx vitest run src/tests/validators.test.ts
```
Expected: PASS (todos los tests en verde)

- [ ] **Step 6: TypeScript check**

```bash
npx tsc --noEmit
```

- [ ] **Step 7: Commit**

```
git add src/lib/audit.ts src/lib/validators.ts src/tests/validators.test.ts
git commit -m "feat: lib/audit.ts helper + lib/validators.ts con dígito verificador RUT"
```

---

### Task 3: Seguridad — proteger server actions sin auth

**Files:**
- Modify: `src/actions/organizations.ts`
- Modify: `src/actions/ocr.ts`
- Modify: `src/actions/approvals.ts` (getReportForApproval, getOrGenerateApprovalAnalysis)
- Modify: `src/actions/expenses.ts` (deleteExpenseItem, getReportWithItems, getReportTimeline, getReportApprovals)
- Modify: `src/actions/notifications.ts` (markNotificationRead)

**Interfaces:**
- Consumes: `createClient()` de supabase
- Produces: funciones protegidas — `getReportForApproval` y `getReportWithItems` verifican sesión; `ocr.ts` verifica sesión; `organizations.ts` restringido a env var; `markNotificationRead` filtra por userId

- [ ] **Step 1: Proteger `src/actions/organizations.ts`**

Todas las funciones expuestas (`createOrganization`, `listOrganizations`, `seedPentaCostCenters`, `createCostCenter`) son scripts de onboarding — no deben ser server actions públicas. Agregar guard:

```typescript
// Al inicio de cada función en organizations.ts
const INTERNAL_TOKEN = process.env.INTERNAL_ADMIN_TOKEN
if (!INTERNAL_TOKEN || token !== INTERNAL_TOKEN) {
  throw new Error('Unauthorized: internal admin token required')
}
```

O más limpio: mover estas funciones a `scripts/onboarding.ts` (scripts de Node que se ejecutan manualmente, no como server actions). En ese caso, eliminar el archivo `organizations.ts` del bundle de producción y reemplazarlo por un script standalone.

**Implementar la segunda opción:**
- Crear `scripts/onboarding.ts` con las funciones
- Eliminar `src/actions/organizations.ts` o dejarlo vacío con comentario
- Verificar que ninguna página importa de `organizations.ts`

- [ ] **Step 2: Proteger `src/actions/ocr.ts`**

```typescript
// src/actions/ocr.ts — agregar al inicio de runOcr()
export async function runOcr(imageBase64: string, mimeType: string) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Unauthorized')
  // ... resto del código existente
}
```

- [ ] **Step 3: Proteger `getReportForApproval` en approvals.ts**

```typescript
export async function getReportForApproval(reportId: string) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null
  
  const profile = await getProfile(supabase, user.id)
  if (!profile) return null
  // Solo approvers y admins pueden llamar esta función
  if (profile.role === 'employee' && !profile.can_approve) return null
  
  // ... resto del código existente (el RLS ya protege por org)
}
```

- [ ] **Step 4: Proteger `getOrGenerateApprovalAnalysis` en approvals.ts**

```typescript
export async function getOrGenerateApprovalAnalysis(reportId: string) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null
  
  const profile = await getProfile(supabase, user.id)
  if (!profile || (profile.role === 'employee' && !profile.can_approve)) return null
  
  // ... código existente
}
```

- [ ] **Step 5: Agregar ownership check en `getReportTimeline` y `getReportApprovals` (expenses.ts)**

```typescript
export async function getReportTimeline(reportId: string) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return []
  
  // Verificar que el reporte pertenece al usuario (o el usuario es admin/approver)
  const { data: report } = await supabase
    .from('expense_reports')
    .select('submitter_id, org_id')
    .eq('id', reportId)
    .single()
  
  if (!report) return []
  const profile = await getProfile(supabase, user.id)
  if (!profile) return []
  if (report.submitter_id !== user.id && profile.role === 'employee') return []
  
  // ... resto del código existente
}
// Misma lógica para getReportApprovals
```

- [ ] **Step 6: Fix `markNotificationRead` (notifications.ts)**

```typescript
export async function markNotificationRead(notificationId: string) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return
  
  await supabase
    .from('notifications')
    .update({ read: true })
    .eq('id', notificationId)
    .eq('user_id', user.id)  // ← AGREGAR ESTA LÍNEA — solo marcar las propias
}
```

- [ ] **Step 7: TypeScript check**

```bash
npx tsc --noEmit
```

- [ ] **Step 8: Commit**

```
git add src/actions/ocr.ts src/actions/approvals.ts src/actions/expenses.ts src/actions/notifications.ts
git commit -m "fix: proteger server actions sin auth — ocr, approvals, expenses, notifications"
```

---

### Task 4: Notificaciones — optimización + soft-delete expense_items

**Files:**
- Modify: `src/actions/notifications.ts` (lookupEmails optimización)
- Modify: `src/actions/expenses.ts` (deleteExpenseItem → soft delete)
- Modify: `src/actions/admin.ts` (queries de expense_items → filtrar deleted_at IS NULL)
- Modify: `src/actions/approvals.ts` (idem)

**Interfaces:**
- Produces: `deleteExpenseItem` hace soft delete; todos los selects de ítems excluyen `deleted_at IS NOT NULL`; emails se buscan individualmente

- [ ] **Step 1: Optimizar `lookupEmails` en notifications.ts**

```typescript
// ANTES (ineficiente):
async function lookupEmails(userIds: string[]): Promise<string[]> {
  const admin = createAdminClient()
  const { data } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 })
  const map = new Map((data?.users ?? []).map(u => [u.id, u.email]))
  return userIds.map(id => map.get(id)).filter(Boolean) as string[]
}

// DESPUÉS (eficiente — una llamada por destinatario en paralelo):
async function lookupEmails(userIds: string[]): Promise<string[]> {
  const admin = createAdminClient()
  const results = await Promise.all(
    userIds.map(id => admin.auth.admin.getUserById(id))
  )
  return results
    .map(r => r.data?.user?.email)
    .filter((e): e is string => !!e)
}
```

- [ ] **Step 2: Soft delete en `deleteExpenseItem` (expenses.ts)**

```typescript
// ANTES:
export async function deleteExpenseItem(itemId: string) {
  const supabase = createClient()
  await supabase.from('expense_items').delete().eq('id', itemId)
}

// DESPUÉS:
export async function deleteExpenseItem(itemId: string) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Unauthorized')
  
  const profile = await getProfile(supabase, user.id)
  if (!profile) throw new Error('Unauthorized')
  
  await supabase
    .from('expense_items')
    .update({ deleted_at: new Date().toISOString(), deleted_by: user.id })
    .eq('id', itemId)
  
  revalidatePath('/expenses')
}
```

- [ ] **Step 3: Filtrar ítems borrados en todos los selects**

Buscar todos los lugares donde se hace `.from('expense_items').select(...)` y agregar `.is('deleted_at', null)`:

```bash
# Identificar ocurrencias
grep -n "from('expense_items')" src/actions/*.ts src/lib/*.ts
```

Los archivos afectados típicamente son: `expenses.ts`, `admin.ts`, `approvals.ts`, `fund-transfers.ts`, `petty-cash.ts`. En cada uno agregar `.is('deleted_at', null)` al select de ítems.

- [ ] **Step 4: Filtrar categorías borradas en selects**

```bash
grep -n "from('expense_categories')" src/actions/*.ts
```

Agregar `.is('deleted_at', null)` en todos los selects de categorías activas.

- [ ] **Step 5: TypeScript check**

```bash
npx tsc --noEmit
```

- [ ] **Step 6: Commit**

```
git add src/actions/notifications.ts src/actions/expenses.ts src/actions/admin.ts src/actions/approvals.ts
git commit -m "fix: soft delete expense_items + optimizar lookupEmails + filtrar deleted_at en selects"
```

---

### Task 5: Rate limiting para OCR y análisis IA

**Files:**
- Create: `src/lib/rate-limit.ts`
- Modify: `src/actions/ocr.ts`
- Modify: `src/actions/approvals.ts` (getOrGenerateApprovalAnalysis)

**Interfaces:**
- Produces: `checkRateLimit(userId, action, maxPerHour)` retorna `{ allowed: boolean; remaining: number }`

- [ ] **Step 1: Escribir test**

```typescript
// src/tests/rate-limit.test.ts
import { describe, it, expect, vi } from 'vitest'
import { buildDedupKey } from '@/lib/rate-limit'

describe('buildDedupKey', () => {
  it('genera clave determinista', () => {
    const key = buildDedupKey('draft_reminder', 'entity-123', '2026-08-11')
    expect(key).toBe('draft_reminder:entity-123:2026-08-11')
    expect(key.length).toBeLessThan(150)
  })
})
```

- [ ] **Step 2: Correr test (esperar fallo)**

```bash
npx vitest run src/tests/rate-limit.test.ts
```

- [ ] **Step 3: Implementar `src/lib/rate-limit.ts`**

```typescript
import { createAdminClient } from '@/lib/supabase/admin'

export function buildDedupKey(type: string, entityId: string, date: string): string {
  return `${type}:${entityId}:${date}`
}

export async function checkRateLimit(
  userId: string,
  action: string,
  maxPerHour: number
): Promise<{ allowed: boolean; remaining: number }> {
  const admin = createAdminClient()
  const windowStart = new Date(Date.now() - 60 * 60 * 1000).toISOString()

  // Contar llamadas en la última hora
  const { count } = await admin
    .from('rate_limit_log')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId)
    .eq('action', action)
    .gte('created_at', windowStart)

  const used = count ?? 0
  const allowed = used < maxPerHour

  if (allowed) {
    // Registrar esta llamada
    await admin.from('rate_limit_log').insert({ user_id: userId, action })
    // Limpiar registros > 2h (housekeeping)
    admin.from('rate_limit_log')
      .delete()
      .lt('created_at', new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString())
      .then(() => {}) // fire and forget
  }

  return { allowed, remaining: Math.max(0, maxPerHour - used - (allowed ? 1 : 0)) }
}
```

- [ ] **Step 4: Aplicar en `runOcr()` (ocr.ts)**

```typescript
export async function runOcr(imageBase64: string, mimeType: string) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Unauthorized')
  
  const { allowed, remaining } = await checkRateLimit(user.id, 'ocr', 30)
  if (!allowed) throw new Error(`Límite de OCR alcanzado. Intenta en una hora.`)
  
  // ... código existente de OCR
}
```

- [ ] **Step 5: Aplicar en `getOrGenerateApprovalAnalysis()` (approvals.ts)**

```typescript
const { allowed } = await checkRateLimit(user.id, 'ai_analysis', 20)
if (!allowed) {
  // Retornar el análisis cacheado si existe, sin regenerar
  const { data: existing } = await supabase
    .from('expense_reports').select('ai_analysis').eq('id', reportId).single()
  return existing?.ai_analysis ?? null
}
```

- [ ] **Step 6: Tests**

```bash
npx vitest run src/tests/rate-limit.test.ts
```
Expected: PASS

- [ ] **Step 7: TypeScript check**

```bash
npx tsc --noEmit
```

- [ ] **Step 8: Commit**

```
git add src/lib/rate-limit.ts src/tests/rate-limit.test.ts src/actions/ocr.ts src/actions/approvals.ts
git commit -m "feat: rate limiting para OCR (30/h) y análisis IA (20/h) por usuario"
```

---

## FASE 2 — Auditoría completa (Tasks 6–9)

> Requiere Fase 1 completa. `logAudit()` ya disponible desde Task 2.

---

### Task 6: Instrumentar borrados y restauraciones

**Files:**
- Modify: `src/actions/admin.ts` (deleteEmployee, restoreFromTrash, permanentlyDeleteFromTrash, deleteCategory)
- Modify: `src/actions/expenses.ts` (deleteExpenseItem, adminDeleteExpenseReport, deleteExpenseReport)
- Modify: `src/actions/petty-cash.ts` (deletePettyCashFund)
- Modify: `src/actions/policies.ts` (deletePolicy, deleteTravelPolicy)

**Pattern a seguir en cada función:**

```typescript
// Antes de la operación: capturar estado actual
const { data: before } = await supabase.from('tabla').select('*').eq('id', id).single()

// Operación
await supabase.from('tabla').update({ deleted_at: now, deleted_by: userId }).eq('id', id)

// Audit
await logAudit({
  orgId:       profile.org_id,
  actorId:     userId,
  actorName:   profile.full_name,
  action:      'deleted',
  entityType:  'expense_report', // ajustar por entidad
  entityId:    id,
  entityLabel: before?.title ?? before?.id,
  oldValue:    before as Record<string, unknown>,
})
```

- [ ] **Step 1: Instrumentar `deleteEmployee` (admin.ts)**

```typescript
// Capturar before
const { data: emp } = await supabase.from('users').select('*').eq('id', userId_target).single()
// ... operación de borrado/desactivación existente ...
await logAudit({
  orgId: profile.org_id, actorId: currentUserId, actorName: profile.full_name,
  action: 'deleted', entityType: 'user', entityId: userId_target,
  entityLabel: emp?.full_name ?? userId_target,
  oldValue: { is_active: emp?.is_active, role: emp?.role },
})
```

- [ ] **Step 2: Instrumentar `restoreFromTrash` y `permanentlyDeleteFromTrash` (admin.ts)**

```typescript
// restoreFromTrash
await logAudit({ ..., action: 'restored', entityType: 'expense_report', ... })

// permanentlyDeleteFromTrash
await logAudit({ ..., action: 'permanently_deleted', entityType: 'expense_report',
  notes: 'Eliminación definitiva desde papelera', ... })
```

- [ ] **Step 3: Instrumentar `adminDeleteExpenseReport` y `deleteExpenseReport` (expenses.ts)**

- [ ] **Step 4: Instrumentar `deletePettyCashFund` (petty-cash.ts)**

- [ ] **Step 5: Instrumentar `deleteCategory` + `deletePolicy` + `deleteTravelPolicy`**

```typescript
await logAudit({
  ..., action: 'deleted', entityType: 'category', // o 'policy', 'travel_policy'
  entityId: id, entityLabel: category.name,
  oldValue: category as Record<string, unknown>,
})
```

- [ ] **Step 6: TypeScript check**

```bash
npx tsc --noEmit
```

- [ ] **Step 7: Commit**

```
git add src/actions/admin.ts src/actions/expenses.ts src/actions/petty-cash.ts src/actions/policies.ts
git commit -m "feat: audit_log en todas las operaciones de borrado y restauración"
```

---

### Task 7: Instrumentar cambios de configuración

**Files:**
- Modify: `src/actions/admin.ts` (updateEmployee, setEmployeeApprovers, setEmployeeBackupApprover, updateDefontanaSettings, updateCategory, addCategory, bulkUpdateExpenseItemsCostCenter, reclassifyExpenseItem, addDefontanaSupplier, deleteDefontanaSupplier)
- Modify: `src/actions/policies.ts` (createPolicy, updatePolicy, createTravelPolicy, updateTravelPolicy)

**Pattern para updates:**

```typescript
// Capturar estado antes
const { data: before } = await supabase.from('users').select('*').eq('id', id).single()
// Hacer el update
const { data: after } = await supabase.from('users').update(updates).eq('id', id).select().single()
// Audit con before/after
await logAudit({
  orgId: profile.org_id, actorId: userId, actorName: profile.full_name,
  action: 'updated', entityType: 'user', entityId: id,
  entityLabel: before?.full_name,
  oldValue: before as Record<string, unknown>,
  newValue: after  as Record<string, unknown>,
})
```

- [ ] **Step 1: Instrumentar `setEmployeeApprovers` (cambio de cadena de aprobación)**

```typescript
await logAudit({
  ..., action: 'config_changed', entityType: 'approver_assignment',
  entityId: employeeId, entityLabel: employee.full_name,
  oldValue: { approver_l1_id: employee.approver_l1_id, approver_l2_id: employee.approver_l2_id },
  newValue: { approver_l1_id: params.l1Id, approver_l2_id: params.l2Id },
})
```

- [ ] **Step 2: Instrumentar `updateDefontanaSettings`**

```typescript
await logAudit({
  ..., action: 'config_changed', entityType: 'defontana_settings',
  entityId: orgId, entityLabel: 'Configuración Defontana',
  oldValue: settingsBefore, newValue: settingsAfter,
})
```

- [ ] **Step 3: Instrumentar `updateCategory` y `addCategory`**

- [ ] **Step 4: Instrumentar `bulkUpdateExpenseItemsCostCenter`**

```typescript
await logAudit({
  ..., action: 'bulk_updated', entityType: 'cost_center_assignment',
  entityId: reportId, entityLabel: `Reporte ${reportId}`,
  newValue: { cost_center_id: ccId, items_count: updatedCount },
  notes: `Reasignación masiva de CC a ${ccId}`,
})
```

- [ ] **Step 5: Instrumentar `reclassifyExpenseItem`**

- [ ] **Step 6: TypeScript check + Commit**

```bash
npx tsc --noEmit
git add src/actions/admin.ts src/actions/policies.ts
git commit -m "feat: audit_log en cambios de configuración, cadenas de aprobación y reclasificaciones"
```

---

### Task 8: Vista `/admin/auditoria`

**Files:**
- Create: `src/app/(app)/admin/auditoria/page.tsx`
- Modify: `src/actions/admin.ts` (nueva `getAuditLog(filters)`)
- Modify: `src/components/layout/Sidebar.tsx` (agregar entrada "Auditoría")

**Interfaces:**
- Consumes: tabla `audit_log` via `getAuditLog()`
- Produces: tabla filtrable en UI + export Excel

- [ ] **Step 1: Agregar `getAuditLog` en admin.ts**

```typescript
export type AuditLogFilters = {
  actorId?:    string
  entityType?: string
  action?:     string
  from?:       string  // YYYY-MM-DD
  to?:         string
  search?:     string  // busca en entity_label y notes
  limit?:      number
  offset?:     number
}

export async function getAuditLog(filters: AuditLogFilters = {}) {
  const { orgId } = await requireAdmin()
  const admin = createAdminClient()
  
  let q = admin
    .from('audit_log')
    .select('*', { count: 'exact' })
    .eq('org_id', orgId)
    .order('created_at', { ascending: false })
    .limit(filters.limit ?? 50)
  
  if (filters.offset)     q = q.range(filters.offset, filters.offset + (filters.limit ?? 50) - 1)
  if (filters.actorId)    q = q.eq('actor_id', filters.actorId)
  if (filters.entityType) q = q.eq('entity_type', filters.entityType)
  if (filters.action)     q = q.eq('action', filters.action)
  if (filters.from)       q = q.gte('created_at', `${filters.from}T00:00:00Z`)
  if (filters.to)         q = q.lte('created_at', `${filters.to}T23:59:59Z`)
  if (filters.search)     q = q.or(`entity_label.ilike.%${filters.search}%,notes.ilike.%${filters.search}%,actor_name.ilike.%${filters.search}%`)
  
  const { data, count } = await q
  return { items: data ?? [], total: count ?? 0 }
}
```

- [ ] **Step 2: Crear `src/app/(app)/admin/auditoria/page.tsx`**

Server Component que precarga la primera página y los filtros disponibles:

```typescript
import { getAuditLog } from '@/actions/admin'
import { AuditoriaClient } from './client'

export const metadata = { title: 'Auditoría · Mi Rendición' }

export default async function AuditoriaPage() {
  const { items, total } = await getAuditLog({ limit: 50 })
  return <AuditoriaClient initial={items} total={total} />
}
```

- [ ] **Step 3: Crear `src/app/(app)/admin/auditoria/client.tsx`**

Client Component con:
- Filtros: fecha (desde/hasta), actor (dropdown empleados), tipo de entidad (select), acción (select)
- Tabla: fecha, quién, acción (badge coloreado), entidad, descripción
- Toggle "Ver detalles" por fila: expande `old_value` / `new_value` como JSON formateado
- Botón export Excel (solo las filas filtradas)

**Colores de acción:**
```typescript
const ACTION_COLORS: Record<string, string> = {
  deleted:             'bg-red-100 text-red-700',
  permanently_deleted: 'bg-red-200 text-red-800',
  restored:            'bg-green-100 text-green-700',
  created:             'bg-teal-100 text-teal-700',
  updated:             'bg-blue-100 text-blue-700',
  bulk_updated:        'bg-purple-100 text-purple-700',
  config_changed:      'bg-amber-100 text-amber-700',
  exported:            'bg-gray-100 text-gray-700',
}
```

- [ ] **Step 4: Agregar entrada en Sidebar**

En `src/components/layout/Sidebar.tsx`, agregar después de "Papelera":

```typescript
{ href: '/admin/auditoria', label: 'Auditoría', icon: Shield, adminOnly: true }
```

Import: `import { Shield } from 'lucide-react'`

- [ ] **Step 5: TypeScript check**

```bash
npx tsc --noEmit
```

- [ ] **Step 6: Commit**

```
git add src/app/(app)/admin/auditoria/ src/actions/admin.ts src/components/layout/Sidebar.tsx
git commit -m "feat: módulo de auditoría — getAuditLog + vista /admin/auditoria con filtros y export"
```

---

## FASE 3 — Robustez (Tasks 9–13)

---

### Task 9: Cron — deduplicación de recordatorios

**Files:**
- Modify: `src/app/api/cron/reminders/route.ts`

**Problema:** el cron inserta notificaciones duplicadas cada día para el mismo problema sin verificar si ya envió hoy. Además tiene un fallback inseguro si `CRON_SECRET` no está configurado.

- [ ] **Step 1: Fix cron secret inseguro**

```typescript
// ANTES (inseguro):
const secret = request.headers.get('authorization')
if (!secret) return true  // ← permite pasar si no hay secret

// DESPUÉS:
const secret = request.headers.get('authorization')
const expected = `Bearer ${process.env.CRON_SECRET}`
if (!process.env.CRON_SECRET || secret !== expected) {
  return new Response('Unauthorized', { status: 401 })
}
```

- [ ] **Step 2: Implementar deduplicación con dedup_key**

La columna `dedup_key` (Task 1) tiene unique constraint por `(org_id, dedup_key)`.

```typescript
// En lugar de .insert(), usar .upsert() con onConflict
const today = new Date().toISOString().split('T')[0]  // YYYY-MM-DD

// Ejemplo para draft reminder:
const dedupKey = `draft_reminder:${report.id}:${today}`

const { error } = await supabase.from('notifications').upsert({
  org_id:    orgId,
  user_id:   report.submitter_id,
  type:      'draft_reminder',
  title:     'Tienes una rendición sin enviar',
  message:   `"${report.title}" lleva más de 7 días como borrador.`,
  dedup_key: dedupKey,
  report_id: report.id,
}, { onConflict: 'org_id,dedup_key', ignoreDuplicates: true })

// Si ignoreDuplicates=true y la clave ya existe → no inserta, no error
```

Aplicar el mismo patrón para los 3 tipos de recordatorio: draft, fondo saldo bajo, rendición sin aprobar.

- [ ] **Step 3: Commit**

```
git add src/app/api/cron/reminders/route.ts
git commit -m "fix: cron secret seguro + deduplicación de recordatorios por dedup_key diario"
```

---

### Task 10: Detección de rendiciones duplicadas

**Files:**
- Create: `src/lib/duplicate-detection.ts`
- Modify: `src/actions/expenses.ts` (addExpenseItem — agregar check)
- Modify: `src/components/expenses/ExpenseItemForm.tsx` (mostrar warning)

**Interfaces:**
- Produces: `checkDuplicateItem(params)` retorna `DuplicateMatch | null`; banner ámbar en el form

- [ ] **Step 1: Escribir test**

```typescript
// src/tests/duplicate-detection.test.ts
import { describe, it, expect } from 'vitest'
import { normalizeMerchant } from '@/lib/duplicate-detection'

describe('normalizeMerchant', () => {
  it('normaliza mayúsculas y tildes', () =>
    expect(normalizeMerchant('RESTAURANT EL RINCÓN')).toBe('restaurant el rincon'))
  it('elimina caracteres especiales', () =>
    expect(normalizeMerchant('COPEC S.A.')).toBe('copec sa'))
})
```

- [ ] **Step 2: Implementar `src/lib/duplicate-detection.ts`**

```typescript
export function normalizeMerchant(name: string): string {
  return name
    .toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')  // quitar tildes
    .replace(/[^a-z0-9\s]/g, '')                        // solo alfanumérico
    .replace(/\s+/g, ' ')
    .trim()
}

export interface DuplicateMatch {
  reportId:    string
  reportTitle: string
  itemId:      string
  date:        string
  amount:      number
  merchant:    string
}
```

- [ ] **Step 3: Agregar `checkDuplicateExpenseItem` en expenses.ts**

```typescript
export async function checkDuplicateExpenseItem(params: {
  submitterId: string
  orgId:       string
  amountClp:   number
  merchant:    string
  date:        string
}): Promise<DuplicateMatch | null> {
  const supabase = createClient()
  const rangeFrom = new Date(new Date(params.date).getTime() - 7 * 86400000).toISOString().split('T')[0]
  const rangeTo   = new Date(new Date(params.date).getTime() + 7 * 86400000).toISOString().split('T')[0]
  
  const { data: items } = await supabase
    .from('expense_items')
    .select('id, merchant, amount_clp, date, expense_report:expense_reports(id, title, submitter_id)')
    .gte('date', rangeFrom)
    .lte('date', rangeTo)
    .eq('amount_clp', params.amountClp)
    .is('deleted_at', null)
  
  if (!items?.length) return null
  
  const normTarget = normalizeMerchant(params.merchant)
  
  for (const item of items) {
    const report = (item.expense_report as { id: string; title: string; submitter_id: string } | null)
    if (!report || report.submitter_id !== params.submitterId) continue
    if (normalizeMerchant(item.merchant ?? '') === normTarget) {
      return {
        reportId:    report.id,
        reportTitle: report.title,
        itemId:      item.id,
        date:        item.date,
        amount:      item.amount_clp,
        merchant:    item.merchant ?? '',
      }
    }
  }
  return null
}
```

- [ ] **Step 4: Agregar banner ámbar en `ExpenseItemForm.tsx`**

```typescript
// Al guardar el ítem, antes de llamar addExpenseItem:
const duplicate = await checkDuplicateExpenseItem({
  submitterId: currentUser.id,
  orgId:       profile.org_id,
  amountClp:   item.amount_clp,
  merchant:    item.merchant ?? '',
  date:        item.date,
})

if (duplicate) {
  // Mostrar confirm dialog, no bloquear
  const proceed = confirm(
    `Posible duplicado detectado: ya existe un ítem de $${formatCLP(duplicate.amount)} ` +
    `en "${duplicate.reportTitle}" del ${formatDate(duplicate.date)}.\n\n¿Continuar de todas formas?`
  )
  if (!proceed) return
}
```

- [ ] **Step 5: Tests + TypeScript check + Commit**

```bash
npx vitest run src/tests/duplicate-detection.test.ts
npx tsc --noEmit
git add src/lib/duplicate-detection.ts src/tests/duplicate-detection.test.ts src/actions/expenses.ts src/components/expenses/ExpenseItemForm.tsx
git commit -m "feat: detección de ítems duplicados con ventana ±7 días + normalización de merchant"
```

---

### Task 11: Presupuesto mensual por categoría

**Files:**
- Modify: `src/app/(app)/admin/settings/page.tsx` (campo monthly_budget_clp en edición de categoría)
- Modify: `src/actions/admin.ts` (updateCategory — incluir monthly_budget_clp)
- Modify: `src/app/(app)/admin/analisis/page.tsx` (barra de ejecución vs presupuesto)

**Interfaces:**
- Consumes: `expense_categories.monthly_budget_clp` (Task 1)
- Produces: campo editable en settings; barra de progreso en /admin/analisis

- [ ] **Step 1: Agregar campo en edición de categoría (settings/page.tsx)**

En el formulario de edición de categoría, agregar después del campo de código Defontana:

```tsx
<div>
  <label className="block text-sm font-medium text-ink-700 mb-1">
    Presupuesto mensual (CLP, opcional)
  </label>
  <input
    type="number"
    min="0"
    step="1000"
    value={editingCategory.monthly_budget_clp ?? ''}
    onChange={e => setEditingCategory(prev => ({
      ...prev!,
      monthly_budget_clp: e.target.value ? Number(e.target.value) : null
    }))}
    placeholder="Sin límite"
    className="w-full border border-ink-200 rounded-item px-3 py-2 text-sm"
  />
  <p className="text-xs text-ink-400 mt-1">
    Si se define, aparecerá una barra de ejecución en el análisis por categoría.
  </p>
</div>
```

- [ ] **Step 2: Incluir `monthly_budget_clp` en `updateCategory` (admin.ts)**

```typescript
await supabase.from('expense_categories').update({
  name:                   data.name,
  color:                  data.color,
  icon:                   data.icon,
  defontana_account_code: data.defontana_account_code,
  monthly_budget_clp:     data.monthly_budget_clp ?? null,  // ← AGREGAR
}).eq('id', id)
```

- [ ] **Step 3: Mostrar barra de ejecución en /admin/analisis**

En la tabla pivot de `/admin/analisis`, agregar columna "Presupuesto mensual" con barra de progreso:

```tsx
{cat.monthly_budget_clp ? (
  <div>
    <div className="flex justify-between text-xs mb-1">
      <span>{Math.round((catTotal / cat.monthly_budget_clp) * 100)}%</span>
      <span className="text-ink-400">{formatCLP(cat.monthly_budget_clp)}</span>
    </div>
    <div className="h-1.5 bg-ink-100 rounded-full overflow-hidden">
      <div
        className={`h-full rounded-full ${
          catTotal > cat.monthly_budget_clp ? 'bg-red-500' :
          catTotal > cat.monthly_budget_clp * 0.8 ? 'bg-amber-500' : 'bg-brand-500'
        }`}
        style={{ width: `${Math.min(100, (catTotal / cat.monthly_budget_clp) * 100)}%` }}
      />
    </div>
  </div>
) : <span className="text-ink-300 text-xs">—</span>}
```

- [ ] **Step 4: TypeScript check + Commit**

```bash
npx tsc --noEmit
git add src/app/(app)/admin/settings/page.tsx src/actions/admin.ts src/app/(app)/admin/analisis/
git commit -m "feat: presupuesto mensual por categoría — campo en settings + barra de ejecución en analisis"
```

---

### Task 12: Validación de inputs endurecida

**Files:**
- Modify: `src/actions/admin.ts` (addCategory, updateCategory)
- Modify: `src/actions/suggestions.ts` (submitSuggestion)
- Modify: `src/actions/profile.ts` (updateProfile)
- Modify: `src/actions/petty-cash.ts` (createPettyCashFund)
- Modify: `src/actions/policies.ts` (addPolicy, createTravelPolicy)
- Modify: `src/actions/employees.ts` (setEmployeePassword)

**Consumes:** `src/lib/validators.ts` (Task 2)

- [ ] **Step 1: Aplicar validadores en `addCategory` / `updateCategory` (admin.ts)**

```typescript
import { validateStringLength, validateHexColor } from '@/lib/validators'

// Dentro de addCategory / updateCategory:
if (!validateStringLength(data.name, 100)) throw new Error('Nombre inválido (1-100 caracteres)')
if (data.color && !validateHexColor(data.color)) throw new Error('Color inválido — debe ser hex (#RRGGBB)')
```

- [ ] **Step 2: Validar `submitSuggestion`**

```typescript
if (!validateStringLength(content, 5000)) throw new Error('El contenido debe tener entre 1 y 5000 caracteres')
```

- [ ] **Step 3: Validar `updateProfile`**

```typescript
import { validateRut, validateStringLength } from '@/lib/validators'

if (data.full_name && !validateStringLength(data.full_name, 150)) throw new Error('Nombre demasiado largo')
if (data.rut && !validateRut(data.rut)) throw new Error('RUT inválido — revisa el dígito verificador')
if (data.bank_account && !validateStringLength(data.bank_account, 30)) throw new Error('Número de cuenta inválido')
```

- [ ] **Step 4: Validar `createPettyCashFund`**

```typescript
import { validateStringLength, validateDateRange } from '@/lib/validators'

if (!validateStringLength(data.name, 200)) throw new Error('Nombre requerido (máx 200 caracteres)')
if (data.period_start && data.period_end && !validateDateRange(data.period_start, data.period_end)) {
  throw new Error('La fecha de fin debe ser posterior a la fecha de inicio')
}
```

- [ ] **Step 5: Validar contraseña con complejidad en `setEmployeePassword`**

```typescript
function validatePassword(pwd: string): string | null {
  if (pwd.length < 8)                return 'Mínimo 8 caracteres'
  if (!/[A-Z]/.test(pwd))            return 'Debe incluir al menos una mayúscula'
  if (!/[0-9]/.test(pwd))            return 'Debe incluir al menos un número'
  return null
}

const error = validatePassword(newPassword)
if (error) throw new Error(error)
```

- [ ] **Step 6: TypeScript check + Commit**

```bash
npx tsc --noEmit
git add src/actions/admin.ts src/actions/suggestions.ts src/actions/profile.ts src/actions/petty-cash.ts src/actions/policies.ts src/actions/employees.ts
git commit -m "feat: validación de inputs — RUT, longitud, fechas, contraseña compleja"
```

---

### Task 13: PDF descargable para el empleado

**Files:**
- Modify: `src/lib/export/pdf.ts` (nueva función `exportEmployeeReportPdf`)
- Modify: `src/app/(app)/expenses/[id]/page.tsx` o su client component (botón de descarga)

**Interfaces:**
- Produces: función `exportEmployeeReportPdf(report, items)` que genera Blob descargable; botón en la vista del empleado

- [ ] **Step 1: Implementar `exportEmployeeReportPdf` en pdf.ts**

```typescript
import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'
import { formatCLP, formatDate } from '@/lib/utils'
import type { ExpenseReport, ExpenseItem, ExpenseCategory } from '@/lib/supabase/types'

export function exportEmployeeReportPdf(
  report: ExpenseReport & { submitter_name?: string },
  items:  (ExpenseItem & { category_name?: string })[],
): void {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })
  const teal = [13, 148, 136] as [number, number, number]
  
  // Encabezado
  doc.setFillColor(...teal)
  doc.rect(0, 0, 210, 36, 'F')
  doc.setTextColor(255, 255, 255)
  doc.setFontSize(18)
  doc.setFont('helvetica', 'bold')
  doc.text('Mi Rendición', 14, 16)
  doc.setFontSize(11)
  doc.setFont('helvetica', 'normal')
  doc.text('Comprobante de rendición de gastos', 14, 24)
  
  // Datos de la rendición
  doc.setTextColor(30, 37, 64)
  doc.setFontSize(14)
  doc.setFont('helvetica', 'bold')
  doc.text(report.title, 14, 48)
  
  doc.setFontSize(9)
  doc.setFont('helvetica', 'normal')
  doc.setTextColor(136, 145, 167)
  doc.text(`Empleado: ${report.submitter_name ?? '—'}`, 14, 56)
  doc.text(`Estado: ${report.status}`, 14, 61)
  doc.text(`Fecha: ${formatDate(report.created_at.split('T')[0])}`, 14, 66)
  
  // Tabla de ítems
  const approvedItems  = items.filter(i => i.item_status === 'approved'  && !i.deleted_at)
  const rejectedItems  = items.filter(i => i.item_status === 'rejected'  && !i.deleted_at)
  const pendingItems   = items.filter(i => i.item_status === 'pending'   && !i.deleted_at)
  
  const rows = [...approvedItems, ...pendingItems, ...rejectedItems].map(item => [
    formatDate(item.date),
    item.merchant ?? '—',
    item.description,
    item.category_name ?? '—',
    formatCLP(item.amount_clp),
    item.item_status === 'approved' ? '✓ Aprobado' :
    item.item_status === 'rejected' ? '✗ Rechazado' : '⏳ Pendiente',
  ])
  
  autoTable(doc, {
    startY: 76,
    head: [['Fecha', 'Proveedor', 'Descripción', 'Categoría', 'Monto', 'Estado']],
    body: rows,
    styles: { fontSize: 8, cellPadding: 3 },
    headStyles: { fillColor: teal, textColor: 255, fontStyle: 'bold' },
    columnStyles: { 4: { halign: 'right', font: 'courier' } },
    alternateRowStyles: { fillColor: [246, 248, 251] },
  })
  
  // Totales
  const finalY = (doc as any).lastAutoTable.finalY + 8
  const totalApproved = approvedItems.reduce((s, i) => s + i.amount_clp, 0)
  const totalAll      = items.filter(i => !i.deleted_at).reduce((s, i) => s + i.amount_clp, 0)
  
  doc.setFontSize(10)
  doc.setFont('helvetica', 'bold')
  doc.setTextColor(30, 37, 64)
  doc.text('Total aprobado:', 130, finalY)
  doc.setTextColor(...teal)
  doc.text(formatCLP(totalApproved), 196, finalY, { align: 'right' })
  
  doc.setTextColor(136, 145, 167)
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(8)
  doc.text(`Total presentado: ${formatCLP(totalAll)}`, 130, finalY + 6)
  
  // Pie de página
  doc.setFontSize(7)
  doc.setTextColor(136, 145, 167)
  doc.text(
    `Generado por Mi Rendición · ${new Date().toLocaleDateString('es-CL')}`,
    105, 287, { align: 'center' }
  )
  
  doc.save(`rendicion-${report.id.slice(-8)}.pdf`)
}
```

- [ ] **Step 2: Agregar botón en la vista del empleado**

En `src/app/(app)/expenses/[id]/` (client component), agregar botón junto a los controles existentes:

```tsx
import { exportEmployeeReportPdf } from '@/lib/export/pdf'
import { Download } from 'lucide-react'

// En el JSX, condicionalmente si el reporte no es draft:
{report.status !== 'draft' && (
  <button
    onClick={() => exportEmployeeReportPdf(report, items)}
    className="inline-flex items-center gap-2 px-3 py-2 text-sm font-semibold text-ink-700 bg-white border border-ink-200 rounded-item hover:bg-ink-50 transition-colors"
  >
    <Download size={14} />
    Descargar PDF
  </button>
)}
```

- [ ] **Step 3: TypeScript check + Commit**

```bash
npx tsc --noEmit
git add src/lib/export/pdf.ts src/app/(app)/expenses/
git commit -m "feat: PDF descargable para empleado — resumen de rendición con ítems y totales"
```

---

## FASE 4 — Nuevas funcionalidades (Tasks 14–18)

---

### Task 14: Notificaciones en tiempo real (Supabase Realtime)

**Files:**
- Create: `src/hooks/useRealtimeNotifications.ts`
- Modify: `src/app/(app)/layout.tsx` (usar el hook)

**Interfaces:**
- Produces: badge del icono de notificaciones se actualiza en tiempo real; toast para notificaciones urgentes

- [ ] **Step 1: Crear `src/hooks/useRealtimeNotifications.ts`**

```typescript
'use client'
import { useEffect, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'
import type { RealtimeChannel } from '@supabase/supabase-js'

export function useRealtimeNotifications(
  userId: string | null,
  onNew: (notification: { title: string; message: string; type: string }) => void
) {
  const channelRef = useRef<RealtimeChannel | null>(null)
  
  useEffect(() => {
    if (!userId) return
    
    const supabase = createClient()
    channelRef.current = supabase
      .channel(`notifications:${userId}`)
      .on(
        'postgres_changes',
        {
          event:  'INSERT',
          schema: 'public',
          table:  'notifications',
          filter: `user_id=eq.${userId}`,
        },
        payload => {
          const n = payload.new as { title: string; message: string; type: string }
          onNew(n)
        }
      )
      .subscribe()
    
    return () => {
      channelRef.current?.unsubscribe()
    }
  }, [userId, onNew])
}
```

- [ ] **Step 2: Modificar `src/app/(app)/layout.tsx`**

```typescript
'use client'
// (convertir el layout a Client Component o extraer el hook a un sub-componente)

// Si layout.tsx es Server Component, crear un componente hijo:
// src/app/(app)/RealtimeProvider.tsx

'use client'
import { useCallback, useState } from 'react'
import { useRealtimeNotifications } from '@/hooks/useRealtimeNotifications'
import { toast } from 'sonner'  // o implementar un toast simple

export function RealtimeProvider({ userId, children }: { userId: string | null; children: React.ReactNode }) {
  const handleNew = useCallback((n: { title: string; message: string; type: string }) => {
    // Mostrar toast
    toast(n.title, { description: n.message })
    // El badge de notificaciones se recarga en la próxima visita a la página
    // Para actualización inmediata del counter, emitir un CustomEvent:
    window.dispatchEvent(new CustomEvent('notification:new'))
  }, [])
  
  useRealtimeNotifications(userId, handleNew)
  return <>{children}</>
}
```

En `layout.tsx`:
```typescript
<RealtimeProvider userId={profile?.id ?? null}>
  {children}
</RealtimeProvider>
```

- [ ] **Step 3: Verificar que RLS en `notifications` permite SELECT del usuario propio**

En Supabase: la política `notifications_select` debe tener `user_id = auth.uid()`. Verificar que está configurada correctamente.

- [ ] **Step 4: TypeScript check + Commit**

```bash
npx tsc --noEmit
git add src/hooks/useRealtimeNotifications.ts src/app/(app)/layout.tsx src/app/(app)/RealtimeProvider.tsx
git commit -m "feat: notificaciones en tiempo real via Supabase Realtime + toast automático"
```

---

### Task 15: Dashboard de salud operacional

**Files:**
- Modify: `src/actions/admin.ts` (nueva `getOrgHealthMetrics()`)
- Modify: `src/app/(app)/admin/page.tsx` (agregar sección de métricas)

- [ ] **Step 1: Implementar `getOrgHealthMetrics` en admin.ts**

```typescript
export async function getOrgHealthMetrics() {
  const { orgId } = await requireAdmin()
  const supabase = createClient()
  const admin    = createAdminClient()
  const now = new Date()
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 86400000).toISOString()
  const sixMonthsAgo  = new Date(now.getTime() - 182 * 86400000).toISOString()
  
  // Rendiciones aprobadas vs rechazadas (últimos 30 días)
  const [approved, rejected, pending] = await Promise.all([
    supabase.from('expense_reports').select('id', { count: 'exact', head: true })
      .eq('org_id', orgId).eq('status', 'approved').gte('updated_at', thirtyDaysAgo).is('deleted_at', null),
    supabase.from('expense_reports').select('id', { count: 'exact', head: true })
      .eq('org_id', orgId).eq('status', 'rejected').gte('updated_at', thirtyDaysAgo).is('deleted_at', null),
    supabase.from('expense_reports').select('id', { count: 'exact', head: true })
      .eq('org_id', orgId).in('status', ['submitted', 'pending_l2']).is('deleted_at', null),
  ])
  
  // Empleados sin actividad en 30 días
  const { data: activeUsers } = await supabase
    .from('expense_reports')
    .select('submitter_id')
    .eq('org_id', orgId)
    .gte('created_at', thirtyDaysAgo)
    .is('deleted_at', null)
  const activeUserIds = new Set((activeUsers ?? []).map(r => r.submitter_id))
  
  const { data: allUsers } = await supabase
    .from('users').select('id, full_name').eq('org_id', orgId).eq('is_active', true).eq('role', 'employee')
  const inactiveUsers = (allUsers ?? []).filter(u => !activeUserIds.has(u.id))
  
  // Tiempo promedio de aprobación (días)
  const { data: recentApproved } = await supabase
    .from('expense_reports')
    .select('created_at, updated_at')
    .eq('org_id', orgId).eq('status', 'approved')
    .gte('updated_at', sixMonthsAgo).is('deleted_at', null)
    .limit(100)
  
  const avgDays = recentApproved?.length
    ? recentApproved.reduce((sum, r) => {
        const ms = new Date(r.updated_at).getTime() - new Date(r.created_at).getTime()
        return sum + ms / 86400000
      }, 0) / recentApproved.length
    : null
  
  return {
    last30Days: {
      approved:  approved.count  ?? 0,
      rejected:  rejected.count  ?? 0,
      pending:   pending.count   ?? 0,
      approvalRate: approved.count && rejected.count
        ? Math.round((approved.count! / (approved.count! + rejected.count!)) * 100)
        : null,
    },
    avgApprovalDays: avgDays ? Math.round(avgDays * 10) / 10 : null,
    inactiveEmployees: inactiveUsers.slice(0, 5),
    inactiveCount: inactiveUsers.length,
  }
}
```

- [ ] **Step 2: Agregar sección en `/admin/page.tsx`**

Después de los KPIs existentes, agregar un bloque "Salud operacional":

```tsx
// Métricas de salud — mostrar como cards en fila
<div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mt-6">
  <HealthCard
    label="Tasa de aprobación"
    value={metrics.last30Days.approvalRate != null ? `${metrics.last30Days.approvalRate}%` : '—'}
    sub="últimos 30 días"
    color={metrics.last30Days.approvalRate > 80 ? 'green' : 'amber'}
  />
  <HealthCard
    label="Tiempo promedio aprobación"
    value={metrics.avgApprovalDays != null ? `${metrics.avgApprovalDays} días` : '—'}
    color={metrics.avgApprovalDays < 3 ? 'green' : metrics.avgApprovalDays < 7 ? 'amber' : 'red'}
  />
  <HealthCard
    label="En espera de aprobación"
    value={String(metrics.last30Days.pending)}
    color={metrics.last30Days.pending > 10 ? 'red' : 'neutral'}
  />
  <HealthCard
    label="Empleados sin actividad"
    value={String(metrics.inactiveCount)}
    sub="en 30 días"
    color={metrics.inactiveCount > 5 ? 'amber' : 'neutral'}
  />
</div>
```

- [ ] **Step 3: TypeScript check + Commit**

```bash
npx tsc --noEmit
git add src/actions/admin.ts src/app/(app)/admin/page.tsx
git commit -m "feat: dashboard salud operacional — tasa aprobación, tiempo promedio, empleados inactivos"
```

---

### Task 16: Validación RUT SII en tiempo real

**Files:**
- Create: `src/lib/sii-validator.ts`
- Modify: `src/components/expenses/ExpenseItemForm.tsx` (badge de RUT en campo supplier_rut)
- Modify: `src/actions/expenses.ts` (validar formato RUT en addExpenseItem)
- Create: `src/tests/sii-validator.test.ts`

- [ ] **Step 1: Test**

```typescript
// src/tests/sii-validator.test.ts
import { describe, it, expect } from 'vitest'
import { validateRutFormat, formatRutDisplay } from '@/lib/sii-validator'

describe('validateRutFormat', () => {
  it('acepta RUTs válidos', () => {
    expect(validateRutFormat('76349816-6')).toBe(true)
    expect(validateRutFormat('12.345.678-9')).toBe(false)  // dígito incorrecto
    expect(validateRutFormat('15381452-K')).toBe(true)
  })
})

describe('formatRutDisplay', () => {
  it('formatea correctamente', () => {
    expect(formatRutDisplay('76349816-6')).toBe('76.349.816-6')
  })
})
```

- [ ] **Step 2: Implementar `src/lib/sii-validator.ts`**

```typescript
import { validateRut } from '@/lib/validators'

export function validateRutFormat(rut: string): boolean {
  return validateRut(rut)
}

export function formatRutDisplay(rut: string): string {
  const clean = rut.replace(/\./g, '').replace(/-/g, '')
  if (clean.length < 2) return rut
  const body  = clean.slice(0, -1)
  const digit = clean.slice(-1)
  const formatted = body.replace(/\B(?=(\d{3})+(?!\d))/g, '.')
  return `${formatted}-${digit}`
}

export type RutValidationResult =
  | { valid: true;  formatted: string }
  | { valid: false; error: string }

export function validateAndFormatRut(rut: string): RutValidationResult {
  if (!rut || rut.trim() === '') return { valid: false, error: 'RUT requerido' }
  const normalized = rut.trim().toUpperCase().replace(/\./g, '')
  if (!validateRut(normalized)) return { valid: false, error: 'RUT inválido — revisa el dígito verificador' }
  return { valid: true, formatted: formatRutDisplay(normalized) }
}
```

**Nota:** La API pública del SII para verificar nombre de empresa requiere scraping o acceso privado. Por ahora la validación es solo del formato y dígito verificador. En una futura iteración se puede agregar una llamada al servicio de contribuyentes del SII.

- [ ] **Step 3: Badge de validación en `ExpenseItemForm.tsx`**

En el campo `supplier_rut` (solo visible cuando `doc_type` es `factura` o `factura_exenta`):

```tsx
const rutValidation = supplierRut ? validateAndFormatRut(supplierRut) : null

<div>
  <label className="block text-sm font-medium text-ink-700 mb-1">
    RUT Proveedor
    {doc_type === 'factura' && <span className="text-red-500 ml-1">*</span>}
  </label>
  <div className="relative">
    <input
      value={supplierRut}
      onChange={e => setSupplierRut(e.target.value)}
      placeholder="76.349.816-6"
      className="w-full border border-ink-200 rounded-item px-3 py-2 text-sm pr-8"
    />
    {rutValidation && (
      <span className="absolute right-2 top-1/2 -translate-y-1/2 text-xs">
        {rutValidation.valid ? '✓' : '✗'}
      </span>
    )}
  </div>
  {rutValidation && !rutValidation.valid && (
    <p className="text-xs text-red-600 mt-1">{rutValidation.error}</p>
  )}
  {rutValidation?.valid && (
    <p className="text-xs text-teal-600 mt-1">RUT válido: {rutValidation.formatted}</p>
  )}
</div>
```

- [ ] **Step 4: Tests + TypeScript + Commit**

```bash
npx vitest run src/tests/sii-validator.test.ts
npx tsc --noEmit
git add src/lib/sii-validator.ts src/tests/sii-validator.test.ts src/components/expenses/ExpenseItemForm.tsx src/actions/expenses.ts
git commit -m "feat: validación RUT chileno (dígito verificador) en tiempo real — supplier_rut en facturas"
```

---

### Task 17: Webhook outbound configurable

**Files:**
- Create: `supabase/migrations/018_webhooks.sql`
- Modify: `src/lib/supabase/types.ts` (tabla webhooks)
- Create: `src/lib/webhooks.ts`
- Modify: `src/actions/admin.ts` (CRUD de webhooks)
- Modify: `src/actions/approvals.ts` (disparar webhook en aprobación/rechazo)
- Modify: `src/app/(app)/admin/settings/page.tsx` (tab Webhooks)

**Interfaces:**
- Produces: tabla `webhooks`; función `dispatchWebhooks(orgId, event, payload)` llamada desde aprobaciones y export Defontana

- [ ] **Step 1: Migración 018**

```sql
-- supabase/migrations/018_webhooks.sql
create table public.webhooks (
  id         uuid        primary key default gen_random_uuid(),
  org_id     uuid        not null references public.organizations(id) on delete cascade,
  url        text        not null,
  secret     varchar(100) not null,          -- para firma HMAC-SHA256
  events     text[]      not null default '{}',  -- ['report.approved', 'report.rejected', 'report.reimbursed', 'defontana.exported']
  activo     boolean     not null default true,
  created_at timestamptz not null default now(),
  constraint uq_webhook_url unique (org_id, url)
);

alter table public.webhooks enable row level security;
create policy "admins_manage_webhooks" on public.webhooks
  for all using (is_admin() and org_id = get_my_org_id())
  with check (is_admin() and org_id = get_my_org_id());
```

- [ ] **Step 2: Implementar `src/lib/webhooks.ts`**

```typescript
import { createAdminClient } from '@/lib/supabase/admin'

export type WebhookEvent =
  | 'report.approved'
  | 'report.partially_approved'
  | 'report.rejected'
  | 'report.reimbursed'
  | 'defontana.exported'

async function signPayload(payload: string, secret: string): Promise<string> {
  const enc = new TextEncoder()
  const key = await crypto.subtle.importKey(
    'raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']
  )
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode(payload))
  return Array.from(new Uint8Array(sig)).map(b => b.toString(16).padStart(2, '0')).join('')
}

export async function dispatchWebhooks(
  orgId:   string,
  event:   WebhookEvent,
  payload: Record<string, unknown>
): Promise<void> {
  const admin = createAdminClient()
  const { data: hooks } = await admin
    .from('webhooks')
    .select('url, secret')
    .eq('org_id', orgId)
    .eq('activo', true)
    .contains('events', [event])
  
  if (!hooks?.length) return
  
  const body = JSON.stringify({ event, timestamp: new Date().toISOString(), data: payload })
  
  await Promise.allSettled(hooks.map(async hook => {
    const signature = await signPayload(body, hook.secret)
    try {
      await fetch(hook.url, {
        method:  'POST',
        headers: {
          'Content-Type':          'application/json',
          'X-Signature-SHA256':    signature,
          'X-MiRendicion-Event':   event,
        },
        body,
        signal: AbortSignal.timeout(8000),  // 8s timeout
      })
    } catch (err) {
      console.error(`[webhook] Failed to dispatch to ${hook.url}:`, err)
      // No relanzar — un webhook fallido no debe bloquear la operación
    }
  }))
}
```

- [ ] **Step 3: Agregar CRUD en admin.ts**

```typescript
export async function listWebhooks() {
  const { orgId } = await requireAdmin()
  const supabase = createClient()
  const { data } = await supabase.from('webhooks').select('id, url, events, activo, created_at').eq('org_id', orgId)
  return data ?? []
}

export async function createWebhook(url: string, secret: string, events: string[]) {
  const { orgId } = await requireAdmin()
  const supabase = createClient()
  await supabase.from('webhooks').insert({ org_id: orgId, url, secret, events })
  revalidatePath('/admin/settings')
}

export async function deleteWebhook(id: string) {
  const { orgId, userId, name } = await requireAdmin()
  const supabase = createClient()
  const { data: wh } = await supabase.from('webhooks').select('url').eq('id', id).eq('org_id', orgId).single()
  await supabase.from('webhooks').delete().eq('id', id).eq('org_id', orgId)
  await logAudit({ orgId, actorId: userId, actorName: name, action: 'deleted', entityType: 'webhook', entityId: id, entityLabel: wh?.url })
  revalidatePath('/admin/settings')
}
```

- [ ] **Step 4: Disparar webhooks desde aprobaciones**

En `submitApprovalDecision()` (approvals.ts), al final cuando el status cambia:

```typescript
// Fire and forget — no await para no bloquear la respuesta al usuario
dispatchWebhooks(profile.org_id, `report.${newStatus}` as WebhookEvent, {
  report_id:     reportId,
  status:        newStatus,
  approved_by:   profile.full_name,
  approved_at:   new Date().toISOString(),
  total_approved: approvedAmount,
}).catch(console.error)
```

- [ ] **Step 5: Tab Webhooks en settings**

En `src/app/(app)/admin/settings/page.tsx`, agregar un tab "Webhooks" con:
- Listado de webhooks activos: URL, eventos suscritos, botón eliminar
- Formulario para agregar: URL, secret (input type=password), checkboxes de eventos
- Descripción de cómo verificar la firma: `X-Signature-SHA256` header con HMAC-SHA256

- [ ] **Step 6: TypeScript + Commit**

```bash
npx tsc --noEmit
git add supabase/migrations/018_webhooks.sql src/lib/webhooks.ts src/lib/supabase/types.ts src/actions/admin.ts src/actions/approvals.ts src/app/(app)/admin/settings/page.tsx
git commit -m "feat: webhook outbound configurable — CRUD admin + firma HMAC-SHA256 + eventos de aprobación"
```

---

## FASE 5 — Refactoring (Tasks 18–20)

---

### Task 18: Dividir `petty-cash/client.tsx` (2.275 líneas)

**Files:**
- Create: `src/app/(app)/petty-cash/hooks/usePettyCashState.ts`
- Create: `src/app/(app)/petty-cash/components/FundList.tsx`
- Create: `src/app/(app)/petty-cash/components/FundModals.tsx`
- Create: `src/app/(app)/petty-cash/components/FundFilters.tsx`
- Modify: `src/app/(app)/petty-cash/client.tsx` (reducir a orquestador ~200 líneas)

**Strategy:** extraer sin cambiar comportamiento. No agregar features. No cambiar UI. Commit intermedio después de cada extracción.

- [ ] **Step 1: Extraer el estado a `usePettyCashState.ts`**

El hook centraliza: `funds`, `loading`, `filters`, `selected`, `modales abiertos (createOpen, linkOpen, transferOpen...)`, handlers (`handleApprove`, `handleReject`, `openTransferModal`...).

```typescript
// src/app/(app)/petty-cash/hooks/usePettyCashState.ts
'use client'
import { useState, useCallback, useEffect } from 'react'
// ... exportar todo el estado y handlers

export function usePettyCashState(initialFunds: PettyCashFund[], orgEmployees: UserProfile[]) {
  // ... estado y handlers extraídos de client.tsx
  return { funds, filters, setFilters, createOpen, setCreateOpen, /* ... */ }
}
```

- [ ] **Step 2: Extraer lista a `FundList.tsx`**

```typescript
// src/app/(app)/petty-cash/components/FundList.tsx
export function FundList({ funds, onApprove, onReject, ... }: FundListProps) { ... }
```

- [ ] **Step 3: Extraer modales a `FundModals.tsx`**

```typescript
// src/app/(app)/petty-cash/components/FundModals.tsx
export function FundModals({ createOpen, onCloseCreate, ... }: FundModalsProps) { ... }
```

- [ ] **Step 4: Extraer filtros a `FundFilters.tsx`**

- [ ] **Step 5: Simplificar `client.tsx` a orquestador**

```typescript
'use client'
import { usePettyCashState } from './hooks/usePettyCashState'
import { FundList }    from './components/FundList'
import { FundModals }  from './components/FundModals'
import { FundFilters } from './components/FundFilters'

export function PettyCashClient({ initialFunds, orgEmployees }: Props) {
  const state = usePettyCashState(initialFunds, orgEmployees)
  return (
    <div>
      <FundFilters {...state} />
      <FundList    {...state} />
      <FundModals  {...state} />
    </div>
  )
}
```

- [ ] **Step 6: Verificar comportamiento idéntico en browser + TypeScript + Commit**

```bash
npx tsc --noEmit
# Abrir /petty-cash en el browser y verificar que TODO funciona igual
git add src/app/(app)/petty-cash/
git commit -m "refactor: dividir petty-cash/client.tsx en hook + FundList + FundModals + FundFilters"
```

---

### Task 19: Instrumentar Defontana export en audit_log

**Files:**
- Modify: `src/actions/admin.ts` (markDefontanaExported + markPettyCashFundDefontanaExported)

*(Tarea pequeña que cierra el ciclo de auditoría — los exports contables deben quedar registrados)*

- [ ] **Step 1: Agregar logAudit en `markDefontanaExported`**

```typescript
// Después del update de exported_at:
await logAudit({
  orgId, actorId, actorName,
  action:      'exported',
  entityType:  'expense_report',
  entityId:    reportIds.join(','),
  entityLabel: `Export Defontana ${reportIds.length} reportes`,
  newValue:    { export_ref: exportRef, exported_at: new Date().toISOString(), count: reportIds.length },
  notes:       `Referencia: ${exportRef}`,
})
```

- [ ] **Step 2: Ídem para `markPettyCashFundDefontanaExported`**

- [ ] **Step 3: Commit**

```bash
npx tsc --noEmit
git add src/actions/admin.ts
git commit -m "feat: audit_log en exports Defontana — rendiciones y cajas chicas"
```

---

### Task 20: Validación final — tests, TypeScript y revisión de seguridad

**Files:**
- No se crean archivos nuevos — es revisión y cierre

- [ ] **Step 1: Correr suite completa de tests**

```bash
npx vitest run
```
Expected: todos los tests en verde. Si alguno falla, investigar y corregir antes de continuar.

- [ ] **Step 2: TypeScript check global**

```bash
npx tsc --noEmit
```
Expected: cero errores

- [ ] **Step 3: Verificar que `organizations.ts` no está accesible**

```bash
grep -r "from '@/actions/organizations'" src/app/ src/components/
```
Expected: sin resultados (o solo los que deben existir con el guard)

- [ ] **Step 4: Verificar que todas las funciones `notify*` están en `src/lib/`**

```bash
grep -r "notifyApproversOfSubmission\|notifyL2Approver\|notifySubmitter\|notifyBank" src/actions/ | grep -v "import"
```
Expected: solo llamadas importadas desde lib, no definidas en actions

- [ ] **Step 5: Revisar el build de producción**

```bash
npm run build
```
Expected: build exitoso sin warnings críticos

- [ ] **Step 6: Commit de cierre**

```bash
git add -A
git commit -m "chore: revisión final — todos los tests en verde, build limpio, seguridad verificada"
```

---

## Resumen de migraciones nuevas

| Archivo | Contenido |
|---------|-----------|
| `016_audit_log.sql` | Tabla `audit_log` append-only + RLS + índices |
| `017_soft_delete_extensions.sql` | `deleted_by`/`modified_by` + soft delete `expense_items`/`expense_categories` + `dedup_key` en notifications + `rate_limit_log` + `monthly_budget_clp` |
| `018_webhooks.sql` | Tabla `webhooks` con CRUD admin + RLS |

**Orden de aplicación:** 016 → 017 → 018 (en ese orden en Supabase Dashboard)

---

## Resumen de archivos nuevos

| Archivo | Propósito |
|---------|-----------|
| `src/lib/audit.ts` | Helper `logAudit()` — usado por todas las actions |
| `src/lib/validators.ts` | Validadores: RUT, strings, fechas, montos |
| `src/lib/rate-limit.ts` | Rate limiting por usuario/acción + `buildDedupKey()` |
| `src/lib/duplicate-detection.ts` | Detección de ítems duplicados |
| `src/lib/sii-validator.ts` | Validación y formateo de RUT chileno |
| `src/lib/webhooks.ts` | Dispatch webhooks outbound con firma HMAC-SHA256 |
| `src/hooks/useRealtimeNotifications.ts` | Hook Supabase Realtime para notificaciones |
| `src/app/(app)/admin/auditoria/page.tsx` | Vista de auditoría (Server Component) |
| `src/app/(app)/admin/auditoria/client.tsx` | Tabla filtrable de audit log |
| `src/app/(app)/RealtimeProvider.tsx` | Provider para notificaciones en tiempo real |
| `src/app/(app)/petty-cash/hooks/usePettyCashState.ts` | Estado extraído de petty-cash/client.tsx |
| `src/app/(app)/petty-cash/components/FundList.tsx` | Lista de fondos |
| `src/app/(app)/petty-cash/components/FundModals.tsx` | Modales de fondos |
| `src/app/(app)/petty-cash/components/FundFilters.tsx` | Filtros de fondos |

---

## Secuencia de commits esperada (20 commits)

```
feat: schema audit_log + soft-delete extensions + rate_limit_log
feat: lib/audit.ts helper + lib/validators.ts con dígito verificador RUT
fix: proteger server actions sin auth — ocr, approvals, expenses, notifications
fix: soft delete expense_items + optimizar lookupEmails + filtrar deleted_at en selects
feat: rate limiting para OCR (30/h) y análisis IA (20/h) por usuario
feat: audit_log en todas las operaciones de borrado y restauración
feat: audit_log en cambios de configuración, cadenas de aprobación y reclasificaciones
feat: módulo de auditoría — getAuditLog + vista /admin/auditoria con filtros y export
fix: cron secret seguro + deduplicación de recordatorios por dedup_key diario
feat: detección de ítems duplicados con ventana ±7 días + normalización de merchant
feat: presupuesto mensual por categoría — campo en settings + barra de ejecución en analisis
feat: validación de inputs — RUT, longitud, fechas, contraseña compleja
feat: PDF descargable para empleado — resumen de rendición con ítems y totales
feat: notificaciones en tiempo real via Supabase Realtime + toast automático
feat: dashboard salud operacional — tasa aprobación, tiempo promedio, empleados inactivos
feat: validación RUT chileno (dígito verificador) en tiempo real — supplier_rut en facturas
feat: webhook outbound configurable — CRUD admin + firma HMAC-SHA256 + eventos de aprobación
refactor: dividir petty-cash/client.tsx en hook + FundList + FundModals + FundFilters
feat: audit_log en exports Defontana — rendiciones y cajas chicas
chore: revisión final — todos los tests en verde, build limpio, seguridad verificada
```
