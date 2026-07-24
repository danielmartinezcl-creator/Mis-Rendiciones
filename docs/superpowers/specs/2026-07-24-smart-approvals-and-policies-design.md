# Diseño: Política de Gastos en Tiempo Real + Aprobación Inteligente con IA

> Fecha: 2026-07-24  
> Estado: Aprobado por Daniel Martínez

---

## Contexto

Dos features que se complementan directamente: las políticas detectan violaciones al momento de cargar la rendición, y el análisis de IA las incorpora al resumen que ve el aprobador. Se implementan juntas porque Feature 2 consume el output de Feature 1.

---

## Feature 1 — Política de Gastos en Tiempo Real

### Objetivo

El empleado recibe feedback inline mientras llena un ítem de rendición, antes de enviar. El tipo de feedback (advertencia, bloqueo suave, bloqueo duro) es configurable por política.

### Modelo de datos

**Tabla nueva: `expense_policies`**

```sql
CREATE TABLE public.expense_policies (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id                uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name                  text NOT NULL,
  category_id           uuid REFERENCES expense_categories(id),  -- null = todas las categorías
  department            text,           -- null = toda la org
  target_user_id        uuid REFERENCES users(id),  -- null = no override individual
  -- Límite por ítem (una sola ocurrencia)
  item_limit            numeric,
  item_enforcement      text CHECK (item_enforcement IN ('warn','require_justification','block')),
  -- Límite mensual acumulado
  monthly_limit         numeric,
  monthly_enforcement   text CHECK (monthly_enforcement IN ('warn','require_justification','block')),
  -- Límite trimestral acumulado
  quarterly_limit       numeric,
  quarterly_enforcement text CHECK (quarterly_enforcement IN ('warn','require_justification','block')),
  -- Límite anual acumulado
  annual_limit          numeric,
  annual_enforcement    text CHECK (annual_enforcement IN ('warn','require_justification','block')),
  is_active             boolean NOT NULL DEFAULT true,
  created_at            timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.expense_policies ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admins manage policies" ON public.expense_policies
  FOR ALL USING (is_admin() AND org_id = get_my_org_id());
CREATE POLICY "employees read own org policies" ON public.expense_policies
  FOR SELECT USING (org_id = get_my_org_id());
CREATE INDEX idx_expense_policies_org ON public.expense_policies(org_id, is_active);
CREATE INDEX idx_expense_policies_category ON public.expense_policies(category_id);
```

**Columnas nuevas en `expense_items`:**

```sql
ALTER TABLE public.expense_items
  ADD COLUMN IF NOT EXISTS policy_justification text,        -- texto del empleado si 'require_justification'
  ADD COLUMN IF NOT EXISTS policy_violations     jsonb;      -- registro de políticas activadas
```

**`policy_violations` estructura:**
```json
[
  {
    "policy_id": "uuid",
    "policy_name": "Límite almuerzos",
    "dimension": "item" | "monthly" | "quarterly" | "annual",
    "limit": 25000,
    "actual": 34000,
    "enforcement": "require_justification"
  }
]
```

### Resolución de política (cascada)

Para un empleado + categoría dada, se aplica la política más específica que encuentre:

1. `target_user_id = employeeId` (override individual)
2. `department = employee.department` (override por departamento)
3. `category_id = categoryId AND target_user_id IS NULL AND department IS NULL` (global por categoría)
4. `category_id IS NULL AND target_user_id IS NULL AND department IS NULL` (global para todas las categorías)

Si hay múltiples coincidencias en el mismo nivel de especificidad, gana la que tiene el límite más bajo.

### Server Action: `checkPolicyViolations`

Ubicación: `src/actions/policies.ts`

```typescript
// Parámetros
{
  employeeId: string
  categoryId: string | null
  amount: number           // monto del ítem en CLP
  date: string             // YYYY-MM-DD (para calcular mes/trimestre/año)
}

// Retorno
{
  violations: PolicyViolation[]
  // PolicyViolation: { policyId, policyName, dimension, limit, actual, enforcement, accumulated? }
  hasBlock: boolean        // true si alguna violation es 'block'
  hasJustificationRequired: boolean
}
```

Para los límites de período, consulta `expense_items` del empleado en la categoría dada con status no-rejected y en el rango de fechas del mes/trimestre/año del `date` recibido.

### Helper puro: `src/lib/policy-helpers.ts`

```typescript
resolveApplicablePolicy(policies: ExpensePolicy[], employeeId: string, department: string | null, categoryId: string | null): ExpensePolicy | null
checkItemLimit(policy: ExpensePolicy, amount: number): PolicyViolation | null
checkPeriodLimit(policy: ExpensePolicy, accumulated: number, amount: number, dimension: 'monthly'|'quarterly'|'annual'): PolicyViolation | null
formatViolationMessage(v: PolicyViolation): string  // ej: "Supera límite mensual ($150.000). Llevas $142.000 + este ítem."
```

### UX en `ExpenseItemForm`

Al cambiar el campo `amount` o `category_id`:
- Se llama `checkPolicyViolations` vía `useTransition` (no bloquea el formulario)
- Para no disparar una llamada por cada tecla, se usa debounce de 600ms sobre `amount` (solo cuando el campo pierde foco o tras 600ms de inactividad)
- `category_id` no requiere debounce (es un selector, cambia de golpe)
- Resultado se muestra debajo del campo monto, antes del botón guardar:

| Enforcement | UI |
|------------|-----|
| `warn` | Banner ámbar: ícono ⚠ + mensaje. Botón "Guardar" habilitado. |
| `require_justification` | Banner ámbar + campo de texto "Justificación (requerida)" aparece. Botón deshabilitado hasta completar. |
| `block` | Banner rojo. Campo monto resaltado en rojo. Botón "Guardar ítem" deshabilitado. Mensaje indica el límite. |

Las violaciones y justificación se guardan en `expense_items.policy_violations` y `expense_items.policy_justification` al hacer submit del ítem.

### Settings — Tab "Políticas de Gastos"

En `/admin/settings` se agrega una nueva pestaña con:

1. **Lista de políticas activas:** nombre, categoría, departamento/empleado, límites configurados, tipo de restricción, toggle activa/inactiva
2. **Botón "Nueva política"** → modal/panel con:
   - Nombre de la política
   - Categoría (selector, opcional — vacío = todas)
   - Aplica a: Toda la org / Departamento específico / Empleado específico
   - Límite por ítem: monto + tipo de restricción
   - Límite mensual: monto + tipo de restricción
   - Límite trimestral: monto + tipo de restricción
   - Límite anual: monto + tipo de restricción
   - (Cada dimensión tiene su propio par monto + enforcement, son independientes)
3. **Edición y eliminación** de políticas existentes

### Server Actions admin: `src/actions/policies.ts`

```typescript
export async function getOrgPolicies(): Promise<ExpensePolicy[]>
export async function createPolicy(data: PolicyInput): Promise<void>
export async function updatePolicy(id: string, data: Partial<PolicyInput>): Promise<void>
export async function togglePolicyActive(id: string, active: boolean): Promise<void>
export async function deletePolicy(id: string): Promise<void>
export async function checkPolicyViolations(params): Promise<PolicyCheckResult>
```

---

## Feature 2 — Aprobación Inteligente con IA

### Objetivo

El aprobador ve un análisis generado por Claude antes de revisar los ítems. El análisis clasifica los ítems en rutinarios vs que requieren atención, y sugiere acciones. El aprobador puede aprobar los rutinarios en bloque o revisarlos uno a uno.

### Modelo de datos

Dos columnas nuevas en `expense_reports`:

```sql
ALTER TABLE public.expense_reports
  ADD COLUMN IF NOT EXISTS ai_analysis      jsonb,
  ADD COLUMN IF NOT EXISTS ai_analysis_at   timestamptz;
```

El análisis se cachea en DB. Se invalida (ai_analysis = null) cuando:
- La rendición vuelve a estado `draft` (empleado edita)
- Se agregan o eliminan ítems

### Estructura del JSON `ai_analysis`

```typescript
interface AiAnalysis {
  risk_level:       'low' | 'medium' | 'high'
  headline:         string        // 1 oración: ej. "2 ítems requieren atención. Los 13 restantes son rutinarios."
  routine_item_ids: string[]      // IDs de ítems clasificados como rutinarios
  attention_items:  AttentionItem[]
  stats: {
    total_clp:           number
    item_count:          number
    vs_employee_avg:     string   // ej. "+40%" o "dentro del rango habitual"
    policy_violations:   number
    missing_docs:        number   // ítems sin doc_number cuando doc_type lo requiere
    new_merchants:       number   // merchants nunca vistos antes para este empleado
  }
}

interface AttentionItem {
  item_id:    string
  reasons:    string[]  // lista de razones específicas
  suggestion: 'aprobar' | 'rechazar' | 'revisar'
}
```

### Helper puro: `src/lib/approval-analysis-helpers.ts`

```typescript
buildAnalysisPrompt(report: ReportWithItems, history: ExpenseItem[], violations: PolicyViolation[]): string
parseAnalysisResponse(raw: string): AiAnalysis
```

El prompt incluye:
- Ítems de la rendición actual (descripción, monto CLP, categoría, merchant, doc_type, doc_number, policy_violations si las hay)
- Resumen del historial: top merchants del empleado + montos promedio por categoría (últimos 6 meses)
- Lista de ítems rechazados previamente al empleado con sus motivos
- Instrucción de responder SOLO en JSON con la estructura `AiAnalysis`

### Server Action: `src/actions/approvals.ts` (extensión)

```typescript
export async function getOrGenerateApprovalAnalysis(reportId: string): Promise<AiAnalysis>
```

Lógica:
1. Lee `expense_reports.ai_analysis` y `ai_analysis_at`
2. Si existe y `ai_analysis_at > report.updated_at` → devuelve cacheado (sin llamar a Claude)
3. Si no existe o está desactualizado → llama a Claude, guarda en DB, devuelve resultado
4. Carga paralela: mientras carga la página, el análisis se genera en el servidor (Server Component)

### UI en `/approvals/[id]`

**Tarjeta de análisis IA** (parte superior, antes de la lista de ítems):

```
┌─────────────────────────────────────────────────────┐
│ 🟡 Riesgo medio         Análisis IA                 │
│                                                     │
│ 2 ítems requieren atención. Los 13 restantes son    │
│ rutinarios para Juan.                               │
│                                                     │
│ $340.000 total · +40% vs su promedio · 1 violación  │
│ de política · 1 doc faltante · 1 merchant nuevo     │
│                                                     │
│ [✓ Aprobar los 13 rutinarios]  [Revisar uno a uno]  │
└─────────────────────────────────────────────────────┘
```

**Lista de ítems — orden priorizado:**
1. Primero los `attention_items` con borde ámbar/rojo, razones de la IA debajo de cada uno, y sugerencia badge ("Sugerencia: rechazar")
2. Luego los ítems rutinarios, con apariencia más tenue pero igualmente accionables

**Comportamiento del botón "Aprobar los X rutinarios":**
- Llama a `bulkApproveItems(reportId, routineItemIds)`
- Los attention items quedan sin tocar para decisión manual
- Una vez aprobados los rutinarios, los attention items quedan solos en la lista con contexto claro
- Si el aprobador prefiere revisar uno a uno, ignora el botón y usa el flujo existente normalmente

**Estado de carga:**
- El análisis se genera en el servidor (Server Component) → llega pre-generado al cliente
- Primera vez: latencia de ~2-3 segundos (llamada a Claude)
- Visitas siguientes: instantáneo (cacheado en DB)

### Nueva función admin: `bulkApproveItems`

```typescript
// src/actions/approvals.ts
export async function bulkApproveItems(reportId: string, itemIds: string[]): Promise<void>
```

Aprueba los ítems indicados, deja los demás intactos. Si todos quedan aprobados después del bulk → el reporte pasa a `approved` (o `pending_l2` si hay L2). Si quedan attention items pendientes → el reporte queda en `submitted`/`pending_l2` hasta que el aprobador los resuelva.

---

## Orden de implementación

1. **Migración SQL** — `expense_policies`, columnas en `expense_items` y `expense_reports`
2. **Types TypeScript** — agregar nuevas tablas y columnas a `types.ts`
3. **Helpers puros** — `policy-helpers.ts` y `approval-analysis-helpers.ts` + tests
4. **Server Actions policies** — CRUD de políticas + `checkPolicyViolations`
5. **Settings tab "Políticas de Gastos"** — UI de configuración
6. **ExpenseItemForm** — validación inline en tiempo real
7. **Server Action análisis IA** — `getOrGenerateApprovalAnalysis` + `bulkApproveItems`
8. **UI aprobación** — tarjeta de análisis + reordenamiento de ítems

---

## Impacto en datos existentes

- **Ninguno.** Las políticas solo aplican a ítems creados desde que se activen.
- `policy_violations` y `policy_justification` quedan `null` en todos los ítems existentes — comportamiento normal.
- `ai_analysis` queda `null` en rendiciones existentes — se genera la primera vez que un aprobador las abra (si siguen en estado `submitted`/`pending_l2`).
