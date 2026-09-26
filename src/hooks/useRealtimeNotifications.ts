'use client'
import { useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import type { RealtimeChannel } from '@supabase/supabase-js'
import type { Notification } from '@/lib/supabase/types'

export function useRealtimeNotifications(
  userId: string | null,
  onNew: (notification: Notification) => void
) {
  useEffect(() => {
    if (!userId) return

    const supabase = createClient()
    let canal: RealtimeChannel | null = null
    let vigente = true

    // Primero el token, después el canal. Realtime filtra cada fila con RLS
    // usando el token que viaja en el join, y subscribe() arma el join en el
    // acto mientras la sesión se busca en paralelo: suscribirse primero dejaba
    // el canal como anon, «user_id = auth.uid()» descartaba cada notificación y
    // no llegaba ninguna. Los refrescos posteriores del token los propaga
    // supabase-js solo.
    supabase.realtime.setAuth()
      .then(() => {
        if (!vigente) return   // se desmontó mientras tanto (StrictMode lo hace siempre en dev)
        canal = supabase
          .channel(`notifications:${userId}`)
          .on(
            'postgres_changes',
            {
              event: 'INSERT',
              schema: 'public',
              table: 'notifications',
              filter: `user_id=eq.${userId}`,
            },
            // La fila tal cual es: el cast anterior prometía `title` y `body`, que
            // la tabla nunca tuvo, y el compilador no podía avisarlo
            payload => onNew(payload.new as Notification)
          )
          .subscribe()
      })
      .catch(e => console.error('[avisos] Realtime sin sesión: no llegarán avisos en vivo', e))

    return () => {
      vigente = false
      if (canal) supabase.removeChannel(canal)
    }
  }, [userId, onNew])
}
