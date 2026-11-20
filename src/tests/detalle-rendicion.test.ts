import { describe, it, expect } from 'vitest'
import { construirRecorridoRendicion, gastosSinCategoria, etiquetaDeHistorial, pasosDeRendicion } from '@/lib/detalle-rendicion'

// «Rendición octubre» de Claudia Lobos, tal como estaba el 2026-11-20
const octubre = {
  status:       'pending_bank_auth',
  createdAt:    '2026-11-05T12:00:00Z',
  submittedAt:  '2026-11-06T12:00:00Z',
  reimbursedAt: null,
  cadenaConN2:  false,
  historial: [
    { action: 'approved',            level: 1, created_at: '2026-11-09T14:19:15Z' },
    { action: 'bank_load_confirmed', level: 1, created_at: '2026-11-09T15:22:11Z' },
  ],
}

const claves = (d: typeof octubre) => construirRecorridoRendicion(d).map(p => `${p.key}:${p.estado}`)

describe('construirRecorridoRendicion', () => {
  it('sin N2 en la cadena no inventa un «nivel 2» — el error de la lista vieja', () => {
    const pasos = construirRecorridoRendicion(octubre)
    expect(pasos.map(p => p.key)).not.toContain('n2')
    expect(pasos.find(p => p.key === 'n1')?.label).toBe('Aprobada')
  })

  it('en espera del banco: lo anterior hecho, la autorización actual, el reembolso pendiente', () => {
    expect(claves(octubre)).toEqual([
      'draft:hecho', 'submitted:hecho', 'n1:hecho', 'carga:hecho',
      'autorizacion:actual', 'reembolsada:pendiente',
    ])
  })

  it('cada paso hecho lleva la fecha de su entrada del historial', () => {
    const pasos = construirRecorridoRendicion(octubre)
    expect(pasos.find(p => p.key === 'carga')?.fecha).toBe('2026-11-09T15:22:11Z')
    expect(pasos.find(p => p.key === 'reembolsada')?.fecha).toBeNull()
  })

  it('con N2 en la cadena aparece el paso y se espera ahí', () => {
    const r = claves({ ...octubre, status: 'pending_l2', cadenaConN2: true })
    expect(r.slice(0, 5)).toEqual(['draft:hecho', 'submitted:hecho', 'n1:hecho', 'n2:actual', 'carga:pendiente'])
  })

  it('una firma de nivel 2 en el historial basta para mostrar el paso', () => {
    const conFirma = { ...octubre, historial: [...octubre.historial, { action: 'approved', level: 2, created_at: '2026-11-09T14:30:00Z' }] }
    expect(construirRecorridoRendicion(conFirma).map(p => p.key)).toContain('n2')
  })

  it('reembolsada: todo hecho', () => {
    const r = construirRecorridoRendicion({ ...octubre, status: 'reimbursed', reimbursedAt: '2026-11-21T10:00:00Z' })
    expect(r.every(p => p.estado === 'hecho')).toBe(true)
    expect(r.at(-1)?.fecha).toBe('2026-11-21T10:00:00Z')
  })

  it('rechazada: el paso de decisión dice «Rechazada» y el recorrido termina ahí', () => {
    const r = construirRecorridoRendicion({
      ...octubre, status: 'rejected',
      historial: [{ action: 'rejected', level: 1, created_at: '2026-11-08T10:00:00Z' }],
    })
    expect(r.map(p => p.label)).toEqual(['Borrador creado', 'Enviada a revisión', 'Rechazada'])
    expect(r.at(-1)?.estado).toBe('actual')
  })

  it('aprobada sin nada que pagar o carga histórica: termina en la aprobación, sin pasos de banco', () => {
    const r = construirRecorridoRendicion({ ...octubre, status: 'approved', historial: [] })
    expect(r.map(p => p.key)).toEqual(['draft', 'submitted', 'n1'])
    expect(r.every(p => p.estado === 'hecho')).toBe(true)
  })

  it('un paso futuro no arrastra la fecha de una vuelta anterior', () => {
    // Devuelta para corregir y reenviada: la aprobación vieja no cuenta
    const r = construirRecorridoRendicion({ ...octubre, status: 'submitted', historial: [{ action: 'approved', level: 1, created_at: '2026-11-01T00:00:00Z' }] })
    const n1 = r.find(p => p.key === 'n1')
    expect(n1?.estado).toBe('actual')
    expect(n1?.fecha).toBeNull()
  })

  it('el rechazo sí lleva su fecha: es el hecho que cierra el recorrido', () => {
    const r = construirRecorridoRendicion({
      ...octubre, status: 'rejected',
      historial: [{ action: 'rejected', level: 1, created_at: '2026-11-08T10:00:00Z' }],
    })
    expect(r.at(-1)?.fecha).toBe('2026-11-08T10:00:00Z')
  })
})

describe('gastosSinCategoria', () => {
  it('cuenta los gastos sin categoría, y los ítems viejos sin tipo también son gastos', () => {
    const items = [
      { id: 'a', item_type: null,      category_id: null },
      { id: 'b', item_type: 'expense', category_id: null },
      { id: 'c', item_type: 'expense', category_id: 'x' },
    ]
    expect(gastosSinCategoria(items).map(i => i.id)).toEqual(['a', 'b'])
  })

  it('un adelanto, una devolución o un traspaso no llevan categoría: no avisa por ellos', () => {
    const items = ['advance', 'return', 'transfer'].map(t => ({ id: t, item_type: t, category_id: null }))
    expect(gastosSinCategoria(items)).toEqual([])
  })
})

describe('pasosDeRendicion — los pasos fijos de la lista', () => {
  const claves = (r: { cadena_l2_id: string | null; status: string }) => pasosDeRendicion(r).map(s => s.key)

  it('sin N2 en la cadena no hay «Revisión nivel 2» — «Rendición octubre» lo mostraba cumplido', () => {
    expect(claves({ cadena_l2_id: null, status: 'pending_bank_auth' })).not.toContain('pending_l2')
  })

  it('con N2 en la cadena, el paso está', () => {
    expect(claves({ cadena_l2_id: 'x', status: 'approved' })).toContain('pending_l2')
  })

  it('parada en nivel 2 sin cadena congelada (anterior a la 039): conserva el paso para tener dónde estar', () => {
    expect(claves({ cadena_l2_id: null, status: 'pending_l2' })).toContain('pending_l2')
  })
})

describe('etiquetaDeHistorial', () => {
  it('nombra el nivel de una aprobación y traduce los pasos del banco', () => {
    expect(etiquetaDeHistorial('approved', 1)).toBe('Aprobada · nivel 1')
    expect(etiquetaDeHistorial('approved', 2)).toBe('Aprobada · nivel 2')
    expect(etiquetaDeHistorial('bank_load_confirmed', 1)).toBe('Carga bancaria confirmada')
  })
})
