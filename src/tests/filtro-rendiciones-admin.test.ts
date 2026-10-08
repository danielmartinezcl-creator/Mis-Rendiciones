import { describe, it, expect } from 'vitest'
import {
  aplicarFiltroRendiciones, dimensionesDeRendiciones,
  type RendicionAdmin,
} from '@/lib/filtro-rendiciones-admin'
import { valoresVacios, type Valores } from '@/lib/filtros/dimensiones'
import { SIN_PROYECTO } from '@/lib/filtro-documentos'

const HOY = '2026-09-15'

const base: RendicionAdmin = {
  id:            'r1',
  status:        'approved',
  submittedAt:   '2026-08-12',
  empleadoId:    'u1',
  departamento:  'Ingeniería',
  proyectoId:    null,
  contabilizada: false,
  reembolsada:   false,
}

const fila = (x: Partial<RendicionAdmin>): RendicionAdmin => ({ ...base, ...x })

const DIMS = dimensionesDeRendiciones({
  empleados:     [{ id: 'u1', etiqueta: 'Claudia' }, { id: 'u2', etiqueta: 'Edwin' }],
  departamentos: ['Ingeniería', 'Operaciones'],
  proyectos:     [{ id: 'p1', etiqueta: '2991' }],
})

const vacios = valoresVacios(DIMS)
const con = (v: Valores): Valores => ({ ...vacios, ...v })
const ids = (filas: RendicionAdmin[]) => filas.map(f => f.id)

describe('aplicarFiltroRendiciones', () => {
  it('sin filtro, pasan todas', () => {
    const filas = [fila({ id: 'a' }), fila({ id: 'b' })]
    expect(ids(aplicarFiltroRendiciones(filas, vacios, HOY))).toEqual(['a', 'b'])
  })

  it('no muta la lista que recibe', () => {
    const filas = [fila({ id: 'a' })]
    aplicarFiltroRendiciones(filas, con({ empleados: { tipo: 'multi', ids: ['u2'] } }), HOY)
    expect(filas).toHaveLength(1)
  })

  describe('la fecha es la de ENVÍO, no la del gasto', () => {
    /* Es al revés que en el filtro del empleado, y es correcto: una rendición
       enviada el 2 de septiembre puede traer gastos de agosto. Acá se pregunta
       por cuándo llegó a revisión. */
    it('filtra por submitted_at', () => {
      const filas = [
        fila({ id: 'agosto',     submittedAt: '2026-08-20' }),
        fila({ id: 'septiembre', submittedAt: '2026-09-02' }),
      ]
      const v = con({ fecha: { tipo: 'fecha', preset: 'elegir', desde: '2026-09-01', hasta: '2026-09-30' } })
      expect(ids(aplicarFiltroRendiciones(filas, v, HOY))).toEqual(['septiembre'])
    })

    /* Hasta el 2026-10-08 un borrador pasaba CUALQUIER rango de fecha, porque
       la condición se saltaba cuando no había fecha. Si se pregunta por lo
       enviado en agosto, algo que nunca se envió no es una respuesta. */
    it('un borrador sin enviar queda fuera de cualquier rango', () => {
      const filas = [fila({ id: 'borrador', status: 'draft', submittedAt: null })]
      const v = con({ fecha: { tipo: 'fecha', preset: 'elegir', desde: '2026-01-01', hasta: '2026-12-31' } })
      expect(aplicarFiltroRendiciones(filas, v, HOY)).toEqual([])
    })

    it('pero sin filtro de fecha el borrador se ve', () => {
      const filas = [fila({ id: 'borrador', status: 'draft', submittedAt: null })]
      expect(ids(aplicarFiltroRendiciones(filas, vacios, HOY))).toEqual(['borrador'])
    })

    it('un preset se resuelve contra el día que se le pasa, no contra el reloj', () => {
      const filas = [
        fila({ id: 'esteMes', submittedAt: '2026-09-03' }),
        fila({ id: 'otro',    submittedAt: '2026-08-03' }),
      ]
      const v = con({ fecha: { tipo: 'fecha', preset: 'este-mes', desde: null, hasta: null } })
      expect(ids(aplicarFiltroRendiciones(filas, v, HOY))).toEqual(['esteMes'])
    })
  })

  describe('las dimensiones sueltas', () => {
    it('empleado', () => {
      const filas = [fila({ id: 'a', empleadoId: 'u1' }), fila({ id: 'b', empleadoId: 'u2' })]
      const v = con({ empleados: { tipo: 'multi', ids: ['u2'] } })
      expect(ids(aplicarFiltroRendiciones(filas, v, HOY))).toEqual(['b'])
    })

    it('estado, con varios elegidos', () => {
      const filas = [
        fila({ id: 'a', status: 'approved' }),
        fila({ id: 'b', status: 'rejected' }),
        fila({ id: 'c', status: 'submitted' }),
      ]
      const v = con({ estados: { tipo: 'multi', ids: ['approved', 'submitted'] } })
      expect(ids(aplicarFiltroRendiciones(filas, v, HOY))).toEqual(['a', 'c'])
    })

    it('departamento', () => {
      const filas = [fila({ id: 'a' }), fila({ id: 'b', departamento: 'Operaciones' })]
      const v = con({ departamento: { tipo: 'unico', id: 'Operaciones' } })
      expect(ids(aplicarFiltroRendiciones(filas, v, HOY))).toEqual(['b'])
    })

    it('reembolso', () => {
      const filas = [fila({ id: 'a' }), fila({ id: 'b', reembolsada: true })]
      expect(ids(aplicarFiltroRendiciones(filas, con({ reembolso: { tipo: 'unico', id: 'pendiente' } }), HOY)))
        .toEqual(['a'])
      expect(ids(aplicarFiltroRendiciones(filas, con({ reembolso: { tipo: 'unico', id: 'reembolsada' } }), HOY)))
        .toEqual(['b'])
    })

    it('contabilización', () => {
      const filas = [fila({ id: 'a' }), fila({ id: 'b', contabilizada: true })]
      expect(ids(aplicarFiltroRendiciones(filas, con({ contabilizacion: { tipo: 'unico', id: 'sin' } }), HOY)))
        .toEqual(['a'])
      expect(ids(aplicarFiltroRendiciones(filas, con({ contabilizacion: { tipo: 'unico', id: 'contabilizada' } }), HOY)))
        .toEqual(['b'])
    })
  })

  describe('proyecto', () => {
    it('filtra por la obra', () => {
      const filas = [fila({ id: 'a', proyectoId: 'p1' }), fila({ id: 'b' })]
      const v = con({ proyectos: { tipo: 'multi', ids: ['p1'] } })
      expect(ids(aplicarFiltroRendiciones(filas, v, HOY))).toEqual(['a'])
    })

    /* Una carga histórica no tiene obra y NO se esconde: se pide aparte. */
    it('«Sin proyecto» trae las que no tienen obra', () => {
      const filas = [fila({ id: 'a', proyectoId: 'p1' }), fila({ id: 'b' })]
      const v = con({ proyectos: { tipo: 'multi', ids: [SIN_PROYECTO] } })
      expect(ids(aplicarFiltroRendiciones(filas, v, HOY))).toEqual(['b'])
    })

    it('las dos cosas a la vez', () => {
      const filas = [fila({ id: 'a', proyectoId: 'p1' }), fila({ id: 'b' }), fila({ id: 'c', proyectoId: 'p9' })]
      const v = con({ proyectos: { tipo: 'multi', ids: ['p1', SIN_PROYECTO] } })
      expect(ids(aplicarFiltroRendiciones(filas, v, HOY))).toEqual(['a', 'b'])
    })
  })

  /* Dos filtros se cumplen A LA VEZ, no por separado: es la confusión más
     cara de un filtro, porque la lista parece correcta. */
  it('dos dimensiones se cumplen las dos', () => {
    const filas = [
      fila({ id: 'a', empleadoId: 'u1', status: 'approved' }),
      fila({ id: 'b', empleadoId: 'u1', status: 'rejected' }),
      fila({ id: 'c', empleadoId: 'u2', status: 'approved' }),
    ]
    const v = con({
      empleados: { tipo: 'multi', ids: ['u1'] },
      estados:   { tipo: 'multi', ids: ['approved'] },
    })
    expect(ids(aplicarFiltroRendiciones(filas, v, HOY))).toEqual(['a'])
  })
})

describe('dimensionesDeRendiciones', () => {
  it('a la vista: Empleado, Estado, Fecha de envío y Proyecto', () => {
    expect(DIMS.filter(d => d.destacada).map(d => d.clave))
      .toEqual(['empleados', 'estados', 'fecha', 'proyectos'])
  })

  it('escondidas: Departamento, Reembolso y Contabilización', () => {
    expect(DIMS.filter(d => !d.destacada).map(d => d.clave))
      .toEqual(['departamento', 'reembolso', 'contabilizacion'])
  })

  /* El chip nunca dice «Fecha» a secas: en esta pantalla es la de envío y en
     las del empleado la del gasto, y confundirlas cambia qué sale en la lista. */
  it('la fecha dice de qué fecha habla', () => {
    expect(DIMS.find(d => d.clave === 'fecha')?.nombre).toBe('Fecha de envío')
  })

  /* Un chip cuya única opción sería «Sin proyecto» es ruido. Al 2026-10-08 el
     catálogo está vacío: aparece solo cuando empiece a servir. */
  it('sin obras en el catálogo, el chip de Proyecto no existe', () => {
    const sinObras = dimensionesDeRendiciones({ empleados: [], departamentos: [], proyectos: [] })
    expect(sinObras.map(d => d.clave)).not.toContain('proyectos')
  })

  it('el chip de Proyecto ofrece «Sin proyecto» primero', () => {
    const d = DIMS.find(x => x.clave === 'proyectos')
    expect(d?.tipo === 'multi' && d.opciones[0].id).toBe(SIN_PROYECTO)
  })
})
