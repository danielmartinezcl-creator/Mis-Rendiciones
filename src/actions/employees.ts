'use server'

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { revalidatePath } from 'next/cache'

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

  for (const row of rows) {
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

      // Enviar invitación
      const { error: inviteError } = await adminClient.auth.admin.inviteUserByEmail(email, {
        redirectTo: `${process.env.NEXT_PUBLIC_APP_URL ?? ''}/api/auth/callback?next=/set-password`,
      })

      if (inviteError) {
        results.push({ userId, email, full_name, success: false, error: inviteError.message })
        continue
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
