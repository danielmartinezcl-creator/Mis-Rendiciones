// Qué confirmación pedir antes de mandar invitaciones por correo.
//
// Existe por el incidente del 2026-10-07: «Invitar sin invitar (52)» mandaba 52
// correos a empleados reales con un solo clic. El botón solo preguntaba cuando
// alguno YA estaba invitado, así que un lote nuevo —justo el de mayor alcance—
// salía sin preguntar nada.
//
// La regla: una persona sola no pide nada (el botón por fila es un acto
// deliberado); varias personas piden ESCRIBIR una palabra. Un clic —distraído o
// automatizado— no alcanza para llegar a la bandeja de mucha gente.

export interface ConfirmacionInvitacion {
  titulo:   string
  detalle:  string
  aceptar:  string
  palabra?: string
}

export const PALABRA_INVITAR = 'INVITAR'

export function confirmacionInvitacion(
  total: number,
  yaInvitados: { nombre: string; fecha: string }[],
): ConfirmacionInvitacion | null {
  if (total <= 0) return null

  if (total === 1) {
    if (!yaInvitados.length) return null
    const p = yaInvitados[0]
    return {
      titulo:  `${p.nombre} ya fue invitado el ${p.fecha}. ¿Reenviar igual?`,
      detalle: 'Le llega de nuevo el correo de bienvenida, con un link nuevo para crear su contraseña. El anterior deja de servir.',
      aceptar: 'Reenviar',
    }
  }

  const reenvios = yaInvitados.length
    ? ` ${yaInvitados.length} de ellos ya habían sido invitados y les llega de nuevo.`
    : ''
  return {
    titulo:  `¿Enviar ${total} invitaciones por correo?`,
    detalle: `Cada persona recibe un correo con un link para crear su contraseña y entrar a la app.${reenvios} Una vez enviados no se pueden retirar.`,
    aceptar: `Enviar ${total} invitaciones`,
    palabra: PALABRA_INVITAR,
  }
}
