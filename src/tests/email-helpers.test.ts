import { describe, it, expect } from 'vitest'
import { revisarConfigCorreo } from '@/lib/email-helpers'

/**
 * Estos tests existen por un defecto concreto: `sendInvitations` mandaba una
 * clave inválida a Resend, se tragaba el rechazo con un `.catch(() => {})` y
 * marcaba al empleado como invitado igual. Con 54 personas eso significa 54
 * invitaciones quemadas sin que nadie se entere.
 *
 * La clave real en producción tenía 9 caracteres y NO era literalmente
 * 'placeholder', así que pasaba la única comprobación que había.
 */
describe('revisarConfigCorreo', () => {
  const CLAVE_VALIDA = 're_' + 'a'.repeat(30)

  it('rechaza cuando la clave no está definida', () => {
    const r = revisarConfigCorreo(undefined, 'hola@empresa.cl')
    expect(r.puedeEnviar).toBe(false)
    if (!r.puedeEnviar) expect(r.motivo).toContain('RESEND_API_KEY')
  })

  it('rechaza la clave vacía', () => {
    const r = revisarConfigCorreo('   ', 'hola@empresa.cl')
    expect(r.puedeEnviar).toBe(false)
  })

  it('rechaza el marcador de posición', () => {
    const r = revisarConfigCorreo('placeholder', 'hola@empresa.cl')
    expect(r.puedeEnviar).toBe(false)
  })

  /* El caso exacto que estaba en producción. */
  it('rechaza una clave de 9 caracteres que no empieza con re_', () => {
    const r = revisarConfigCorreo('abc123xyz', 'hola@empresa.cl')
    expect(r.puedeEnviar).toBe(false)
    if (!r.puedeEnviar) expect(r.motivo).toContain('re_')
  })

  it('rechaza una clave que empieza bien pero es demasiado corta', () => {
    const r = revisarConfigCorreo('re_abc', 'hola@empresa.cl')
    expect(r.puedeEnviar).toBe(false)
  })

  it('acepta una clave con la forma correcta', () => {
    const r = revisarConfigCorreo(CLAVE_VALIDA, 'hola@empresa.cl')
    expect(r.puedeEnviar).toBe(true)
    if (r.puedeEnviar) expect(r.desde).toBe('hola@empresa.cl')
  })

  it('usa el remitente por omisión cuando no hay uno configurado', () => {
    const r = revisarConfigCorreo(CLAVE_VALIDA, undefined)
    expect(r.puedeEnviar).toBe(true)
    if (r.puedeEnviar) expect(r.desde).toBe('noreply@mi-rendicion.com')
  })

  it('ignora espacios alrededor de la clave y del remitente', () => {
    const r = revisarConfigCorreo(`  ${CLAVE_VALIDA}  `, '  hola@empresa.cl  ')
    expect(r.puedeEnviar).toBe(true)
    if (r.puedeEnviar) expect(r.desde).toBe('hola@empresa.cl')
  })
})
