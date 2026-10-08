import { describe, it, expect } from 'vitest'
import {
  valoresVacios, hayValor, clavesPuestas, ocultasPuestas, quitar,
  etiquetaDe, resumen, type Dimension,
} from '@/lib/filtros/dimensiones'

/* `plural` solo lo lleva `multi`: con dos o más elegidos el chip dice «2
   empleados», «2 tipos de gasto». Sin él no se puede reproducir lo que el chip
   del empleado ya dice hoy. */
const DIMS: Dimension[] = [
  { clave: 'empleados', nombre: 'Empleado', plural: 'empleados', destacada: true, tipo: 'multi',
    opciones: [{ id: 'u1', etiqueta: 'Lobos Claudia' }, { id: 'u2', etiqueta: 'Seaton Edwin' }] },
  { clave: 'fecha', nombre: 'Fecha de envío', destacada: true, tipo: 'fecha' },
  { clave: 'reembolso', nombre: 'Reembolso', destacada: false, tipo: 'unico',
    opciones: [{ id: 'pendiente', etiqueta: 'Pendiente de reembolso' }] },
  { clave: 'busca', nombre: 'Buscar', destacada: true, tipo: 'texto', marcador: 'Buscar…' },
]

describe('valoresVacios', () => {
  it('da un valor del tipo de cada dimensión, todos sin poner', () => {
    const v = valoresVacios(DIMS)
    expect(v.empleados).toEqual({ tipo: 'multi', ids: [] })
    expect(v.fecha).toEqual({ tipo: 'fecha', preset: null, desde: null, hasta: null })
    expect(v.reembolso).toEqual({ tipo: 'unico', id: null })
    expect(v.busca).toEqual({ tipo: 'texto', texto: '' })
  })
  it('no deja claves de más', () => {
    expect(Object.keys(valoresVacios(DIMS)).sort())
      .toEqual(['busca', 'empleados', 'fecha', 'reembolso'])
  })
})

describe('hayValor', () => {
  it('vacío es vacío en los cuatro tipos', () => {
    for (const v of Object.values(valoresVacios(DIMS))) expect(hayValor(v)).toBe(false)
  })
  it('un texto de solo espacios no cuenta como puesto', () => {
    expect(hayValor({ tipo: 'texto', texto: '   ' })).toBe(false)
  })
  it('una fecha «elegir» sin rango todavía no filtra nada', () => {
    expect(hayValor({ tipo: 'fecha', preset: 'elegir', desde: null, hasta: null })).toBe(false)
  })
  it('con rango sí', () => {
    expect(hayValor({ tipo: 'fecha', preset: 'elegir', desde: '2026-08-01', hasta: null })).toBe(true)
  })
  it('un preset que no es «elegir» filtra por sí solo', () => {
    expect(hayValor({ tipo: 'fecha', preset: 'este-mes', desde: null, hasta: null })).toBe(true)
  })
})

describe('ocultasPuestas — el número del botón «Más filtros»', () => {
  it('cuenta SOLO las no destacadas que están puestas', () => {
    const v = {
      ...valoresVacios(DIMS),
      empleados: { tipo: 'multi' as const, ids: ['u1'] },
      reembolso: { tipo: 'unico' as const, id: 'pendiente' },
    }
    expect(clavesPuestas(DIMS, v)).toEqual(['empleados', 'reembolso'])
    expect(ocultasPuestas(DIMS, v)).toBe(1)
  })
  it('sin nada puesto no hay número', () => {
    expect(ocultasPuestas(DIMS, valoresVacios(DIMS))).toBe(0)
  })
  /* El orden sale de `dimensiones`, no de las claves del objeto: así la misma
     selección se lee siempre igual. */
  it('clavesPuestas respeta el orden de las dimensiones', () => {
    const v = {
      ...valoresVacios(DIMS),
      busca: { tipo: 'texto' as const, texto: 'penta' },
      empleados: { tipo: 'multi' as const, ids: ['u1'] },
    }
    expect(clavesPuestas(DIMS, v)).toEqual(['empleados', 'busca'])
  })
})

describe('etiquetaDe', () => {
  it('sin poner, el chip dice el nombre de la dimensión', () => {
    expect(etiquetaDe(DIMS[0], { tipo: 'multi', ids: [] })).toBe('Empleado')
  })
  it('con uno elegido, dice cuál', () => {
    expect(etiquetaDe(DIMS[0], { tipo: 'multi', ids: ['u1'] })).toBe('Lobos Claudia')
  })
  it('con varios, dice cuántos', () => {
    expect(etiquetaDe(DIMS[0], { tipo: 'multi', ids: ['u1', 'u2'] })).toBe('2 empleados')
  })
  /* Una opción que ya no existe no se muestra como un id crudo: la vista
     guardada puede apuntar a alguien que se fue. */
  it('un id que ya no está entre las opciones no se imprime', () => {
    expect(etiquetaDe(DIMS[0], { tipo: 'multi', ids: ['borrado'] })).toBe('Empleado')
  })
  it('único elegido dice su etiqueta', () => {
    expect(etiquetaDe(DIMS[2], { tipo: 'unico', id: 'pendiente' })).toBe('Pendiente de reembolso')
  })
  it('texto escrito va entre comillas', () => {
    expect(etiquetaDe(DIMS[3], { tipo: 'texto', texto: 'penta' })).toBe('«penta»')
  })

  /* Las mismas palabras que el chip del empleado ya muestra hoy: si estas
     cambian, las dos pantallas del empleado cambian de texto. */
  describe('fecha — tiene que decir lo mismo que el filtro del empleado', () => {
    const f = DIMS[1]
    it('sin poner, el nombre de la dimensión (que NO es «Fecha» a secas acá)', () => {
      expect(etiquetaDe(f, { tipo: 'fecha', preset: null, desde: null, hasta: null }))
        .toBe('Fecha de envío')
    })
    it('un preset dice su nombre', () => {
      expect(etiquetaDe(f, { tipo: 'fecha', preset: 'este-mes', desde: null, hasta: null }))
        .toBe('Este mes')
      expect(etiquetaDe(f, { tipo: 'fecha', preset: 'ultimos-3', desde: null, hasta: null }))
        .toBe('Últimos 3 meses')
    })
    it('un rango completo, los dos extremos', () => {
      expect(etiquetaDe(f, { tipo: 'fecha', preset: 'elegir', desde: '2026-08-01', hasta: '2026-08-31' }))
        .toBe('1 ago – 31 ago')
    })
    it('medio rango lo dice', () => {
      expect(etiquetaDe(f, { tipo: 'fecha', preset: 'elegir', desde: '2026-08-01', hasta: null }))
        .toBe('Desde 1 ago')
      expect(etiquetaDe(f, { tipo: 'fecha', preset: 'elegir', desde: null, hasta: '2026-08-31' }))
        .toBe('Hasta 31 ago')
    })
    it('«elegir» sin fechas todavía', () => {
      expect(etiquetaDe(f, { tipo: 'fecha', preset: 'elegir', desde: null, hasta: null }))
        .toBe('Elegir fechas')
    })
  })
})

describe('resumen — la línea que el admin arma bajo la barra', () => {
  it('sin filtro no hay línea', () => {
    expect(resumen(DIMS, valoresVacios(DIMS))).toBeNull()
  })
  it('nombra todo lo puesto, destacado u oculto, en el orden de las dimensiones', () => {
    const v = {
      ...valoresVacios(DIMS),
      empleados: { tipo: 'multi' as const, ids: ['u1'] },
      reembolso: { tipo: 'unico' as const, id: 'pendiente' },
    }
    expect(resumen(DIMS, v)).toBe('Lobos Claudia · Pendiente de reembolso')
  })
  it('lo que no está puesto no aparece', () => {
    const v = { ...valoresVacios(DIMS), busca: { tipo: 'texto' as const, texto: 'penta' } }
    expect(resumen(DIMS, v)).toBe('«penta»')
  })
})

describe('quitar', () => {
  it('deja la dimensión vacía y no toca las demás', () => {
    const v = {
      ...valoresVacios(DIMS),
      empleados: { tipo: 'multi' as const, ids: ['u1'] },
      reembolso: { tipo: 'unico' as const, id: 'pendiente' },
    }
    const r = quitar(DIMS, v, 'empleados')
    expect(r.empleados).toEqual({ tipo: 'multi', ids: [] })
    expect(r.reembolso).toEqual({ tipo: 'unico', id: 'pendiente' })
  })
  it('quitar una fecha borra también su rango', () => {
    const v = {
      ...valoresVacios(DIMS),
      fecha: { tipo: 'fecha' as const, preset: 'elegir' as const, desde: '2026-08-01', hasta: '2026-08-31' },
    }
    expect(quitar(DIMS, v, 'fecha').fecha)
      .toEqual({ tipo: 'fecha', preset: null, desde: null, hasta: null })
  })
  it('no muta lo que recibe', () => {
    const v = { ...valoresVacios(DIMS), empleados: { tipo: 'multi' as const, ids: ['u1'] } }
    quitar(DIMS, v, 'empleados')
    expect(v.empleados).toEqual({ tipo: 'multi', ids: ['u1'] })
  })
  it('una clave que no es dimensión devuelve lo mismo', () => {
    const v = valoresVacios(DIMS)
    expect(quitar(DIMS, v, 'no-existe')).toEqual(v)
  })
})
