import { describe, it, expect } from 'vitest'
import { leerFiltro, escribirFiltro, depurarFiltro, paramsDePagina } from '@/lib/filtro-url'
import { FILTRO_VACIO, SIN_PROYECTO, type Filtro } from '@/lib/filtro-documentos'

describe('el filtro en la dirección', () => {
  it('ida y vuelta', () => {
    const f: Filtro = {
      proyectos: ['p1', SIN_PROYECTO], categorias: ['comb'], fecha: 'elegir',
      desde: '2026-09-01', hasta: '2026-09-30', estados: ['en-curso'], empleados: ['ana'],
    }
    expect(leerFiltro(new URLSearchParams(escribirFiltro(f).slice(1)))).toEqual(f)
  })

  it('sin filtro, sin parámetros', () => {
    expect(escribirFiltro(FILTRO_VACIO)).toBe('')
  })

  it('ignora una fecha o un estado que no existen, y «desde» sin «elegir»', () => {
    const f = leerFiltro(new URLSearchParams('fecha=ayer&estado=en-curso,inventado&desde=2026-09-01'))
    expect(f.fecha).toBeNull()
    expect(f.estados).toEqual(['en-curso'])
    expect(f.desde).toBeNull()
  })

  it('una fecha mal escrita no entra', () => {
    expect(leerFiltro(new URLSearchParams('fecha=elegir&desde=1-9-2026')).desde).toBeNull()
  })

  it('depurar saca los ids que ya no existen y conserva «Sin proyecto»', () => {
    const f: Filtro = { ...FILTRO_VACIO, proyectos: ['p1', 'borrado', SIN_PROYECTO], categorias: ['vieja'], empleados: ['ana'] }
    expect(depurarFiltro(f, { proyectos: ['p1'], categorias: ['comb'], empleados: ['ana'] }))
      .toEqual({ ...FILTRO_VACIO, proyectos: ['p1', SIN_PROYECTO], categorias: [], empleados: ['ana'] })
  })

  it('paramsDePagina toma el último valor repetido y salta los vacíos', () => {
    expect(paramsDePagina({ tipo: ['a', 'b'], fecha: 'este-mes', nada: undefined }).toString())
      .toBe('tipo=b&fecha=este-mes')
  })
})
