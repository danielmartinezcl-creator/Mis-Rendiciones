import { describe, it, expect } from 'vitest'
import { pestanasPrincipales } from '@/lib/navegacion'

describe('pestanasPrincipales', () => {
  it('el empleado que rinde: Estado · Rendir · Rendiciones · C. Chica', () => {
    expect(pestanasPrincipales({ role: 'employee', can_submit: true }))
      .toEqual(['/', '/expenses/new', '/reimbursements', '/petty-cash'])
  })
  it('el empleado que no rinde no tiene rendiciones que listar: queda como antes', () => {
    expect(pestanasPrincipales({ role: 'employee', can_submit: false }))
      .toEqual(['/', '/petty-cash', '/mis-gastos'])
  })
  it('aprobador y admin no cambian', () => {
    expect(pestanasPrincipales({ role: 'approver', can_submit: true }))
      .toEqual(['/', '/approvals', '/petty-cash', '/expenses/new'])
    expect(pestanasPrincipales({ role: 'admin', can_submit: true }))
      .toEqual(['/', '/admin/reports', '/petty-cash', '/approvals'])
  })
})
