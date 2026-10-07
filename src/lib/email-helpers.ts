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

/**
 * Lo que decide si un correo puede salir, además de la clave.
 *
 * Existe por un incidente del 2026-10-07: una prueba automatizada corrida contra
 * el servidor LOCAL —que apunta a la base real de producción y tenía una clave
 * de Resend que funcionaba— hizo clic en «Invitar sin invitar», y salieron 52
 * invitaciones a empleados reales con la app a medio reconfigurar.
 */
export interface EntornoCorreo {
  /** Vercel lo pone en 'production' solo en el despliegue de producción */
  VERCEL_ENV?:     string
  /** Pausa todo correo saliente. Vacío, '0', 'false' o 'no' = sin pausa */
  CORREO_PAUSADO?: string
}

export function entornoCorreoActual(): EntornoCorreo {
  return { VERCEL_ENV: process.env.VERCEL_ENV, CORREO_PAUSADO: process.env.CORREO_PAUSADO }
}

const VALORES_SIN_PAUSA = new Set(['', '0', 'false', 'no'])

export function revisarConfigCorreo(
  clave: string | undefined | null,
  remitente: string | undefined | null,
  entorno: EntornoCorreo = entornoCorreoActual(),
): EstadoCorreo {
  // 1. Fuera de producción no sale nada: ni en local ni en los previews de
  //    Vercel, que comparten la base con producción. Va ANTES de mirar la
  //    clave: que una clave sea válida es justamente lo que lo hacía peligroso.
  if (entorno.VERCEL_ENV !== 'production') {
    return {
      puedeEnviar: false,
      motivo: 'Fuera de producción no se envían correos (VERCEL_ENV no es «production»).',
    }
  }

  // 2. Pausa global. Falla cerrado: un valor que no se reconoce como «sin
  //    pausa» pausa. Un error de tipeo al apagarla deja todo callado, que es el
  //    error barato; el caro es el que acaba de pasar.
  const pausa = (entorno.CORREO_PAUSADO ?? '').trim().toLowerCase()
  if (!VALORES_SIN_PAUSA.has(pausa)) {
    return {
      puedeEnviar: false,
      motivo: 'Los correos están pausados (CORREO_PAUSADO). Se reanudan quitando esa variable en Vercel.',
    }
  }

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
