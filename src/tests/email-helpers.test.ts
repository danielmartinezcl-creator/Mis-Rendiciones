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
  const PRODUCCION   = { VERCEL_ENV: 'production' }

  it('rechaza cuando la clave no está definida', () => {
    const r = revisarConfigCorreo(undefined, 'hola@empresa.cl', PRODUCCION)
    expect(r.puedeEnviar).toBe(false)
    if (!r.puedeEnviar) expect(r.motivo).toContain('RESEND_API_KEY')
  })

  it('rechaza la clave vacía', () => {
    const r = revisarConfigCorreo('   ', 'hola@empresa.cl', PRODUCCION)
    expect(r.puedeEnviar).toBe(false)
  })

  it('rechaza el marcador de posición', () => {
    const r = revisarConfigCorreo('placeholder', 'hola@empresa.cl', PRODUCCION)
    expect(r.puedeEnviar).toBe(false)
  })

  /* El caso exacto que estaba en producción. */
  it('rechaza una clave de 9 caracteres que no empieza con re_', () => {
    const r = revisarConfigCorreo('abc123xyz', 'hola@empresa.cl', PRODUCCION)
    expect(r.puedeEnviar).toBe(false)
    if (!r.puedeEnviar) expect(r.motivo).toContain('re_')
  })

  it('rechaza una clave que empieza bien pero es demasiado corta', () => {
    const r = revisarConfigCorreo('re_abc', 'hola@empresa.cl', PRODUCCION)
    expect(r.puedeEnviar).toBe(false)
  })

  it('acepta una clave con la forma correcta', () => {
    const r = revisarConfigCorreo(CLAVE_VALIDA, 'hola@empresa.cl', PRODUCCION)
    expect(r.puedeEnviar).toBe(true)
    if (r.puedeEnviar) expect(r.desde).toBe('hola@empresa.cl')
  })

  it('usa el remitente por omisión cuando no hay uno configurado', () => {
    const r = revisarConfigCorreo(CLAVE_VALIDA, undefined, PRODUCCION)
    expect(r.puedeEnviar).toBe(true)
    if (r.puedeEnviar) expect(r.desde).toBe('noreply@mi-rendicion.com')
  })

  it('ignora espacios alrededor de la clave y del remitente', () => {
    const r = revisarConfigCorreo(`  ${CLAVE_VALIDA}  `, '  hola@empresa.cl  ', PRODUCCION)
    expect(r.puedeEnviar).toBe(true)
    if (r.puedeEnviar) expect(r.desde).toBe('hola@empresa.cl')
  })
})

/**
 * El candado de correo (2026-10-07). Existe por un incidente: una prueba
 * automatizada corrida contra el servidor LOCAL —que apunta a la base real y
 * tenía una clave de Resend que funcionaba— hizo clic en «Invitar sin invitar»
 * y salieron 52 invitaciones a empleados reales, con la app a medio
 * reconfigurar.
 *
 * Dos reglas, en el único punto que decide si un correo sale:
 *   1. Fuera de producción no sale nada. Ni en local, ni en los previews de
 *      Vercel, que también apuntan a la base real.
 *   2. En producción, CORREO_PAUSADO corta todo hasta que se apague.
 */
describe('revisarConfigCorreo — el candado', () => {
  const CLAVE = 're_' + 'a'.repeat(30)

  it('fuera de producción no envía, aunque la clave sea válida', () => {
    const r = revisarConfigCorreo(CLAVE, 'hola@empresa.cl', {})
    expect(r.puedeEnviar).toBe(false)
    if (!r.puedeEnviar) expect(r.motivo).toContain('producción')
  })

  it('en un preview de Vercel tampoco: comparte la base con producción', () => {
    const r = revisarConfigCorreo(CLAVE, 'hola@empresa.cl', { VERCEL_ENV: 'preview' })
    expect(r.puedeEnviar).toBe(false)
  })

  it('en producción, CORREO_PAUSADO corta todo', () => {
    const r = revisarConfigCorreo(CLAVE, 'hola@empresa.cl', { VERCEL_ENV: 'production', CORREO_PAUSADO: '1' })
    expect(r.puedeEnviar).toBe(false)
    if (!r.puedeEnviar) expect(r.motivo).toContain('pausad')
  })

  it.each(['', '0', 'false', 'no', '  '])('CORREO_PAUSADO=%j no pausa', valor => {
    const r = revisarConfigCorreo(CLAVE, 'hola@empresa.cl', { VERCEL_ENV: 'production', CORREO_PAUSADO: valor })
    expect(r.puedeEnviar).toBe(true)
  })

  // Falla cerrado: un valor que no se entiende pausa. Un error de tipeo al
  // apagar la pausa deja todo callado, que es el error barato.
  it('un valor que no se entiende pausa, no deja pasar', () => {
    const r = revisarConfigCorreo(CLAVE, 'hola@empresa.cl', { VERCEL_ENV: 'production', CORREO_PAUSADO: 'sí por ahora' })
    expect(r.puedeEnviar).toBe(false)
  })

  it('el candado se mira antes que la clave: sin producción, ni siquiera se valida', () => {
    const r = revisarConfigCorreo(undefined, undefined, {})
    expect(r.puedeEnviar).toBe(false)
    if (!r.puedeEnviar) expect(r.motivo).toContain('producción')
  })
})
