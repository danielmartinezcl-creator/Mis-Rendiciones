// Reglas de la cadena bancaria (carga → autorización de la transferencia).
// Decididas por Daniel el 2026-09-24 para el caso Francisco / Roberto Hagar.

// Suplente bancario (`users.bank_is_backup`, migración 031): tiene el permiso de
// cargar o autorizar y puede usarlo cuando quiera, pero los avisos van solo a
// los titulares. Si no queda ningún titular, se avisa a los suplentes: un pago
// nunca debe quedar esperando sin que nadie se entere.
export function destinatariosBancarios(
  conPermiso: { id: string; bank_is_backup: boolean }[],
): string[] {
  const titulares = conPermiso.filter(u => !u.bank_is_backup)
  return (titulares.length > 0 ? titulares : conPermiso).map(u => u.id)
}

// Acciones del log que cuentan como aprobación. Los pasos bancarios
// (bank_load_confirmed, bank_authorized…) también se registran en el mismo
// log, pero hacer un paso bancario no es aprobar el gasto.
const ACCIONES_DE_APROBACION = new Set(['approved', 'partially_approved'])

// Quien tiene el permiso bancario puede operar el pago de otra persona siempre.
// El suyo propio, solo si otra persona aprobó la rendición o el fondo: quien
// tiene las credenciales del banco puede pagarse, pero no puede ser a la vez
// quien aprobó el gasto.
export function puedeOperarPago(
  actorId: string,
  beneficiarioId: string,
  aprobaciones: { actor_id: string; action: string }[],
): boolean {
  if (actorId !== beneficiarioId) return true
  return aprobaciones.some(a => ACCIONES_DE_APROBACION.has(a.action) && a.actor_id !== beneficiarioId)
}
