'use server'

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { revalidatePath } from 'next/cache'

export type ImportEmployeeRow = {
  full_name: string
  email: string
  role: 'admin' | 'approver' | 'employee'
  department?: string
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
      // Verificar si el email ya existe en la org
      const { data: existing } = await adminClient
        .from('users')
        .select('id')
        .eq('org_id', profile.org_id)

      // Intentar crear usuario en Auth + enviar invitación
      const { data: invited, error: inviteError } = await adminClient.auth.admin.createUser({
        email: row.email,
        email_confirm: false,
        user_metadata: { full_name: row.full_name },
      })

      if (inviteError) {
        results.push({ email: row.email, full_name: row.full_name, success: false, error: inviteError.message })
        continue
      }

      // Insertar en public.users
      const { error: insertError } = await adminClient
        .from('users')
        .insert({
          id: invited.user.id,
          org_id: profile.org_id,
          full_name: row.full_name.trim(),
          role: row.role,
          department: row.department?.trim() || null,
          can_submit: row.role !== 'approver',
          can_approve: row.role === 'approver' || row.role === 'admin',
          is_active: true,
        })

      if (insertError) {
        // Rollback: eliminar el usuario de auth si falla el insert
        await adminClient.auth.admin.deleteUser(invited.user.id)
        results.push({ email: row.email, full_name: row.full_name, success: false, error: insertError.message })
        continue
      }

      // Generar link de invitación (para mostrar al admin o enviar por Resend)
      await adminClient.auth.admin.generateLink({
        type: 'magiclink',
        email: row.email,
      })

      results.push({ email: row.email, full_name: row.full_name, success: true })
    } catch (err) {
      results.push({ email: row.email, full_name: row.full_name, success: false, error: String(err) })
    }
  }

  revalidatePath('/admin/employees')
  return results
}
