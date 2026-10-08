import { describe, it, expect } from 'vitest'
import {
  aplicarFiltro, rangoDeFecha, contarPorCategoria, hayFiltro, esGasto, fechaEnChile,
  documentoDeRendicion, documentoDeFondo, historicaEntraEnExportacion,
  FILTRO_VACIO, SIN_PROYECTO,
  type DocumentoFiltrable, type Filtro, type GastoFiltrable,
} from '@/lib/filtro-documentos'

const HOY = '2026-10-07'
const g = (categoriaId: string | null, fecha: string, montoClp: number, rechazado = false): GastoFiltrable =>
  ({ categoriaId, fecha, montoClp, rechazado })
const doc = (id: string, over: Partial<DocumentoFiltrable> = {}): DocumentoFiltrable => ({
  id, proyectoId: null, familia: 'en-curso', beneficiarioId: 'ana', creadoEl: '2026-09-01', gastos: [], ...over,
})
const filtro = (over: Partial<Filtro>): Filtro => ({ ...FILTRO_VACIO, ...over })
const ids = (r: { visibles: { doc: { id: string } }[] }) => r.visibles.map(v => v.doc.id)

describe('aplicarFiltro — chips de documento', () => {
  const docs = [
    doc('a', { proyectoId: 'p1', familia: 'en-curso', beneficiarioId: 'ana' }),
    doc('b', { proyectoId: null, familia: 'resuelto', beneficiarioId: 'beto' }),
    doc('c', { proyectoId: 'p2', familia: 'atencion', beneficiarioId: 'ana' }),
  ]

  it('sin filtro entran todos', () => {
    expect(ids(aplicarFiltro(docs, FILTRO_VACIO, HOY))).toEqual(['a', 'b', 'c'])
  })

  it('«Sin proyecto» es el documento sin proyecto', () => {
    expect(ids(aplicarFiltro(docs, filtro({ proyectos: [SIN_PROYECTO] }), HOY))).toEqual(['b'])
  })

  it('dentro de un chip las opciones se suman (O)', () => {
    expect(ids(aplicarFiltro(docs, filtro({ proyectos: ['p1', 'p2'] }), HOY))).toEqual(['a', 'c'])
  })

  it('entre chips se exigen todos (Y)', () => {
    const f = filtro({ estados: ['en-curso', 'atencion'], empleados: ['ana'], proyectos: ['p2'] })
    expect(ids(aplicarFiltro(docs, f, HOY))).toEqual(['c'])
  })
})

describe('aplicarFiltro — tipo de gasto y fecha', () => {
  it('entra si tiene un gasto no rechazado de la categoría, y suma solo esos', () => {
    const d = doc('a', { gastos: [g('comb', '2026-09-03', 1000), g('alim', '2026-09-04', 500), g('comb', '2026-09-05', 300)] })
    const r = aplicarFiltro([d], filtro({ categorias: ['comb'] }), HOY)
    expect(r.visibles[0].gastos).toHaveLength(2)
    expect(r.totalClp).toBe(1300)
    expect(r.totalGastos).toBe(2)
  })

  it('un gasto rechazado de la categoría no hace entrar al documento ni suma', () => {
    const d = doc('a', { gastos: [g('comb', '2026-09-03', 1000, true), g('alim', '2026-09-04', 500)] })
    expect(aplicarFiltro([d], filtro({ categorias: ['comb'] }), HOY).visibles).toEqual([])
  })

  it('tipo de gasto y fecha los tiene que cumplir el MISMO gasto', () => {
    const d = doc('a', { gastos: [g('comb', '2026-08-20', 1000), g('alim', '2026-09-10', 500)] })
    expect(aplicarFiltro([d], filtro({ categorias: ['comb'], fecha: 'mes-pasado' }), HOY).visibles).toEqual([])
  })

  it('con fecha, suma solo los gastos del rango', () => {
    const d = doc('a', { gastos: [g('comb', '2026-08-20', 1000), g('alim', '2026-09-10', 500)] })
    expect(aplicarFiltro([d], filtro({ fecha: 'mes-pasado' }), HOY).totalClp).toBe(500)
  })

  it('un documento sin gastos se juzga por su fecha de creación', () => {
    const vacio = doc('a', { creadoEl: '2026-09-15', gastos: [] })
    expect(ids(aplicarFiltro([vacio], filtro({ fecha: 'mes-pasado' }), HOY))).toEqual(['a'])
    expect(ids(aplicarFiltro([vacio], filtro({ fecha: 'este-mes' }), HOY))).toEqual([])
  })

  it('un documento sin gastos nunca entra con tipo de gasto', () => {
    const vacio = doc('a', { creadoEl: '2026-09-15', gastos: [] })
    expect(aplicarFiltro([vacio], filtro({ categorias: ['comb'] }), HOY).visibles).toEqual([])
  })

  it('un documento con todos sus gastos rechazados no entra con fecha', () => {
    const d = doc('a', { creadoEl: '2026-09-15', gastos: [g('comb', '2026-09-03', 1000, true)] })
    expect(aplicarFiltro([d], filtro({ fecha: 'mes-pasado' }), HOY).visibles).toEqual([])
  })

  it('«Sin proyecto» combinado con tipo de gasto', () => {
    const docs = [
      doc('a', { proyectoId: null, gastos: [g('comb', '2026-09-03', 100)] }),
      doc('b', { proyectoId: 'p1', gastos: [g('comb', '2026-09-03', 200)] }),
      doc('c', { proyectoId: null, gastos: [g('alim', '2026-09-03', 300)] }),
    ]
    const r = aplicarFiltro(docs, filtro({ proyectos: [SIN_PROYECTO], categorias: ['comb'] }), HOY)
    expect(ids(r)).toEqual(['a'])
    expect(r.totalClp).toBe(100)
  })

  it('sin tipo ni fecha, los totales cuentan todos los gastos no rechazados', () => {
    const d = doc('a', { gastos: [g('comb', '2026-09-03', 1000), g('alim', '2026-09-04', 500, true)] })
    expect(aplicarFiltro([d], FILTRO_VACIO, HOY).totalClp).toBe(1000)
  })
})

describe('rangoDeFecha', () => {
  const r = (fecha: Filtro['fecha'], hoy: string, desde: string | null = null, hasta: string | null = null) =>
    rangoDeFecha({ fecha, desde, hasta }, hoy)

  it('sin fecha, sin rango', () => {
    expect(r(null, HOY)).toEqual({ desde: null, hasta: null })
  })
  it('este mes, del 1 al último día', () => {
    expect(r('este-mes', '2026-02-10')).toEqual({ desde: '2026-02-01', hasta: '2026-02-28' })
  })
  it('año bisiesto', () => {
    expect(r('este-mes', '2028-02-03').hasta).toBe('2028-02-29')
  })
  it('mes pasado cruza el año en enero', () => {
    expect(r('mes-pasado', '2026-01-15')).toEqual({ desde: '2025-12-01', hasta: '2025-12-31' })
  })
  it('últimos 3 meses arranca el 1 del mes de hace dos', () => {
    expect(r('ultimos-3', '2026-02-10')).toEqual({ desde: '2025-12-01', hasta: '2026-02-10' })
  })
  it('este año, del 1 de enero a hoy', () => {
    expect(r('este-anio', HOY)).toEqual({ desde: '2026-01-01', hasta: HOY })
  })
  it('elegir fechas con una sola deja el otro lado abierto', () => {
    expect(r('elegir', HOY, '2026-09-01', null)).toEqual({ desde: '2026-09-01', hasta: null })
  })
})

describe('apoyos', () => {
  it('hayFiltro', () => {
    expect(hayFiltro(FILTRO_VACIO)).toBe(false)
    expect(hayFiltro(filtro({ fecha: 'este-mes' }))).toBe(true)
    expect(hayFiltro(filtro({ empleados: ['ana'] }))).toBe(true)
  })

  it('contarPorCategoria no cuenta rechazados ni gastos sin categoría', () => {
    const m = contarPorCategoria([doc('a', {
      gastos: [g('comb', '2026-09-01', 1), g('comb', '2026-09-01', 1, true), g(null, '2026-09-01', 1)],
    })])
    expect(m.get('comb')).toBe(1)
    expect(m.size).toBe(1)
  })

  it('esGasto: solo expense o sin tipo', () => {
    expect(esGasto('expense')).toBe(true)
    expect(esGasto(null)).toBe(true)
    expect(esGasto(undefined)).toBe(true)
    expect(esGasto('advance')).toBe(false)
    expect(esGasto('return')).toBe(false)
    expect(esGasto('transfer')).toBe(false)
  })

  it('fechaEnChile: a las 23:30 de Chile sigue siendo el mismo día', () => {
    // 2026-10-08T02:30Z = 2026-10-07 23:30 en Chile (UTC-3, horario de verano)
    expect(fechaEnChile(new Date('2026-10-08T02:30:00Z'))).toBe('2026-10-07')
  })

  it('la carga histórica entra en la exportación salvo que los chips la excluyan', () => {
    expect(historicaEntraEnExportacion(FILTRO_VACIO)).toBe(true)
    expect(historicaEntraEnExportacion(filtro({ proyectos: ['p1'] }))).toBe(false)
    expect(historicaEntraEnExportacion(filtro({ proyectos: ['p1', SIN_PROYECTO] }))).toBe(true)
    expect(historicaEntraEnExportacion(filtro({ estados: ['en-curso'] }))).toBe(false)
    expect(historicaEntraEnExportacion(filtro({ estados: ['resuelto'] }))).toBe(true)
  })
})

describe('desde las filas de la base', () => {
  it('una rendición deja fuera adelantos y su familia sale de FAMILIA_REPORTE', () => {
    const d = documentoDeRendicion(
      { id: 'r1', status: 'partially_approved', proyecto_id: 'p1', submitter_id: 'ana', created_at: '2026-09-01T12:00:00Z' },
      [
        { item_type: 'expense', category_id: 'comb', date: '2026-09-02', amount_clp: 100, status: 'approved' },
        { item_type: 'advance', category_id: null,   date: '2026-09-02', amount_clp: 999, status: 'approved' },
        { item_type: null,      category_id: 'alim', date: '2026-09-03', amount_clp: 50,  status: 'rejected' },
      ],
    )
    expect(d.familia).toBe('atencion')
    expect(d.proyectoId).toBe('p1')
    expect(d.creadoEl).toBe('2026-09-01')
    expect(d.gastos).toEqual([
      { categoriaId: 'comb', fecha: '2026-09-02', montoClp: 100, rechazado: false },
      { categoriaId: 'alim', fecha: '2026-09-03', montoClp: 50,  rechazado: true },
    ])
  })

  it('un fondo usa al beneficiario y FAMILIA_FONDO', () => {
    const d = documentoDeFondo(
      { id: 'f1', status: 'funds_sent', proyecto_id: null, employee_id: 'beto', created_at: '2026-09-01T12:00:00Z' },
      [{ category_id: 'comb', date: '2026-09-02', amount_clp: 100, status: 'pending' }],
    )
    expect(d.beneficiarioId).toBe('beto')
    expect(d.familia).toBe('en-curso')
    expect(d.gastos[0].rechazado).toBe(false)
  })
})
