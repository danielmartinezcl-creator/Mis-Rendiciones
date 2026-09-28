import { describe, it, expect } from 'vitest'
import { esRutaPublica } from '@/lib/rutas-publicas'

/* Hasta el 2026-09-28 el proxy mandaba /api/cron al login: Vercel llama al cron
   sin cookies de sesión, así que recibía un 307 y el handler nunca corría. */

describe('esRutaPublica: lo que el proxy deja pasar sin sesión', () => {
  it('el cron: lo llama Vercel sin cookies y lo protege CRON_SECRET', () => {
    expect(esRutaPublica('/api/cron/reminders')).toBe(true)
  })

  it('el login, la contraseña inicial y el canje de OAuth', () => {
    for (const p of ['/login', '/register', '/set-password', '/api/auth/callback']) {
      expect(esRutaPublica(p), p).toBe(true)
    }
  })

  it('todo lo demás pide sesión', () => {
    for (const p of ['/', '/admin', '/banco', '/expenses/new', '/api/otra']) {
      expect(esRutaPublica(p), p).toBe(false)
    }
  })

  it('compara por segmento, no por prefijo', () => {
    expect(esRutaPublica('/api/cronograma')).toBe(false)
    expect(esRutaPublica('/loginx')).toBe(false)
  })
})
