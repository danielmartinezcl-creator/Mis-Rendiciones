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
    policyId:    policy.id,
    policyName:  policy.name,
    dimension:   'item',
    limit:       policy.item_limit,
    actual:      amount,
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
