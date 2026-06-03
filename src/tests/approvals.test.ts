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

  it('sums only approved items', () => {
    const items = [
      { status: 'approved', amount_clp: 10000 },
      { status: 'rejected', amount_clp: 5000 },
      { status: 'approved', amount_clp: 3000 },
    ]
    expect(computeApprovedAmount(items)).toBe(13000)
  })

  it('returns 0 when all rejected', () => {
    const items = [
      { status: 'rejected', amount_clp: 5000 },
      { status: 'rejected', amount_clp: 2000 },
    ]
    expect(computeApprovedAmount(items)).toBe(0)
  })

  it('returns full total when all approved', () => {
    const items = [
      { status: 'approved', amount_clp: 100000 },
      { status: 'approved', amount_clp: 50000 },
    ]
    expect(computeApprovedAmount(items)).toBe(150000)
  })
})
