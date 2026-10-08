import { describe, it, expect } from 'vitest'
import { pestanasPrincipales } from '@/lib/navegacion'

describe('pestanasPrincipales', () => {
  it('el empleado que rinde: Estado · Rendir · Rendiciones · C. Chica', () => {
    expect(pestanasPrincipales({ role: 'employee', can_submit: true, can_approve: false }))
      .toEqual(['/', '/expenses/new', '/reimbursements', '/petty-cash'])
  })
  it('el empleado que no rinde no tiene rendiciones que listar: queda como antes', () => {
    expect(pestanasPrincipales({ role: 'employee', can_submit: false, can_approve: false }))
      .toEqual(['/', '/petty-cash', '/mis-gastos'])
  })
  it('aprobador y admin no cambian', () => {
    expect(pestanasPrincipales({ role: 'approver', can_submit: true, can_approve: true }))
      .toEqual(['/', '/approvals', '/petty-cash', '/expenses/new'])
    expect(pestanasPrincipales({ role: 'admin', can_submit: true, can_approve: true }))
      .toEqual(['/', '/admin/reports', '/petty-cash', '/approvals'])
  })

  /* En PENTA NADIE tiene el rol `approver`: los 11 que aprueban son `employee`
     con el permiso. Decidir por el rol les dejaba la bandeja fuera de la barra
     Y fuera de «Más», así que en el teléfono no había forma de llegar. */
  it('quien aprueba por permiso ve la bandeja, aunque su rol sea empleado', () => {
    expect(pestanasPrincipales({ role: 'employee', can_submit: true, can_approve: true }))
      .toEqual(['/', '/approvals', '/petty-cash', '/expenses/new'])
  })
  it('quien aprueba y no rinde llega igual a la bandeja', () => {
    expect(pestanasPrincipales({ role: 'employee', can_submit: false, can_approve: true }))
      .toEqual(['/', '/approvals', '/petty-cash', '/mis-gastos'])
  })
})
