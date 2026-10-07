// Piezas puras de los avisos (src/lib/avisos.ts), separadas para poder testearlas.

import { destinatariosInformativos } from '@/lib/permisos'

// Todo texto que escribe una persona —su nombre, el título de una rendición, el
// nombre de un fondo— entra al HTML del correo escapado. Sin esto, un título como
// `<a href="https://otro-sitio">Revisar</a>` llegaba como un link de verdad dentro
// de un correo con nuestro remitente.
export function escaparHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

// Clave de «ya avisamos hoy» del aviso de configuración. La base tiene un índice
// único en (org_id, dedup_key), así que la clave lleva al admin: con una sola
// clave para todos, solo el primer admin de la organización recibiría el aviso.
// `dedup_key` es varchar(150): el nombre se recorta para que siempre quepa.
export function claveAvisoSinAprobador(empleadoNombre: string, fecha: string, adminId: string): string {
  return `config_missing:${empleadoNombre.trim().slice(0, 60)}:${fecha}:${adminId}`
}

// A quién informa el resultado de un fondo. Spec §4: «Autorizado → beneficiario»
// (los fondos enviados le importan a quien los recibe); el rechazo y la
// liquidación cerrada, al EFF que creó el fondo y al beneficiario. Nunca a
// quien acaba de actuar.
export function destinatariosResultadoFondo(
  resultado: 'rejected' | 'funds_sent' | 'settled',
  managerId: string, employeeId: string, actorId: string,
): string[] {
  if (resultado === 'funds_sent') return employeeId === actorId ? [] : [employeeId]
  return destinatariosInformativos(managerId, employeeId, [actorId])
}

/**
 * Quién se entera —sin poder decidir— de que a una persona le pidieron un fondo.
 *
 * Regla de Daniel (2026-10-07): cuando administración crea el fondo a nombre de
 * otro, el jefe del beneficiario **no autoriza, solo se entera**. Quien autoriza
 * es el jefe de la obra. Y si el beneficiario no tiene jefe definido, no se
 * envía nada a nadie.
 *
 * Separar «quién decide» de «quién se entera» es lo que evita tener que
 * ensanchar la cadena a una lista: `bloqueo()` compara contra UNA persona, y en
 * el momento en que un paso admite «cualquiera de estos dos» hay que revisar
 * todo lo que lee la cadena — avisos, recordatorios, cola bancaria, alertas de
 * segregación.
 */
export function jefeQueSeEntera(opts: {
  solicitanteId:         string
  beneficiarioId:        string
  jefeDelBeneficiario:   string | null
  aprobadorDelDocumento: string | null
}): string | null {
  // Pidió el suyo: su jefe no tiene nada que enterarse que no sepa
  if (opts.solicitanteId === opts.beneficiarioId) return null
  const jefe = opts.jefeDelBeneficiario
  if (!jefe) return null
  // Ya le va a llegar como aprobador, o es el beneficiario mismo
  if (jefe === opts.aprobadorDelDocumento) return null
  if (jefe === opts.beneficiarioId) return null
  return jefe
}
