'use client'

import { useCallback } from 'react'
import { useRealtimeNotifications } from '@/hooks/useRealtimeNotifications'
import { useDialogos } from '@/components/ui/Dialogos'
import { textoNotificacion } from '@/lib/notificaciones'
import type { Notification } from '@/lib/supabase/types'

interface Props {
  userId: string | null
  children: React.ReactNode
}

// Va DENTRO de <ProveedorDialogos> en el layout: el aviso es su `avisar()`.
export function RealtimeProvider({ userId, children }: Props) {
  const { avisar } = useDialogos()

  const handleNew = useCallback((n: Notification) => {
    // Dispatchar un CustomEvent para que otros componentes puedan reaccionar
    window.dispatchEvent(new CustomEvent('notification:new', { detail: n }))

    // La píldora de la §5 de la spec. Sin texto conocido, ningún aviso.
    const texto = textoNotificacion(n)
    if (texto) avisar(texto)
  }, [avisar])

  useRealtimeNotifications(userId, handleNew)
  return <>{children}</>
}
