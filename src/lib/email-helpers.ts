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
  | {
      puedeEnviar: true
      desde: string
      /** Si tiene elementos, SOLO estas direcciones reciben. Vacío = todas. */
      soloA: string[]
    }
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
  /**
   * Direcciones separadas por coma que SÍ reciben, aunque la pausa esté puesta.
   *
   * Es una excepción a la pausa, no un reemplazo: con la lista cargada, los
   * correos salen **solo** a esas direcciones y nadie más recibe nada. Para una
   * prueba en producción con un puñado de personas, que es exactamente lo que
   * Daniel pidió el 2026-10-20 para la semana del piloto.
   *
   * **Falla cerrado por construcción**: borrar la lista no abre nada, porque
   * `CORREO_PAUSADO` sigue puesto y vuelve la pausa total. Al revés que una
   * lista de bloqueados, donde olvidarse de un nombre manda el correo.
   */
  CORREO_SOLO_A?: string
}

export function entornoCorreoActual(): EntornoCorreo {
  return {
    VERCEL_ENV:     process.env.VERCEL_ENV,
    CORREO_PAUSADO: process.env.CORREO_PAUSADO,
    CORREO_SOLO_A:  process.env.CORREO_SOLO_A,
  }
}

/** La lista de permitidos, normalizada. Vacía si la variable no está. */
export function listaPermitidos(valor: string | undefined | null): string[] {
  return (valor ?? '')
    .split(',')
    .map(s => s.trim().toLowerCase())
    .filter(s => s.includes('@'))
}

/**
 * ¿Esta dirección puede recibir?
 *
 * Con la lista vacía, sí: no hay piloto en curso y manda lo que decidió
 * `revisarConfigCorreo`. Con la lista cargada, solo quien esté en ella.
 *
 * Se compara en minúsculas y sin espacios porque la lista la escribe una
 * persona en el panel de Vercel y el correo viene de `auth.users`.
 */
export function puedeRecibir(email: string, soloA: string[]): boolean {
  if (!soloA.length) return true
  return soloA.includes(email.trim().toLowerCase())
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
  const soloA = listaPermitidos(entorno.CORREO_SOLO_A)
  const pausa = (entorno.CORREO_PAUSADO ?? '').trim().toLowerCase()
  /* La lista de permitidos levanta la pausa, pero SOLO para quien esté en
     ella: el filtro por destinatario corre después, en los dos embudos de
     salida. Sin lista, la pausa corta todo como siempre. */
  if (!VALORES_SIN_PAUSA.has(pausa) && !soloA.length) {
    return {
      puedeEnviar: false,
      motivo: 'Los correos están pausados (CORREO_PAUSADO). Se reanudan quitando esa variable en Vercel, '
            + 'o se abren para unas pocas direcciones con CORREO_SOLO_A.',
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
  return { puedeEnviar: true, desde, soloA }
}
