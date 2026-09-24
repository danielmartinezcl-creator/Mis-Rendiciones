import { describe, it, expect } from 'vitest'
import { destinatariosBancarios, puedeOperarPago } from '@/lib/bank-helpers'

const FRANCISCO = 'francisco'
const ROBERTO   = 'roberto'
const KATHERINE = 'katherine'

describe('destinatariosBancarios', () => {
  // Roberto autoriza solo en casos extraordinarios: tiene el permiso, pero los
  // avisos van a los titulares
  it('avisa solo a los titulares, no a los suplentes', () => {
    const ids = destinatariosBancarios([
      { id: FRANCISCO, bank_is_backup: false },
      { id: ROBERTO,   bank_is_backup: true },
    ])
    expect(ids).toEqual([FRANCISCO])
  })

  it('si solo hay suplentes, les avisa igual: un pago nunca queda sin aviso', () => {
    expect(destinatariosBancarios([{ id: ROBERTO, bank_is_backup: true }])).toEqual([ROBERTO])
  })

  it('sin nadie con el permiso, no hay a quién avisar', () => {
    expect(destinatariosBancarios([])).toEqual([])
  })
})

describe('puedeOperarPago', () => {
  it('cualquiera con el permiso opera el pago de OTRA persona', () => {
    expect(puedeOperarPago(FRANCISCO, ROBERTO, [])).toBe(true)
  })

  // Francisco tiene las credenciales del banco: autoriza sus propias
  // rendiciones, siempre que otra persona las haya aprobado antes
  it('su propio pago, si otra persona lo aprobó', () => {
    const aprobaciones = [{ actor_id: ROBERTO, action: 'approved' }]
    expect(puedeOperarPago(FRANCISCO, FRANCISCO, aprobaciones)).toBe(true)
  })

  it('una aprobación parcial de otra persona también cuenta', () => {
    const aprobaciones = [{ actor_id: ROBERTO, action: 'partially_approved' }]
    expect(puedeOperarPago(FRANCISCO, FRANCISCO, aprobaciones)).toBe(true)
  })

  it('su propio pago, NO si la única aprobación es suya', () => {
    const aprobaciones = [{ actor_id: FRANCISCO, action: 'approved' }]
    expect(puedeOperarPago(FRANCISCO, FRANCISCO, aprobaciones)).toBe(false)
  })

  it('su propio pago, NO si nadie lo aprobó', () => {
    expect(puedeOperarPago(FRANCISCO, FRANCISCO, [])).toBe(false)
  })

  // Los pasos bancarios también quedan en el log: una carga hecha por otra
  // persona no es una aprobación
  it('los pasos bancarios de otros no cuentan como aprobación', () => {
    const aprobaciones = [
      { actor_id: FRANCISCO, action: 'approved' },
      { actor_id: KATHERINE, action: 'bank_load_confirmed' },
    ]
    expect(puedeOperarPago(FRANCISCO, FRANCISCO, aprobaciones)).toBe(false)
  })
})
