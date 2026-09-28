import { describe, it, expect } from 'vitest'
import {
  destinoDelRespaldo, puedeSubirRespaldo, puedeBorrarRespaldo,
  RESPALDO_SIN_DESTINO, RESPALDO_DOBLE_DESTINO, RESPALDO_EN_PAPELERA, RESPALDO_AJENO, RESPALDO_FIRME,
} from '@/lib/respaldos'

describe('destinoDelRespaldo', () => {
  it('una rendición', () => {
    expect(destinoDelRespaldo('r-1', null)).toEqual({ tipo: 'rendicion', id: 'r-1' })
  })

  it('un fondo', () => {
    expect(destinoDelRespaldo(null, 'f-1')).toEqual({ tipo: 'fondo', id: 'f-1' })
  })

  it('un campo vacío del formulario cuenta como ausente', () => {
    expect(destinoDelRespaldo('', 'f-1')).toEqual({ tipo: 'fondo', id: 'f-1' })
  })

  it('sin destino', () => {
    expect(() => destinoDelRespaldo(null, null)).toThrow(RESPALDO_SIN_DESTINO)
  })

  it('con los dos destinos a la vez', () => {
    expect(() => destinoDelRespaldo('r-1', 'f-1')).toThrow(RESPALDO_DOBLE_DESTINO)
  })
})

describe('puedeSubirRespaldo', () => {
  it('a un documento vigente', () => {
    expect(puedeSubirRespaldo({ deleted_at: null })).toEqual({ ok: true })
  })

  it('a un documento en la papelera', () => {
    expect(puedeSubirRespaldo({ deleted_at: '2026-09-26T12:00:00+00:00' }))
      .toEqual({ ok: false, motivo: RESPALDO_EN_PAPELERA })
  })
})

describe('puedeBorrarRespaldo', () => {
  const YO   = 'u-yo'
  const OTRA = 'u-otra'
  // Con microsegundos, como los devuelve la base
  const SUBIDO = '2026-09-25T15:00:00.250000+00:00'
  const ANTES  = '2026-09-25T14:59:59.100000+00:00'
  const DESPUES = '2026-09-25T15:00:07.800000+00:00'
  const deYo = { uploaded_by: YO, created_at: SUBIDO }

  it.each([
    ['quien lo subió, sin pasos en el documento',
      deYo, [], YO, { ok: true }],
    ['quien lo subió, con pasos solo anteriores a la subida',
      deYo, [ANTES, ANTES], YO, { ok: true }],
    ['quien lo subió, en una rendición sin enviar (submitted_at nulo)',
      deYo, [null], YO, { ok: true }],
    ['quien lo subió, con un paso después de la subida',
      deYo, [ANTES, DESPUES], YO, { ok: false, motivo: RESPALDO_FIRME }],
    ['quien lo subió, con la rendición enviada después de la subida',
      deYo, [DESPUES], YO, { ok: false, motivo: RESPALDO_FIRME }],
    ['otra persona (el admin incluido), sin pasos',
      deYo, [], OTRA, { ok: false, motivo: RESPALDO_AJENO }],
    ['otra persona, con pasos posteriores: pesa primero quién',
      deYo, [DESPUES], OTRA, { ok: false, motivo: RESPALDO_AJENO }],
    ['un respaldo sin autor',
      { uploaded_by: null, created_at: SUBIDO }, [], YO, { ok: false, motivo: RESPALDO_AJENO }],
  ] as const)('%s', (_, respaldo, pasos, userId, esperado) => {
    expect(puedeBorrarRespaldo(respaldo, [...pasos], userId)).toEqual(esperado)
  })

  // Ante la duda, el respaldo se queda: es evidencia
  it('un paso en el mismo instante que la subida cuenta como posterior', () => {
    expect(puedeBorrarRespaldo(deYo, [SUBIDO], YO)).toEqual({ ok: false, motivo: RESPALDO_FIRME })
  })

  it('una fecha de paso ilegible cuenta como posterior', () => {
    expect(puedeBorrarRespaldo(deYo, ['basura'], YO)).toEqual({ ok: false, motivo: RESPALDO_FIRME })
  })

  it('una fecha de subida ilegible deja el respaldo si hay algún paso', () => {
    expect(puedeBorrarRespaldo({ uploaded_by: YO, created_at: 'basura' }, [ANTES], YO))
      .toEqual({ ok: false, motivo: RESPALDO_FIRME })
  })
})
