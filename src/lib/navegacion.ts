// Las 4 pestañas de la barra de abajo según el perfil; el resto va a «Más».
// Separado de MobileNav para poder probarlo.

export function pestanasPrincipales(
  u: { role: 'admin' | 'approver' | 'employee'; can_submit: boolean; can_approve: boolean },
): string[] {
  if (u.role === 'admin') return ['/', '/admin/reports', '/petty-cash', '/approvals']

  /* Por el PERMISO, no por el rol. En PENTA nadie tiene el rol `approver`: los
     11 que aprueban —la aprobadora por defecto y los 6 jefes de proyecto entre
     ellos— son `employee` con `can_approve`, porque desde los permisos por
     asignación quién aprueba lo decide la cadena y no la ficha. Mirando el rol,
     la bandeja quedaba fuera de la barra y también fuera de «Más» (isVisible de
     MobileNav corta por rol antes que nada), así que en el teléfono no había
     ninguna forma de llegar a aprobar. */
  if (u.can_approve) return ['/', '/approvals', '/petty-cash', u.can_submit ? '/expenses/new' : '/mis-gastos']

  // Empleado (Daniel, 2026-10-07): «Rendiciones» entra a la barra y «Mis
  // gastos» pasa a «Más». Sin permiso de rendir no hay rendiciones que listar.
  return u.can_submit
    ? ['/', '/expenses/new', '/reimbursements', '/petty-cash']
    : ['/', '/petty-cash', '/mis-gastos']
}
