import type { Resend } from 'resend'
import { createAdminClient } from '@/lib/supabase/admin'
import { revisarConfigCorreo } from '@/lib/email-helpers'
import { checkRateLimit } from '@/lib/rate-limit'
import { buildAccessEmail, buildAccessLink, type MotivoAcceso } from '@/lib/access-link'

/**
 * Genera el token de acceso y lo manda por Resend. Es el ÚNICO camino por el
 * que sale un link de contraseña: invitación, reenvío, «¿Olvidaste tu
 * contraseña?» y el botón del perfil.
 *
 * No usa el SMTP de Supabase Auth a propósito: ese es otro canal, con otra
 * credencial cargada en otro lugar (el dashboard), y el 2026-09-23 estaba
 * roto (`535 Authentication failed`) mientras Resend andaba bien.
 *
 * Solo para el servidor: recibe el cliente de service role.
 */
export async function enviarLinkDeAcceso(opts: {
  adminClient: ReturnType<typeof createAdminClient>
  resend:      Resend
  desde:       string
  appUrl:      string
  email:       string
  nombre:      string
  motivo:      MotivoAcceso
}): Promise<{ ok: true; userId: string } | { ok: false; error: string }> {
  const { adminClient, resend, desde, appUrl, email, nombre, motivo } = opts

  /* `recovery` y no `invite`: los empleados ya tienen cuenta en auth (la crea
     importEmployees), y `invite` falla con usuarios existentes. */
  const { data, error } = await adminClient.auth.admin.generateLink({ type: 'recovery', email })
  const hashedToken = data?.properties?.hashed_token
  if (error || !hashedToken || !data.user) {
    return { ok: false, error: error?.message ?? 'No se pudo generar el link de acceso' }
  }

  const { subject, html } = buildAccessEmail(motivo, nombre, buildAccessLink(appUrl, hashedToken))
  const { error: errorEnvio } = await resend.emails.send({
    from: `Mi Rendición <${desde}>`,
    to:   [email],
    subject,
    html,
  })
  if (errorEnvio) return { ok: false, error: `Resend rechazó el envío: ${errorEnvio.message}` }

  return { ok: true, userId: data.user.id }
}

/**
 * «¿Olvidaste tu contraseña?» — lo llama gente SIN sesión, así que:
 * - nunca revela si el correo existe (misma respuesta en los dos casos);
 * - un empleado bloqueado no recibe link;
 * - tope de 3 por hora por cuenta, para que nadie use el formulario para
 *   llenarle la bandeja a un compañero.
 *
 * Devuelve `false` solo cuando el sistema de correo no puede enviar: eso sí
 * hay que decirlo, porque si no la persona espera un mail que no va a llegar.
 */
export async function enviarRecuperacion(email: string): Promise<{ ok: boolean }> {
  const correo = revisarConfigCorreo(process.env.RESEND_API_KEY, process.env.RESEND_FROM_EMAIL)
  if (!correo.puedeEnviar) {
    console.error('[recuperación] correo no configurado:', correo.motivo)
    return { ok: false }
  }

  const limpio = email.trim().toLowerCase()
  if (!limpio.includes('@')) return { ok: true }

  const adminClient = createAdminClient()

  /* Se busca la cuenta ANTES de generar nada: generar un link invalida el
     anterior, y eso tampoco debe poder dispararlo un desconocido sin tope. */
  const { data: lista } = await adminClient.auth.admin.listUsers({ page: 1, perPage: 1000 })
  const cuenta = lista?.users.find(u => u.email?.toLowerCase() === limpio)
  if (!cuenta) return { ok: true }

  const { data: perfil } = await adminClient
    .from('users').select('full_name, blocked_at').eq('id', cuenta.id).maybeSingle()
  if (!perfil || perfil.blocked_at) return { ok: true }

  const { allowed } = await checkRateLimit(cuenta.id, 'password_reset', 3)
  if (!allowed) return { ok: true }

  const { Resend } = await import('resend')
  const envio = await enviarLinkDeAcceso({
    adminClient,
    resend: new Resend((process.env.RESEND_API_KEY ?? '').trim()),
    desde:  correo.desde,
    appUrl: process.env.NEXT_PUBLIC_APP_URL ?? '',
    email:  cuenta.email!,
    nombre: perfil.full_name ?? cuenta.email!,
    motivo: 'recuperacion',
  })
  if (!envio.ok) {
    console.error('[recuperación] falló el envío:', envio.error)
    return { ok: false }
  }
  return { ok: true }
}
