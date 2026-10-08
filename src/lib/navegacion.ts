// Las 4 pestañas de la barra de abajo según el perfil; el resto va a «Más».
// Separado de MobileNav para poder probarlo.

export function pestanasPrincipales(u: { role: 'admin' | 'approver' | 'employee'; can_submit: boolean }): string[] {
  if (u.role === 'admin')    return ['/', '/admin/reports', '/petty-cash', '/approvals']
  if (u.role === 'approver') return ['/', '/approvals', '/petty-cash', u.can_submit ? '/expenses/new' : '/mis-gastos']
  // Empleado (Daniel, 2026-10-07): «Rendiciones» entra a la barra y «Mis
  // gastos» pasa a «Más». Sin permiso de rendir no hay rendiciones que listar.
  return u.can_submit
    ? ['/', '/expenses/new', '/reimbursements', '/petty-cash']
    : ['/', '/petty-cash', '/mis-gastos']
}
