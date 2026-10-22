import { describe, it, expect } from 'vitest'
import { revisarConfigCorreo, listaPermitidos, puedeRecibir, estaPausado, destinoDePrueba } from '@/lib/email-helpers'

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

/**
 * La lista de permitidos del piloto (`CORREO_SOLO_A`).
 *
 * Daniel, 2026-10-20: quiere probar la app en producción con seis personas
 * sin que le llegue un correo a los otros 55. La forma segura es una EXCEPCIÓN
 * a la pausa, no un reemplazo: borrar la lista no abre nada, porque
 * `CORREO_PAUSADO` sigue puesto y vuelve la pausa total.
 */
describe('CORREO_SOLO_A — la lista del piloto', () => {
  const CLAVE = 're_' + 'a'.repeat(30)
  const EN_PRODUCCION_Y_PAUSADO = { VERCEL_ENV: 'production', CORREO_PAUSADO: '1' }

  it('sin lista, la pausa sigue cortando todo', () => {
    const r = revisarConfigCorreo(CLAVE, 'de@empresa.cl', EN_PRODUCCION_Y_PAUSADO)
    expect(r.puedeEnviar).toBe(false)
  })

  it('con lista, el correo puede salir y la lista viaja con el permiso', () => {
    const r = revisarConfigCorreo(CLAVE, 'de@empresa.cl',
      { ...EN_PRODUCCION_Y_PAUSADO, CORREO_SOLO_A: 'ana@penta.cl, BRUNO@penta.cl' })
    expect(r.puedeEnviar).toBe(true)
    if (r.puedeEnviar) expect(r.soloA).toEqual(['ana@penta.cl', 'bruno@penta.cl'])
  })

  /* Lo que de verdad protege: la lista levanta la pausa, pero solo para
     quien está en ella. Quien no está no recibe, aunque el envío ya pasó
     todos los chequeos de configuración. */
  it('quien no está en la lista no recibe', () => {
    const soloA = listaPermitidos('ana@penta.cl,bruno@penta.cl')
    expect(puedeRecibir('ana@penta.cl', soloA)).toBe(true)
    expect(puedeRecibir('carla@penta.cl', soloA)).toBe(false)
  })

  /* La lista la escribe una persona en el panel de Vercel y el correo sale de
     auth.users: mayúsculas y espacios no pueden decidir quién recibe. */
  it('no le importan mayúsculas ni espacios', () => {
    const soloA = listaPermitidos('  Ana@Penta.CL , bruno@penta.cl ')
    expect(puedeRecibir('ANA@penta.cl', soloA)).toBe(true)
    expect(puedeRecibir(' bruno@penta.cl ', soloA)).toBe(true)
  })

  /* Sin lista NO filtra: es el caso de «se levantó la pausa de verdad», y ahí
     el permiso lo da revisarConfigCorreo, no esta función. */
  it('con la lista vacía no filtra a nadie', () => {
    expect(puedeRecibir('cualquiera@penta.cl', [])).toBe(true)
  })

  /* Falla cerrado: basura en la variable no abre nada, porque nada de eso
     parece una dirección y la lista queda vacía — y entonces manda la pausa. */
  it('una lista sin direcciones válidas es una lista vacía, y la pausa vuelve', () => {
    expect(listaPermitidos('si, claro, mandá')).toEqual([])
    const r = revisarConfigCorreo(CLAVE, 'de@empresa.cl',
      { ...EN_PRODUCCION_Y_PAUSADO, CORREO_SOLO_A: 'si, claro, mandá' })
    expect(r.puedeEnviar).toBe(false)
  })

  /* La lista NO es una puerta trasera para saltarse el entorno: fuera de
     producción sigue sin salir nada, que es el candado del incidente. */
  it('fuera de producción la lista no sirve de nada', () => {
    const r = revisarConfigCorreo(CLAVE, 'de@empresa.cl',
      { VERCEL_ENV: 'development', CORREO_SOLO_A: 'ana@penta.cl' })
    expect(r.puedeEnviar).toBe(false)
    if (!r.puedeEnviar) expect(r.motivo).toContain('producción')
  })
})

describe('estaPausado — la misma regla que ve la pantalla de Correo', () => {
  /* Existe exportada para que la pestaña «Correo» de Configuración no tenga su
     propia copia de la lista de valores que cuentan como «sin pausa»: una
     segunda definición se desincroniza sin que nada falle, y la pantalla
     diría «sin pausa» mientras el candado corta los envíos. */

  it('los cuatro valores que NO pausan', () => {
    for (const v of ['', '0', 'false', 'no']) expect(estaPausado(v)).toBe(false)
  })

  it('sin variable no hay pausa', () => {
    expect(estaPausado(undefined)).toBe(false)
    expect(estaPausado(null)).toBe(false)
  })

  it('falla cerrado: cualquier otro valor pausa', () => {
    for (const v of ['1', 'true', 'si', 'sí', 'pausado', 'x']) expect(estaPausado(v)).toBe(true)
  })

  it('no se deja engañar por espacios ni mayúsculas', () => {
    expect(estaPausado('  FALSE  ')).toBe(false)
    expect(estaPausado('  No ')).toBe(false)
    expect(estaPausado(' 1 ')).toBe(true)
  })
})

/**
 * `destinoDePrueba` — a dónde puede ir el correo de prueba de Configuración.
 *
 * Es la seguridad del botón: el destinatario viaja desde el navegador, así que
 * sin esta función una sesión de admin mandaría un correo con nuestro remitente
 * a cualquier dirección. `puedeRecibir` no sirve de red acá, porque con la
 * lista vacía deja pasar todo — correcto para un aviso, peligroso para esto.
 */
describe('destinoDePrueba', () => {
  const PROPIA = 'danielmartinez.cl@gmail.com'
  const PILOTO = ['fdiaz@pentaingenieros.cl', 'kcorvalan@pentaingenieros.cl', PROPIA]

  it('sin pedido va a la propia dirección', () => {
    const r = destinoDePrueba(undefined, PROPIA, PILOTO)
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.email).toBe(PROPIA)
  })

  it('una dirección del piloto está permitida', () => {
    // Es el caso que importa: la pregunta abierta del 2026-10-21 era si el
    // correo llega a @pentaingenieros.cl, y al Gmail del admin llega igual.
    const r = destinoDePrueba('kcorvalan@pentaingenieros.cl', PROPIA, PILOTO)
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.email).toBe('kcorvalan@pentaingenieros.cl')
  })

  it('una dirección fuera de la lista NO', () => {
    const r = destinoDePrueba('cualquiera@ejemplo.com', PROPIA, PILOTO)
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.motivo).toContain('lista del piloto')
  })

  it('SIN lista de piloto, solo la propia — acá `puedeRecibir` diría que sí a todos', () => {
    expect(destinoDePrueba('cualquiera@ejemplo.com', PROPIA, []).ok).toBe(false)
    expect(destinoDePrueba(PROPIA, PROPIA, []).ok).toBe(true)
    expect(destinoDePrueba(undefined, PROPIA, []).ok).toBe(true)
  })

  it('la propia pasa aunque no esté en la lista', () => {
    const r = destinoDePrueba(PROPIA, PROPIA, ['otro@pentaingenieros.cl'])
    expect(r.ok).toBe(true)
  })

  it('no se deja engañar por mayúsculas ni espacios', () => {
    expect(destinoDePrueba('  KCorvalan@PentaIngenieros.CL ', PROPIA, PILOTO).ok).toBe(true)
    expect(destinoDePrueba('  DANIELmartinez.cl@GMAIL.com ', PROPIA, []).ok).toBe(true)
  })
})
