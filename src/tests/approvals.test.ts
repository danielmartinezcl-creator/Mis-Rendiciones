import { describe, it, expect } from 'vitest'
import { computeReportStatus, computeApprovedAmount } from '@/lib/approval-helpers'

describe('computeReportStatus', () => {
  it('returns "submitted" for empty items list', () => {
    expect(computeReportStatus([])).toBe('submitted')
  })

  it('returns "approved" when all items approved', () => {
    const items = [
      { status: 'approved' },
      { status: 'approved' },
      { status: 'approved' },
    ]
    expect(computeReportStatus(items)).toBe('approved')
  })

  it('returns "rejected" when all items rejected', () => {
    const items = [
      { status: 'rejected' },
      { status: 'rejected' },
    ]
    expect(computeReportStatus(items)).toBe('rejected')
  })

  it('returns "partially_approved" when mixed statuses', () => {
    const items = [
      { status: 'approved' },
      { status: 'rejected' },
    ]
    expect(computeReportStatus(items)).toBe('partially_approved')
  })

  it('returns "partially_approved" when some pending', () => {
    const items = [
      { status: 'approved' },
      { status: 'pending' },
    ]
    expect(computeReportStatus(items)).toBe('partially_approved')
  })

  it('returns "approved" for single approved item', () => {
    expect(computeReportStatus([{ status: 'approved' }])).toBe('approved')
  })
})

describe('computeApprovedAmount', () => {
  it('returns 0 for no items', () => {
    expect(computeApprovedAmount([])).toBe(0)
  })

  it('sums only approved expense items (ignores rejected)', () => {
    const items = [
      { status: 'approved', amount_clp: 10000, item_type: 'expense' },
      { status: 'rejected', amount_clp: 5000,  item_type: 'expense' },
      { status: 'approved', amount_clp: 3000,  item_type: 'expense' },
    ]
    expect(computeApprovedAmount(items)).toBe(13000)
  })

  it('returns 0 when all rejected', () => {
    const items = [
      { status: 'rejected', amount_clp: 5000, item_type: 'expense' },
      { status: 'rejected', amount_clp: 2000, item_type: 'expense' },
    ]
    expect(computeApprovedAmount(items)).toBe(0)
  })

  it('returns full total when all approved expenses', () => {
    const items = [
      { status: 'approved', amount_clp: 100000, item_type: 'expense' },
      { status: 'approved', amount_clp: 50000,  item_type: 'expense' },
    ]
    expect(computeApprovedAmount(items)).toBe(150000)
  })

  it('subtracts approved advance items (company pre-paid employee)', () => {
    const items = [
      { status: 'approved', amount_clp: 38080, item_type: 'expense' },
      { status: 'approved', amount_clp: 34080, item_type: 'advance' },
    ]
    // employee spent 38080, company already gave 34080 → net owed = 4000
    expect(computeApprovedAmount(items)).toBe(4000)
  })

  it('subtracts approved return items (employee returns money)', () => {
    const items = [
      { status: 'approved', amount_clp: 50000, item_type: 'expense' },
      { status: 'approved', amount_clp: 10000, item_type: 'return' },
    ]
    // expense 50000, return 10000 → net owed = 40000
    expect(computeApprovedAmount(items)).toBe(40000)
  })

  it('ignores transfer items (internal movement)', () => {
    const items = [
      { status: 'approved', amount_clp: 20000, item_type: 'expense' },
      { status: 'approved', amount_clp: 5000,  item_type: 'transfer' },
    ]
    expect(computeApprovedAmount(items)).toBe(20000)
  })

  it('defaults to expense behavior when item_type is undefined', () => {
    const items = [
      { status: 'approved', amount_clp: 10000 },
      { status: 'approved', amount_clp: 3000 },
    ]
    expect(computeApprovedAmount(items)).toBe(13000)
  })

  it('handles mixed item types correctly (Claudia Lobos case)', () => {
    // Reported bug: expense 38080, advance 34080 → should show deficit 4000, not cuadrado
    const items = [
      { status: 'approved', amount_clp: 38080, item_type: 'expense' },
      { status: 'approved', amount_clp: 34080, item_type: 'advance' },
    ]
    const net = computeApprovedAmount(items)
    expect(net).toBe(4000)
    // If reimbursed_amount = 72160 (sum of both), badge should show deficit, not cuadrado
    expect(72160 - net).toBe(68160) // excess of reimbursement
  })
})
