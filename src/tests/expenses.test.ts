import { describe, it, expect } from 'vitest'
import {
  calculateReportTotal, validateExpenseItem, puedeCambiarGastos, soloCampos,
  puedeCambiarGastosFondo, puedeCambiarAdjuntos,
  RENDICION_CERRADA, RENDICION_AJENA, FONDO_CERRADO, FONDO_AJENO,
} from '@/lib/expense-helpers'

describe('calculateReportTotal', () => {
  it('suma los amount_clp de todos los ítems', () => {
    const items = [
      { amount_clp: 10000 },
      { amount_clp: 25000 },
      { amount_clp: 5000 },
    ]
    expect(calculateReportTotal(items)).toBe(40000)
  })

  it('retorna 0 si no hay ítems', () => {
    expect(calculateReportTotal([])).toBe(0)
  })
})

describe('validateExpenseItem', () => {
  it('retorna error si description está vacío', () => {
    const errors = validateExpenseItem({ description: '', amount: 1000, date: '2026-06-01' })
    expect(errors).toContain('La descripción es obligatoria')
  })

  it('retorna error si amount es 0 o negativo', () => {
    const errors = validateExpenseItem({ description: 'Test', amount: 0, date: '2026-06-01' })
    expect(errors).toContain('El monto debe ser mayor a 0')
  })

  it('retorna error si date está vacío', () => {
    const errors = validateExpenseItem({ description: 'Test', amount: 1000, date: '' })
    expect(errors).toContain('La fecha es obligatoria')
  })

  it('retorna array vacío si todos los campos son válidos', () => {
    const errors = validateExpenseItem({ description: 'Almuerzo cliente', amount: 15000, date: '2026-06-01' })
    expect(errors).toHaveLength(0)
  })
})

describe('puedeCambiarGastos', () => {
  const YO   = 'u-rinde'
  const OTRA = 'u-otra'

  it('en su borrador, quien rinde agrega y quita gastos', () => {
    expect(puedeCambiarGastos({ status: 'draft', submitter_id: YO }, YO)).toEqual({ ok: true })
  })

  it('enviada o ya aprobada, ni quien rinde los toca: el doble pago entraba por acá', () => {
    for (const status of ['submitted', 'pending_l2', 'approved', 'partially_approved', 'rejected', 'reimbursed']) {
      expect(puedeCambiarGastos({ status, submitter_id: YO, is_historical_import: false }, YO))
        .toEqual({ ok: false, motivo: RENDICION_CERRADA })
    }
    // Una carga histórica a nombre del empleado tampoco: nace aprobada
    expect(puedeCambiarGastos({ status: 'approved', submitter_id: YO, is_historical_import: true }, YO))
      .toEqual({ ok: false, motivo: RENDICION_CERRADA })
  })

  it('en el borrador de otra persona, nadie: tampoco el admin (Daniel, 2026-09-25)', () => {
    expect(puedeCambiarGastos({ status: 'draft', submitter_id: OTRA }, YO))
      .toEqual({ ok: false, motivo: RENDICION_AJENA })
    expect(puedeCambiarGastos({ status: 'draft', submitter_id: OTRA, is_historical_import: false }, YO, true))
      .toEqual({ ok: false, motivo: RENDICION_AJENA })
  })

  it('primero el estado, después el dueño: lo mismo que responde la base', () => {
    expect(puedeCambiarGastos({ status: 'submitted', submitter_id: OTRA, is_historical_import: false }, YO, true))
      .toEqual({ ok: false, motivo: RENDICION_CERRADA })
  })

  it('el admin corrige cargas históricas, que nacen cerradas y a nombre de otro', () => {
    expect(puedeCambiarGastos({ status: 'approved', submitter_id: OTRA, is_historical_import: true }, YO, true))
      .toEqual({ ok: true })
  })
})

describe('puedeCambiarGastosFondo', () => {
  const YO   = 'u-empleado'
  const OTRA = 'u-otra'

  it('con los fondos enviados, el empleado del fondo cambia sus gastos', () => {
    expect(puedeCambiarGastosFondo({ status: 'funds_sent', employee_id: YO }, YO)).toEqual({ ok: true })
  })

  it('antes de recibir la plata o con la liquidación ya enviada, ni el empleado', () => {
    for (const status of [
      'draft', 'pending_approval', 'pending_approval_l2', 'approved', 'pending_bank_load',
      'pending_bank_auth', 'submitted', 'pending_liquidation_approval', 'pending_liquidation_l2',
      'settled', 'rejected',
    ]) {
      expect(puedeCambiarGastosFondo({ status, employee_id: YO, is_historical_import: false }, YO))
        .toEqual({ ok: false, motivo: FONDO_CERRADO })
    }
  })

  it('en el fondo de otra persona, nadie: tampoco el admin', () => {
    expect(puedeCambiarGastosFondo({ status: 'funds_sent', employee_id: OTRA }, YO))
      .toEqual({ ok: false, motivo: FONDO_AJENO })
    expect(puedeCambiarGastosFondo({ status: 'funds_sent', employee_id: OTRA, is_historical_import: false }, YO, true))
      .toEqual({ ok: false, motivo: FONDO_AJENO })
  })

  it('primero el estado, después el dueño: lo mismo que responde la base', () => {
    expect(puedeCambiarGastosFondo({ status: 'settled', employee_id: OTRA, is_historical_import: false }, YO, true))
      .toEqual({ ok: false, motivo: FONDO_CERRADO })
  })

  it('el admin corrige cargas históricas; el empleado no toca la suya', () => {
    expect(puedeCambiarGastosFondo({ status: 'settled', employee_id: OTRA, is_historical_import: true }, YO, true))
      .toEqual({ ok: true })
    expect(puedeCambiarGastosFondo({ status: 'settled', employee_id: YO, is_historical_import: true }, YO))
      .toEqual({ ok: false, motivo: FONDO_CERRADO })
  })
})

// El comprobante es parte del gasto: se sube o se borra exactamente cuando el
// gasto se puede cambiar. Cada fila es una persona real frente a un documento.
describe('puedeCambiarAdjuntos', () => {
  const YO   = 'u-yo'
  const OTRA = 'u-otra'

  it.each([
    ['quien rinde, en su borrador',
      { tipo: 'rendicion', status: 'draft', submitter_id: YO }, false, { ok: true }],
    ['quien rinde, con la rendición ya enviada',
      { tipo: 'rendicion', status: 'submitted', submitter_id: YO }, false, { ok: false, motivo: RENDICION_CERRADA }],
    ['el empleado, en una carga histórica a su nombre',
      { tipo: 'rendicion', status: 'approved', submitter_id: YO, is_historical_import: true }, false, { ok: false, motivo: RENDICION_CERRADA }],
    ['el admin, en el borrador de otra persona',
      { tipo: 'rendicion', status: 'draft', submitter_id: OTRA, is_historical_import: false }, true, { ok: false, motivo: RENDICION_AJENA }],
    ['el admin, en una carga histórica',
      { tipo: 'rendicion', status: 'reimbursed', submitter_id: OTRA, is_historical_import: true }, true, { ok: true }],
    ['el empleado del fondo, con los fondos enviados',
      { tipo: 'fondo', status: 'funds_sent', employee_id: YO }, false, { ok: true }],
    ['el aprobador, con la liquidación en revisión',
      { tipo: 'fondo', status: 'pending_liquidation_approval', employee_id: OTRA }, false, { ok: false, motivo: FONDO_CERRADO }],
    ['el aprobador o el EFF, con los fondos enviados',
      { tipo: 'fondo', status: 'funds_sent', employee_id: OTRA }, false, { ok: false, motivo: FONDO_AJENO }],
    ['el admin, en el fondo de otra persona',
      { tipo: 'fondo', status: 'funds_sent', employee_id: OTRA, is_historical_import: false }, true, { ok: false, motivo: FONDO_AJENO }],
    ['el admin, en un fondo histórico',
      { tipo: 'fondo', status: 'settled', employee_id: OTRA, is_historical_import: true }, true, { ok: true }],
  ] as const)('%s', (_, doc, esAdmin, esperado) => {
    expect(puedeCambiarAdjuntos(doc, YO, esAdmin)).toEqual(esperado)
  })
})

describe('soloCampos', () => {
  type Patch = { description?: string; category_id?: string | null; amount_clp?: number }

  it('deja pasar solo los campos permitidos, aunque el navegador mande otros', () => {
    const colado = { description: 'Taxi', report_id: 'otra', status: 'approved', defontana_exported_at: 'ayer' } as Patch
    expect(soloCampos(colado, ['description', 'category_id'])).toEqual({ description: 'Taxi' })
  })

  it('null pasa (es borrar el valor); undefined no', () => {
    const patch: Patch = { category_id: null, amount_clp: undefined }
    expect(soloCampos(patch, ['category_id', 'amount_clp'])).toEqual({ category_id: null })
  })

  it('un patch que no es objeto no escribe nada', () => {
    expect(soloCampos(null as unknown as Patch, ['description'])).toEqual({})
  })
})
