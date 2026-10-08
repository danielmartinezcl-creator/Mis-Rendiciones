import { describe, it, expect } from 'vitest'
import { aValores, aFiltro, dimensionDocumento } from '@/lib/filtros/adaptador-documentos'
import { FILTRO_VACIO, type Filtro } from '@/lib/filtro-documentos'
import { etiquetaDe, hayValor } from '@/lib/filtros/dimensiones'

const CASOS: [string, Filtro][] = [
  ['vacío',            FILTRO_VACIO],
  ['proyectos',        { ...FILTRO_VACIO, proyectos: ['p1', 'sin'] }],
  ['categoría+estado', { ...FILTRO_VACIO, categorias: ['c1'], estados: ['resuelto'] }],
  ['preset de fecha',  { ...FILTRO_VACIO, fecha: 'este-mes' }],
  ['rango elegido',    { ...FILTRO_VACIO, fecha: 'elegir', desde: '2026-08-01', hasta: '2026-08-31' }],
  ['medio rango',      { ...FILTRO_VACIO, fecha: 'elegir', desde: '2026-08-01', hasta: null }],
  ['empleados',        { ...FILTRO_VACIO, empleados: ['u1', 'u2'] }],
  ['todo junto',       { proyectos: ['p1'], categorias: ['c1'], fecha: 'ultimos-3', desde: null,
                         hasta: null, estados: ['en-curso'], empleados: ['u1'] }],
]

describe('adaptador documentos ↔ valores', () => {
  it.each(CASOS)('ida y vuelta no pierde nada: %s', (_nombre, f) => {
    expect(aFiltro(aValores(f))).toEqual(f)
  })

  it('las cinco claves del filtro del empleado, ni una más', () => {
    expect(Object.keys(aValores(FILTRO_VACIO)).sort())
      .toEqual(['categorias', 'empleados', 'estados', 'fecha', 'proyectos'])
  })

  /* El filtro puede venir de la dirección de la página o de una vista
     guardada, y ahí puede faltar una clave. Que falte no es un error: es
     «sin poner». */
  it('una clave ausente se lee como sin poner', () => {
    expect(aFiltro({})).toEqual(FILTRO_VACIO)
  })

  it('el filtro vacío no tiene ninguna dimensión puesta', () => {
    for (const v of Object.values(aValores(FILTRO_VACIO))) expect(hayValor(v)).toBe(false)
  })
})

describe('dimensionDocumento — tiene que decir lo mismo que hoy', () => {
  const opciones = [{ id: 'a', etiqueta: 'Alfa' }, { id: 'b', etiqueta: 'Beta' }]

  it('conserva el nombre de cada chip', () => {
    expect(dimensionDocumento('proyectos', []).nombre).toBe('Proyecto')
    expect(dimensionDocumento('categorias', []).nombre).toBe('Tipo de gasto')
    expect(dimensionDocumento('fecha', []).nombre).toBe('Fecha')
    expect(dimensionDocumento('estados', []).nombre).toBe('Estado')
    expect(dimensionDocumento('empleados', []).nombre).toBe('Empleado')
  })

  it('conserva el plural, que es lo que el chip dice con dos elegidos', () => {
    const d = dimensionDocumento('categorias', opciones)
    expect(etiquetaDe(d, { tipo: 'multi', ids: ['a', 'b'] })).toBe('2 tipos de gasto')
  })

  /* El buscador dentro de la hoja aparece hoy SOLO en proyectos y empleados, y
     solo con más de seis opciones. Si apareciera en categorías, la pantalla del
     empleado cambiaría sin que nadie lo haya pedido. */
  it('solo proyectos y empleados ofrecen buscador', () => {
    const buscador = (c: Parameters<typeof dimensionDocumento>[0]) => {
      const d = dimensionDocumento(c, [])
      return d.tipo === 'multi' || d.tipo === 'unico' ? d.buscador : undefined
    }
    expect(buscador('proyectos')).toBe(true)
    expect(buscador('empleados')).toBe(true)
    expect(buscador('categorias')).toBeFalsy()
    expect(buscador('estados')).toBeFalsy()
  })

  it('todas las del empleado van destacadas: nunca hay «Más filtros»', () => {
    for (const c of ['proyectos', 'categorias', 'fecha', 'estados', 'empleados'] as const) {
      expect(dimensionDocumento(c, []).destacada).toBe(true)
    }
  })

  it('la fecha no lleva opciones: sus presets los pone la hoja', () => {
    expect(dimensionDocumento('fecha', []).tipo).toBe('fecha')
  })
})
