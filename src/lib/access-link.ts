import { BRAND } from '@/lib/design-tokens'

/**
 * El link de acceso que va en los correos de invitación y de recuperación.
 *
 * Existe por lo que le pasó a Roberto Hagar el 2026-09-23. El link anterior
 * apuntaba a `/auth/v1/verify` de Supabase, que gasta el token de un solo uso
 * con un simple GET. El filtro de seguridad de Outlook abre todos los links de
 * cada correo para revisarlos —los registros muestran GET y HEAD desde IPs de
 * Microsoft— así que el token llegaba gastado y la persona veía «el link
 * expiró». Y aunque llegara entero, `generateLink` devuelve la sesión en el
 * `#hash` y `/api/auth/callback` esperaba un `?code=`: terminaba en el login
 * igual.
 *
 * Ahora el link solo ABRE `/set-password`. El token se canjea recién cuando la
 * persona aprieta «Guardar contraseña», y eso un escáner no lo hace nunca.
 */

export type MotivoAcceso = 'invitacion' | 'recuperacion'

export function buildAccessLink(appUrl: string, hashedToken: string): string {
  const base = appUrl.replace(/\/+$/, '')
  const params = new URLSearchParams({ token_hash: hashedToken, type: 'recovery' })
  return `${base}/set-password?${params.toString()}`
}

function escaparHtml(texto: string): string {
  return texto
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

export function buildAccessEmail(
  motivo: MotivoAcceso,
  nombre: string,
  link: string,
): { subject: string; html: string } {
  const invitacion = motivo === 'invitacion'
  const subject = invitacion
    ? 'Mi Rendición — Configura tu acceso'
    : 'Mi Rendición — Crea una nueva contraseña'
  const intro = invitacion
    ? 'Tienes acceso a <strong>Mi Rendición</strong>, el sistema de rendición de gastos de tu empresa. Haz clic en el botón para crear tu contraseña.'
    : 'Recibimos un pedido para cambiar tu contraseña de <strong>Mi Rendición</strong>. Haz clic en el botón para crear una nueva.'
  const pie = invitacion
    ? 'Este enlace vence en 24 horas. Si no esperabas este correo, puedes ignorarlo.'
    : 'Este enlace vence en 24 horas. Si no pediste el cambio, ignora este correo: tu contraseña actual sigue funcionando.'

  const html = `<p>Hola ${escaparHtml(nombre)},</p>
<p>${intro}</p>
<p style="margin:24px 0">
  <a href="${escaparHtml(link)}" style="background:${BRAND.accent};color:#fff;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:600;display:inline-block">
    Crear contraseña →
  </a>
</p>
<p style="color:#888;font-size:12px">${pie}</p>`

  return { subject, html }
}
