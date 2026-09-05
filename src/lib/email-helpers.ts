/**
 * Comprobación de la configuración de correo saliente.
 *
 * Existe por un defecto que casi cuesta las 54 invitaciones de PENTA: la clave
 * en producción tenía 9 caracteres —no era una clave de Resend— pero tampoco
 * era literalmente `'placeholder'`, que era la única comprobación que había.
 * Así que pasaba, Resend la rechazaba, y un `.catch(() => {})` se tragaba el
 * rechazo mientras el empleado quedaba marcado como invitado.
 *
 * La regla acá es simple: **si no se puede enviar, hay que saberlo ANTES de
 * escribir `invited_at`**, porque ese campo solo se puede escribir bien una vez.
 */

export const REMITENTE_POR_OMISION = 'noreply@mi-rendicion.com'

export type EstadoCorreo =
  | { puedeEnviar: true;  desde: string }
  | { puedeEnviar: false; motivo: string }

/** Las claves de Resend son `re_` + token; en la práctica rondan los 36. */
const PREFIJO = 're_'
const LARGO_MINIMO = 20

export function revisarConfigCorreo(
  clave: string | undefined | null,
  remitente: string | undefined | null,
): EstadoCorreo {
  const k = (clave ?? '').trim()

  if (!k) {
    return { puedeEnviar: false, motivo: 'RESEND_API_KEY no está definida.' }
  }
  if (k === 'placeholder') {
    return { puedeEnviar: false, motivo: 'RESEND_API_KEY sigue con el valor de relleno «placeholder».' }
  }
  if (!k.startsWith(PREFIJO)) {
    return {
      puedeEnviar: false,
      motivo: `RESEND_API_KEY no parece una clave de Resend: tiene ${k.length} caracteres y no empieza con «${PREFIJO}».`,
    }
  }
  if (k.length < LARGO_MINIMO) {
    return {
      puedeEnviar: false,
      motivo: `RESEND_API_KEY es demasiado corta (${k.length} caracteres; se esperan al menos ${LARGO_MINIMO}).`,
    }
  }

  const desde = (remitente ?? '').trim() || REMITENTE_POR_OMISION
  return { puedeEnviar: true, desde }
}
