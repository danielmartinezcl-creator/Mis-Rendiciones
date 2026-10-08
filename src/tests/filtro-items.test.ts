import { describe, it, expect } from 'vitest'
import { aplicarFiltroItems, dimensionesDeInformes } from '@/lib/filtro-items'
import { valoresVacios, type Valores } from '@/lib/filtros/dimensiones'
import { SIN_PROYECTO } from '@/lib/filtro-documentos'
import { computeUnifiedKpis, type UnifiedReportItem } from '@/lib/report-helpers'

const HOY = '2026-09-15'

const base: UnifiedReportItem = {
  source: 'rendicion_new', item_type: 'expense',
  employee_id: 'u1', employee_name: 'Claudia', department: 'Ingeniería',
  parent_id: 'r1', parent_title: 'Agosto', parent_status: 'approved',
  proyecto_id: null, proyecto_numero: null,
  defontana_exported_at: null, reimbursed_at: null,
  item_id: 'i1', description: 'Bencina', merchant: null, date: '2026-08-12',
  category_id: 'comb', category_name: 'Combustible', category_color: null,
  amount: 10_000, currency: 'CLP', amount_clp: 10_000,
  doc_type: null, doc_number: null, item_status: 'approved',
  rejection_reason: null, notes: null,
}

const item = (x: Partial<UnifiedReportItem>): UnifiedReportItem => ({ ...base, ...x })

const DIMS = dimensionesDeInformes({
  empleados:     [{ id: 'u1', etiqueta: 'Claudia' }, { id: 'u2', etiqueta: 'Edwin' }],
  categorias:    [{ id: 'comb', etiqueta: 'Combustible' }, { id: 'alim', etiqueta: 'Comida' }],
  departamentos: ['Ingeniería', 'Operaciones'],
  proyectos:     [{ id: 'p1', etiqueta: '2991' }],
})

const vacios = valoresVacios(DIMS)
const con = (v: Valores): Valores => ({ ...vacios, ...v })
const ids = (xs: UnifiedReportItem[]) => xs.map(x => x.item_id)

describe('aplicarFiltroItems', () => {
  it('sin filtro pasan todos', () => {
    const xs = [item({ item_id: 'a' }), item({ item_id: 'b' })]
    expect(ids(aplicarFiltroItems(xs, vacios, HOY))).toEqual(['a', 'b'])
  })

  /* El movimiento es la dimensión más cara de equivocar: un adelanto es la
     plata que se ENTREGA y el gasto es en qué se usó. Sumarlos cuenta dos veces
     la misma plata, y por eso el KPI principal es solo el gasto. */
  describe('movimiento', () => {
    const xs = [
      item({ item_id: 'gasto',     item_type: 'expense' }),
      item({ item_id: 'adelanto',  item_type: 'advance' }),
      item({ item_id: 'devuelta',  item_type: 'return' }),
      item({ item_id: 'traspaso',  item_type: 'transfer' }),
    ]
    it('solo gastos deja fuera adelantos, devoluciones y traspasos', () => {
      const v = con({ movimiento: { tipo: 'multi', ids: ['expense'] } })
      expect(ids(aplicarFiltroItems(xs, v, HOY))).toEqual(['gasto'])
    })
    it('se pueden pedir varios movimientos', () => {
      const v = con({ movimiento: { tipo: 'multi', ids: ['advance', 'return'] } })
      expect(ids(aplicarFiltroItems(xs, v, HOY))).toEqual(['adelanto', 'devuelta'])
    })
  })

  describe('fuente y datos son dos cosas distintas', () => {
    const xs = [
      item({ item_id: 'rn', source: 'rendicion_new' }),
      item({ item_id: 'rh', source: 'rendicion_hist' }),
      item({ item_id: 'cn', source: 'caja_chica_new' }),
      item({ item_id: 'ch', source: 'caja_chica_hist' }),
    ]
    it('fuente: solo caja chica', () => {
      const v = con({ fuente: { tipo: 'multi', ids: ['caja_chica'] } })
      expect(ids(aplicarFiltroItems(xs, v, HOY))).toEqual(['cn', 'ch'])
    })
    it('datos: solo históricos', () => {
      const v = con({ datos: { tipo: 'unico', id: 'historicos' } })
      expect(ids(aplicarFiltroItems(xs, v, HOY))).toEqual(['rh', 'ch'])
    })
    /* Las dos se cumplen A LA VEZ, no una o la otra. */
    it('caja chica histórica son las dos juntas', () => {
      const v = con({
        fuente: { tipo: 'multi', ids: ['caja_chica'] },
        datos:  { tipo: 'unico', id: 'historicos' },
      })
      expect(ids(aplicarFiltroItems(xs, v, HOY))).toEqual(['ch'])
    })
  })

  describe('la fecha es la del GASTO', () => {
    const xs = [
      item({ item_id: 'ago', date: '2026-08-30' }),
      item({ item_id: 'sep', date: '2026-09-02' }),
    ]
    it('un rango elegido', () => {
      const v = con({ periodo: { tipo: 'fecha', preset: 'elegir', desde: '2026-09-01', hasta: '2026-09-30' } })
      expect(ids(aplicarFiltroItems(xs, v, HOY))).toEqual(['sep'])
    })
    it('un preset se resuelve contra el día que se le pasa', () => {
      const v = con({ periodo: { tipo: 'fecha', preset: 'mes-pasado', desde: null, hasta: null } })
      expect(ids(aplicarFiltroItems(xs, v, HOY))).toEqual(['ago'])
    })
  })

  describe('el resto de las dimensiones', () => {
    it('empleado', () => {
      const xs = [item({ item_id: 'a' }), item({ item_id: 'b', employee_id: 'u2' })]
      expect(ids(aplicarFiltroItems(xs, con({ empleados: { tipo: 'multi', ids: ['u2'] } }), HOY)))
        .toEqual(['b'])
    })
    it('categoría', () => {
      const xs = [item({ item_id: 'a' }), item({ item_id: 'b', category_id: 'alim' })]
      expect(ids(aplicarFiltroItems(xs, con({ categorias: { tipo: 'multi', ids: ['alim'] } }), HOY)))
        .toEqual(['b'])
    })
    it('departamento', () => {
      const xs = [item({ item_id: 'a' }), item({ item_id: 'b', department: 'Operaciones' })]
      expect(ids(aplicarFiltroItems(xs, con({ departamento: { tipo: 'unico', id: 'Operaciones' } }), HOY)))
        .toEqual(['b'])
    })
    it('estado del informe', () => {
      const xs = [item({ item_id: 'a' }), item({ item_id: 'b', parent_status: 'rejected' })]
      expect(ids(aplicarFiltroItems(xs, con({ estadoInforme: { tipo: 'multi', ids: ['rejected'] } }), HOY)))
        .toEqual(['b'])
    })
    it('estado del ítem', () => {
      const xs = [item({ item_id: 'a' }), item({ item_id: 'b', item_status: 'rejected' })]
      expect(ids(aplicarFiltroItems(xs, con({ estadoItem: { tipo: 'multi', ids: ['rejected'] } }), HOY)))
        .toEqual(['b'])
    })
    it('reembolso', () => {
      const xs = [item({ item_id: 'a' }), item({ item_id: 'b', reimbursed_at: '2026-09-01' })]
      expect(ids(aplicarFiltroItems(xs, con({ reembolso: { tipo: 'unico', id: 'pendiente' } }), HOY)))
        .toEqual(['a'])
    })
    it('contabilización', () => {
      const xs = [item({ item_id: 'a' }), item({ item_id: 'b', defontana_exported_at: '2026-09-01' })]
      expect(ids(aplicarFiltroItems(xs, con({ contabilizacion: { tipo: 'unico', id: 'sin' } }), HOY)))
        .toEqual(['a'])
    })
    it('proyecto, con «Sin proyecto»', () => {
      const xs = [item({ item_id: 'a', proyecto_id: 'p1' }), item({ item_id: 'b' })]
      expect(ids(aplicarFiltroItems(xs, con({ proyectos: { tipo: 'multi', ids: [SIN_PROYECTO] } }), HOY)))
        .toEqual(['b'])
    })
  })

  /* El KPI principal se recalcula sobre lo filtrado, y sigue siendo el GASTO
     aprobado: `byMovement.expense`, nunca el total. */
  it('los KPIs salen de lo filtrado, no de todo', () => {
    const xs = [
      item({ item_id: 'g', item_type: 'expense', amount_clp: 10_000 }),
      item({ item_id: 'a', item_type: 'advance', amount_clp: 90_000 }),
    ]
    const soloGastos = aplicarFiltroItems(xs, con({ movimiento: { tipo: 'multi', ids: ['expense'] } }), HOY)
    expect(computeUnifiedKpis(soloGastos).byMovement.expense.approvedCLP).toBe(10_000)
  })
})

describe('dimensionesDeInformes', () => {
  it('a la vista: Período, Proyecto, Empleado y Categoría', () => {
    expect(DIMS.filter(d => d.destacada).map(d => d.clave))
      .toEqual(['periodo', 'proyectos', 'empleados', 'categorias'])
  })

  it('las otras ocho van en «Más filtros»', () => {
    expect(DIMS.filter(d => !d.destacada).map(d => d.clave)).toEqual([
      'estadoInforme', 'fuente', 'datos', 'departamento',
      'movimiento', 'estadoItem', 'reembolso', 'contabilizacion',
    ])
  })

  it('el chip de fecha dice de qué fecha habla', () => {
    expect(DIMS.find(d => d.clave === 'periodo')?.nombre).toBe('Fecha del gasto')
  })

  it('sin obras en el catálogo, el chip de Proyecto no existe', () => {
    const sinObras = dimensionesDeInformes({
      empleados: [], categorias: [], departamentos: [], proyectos: [],
    })
    expect(sinObras.map(d => d.clave)).not.toContain('proyectos')
    // y «Estado del informe» sube a la barra, que queda con lugar
    expect(sinObras.filter(d => d.destacada).map(d => d.clave))
      .toEqual(['periodo', 'empleados', 'categorias'])
  })
})
