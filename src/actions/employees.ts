'use server'

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { revalidatePath } from 'next/cache'

export type ImportEmployeeRow = {
  full_name:       string
  email:           string
  role:            'admin' | 'approver' | 'employee'
  department?:     string
  cost_center_id?: string
}

export type ImportResult = {
  email: string
  full_name: string
  success: boolean
  error?: string
}

export async function importEmployees(rows: ImportEmployeeRow[]): Promise<ImportResult[]> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('No autenticado')

  const { data: profile } = await supabase
    .from('users')
    .select('org_id, role')
    .eq('id', user.id)
    .single()

  if (!profile || profile.role !== 'admin') {
    throw new Error('Solo administradores pueden importar empleados')
  }

  const adminClient = createAdminClient()
  const results: ImportResult[] = []

  for (const row of rows) {
    try {
      /* inviteUserByEmail crea el usuario en auth Y envía el email de invitación
         automáticamente via el SMTP configurado en Supabase — sin necesitar Resend */
      const { data: invited, error: inviteError } = await adminClient.auth.admin.inviteUserByEmail(
        row.email,
        {
          data: { full_name: row.full_name },
          redirectTo: `${process.env.NEXT_PUBLIC_APP_URL ?? ''}/api/auth/callback?next=/set-password`,
        }
      )

      if (inviteError) {
        results.push({ email: row.email, full_name: row.full_name, success: false, error: inviteError.message })
        continue
      }

      const { error: insertError } = await adminClient
        .from('users')
        .insert({
          id:             invited.user.id,
          org_id:         profile.org_id,
          full_name:      row.full_name.trim(),
          role:           row.role,
          department:     row.department?.trim() || null,
          can_submit:     row.role !== 'approver',
          can_approve:    row.role === 'approver' || row.role === 'admin',
          is_active:      true,
          cost_center_id: row.cost_center_id ?? null,
        })

      if (insertError) {
        await adminClient.auth.admin.deleteUser(invited.user.id)
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
