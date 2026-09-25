'use server'

// Solo lo que el navegador usa: leer y marcar las notificaciones propias.
// Los avisos (crear notificaciones y mandar correos) viven en src/lib/avisos.ts:
// como acciones del servidor, cualquier sesión podía invocarlos desde el navegador.

import { createClient } from '@/lib/supabase/server'

export async function getMyNotifications() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return []

  const { data } = await supabase
    .from('notifications')
    .select('*')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false })
    .limit(20)

  return data ?? []
}

export async function markNotificationRead(notificationId: string) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return

  await supabase
    .from('notifications')
    .update({ read: true })
    .eq('id', notificationId)
    .eq('user_id', user.id)  // solo marcar las propias notificaciones
}
