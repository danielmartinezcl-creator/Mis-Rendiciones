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
