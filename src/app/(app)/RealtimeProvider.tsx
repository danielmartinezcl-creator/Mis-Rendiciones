'use client'

import { BRAND } from '@/lib/design-tokens'
import { useCallback } from 'react'
import { useRealtimeNotifications } from '@/hooks/useRealtimeNotifications'

interface Props {
  userId: string | null
  children: React.ReactNode
}

export function RealtimeProvider({ userId, children }: Props) {
  const handleNew = useCallback((n: { title: string; body: string; type: string }) => {
    // Dispatchar un CustomEvent para que otros componentes puedan reaccionar
    window.dispatchEvent(new CustomEvent('notification:new', { detail: n }))

    // Toast simple nativo (sin librería externa)
    const container = document.createElement('div')
    container.style.cssText = [
      'position:fixed',
      'bottom:24px',
      'right:24px',
      'z-index:9999',
      `background:${BRAND.accent}`,
      'color:white',
      'padding:12px 16px',
      'border-radius:12px',
      'max-width:320px',
      'box-shadow:0 4px 12px rgba(0,0,0,0.15)',
      'font-family:inherit',
      'font-size:14px',
      'cursor:pointer',
      'transition:opacity 0.3s',
    ].join(';')

    // I-1: Usar textContent en lugar de innerHTML para evitar XSS
    const titleEl = document.createElement('div')
    titleEl.style.cssText = 'font-weight:600;margin-bottom:2px'
    titleEl.textContent = n.title ?? ''

    const messageEl = document.createElement('div')
    messageEl.style.cssText = 'opacity:0.9;font-size:13px'
    messageEl.textContent = n.body ?? ''

    container.appendChild(titleEl)
    container.appendChild(messageEl)

    container.onclick = () => container.remove()
    document.body.appendChild(container)

    setTimeout(() => {
      container.style.opacity = '0'
      setTimeout(() => container.remove(), 300)
    }, 5000)
  }, [])

  useRealtimeNotifications(userId, handleNew)
  return <>{children}</>
}
