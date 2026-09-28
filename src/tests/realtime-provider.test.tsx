import { describe, it, expect, vi } from 'vitest'
import { render, screen, act } from '@testing-library/react'
import { ProveedorDialogos } from '@/components/ui/Dialogos'
import { RealtimeProvider } from '@/app/(app)/RealtimeProvider'
import type { Notification } from '@/lib/supabase/types'

/* Sin Supabase: el hook se reemplaza por uno que guarda el callback, y el test
   le entrega una fila con la forma real de la tabla — la que llega por Realtime. */
const canal = vi.hoisted(() => ({ recibir: null as null | ((n: Notification) => void) }))
vi.mock('@/hooks/useRealtimeNotifications', () => ({
  useRealtimeNotifications: (_userId: string | null, onNew: (n: Notification) => void) => {
    canal.recibir = onNew
  },
}))

function fila(cambios: Partial<Notification>): Notification {
  return {
    id: 'n-1', org_id: 'o-1', user_id: 'u-1', type: 'approval',
    report_id: 'r-1', fund_id: null, read: false,
    created_at: '2026-09-25T12:00:00Z', dedup_key: null,
    ...cambios,
  }
}

describe('RealtimeProvider', () => {
  it('una notificación nueva sale como aviso flotante, con texto', () => {
    render(
      <ProveedorDialogos>
        <RealtimeProvider userId="u-1"><p>app</p></RealtimeProvider>
      </ProveedorDialogos>,
    )
    act(() => canal.recibir!(fila({ type: 'approval', report_id: 'r-1' })))
    expect(screen.getByRole('status')).toHaveTextContent('Tu rendición fue aprobada.')
  })
})
