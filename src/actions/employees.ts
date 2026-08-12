'use server'

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { revalidatePath } from 'next/cache'
import { validateRut } from '@/lib/validators'

export type ImportEmployeeRow = {
  full_name:       string
  email:           string
  role:            'admin' | 'approver' | 'employee'
  rut?:            string
  department?:     string
  cost_center_id?: string
}

export type ImportResult = {
  email: string
  full_name: string
  success: boolean
  error?: string
}

export type InviteResult = {
  userId: string
  email: string
  full_name: string
  success: boolean
  error?: string
}

async function getAdminContext() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('No autenticado')

  const { data: profile } = await supabase
    .from('users')
    .select('org_id, role')
    .eq('id', user.id)
    .single()

  if (!profile || profile.role !== 'admin') {
    throw new Error('Solo administradores pueden realizar esta acción')
  }

  return { supabase, profile, adminClient: createAdminClient() }
}

// ── Importar empleados (SIN enviar email) ────────────────────────────────────

export async function importEmployees(rows: ImportEmployeeRow[]): Promise<ImportResult[]> {
  const { profile, adminClient } = await getAdminContext()
  const results: ImportResult[] = []

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i]
    // Validar RUT del empleado si viene en la fila
    if (row.rut) {
      const normalized = row.rut.trim().toUpperCase().replace(/\./g, '')
      if (!validateRut(normalized)) {
        results.push({ email: row.email, full_name: row.full_name, success: false, error: `RUT inválido "${row.rut}"` })
        continue
      }
    }

    try {
      // createUser crea la cuenta SIN enviar email de invitación
      const { data: created, error: createError } = await adminClient.auth.admin.createUser({
        email:          row.email,
        email_confirm:  false,
        user_metadata:  { full_name: row.full_name },
      })

      if (createError) {
        results.push({ email: row.email, full_name: row.full_name, success: false, error: createError.message })
        continue
      }

      const { error: insertError } = await adminClient
        .from('users')
        .insert({
          id:             created.user.id,
          org_id:         profile.org_id,
          full_name:      row.full_name.trim(),
          role:           row.role,
          rut:            row.rut?.trim() || null,
          department:     row.department?.trim() || null,
          can_submit:     row.role !== 'approver',
          can_approve:    row.role === 'approver' || row.role === 'admin',
          is_active:      true,
          cost_center_id: row.cost_center_id ?? null,
          // invited_at queda null — el admin envía la invitación manualmente
        })

      if (insertError) {
        // Revertir: borrar el usuario de auth si el insert a public.users falló
        await adminClient.auth.admin.deleteUser(created.user.id)
        results.push({ email: row.email, full_name: row.full_name, success: false, error: insertError.message })
        continue
      }

      results.push({ email: row.email, full_name: row.full_name, success: true })
    } catch (err) {
      results.push({ email: row.email, full_name: row.full_name, success: false, error: String(err) })
    }
  }

  revalidatePath('/admin/employees')
  return results
}

// ── Enviar invitaciones (manual, controlado por el admin) ────────────────────

export async function sendInvitations(userIds: string[]): Promise<InviteResult[]> {
  const { adminClient } = await getAdminContext()
  const results: InviteResult[] = []

  const appUrl      = process.env.NEXT_PUBLIC_APP_URL ?? ''
  const resendKey   = process.env.RESEND_API_KEY
  const fromEmail   = process.env.RESEND_FROM_EMAIL ?? 'noreply@mi-rendicion.com'
  const redirectTo  = `${appUrl}/api/auth/callback?next=/set-password`

  for (const userId of userIds) {
    try {
      // Obtener email desde auth.users via admin API
      const { data: authUser, error: getUserError } = await adminClient.auth.admin.getUserById(userId)
      if (getUserError || !authUser?.user?.email) {
        results.push({ userId, email: '', full_name: '', success: false, error: 'No se pudo obtener el email del usuario' })
        continue
      }

      const email = authUser.user.email

      // Obtener nombre desde public.users
      const { data: profile } = await adminClient.from('users').select('full_name').eq('id', userId).single()
      const full_name = profile?.full_name ?? email

      // Los empleados importados ya tienen cuenta en auth (creada por importEmployees con createUser).
      // inviteUserByEmail falla para usuarios existentes — usamos generateLink(recovery) en su lugar.
      const { data: linkData, error: linkError } = await adminClient.auth.admin.generateLink({
        type:    'recovery',
        email,
        options: { redirectTo },
      })

      if (linkError || !linkData?.properties?.action_link) {
        results.push({ userId, email, full_name, success: false, error: linkError?.message ?? 'Error generando link de acceso' })
        continue
      }

      const actionLink = linkData.properties.action_link

      // Enviar email via Resend si está configurado
      if (resendKey && resendKey !== 'placeholder') {
        const { Resend } = await import('resend')
        const resend = new Resend(resendKey)
        await resend.emails.send({
          from:    `Mi Rendición <${fromEmail}>`,
          to:      [email],
          subject: 'Mi Rendición — Configura tu acceso',
          html:    `<p>Hola ${full_name},</p>
                    <p>Tienes acceso a <strong>Mi Rendición</strong>, el sistema de rendición de gastos de tu empresa. Haz clic en el botón para crear tu contraseña.</p>
                    <p style="margin:24px 0">
                      <a href="${actionLink}" style="background:#0D9488;color:#fff;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:600;display:inline-block">
                        Crear contraseña →
                      </a>
                    </p>
                    <p style="color:#888;font-size:12px">Este enlace expira en 24 horas. Si no solicitaste esto, podés ignorar este correo.</p>`,
        }).catch(() => {})
      }

      // Marcar como invitado
      await adminClient.from('users').update({ invited_at: new Date().toISOString() }).eq('id', userId)

      results.push({ userId, email, full_name, success: true })
    } catch (err) {
      results.push({ userId, email: '', full_name: '', success: false, error: String(err) })
    }
  }

  revalidatePath('/admin/employees')
  return results
}

// ── Validación de complejidad de contraseña ──────────────────────────────────

function validatePassword(pwd: string): string | null {
  if (pwd.length < 8)       return 'Mínimo 8 caracteres'
  if (!/[A-Z]/.test(pwd))  return 'Debe incluir al menos una mayúscula'
  if (!/[0-9]/.test(pwd))  return 'Debe incluir al menos un número'
  return null
}

// ── Establecer contraseña de empleado sin enviar email ───────────────────────

export async function setEmployeePassword(userId: string, newPassword: string): Promise<void> {
  const pwdError = validatePassword(newPassword)
  if (pwdError) throw new Error(pwdError)
  const { adminClient } = await getAdminContext()
  const { error } = await adminClient.auth.admin.updateUserById(userId, {
    password:      newPassword,
    email_confirm: true,   // confirma el email para que pueda iniciar sesión
  })
  if (error) throw new Error(error.message)
}
