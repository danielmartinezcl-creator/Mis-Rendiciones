/**
 * La fecha del comprobante de GASTOS de una rendición en Defontana.
 *
 * Es la fecha de la rendición, no la del gasto más antiguo. Hasta el 2026-11-20
 * era la del gasto más antiguo, y una boleta vieja arrastraba el asiento entero
 * a otro mes: «RENDICION CAJA CHICA 26 FD», rendida el 05-11-2026, salía el
 * 22-08-2026 por un snack de agosto entre 26 gastos de octubre y noviembre
 * (Daniel: «debería tomar la fecha de la rendición»).
 *
 * Solo el comprobante de gastos. Los de adelanto y devolución siguen con la fecha
 * de cada movimiento, porque ahí el N° de documento del banco ES esa fecha.
 *
 * El orden: el día en que se envió (en una carga histórica, la «fecha de
 * rendición» del Excel, que la importación guarda igual en envío y aprobación),
 * después el de la aprobación, y recién sin ninguno de los dos, el gasto más
 * antiguo, que es lo único que queda.
 */

// Vercel corre en UTC: una rendición enviada a las 22:00 del 5 sería del 6 sin esto
const DIA_CHILE = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'America/Santiago', year: 'numeric', month: '2-digit', day: '2-digit',
})

function diaEnChile(iso: string): string {
  // Una fecha sola no tiene zona: se toma tal cual
  if (/^\d{4}-\d{2}-\d{2}$/.test(iso)) return iso
  return DIA_CHILE.format(new Date(iso))
}

export function fechaDelComprobanteDeGastos(
  rendicion: { submitted_at?: string | null; approved_at?: string | null },
  fechasDeGastos: readonly (string | null)[],
): string {
  if (rendicion.submitted_at) return diaEnChile(rendicion.submitted_at)
  if (rendicion.approved_at)  return diaEnChile(rendicion.approved_at)
  const fechas = fechasDeGastos.filter((f): f is string => !!f).sort()
  return fechas[0] ?? ''
}
