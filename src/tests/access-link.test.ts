import { describe, it, expect } from 'vitest'
import { buildAccessEmail, buildAccessLink } from '@/lib/access-link'

/**
 * El 2026-09-23 una invitación a rhagar@pentaingenieros.cl llegó bien y no
 * sirvió: el link iba a `/auth/v1/verify` de Supabase, que gasta el token con
 * un GET, y el filtro de Outlook lo abrió antes que la persona. Estos tests
 * fijan que el link del correo apunte a NUESTRA página y no al verificador.
 */
describe('buildAccessLink', () => {
  it('apunta a /set-password con el token_hash, no al /verify de Supabase', () => {
    const link = buildAccessLink('https://www.mi-rendicion.com', 'abc123')
    expect(link).toBe('https://www.mi-rendicion.com/set-password?token_hash=abc123&type=recovery')
    expect(link).not.toContain('/auth/v1/verify')
    expect(link).not.toContain('/api/auth/callback')
  })

  it('no duplica la barra si la URL de la app termina en /', () => {
    expect(buildAccessLink('https://www.mi-rendicion.com/', 'x'))
      .toBe('https://www.mi-rendicion.com/set-password?token_hash=x&type=recovery')
  })

  it('codifica el token', () => {
    expect(buildAccessLink('https://a.cl', 'a&b=c')).toContain('token_hash=a%26b%3Dc')
  })
})

describe('buildAccessEmail', () => {
  const link = 'https://a.cl/set-password?token_hash=t&type=recovery'

  it('invitación y recuperación tienen asuntos distintos', () => {
    expect(buildAccessEmail('invitacion', 'Ana', link).subject).toMatch(/Configura tu acceso/)
    expect(buildAccessEmail('recuperacion', 'Ana', link).subject).toMatch(/nueva contraseña/)
  })

  it('el botón lleva al link, con el & escapado para HTML', () => {
    const { html } = buildAccessEmail('invitacion', 'Ana', link)
    expect(html).toContain('href="https://a.cl/set-password?token_hash=t&amp;type=recovery"')
  })

  it('escapa el nombre', () => {
    const { html } = buildAccessEmail('invitacion', '<b>Ana</b>', link)
    expect(html).toContain('Hola &lt;b&gt;Ana&lt;/b&gt;,')
  })
})
