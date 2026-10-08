import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { BarraFiltros, type Dimension } from '@/components/filtros/BarraFiltros'
import { FILTRO_VACIO, type Filtro } from '@/lib/filtro-documentos'

const dimensiones: Dimension[] = [
  { clave: 'categorias', opciones: [
    { id: 'comb', etiqueta: 'Combustible', detalle: '3 gastos' },
    { id: 'alim', etiqueta: 'Alimentación' },
  ] },
  { clave: 'fecha', opciones: [] },
]

function montar(filtro: Filtro = FILTRO_VACIO, resumen: string | null = null) {
  const onCambio = vi.fn()
  render(
    <BarraFiltros
      filtro={filtro} onCambio={onCambio} dimensiones={dimensiones}
      contar={f => (f.categorias.length ? 1 : 5)}
      sustantivo={['rendición', 'rendiciones']} resumen={resumen}
    />,
  )
  return onCambio
}

describe('BarraFiltros', () => {
  it('sin filtro, cada chip muestra su nombre y no hay línea de resultado', () => {
    montar()
    expect(screen.getByRole('button', { name: 'Tipo de gasto' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Fecha' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Limpiar' })).toBeNull()
  })

  it('elegir en la hoja y aplicar devuelve el filtro, con el número de lo que queda', () => {
    const onCambio = montar()
    fireEvent.click(screen.getByRole('button', { name: 'Tipo de gasto' }))
    fireEvent.click(screen.getByLabelText(/Combustible/))
    fireEvent.click(screen.getByRole('button', { name: 'Ver 1 rendición' }))
    expect(onCambio).toHaveBeenCalledWith({ ...FILTRO_VACIO, categorias: ['comb'] })
  })

  it('cerrar la hoja descarta lo marcado', () => {
    const onCambio = montar()
    fireEvent.click(screen.getByRole('button', { name: 'Tipo de gasto' }))
    fireEvent.click(screen.getByLabelText(/Combustible/))
    fireEvent.click(screen.getByRole('button', { name: 'Cerrar' }))
    expect(onCambio).not.toHaveBeenCalled()
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('Escape también cierra', () => {
    montar()
    fireEvent.click(screen.getByRole('button', { name: 'Tipo de gasto' }))
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('con algo elegido, el chip lo muestra y su ✕ lo quita', () => {
    const onCambio = montar({ ...FILTRO_VACIO, categorias: ['comb'] }, '3 de 12 · $ 97.300 en Combustible')
    expect(screen.getByRole('button', { name: 'Combustible' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Quitar filtro Tipo de gasto' }))
    expect(onCambio).toHaveBeenCalledWith(FILTRO_VACIO)
  })

  it('«Limpiar» de la línea de resultado lo saca todo', () => {
    const onCambio = montar({ ...FILTRO_VACIO, categorias: ['comb'], fecha: 'este-mes' }, 'resumen')
    fireEvent.click(screen.getByRole('button', { name: 'Limpiar' }))
    expect(onCambio).toHaveBeenCalledWith(FILTRO_VACIO)
  })

  it('la fecha se elige de una lista, y «Elegir fechas» muestra los dos campos', () => {
    const onCambio = montar()
    fireEvent.click(screen.getByRole('button', { name: 'Fecha' }))
    fireEvent.click(screen.getByLabelText('Elegir fechas'))
    expect(screen.getByLabelText('Desde')).toBeInTheDocument()
    fireEvent.click(screen.getByLabelText('Este mes'))
    fireEvent.click(screen.getByRole('button', { name: /^Ver / }))
    expect(onCambio).toHaveBeenCalledWith({ ...FILTRO_VACIO, fecha: 'este-mes' })
  })
})
