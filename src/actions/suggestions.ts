'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'

async function getProfile() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('users')
    .select('id, org_id, role')
    .eq('id', user.id)
    .single()

  if (!profile) throw new Error('Perfil no encontrado')
  return { supabase, userId: user.id, profile }
}

export async function submitSuggestion(data: {
  content:  string
  category: 'mejora' | 'error' | 'consulta' | 'otro'
}) {
  const { supabase, userId, profile } = await getProfile()

  const { error } = await supabase.from('suggestions').insert({
    org_id:   profile.org_id,
    user_id:  userId,
    content:  data.content.trim(),
    category: data.category,
  })

  if (error) throw new Error(error.message)
  revalidatePath('/suggestions')
}

export async function getMySuggestions() {
  const { supabase, userId } = await getProfile()

  const { data } = await supabase
    .from('suggestions')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })

  return data ?? []
}

export async function getAllSuggestions() {
  const { supabase, profile } = await getProfile()

  if (profile.role !== 'admin') throw new Error('Solo administradores')

  const { data } = await supabase
    .from('suggestions')
    .select('*')
    .eq('org_id', profile.org_id)
    .order('created_at', { ascending: false })

  if (!data?.length) return []

  const userIds = [...new Set(data.map(s => s.user_id))]
  const { data: users } = await supabase
    .from('users')
    .select('id, full_name')
    .in('id', userIds)

  const userMap = Object.fromEntries((users ?? []).map(u => [u.id, u.full_name]))

  return data.map(s => ({ ...s, user_name: userMap[s.user_id] ?? 'Desconocido' }))
}

export async function updateSuggestionStatus(
  id: string,
  status: 'pending' | 'reviewing' | 'done' | 'dismissed',
  adminNotes?: string,
) {
  const { supabase, profile } = await getProfile()
  if (profile.role !== 'admin') throw new Error('Solo administradores')

  const { error } = await supabase
    .from('suggestions')
    .update({ status, admin_notes: adminNotes ?? null })
    .eq('id', id)
    .eq('org_id', profile.org_id)

  if (error) throw new Error(error.message)
  revalidatePath('/suggestions')
}
