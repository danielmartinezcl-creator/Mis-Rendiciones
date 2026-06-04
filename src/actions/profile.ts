'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'

export async function getMyProfile() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data } = await supabase
    .from('users')
    .select('*')
    .eq('id', user.id)
    .single()

  return data ? { ...data, email: user.email ?? '' } : null
}

export async function updateProfile(updates: {
  full_name?: string
  rut?: string | null
  department?: string | null
  bank_account?: string | null
  bank_name?: string | null
  bank_account_type?: string | null
}) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('No autenticado')

  const clean: typeof updates = {}
  if (updates.full_name?.trim())       clean.full_name         = updates.full_name.trim()
  if ('rut'               in updates)  clean.rut               = updates.rut?.trim()               || null
  if ('department'        in updates)  clean.department        = updates.department?.trim()         || null
  if ('bank_account'      in updates)  clean.bank_account      = updates.bank_account?.trim()      || null
  if ('bank_name'         in updates)  clean.bank_name         = updates.bank_name?.trim()         || null
  if ('bank_account_type' in updates)  clean.bank_account_type = updates.bank_account_type?.trim() || null

  const { error } = await supabase
    .from('users')
    .update(clean)
    .eq('id', user.id)

  if (error) throw new Error(error.message)
  revalidatePath('/profile')
}

export async function sendPasswordReset() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user?.email) throw new Error('No se pudo obtener el email del usuario')

  const { error } = await supabase.auth.resetPasswordForEmail(user.email, {
    redirectTo: `${process.env.NEXT_PUBLIC_APP_URL}/auth/reset-password`,
  })
  if (error) throw new Error(error.message)
}
