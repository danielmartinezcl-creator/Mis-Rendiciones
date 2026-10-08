import { describe, it, expect } from 'vitest'
import {
  etiquetaDeChip, chipActivo, quitarChip, etiquetaDeProyecto, textoResumen, textoCoincidencia,
} from '@/lib/filtro-etiquetas'
import { FILTRO_VACIO, type Filtro } from '@/lib/filtro-documentos'

const cats = [{ id: 'comb', etiqueta: 'Combustible' }, { id: 'alim', etiqueta: 'Alimentación' }]
const f = (over: Partial<Filtro>): Filtro => ({ ...FILTRO_VACIO, ...over })

describe('lo que dice un chip', () => {
  it('sin nada elegido, su nombre', () => {
    expect(etiquetaDeChip('categorias', FILTRO_VACIO, cats)).toBe('Tipo de gasto')
    expect(etiquetaDeChip('fecha', FILTRO_VACIO, [])).toBe('Fecha')
  })
  it('una opción, su nombre', () => {
    expect(etiquetaDeChip('categorias', f({ categorias: ['comb'] }), cats)).toBe('Combustible')
  })
  it('varias, cuántas', () => {
    expect(etiquetaDeChip('categorias', f({ categorias: ['comb', 'alim'] }), cats)).toBe('2 tipos de gasto')
    expect(etiquetaDeChip('proyectos', f({ proyectos: ['a', 'b', 'c'] }), [])).toBe('3 proyectos')
  })
  it('fecha con atajo', () => {
    expect(etiquetaDeChip('fecha', f({ fecha: 'ultimos-3' }), [])).toBe('Últimos 3 meses')
  })
  it('fecha elegida: las dos puntas o una', () => {
    expect(etiquetaDeChip('fecha', f({ fecha: 'elegir', desde: '2026-09-01', hasta: '2026-09-30' }), [])).toBe('1 sep – 30 sep')
    expect(etiquetaDeChip('fecha', f({ fecha: 'elegir', desde: '2026-09-01' }), [])).toBe('Desde 1 sep')
    expect(etiquetaDeChip('fecha', f({ fecha: 'elegir', hasta: '2026-09-30' }), [])).toBe('Hasta 30 sep')
  })
})

describe('activar y quitar', () => {
  it('chipActivo', () => {
    expect(chipActivo('fecha', f({ fecha: 'este-mes' }))).toBe(true)
    expect(chipActivo('estados', FILTRO_VACIO)).toBe(false)
  })
  it('quitar la fecha borra también las puntas', () => {
    expect(quitarChip('fecha', f({ fecha: 'elegir', desde: '2026-09-01', categorias: ['comb'] })))
      .toEqual(f({ categorias: ['comb'] }))
  })
  it('quitar un chip de lista deja los demás', () => {
    expect(quitarChip('categorias', f({ categorias: ['comb'], estados: ['neutro'] }))).toEqual(f({ estados: ['neutro'] }))
  })
})

describe('las líneas de texto', () => {
  it('un proyecto con y sin nombre', () => {
    expect(etiquetaDeProyecto({ numero: '2991', nombre: 'Planta Norte' })).toBe('2991 · Planta Norte')
    expect(etiquetaDeProyecto({ numero: '2991', nombre: null })).toBe('2991')
  })
  it('resumen con una categoría', () => {
    expect(textoResumen({ visibles: 3, total: 12, totalClp: 97300 }, f({ categorias: ['comb'] }), cats))
      .toBe('3 de 12 · $ 97.300 en Combustible')
  })
  it('resumen con varias categorías y sin categoría', () => {
    expect(textoResumen({ visibles: 3, total: 12, totalClp: 97300 }, f({ categorias: ['comb', 'alim'] }), cats))
      .toBe('3 de 12 · $ 97.300 en 2 tipos de gasto')
    expect(textoResumen({ visibles: 3, total: 12, totalClp: 97300 }, f({ fecha: 'este-mes' }), cats))
      .toBe('3 de 12 · $ 97.300')
  })
  it('coincidencia de una tarjeta, singular y plural', () => {
    expect(textoCoincidencia({ gastos: 1, montoClp: 13700 }, f({ categorias: ['comb'] }), cats))
      .toBe('1 gasto de Combustible · $ 13.700')
    expect(textoCoincidencia({ gastos: 2, montoClp: 38400 }, f({ categorias: ['comb', 'alim'] }), cats))
      .toBe('2 gastos · $ 38.400')
  })
})
