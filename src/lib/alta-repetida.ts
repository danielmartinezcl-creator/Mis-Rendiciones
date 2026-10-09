// Por qué un alta rebota cuando la persona YA existe, y qué hacer al respecto.
//
// En esta app eliminar a alguien nunca borra su cuenta de acceso: «Eliminar» la
// manda a la papelera y «Eliminar definitivamente» la bloquea (migración 027,
// porque su historial la referencia y `audit_log` no admite la cascada). En los
// dos casos el correo sigue tomado en Auth, que es global.
//
// Así que al dar de alta a alguien que ya pasó por acá, `createUser` falla con
// «email already registered» y el admin se queda sin salida: el mensaje no dice
// quién tiene el correo ni que está a un clic de volver. Pasó con Julián Torres
// el 2026-10-08.
//
// Este módulo es común (sin 'use server'): lo usa el alta individual, la
// planilla y sus vistas previas.

import { normalizarRut } from '@/lib/rut'

export type EstadoCuenta = 'activa' | 'inactiva' | 'papelera' | 'bloqueada'

export type CuentaExistente = {
  id: string
  nombre: string
  correo: string
  rut: string | null
  estado: EstadoCuenta
}

export type Choque = { cuenta: CuentaExistente; por: 'correo' | 'rut' }

/**
 * El estado de una ficha tal como lo muestra la app. El orden importa: una
 * persona en la papelera también tiene `is_active = false`, y si se mirara
 * primero diría «desactivada», que manda a reactivar donde no hay nada que
 * reactivar.
 */
export function estadoDeCuenta(
  u: { is_active: boolean; deleted_at: string | null; blocked_at: string | null },
): EstadoCuenta {
  if (u.deleted_at) return 'papelera'
  if (u.blocked_at) return 'bloqueada'
  return u.is_active ? 'activa' : 'inactiva'
}

/**
 * La cuenta que impide el alta. Busca por correo y por RUT, **sin mirar si está
 * activa**: justamente las que no lo están son las que no se ven en la nómina y
 * dejan al admin sin entender el rechazo.
 *
 * El correo manda sobre el RUT porque es lo que Auth rechaza: con el correo
 * tomado la cuenta no se crea, tenga o no el RUT alguien más.
 */
export function cuentaQueChoca(
  datos: { correo: string; rut?: string | null },
  cuentas: CuentaExistente[],
): Choque | null {
  const correo = datos.correo.trim().toLowerCase()
  if (correo) {
    const porCorreo = cuentas.find(c => c.correo.trim().toLowerCase() === correo)
    if (porCorreo) return { cuenta: porCorreo, por: 'correo' }
  }

  const rut = normalizarRut(datos.rut ?? '')
  if (rut) {
    const porRut = cuentas.find(c => c.rut !== null && normalizarRut(c.rut) === rut)
    if (porRut) return { cuenta: porRut, por: 'rut' }
  }

  return null
}

/** Las que se pueden volver a poner en pie, en vez de crear una cuenta nueva. */
export function seRecupera(estado: EstadoCuenta): boolean {
  return estado !== 'activa'
}

/**
 * El texto que lee el admin. Nombra a la persona SIEMPRE —un correo tomado sin
 * nombre no se puede resolver— y termina en lo que hay que hacer, que es
 * distinto en cada estado: la papelera se restaura, el bloqueo se habilita, la
 * desactivación se reactiva.
 */
export function motivoDeChoque({ cuenta, por }: Choque): string {
  const quien = cuenta.nombre.replace(/\s+/g, ' ').trim() || cuenta.correo
  const dato  = por === 'correo' ? `Ese correo (${cuenta.correo})` : `Ese RUT (${cuenta.rut})`

  switch (cuenta.estado) {
    case 'papelera':
      return `${dato} es de ${quien}, que está en la papelera. Restauralo desde Papelera → Empleados: vuelve con su historial y su acceso. Una cuenta nueva con el mismo correo no se puede crear.`
    case 'bloqueada':
      return `${dato} es de ${quien}, que está bloqueado. Buscalo por su nombre en Empleados y habilitalo, en vez de crearlo de nuevo: su historial sigue ahí.`
    case 'inactiva':
      return `${quien} ya está en la nómina, desactivado — ${dato.toLowerCase()} es suyo. Reactivalo desde Empleados en vez de crearlo de nuevo.`
    case 'activa':
      return por === 'correo'
        ? `Ese correo ya lo usa ${quien}. Cada persona necesita el suyo.`
        : `Ese RUT ya lo tiene ${quien} (${cuenta.correo}).`
  }
}
