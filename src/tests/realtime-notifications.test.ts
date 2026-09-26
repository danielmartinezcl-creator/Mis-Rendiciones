import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { useRealtimeNotifications } from '@/hooks/useRealtimeNotifications'

/* Realtime filtra cada fila con RLS usando el token que viaja en el join.
   realtime-js (2.106) arma el join en el mismo momento del subscribe() y busca
   el token de la sesión en paralelo: si subscribe() va primero, el join sale
   sin token, el canal queda como anon y la política «user_id = auth.uid()»
   descarta cada notificación en silencio. Visto en el navegador el 2026-09-25. */

const registro = vi.hoisted(() => ({ pasos: [] as string[] }))

vi.mock('@/lib/supabase/client', () => ({
  createClient: () => {
    const canal = {
      on:          () => canal,
      subscribe:   () => { registro.pasos.push('subscribe'); return canal },
      unsubscribe: async () => 'ok',
    }
    return {
      realtime: { setAuth: async () => { await Promise.resolve(); registro.pasos.push('setAuth') } },
      channel:  () => canal,
      removeChannel: async () => { registro.pasos.push('removeChannel'); return 'ok' },
    }
  },
}))

beforeEach(() => { registro.pasos = [] })

describe('useRealtimeNotifications', () => {
  it('carga el token de la sesión antes de suscribirse', async () => {
    renderHook(() => useRealtimeNotifications('u-1', () => {}))
    await waitFor(() => expect(registro.pasos).toContain('subscribe'))
    expect(registro.pasos).toEqual(['setAuth', 'subscribe'])
  })

  it('si se desmonta antes de tener el token, no abre el canal', async () => {
    // Es lo que hace StrictMode en desarrollo: montar, desmontar y montar
    const { unmount } = renderHook(() => useRealtimeNotifications('u-1', () => {}))
    unmount()
    await new Promise(r => setTimeout(r, 0))
    expect(registro.pasos).not.toContain('subscribe')
  })
})
