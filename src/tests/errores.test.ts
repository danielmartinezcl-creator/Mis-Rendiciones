import { describe, it, expect } from 'vitest'
import { esErrorOpaco, mensajeLegible, mensajeDeError, ERROR_GENERICO } from '@/lib/errores'

/* El párrafo exacto que vio Francisco Díaz el 2026-10-21 al intentar borrar un
   fondo en borrador. Lo pone Next en producción, reemplazando el mensaje real. */
const DE_NEXT =
  'An error occurred in the Server Components render. The specific message is omitted ' +
  'in production builds to avoid leaking sensitive details. A digest property is included ' +
  'in this error instance which may provide additional details about the nature of the error.'

describe('esErrorOpaco', () => {
  it('reconoce el párrafo de Next', () => {
    expect(esErrorOpaco(DE_NEXT)).toBe(true)
  })

  it('reconoce las otras formas que usa Next', () => {
    expect(esErrorOpaco('An unexpected response was received from the server.')).toBe(true)
  })

  it('deja pasar nuestros mensajes', () => {
    // Están todos en español, así que no hay falso positivo posible.
    for (const m of [
      'Solo se pueden eliminar fondos en borrador. Este ya fue enviado',
      'Solo podés eliminar tus propios fondos',
      'El monto excede el límite máximo por ítem',
      'La rendición no tiene ítems',
    ]) expect(esErrorOpaco(m)).toBe(false)
  })
})

describe('mensajeLegible — la red de avisar()', () => {
  it('reemplaza el párrafo de Next por uno en español', () => {
    expect(mensajeLegible(DE_NEXT)).toBe(ERROR_GENERICO)
  })

  it('con digest lo agrega, que es lo único que lo cruza con los registros', () => {
    expect(mensajeLegible(DE_NEXT, 'abc123')).toContain('abc123')
    expect(mensajeLegible(DE_NEXT, 'abc123')).toContain(ERROR_GENERICO)
  })

  it('un mensaje nuestro pasa intacto', () => {
    const m = 'Solo se pueden eliminar fondos en borrador. Este ya fue enviado'
    expect(mensajeLegible(m)).toBe(m)
  })
})

describe('mensajeDeError', () => {
  it('usa el respaldo cuando el error es opaco', () => {
    expect(mensajeDeError(new Error(DE_NEXT), 'No se pudo eliminar el fondo'))
      .toBe('No se pudo eliminar el fondo')
  })

  it('agrega el digest de Next cuando viene', () => {
    const err = Object.assign(new Error(DE_NEXT), { digest: '99887' })
    expect(mensajeDeError(err, 'No se pudo eliminar el fondo')).toBe('No se pudo eliminar el fondo (código 99887)')
  })

  it('conserva un mensaje nuestro', () => {
    expect(mensajeDeError(new Error('Fondo no encontrado'), 'respaldo')).toBe('Fondo no encontrado')
  })

  it('lo que no es un Error cae al respaldo', () => {
    expect(mensajeDeError('algo', 'respaldo')).toBe('respaldo')
    expect(mensajeDeError(new Error(''), 'respaldo')).toBe('respaldo')
  })
})
