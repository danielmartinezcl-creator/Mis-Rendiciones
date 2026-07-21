import { cache } from 'react'
import { createClient } from '@/lib/supabase/server'

// cache() de React deduplica llamadas dentro del mismo request de servidor.
// Cualquier página bajo (app)/layout que llame getAuthUser() obtiene el resultado
// cacheado — sin round-trip adicional a Supabase Auth.

export const getAuthUser = cache(async () => {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  return user ?? null
})

export const getAuthProfile = cache(async () => {
  const user = await getAuthUser()
  if (!user) return null
  const supabase = await createClient()
  const { data } = await supabase
    .from('users')
    .select('id, full_name, role, can_submit, can_approve, can_manage_petty_cash, department, org_id, is_active, approver_l1_id, approver_l2_id, cost_center_id, rut, bank_account, bank_name, bank_account_type, invited_at, created_at, deleted_at')
    .eq('id', user.id)
    .single()
  return data
})
