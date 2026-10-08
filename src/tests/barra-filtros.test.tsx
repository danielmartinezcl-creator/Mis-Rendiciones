import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { BarraFiltros } from '@/components/filtros/BarraFiltros'
import { FILTRO_VACIO, type Filtro } from '@/lib/filtro-documentos'
import { aFiltro, aValores, dimensionDocumento } from '@/lib/filtros/adaptador-documentos'
import type { Dimension } from '@/lib/filtros/dimensiones'

const dimensiones: Dimension[] = [
  dimensionDocumento('categorias', [
    { id: 'comb', etiqueta: 'Combustible', detalle: '3 gastos' },
    { id: 'alim', etiqueta: 'Alimentación' },
  ]),
  dimensionDocumento('fecha', []),
]

/* La barra habla en `Valores`; las afirmaciones siguen escritas en `Filtro`,
   que es lo que la pantalla del empleado maneja. El adaptador va en el medio,
   igual que en la app: así esta prueba recorre el mismo camino. */
function montar(filtro: Filtro = FILTRO_VACIO, resumen: string | null = null, dims = dimensiones) {
  const onCambio = vi.fn()
  render(
    <BarraFiltros
      valores={aValores(filtro)}
      onCambio={v => onCambio(aFiltro(v))}
      dimensiones={dims}
      contar={v => (aFiltro(v).categorias.length ? 1 : 5)}
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

  /* Con las cuatro o cinco dimensiones del empleado NO hay nada escondido, así
     que el botón no existe. Si esta prueba se pone roja, las dos pantallas del
     empleado ganaron un botón que nadie pidió. */
  it('sin dimensiones escondidas no aparece «Más filtros»', () => {
    montar()
    expect(screen.queryByRole('button', { name: /Más filtros/ })).toBeNull()
  })
})

describe('BarraFiltros · «Más filtros»', () => {
  const conEscondida: Dimension[] = [
    ...dimensiones,
    { clave: 'reembolso', nombre: 'Reembolso', destacada: false, tipo: 'unico',
      opciones: [{ id: 'pendiente', etiqueta: 'Pendiente de reembolso' }] },
  ]

  function montarAdmin(valores = {}, dims = conEscondida) {
    const onCambio = vi.fn()
    render(
      <BarraFiltros
        valores={valores} onCambio={onCambio} dimensiones={dims}
        contar={() => 7} sustantivo={['rendición', 'rendiciones']} resumen={null}
      />,
    )
    return onCambio
  }

  it('aparece cuando hay dimensiones escondidas', () => {
    montarAdmin()
    expect(screen.getByRole('button', { name: /Más filtros/ })).toBeInTheDocument()
  })

  it('no es un chip: lo escondido no se dibuja en la barra', () => {
    montarAdmin()
    expect(screen.queryByRole('button', { name: 'Reembolso' })).toBeNull()
  })

  /* El número es lo único que impide que «Más filtros» esconda algo de verdad.
     Sin él, un filtro puesto ahí adentro cambia la lista sin que nada lo diga. */
  it('lleva el número de las escondidas que están puestas', () => {
    montarAdmin({ reembolso: { tipo: 'unico', id: 'pendiente' } })
    expect(screen.getByRole('button', { name: 'Más filtros, 1 puesto' })).toBeInTheDocument()
  })

  it('sin nada puesto adentro, no lleva número', () => {
    montarAdmin()
    expect(screen.getByRole('button', { name: 'Más filtros' })).toBeInTheDocument()
  })

  it('elegir adentro y aplicar devuelve los valores', () => {
    const onCambio = montarAdmin()
    fireEvent.click(screen.getByRole('button', { name: /Más filtros/ }))
    fireEvent.change(screen.getByLabelText('Reembolso'), { target: { value: 'pendiente' } })
    fireEvent.click(screen.getByRole('button', { name: 'Ver 7 rendiciones' }))
    expect(onCambio).toHaveBeenCalledWith(
      expect.objectContaining({ reembolso: { tipo: 'unico', id: 'pendiente' } }),
    )
  })

  it('cerrar descarta lo elegido adentro', () => {
    const onCambio = montarAdmin()
    fireEvent.click(screen.getByRole('button', { name: /Más filtros/ }))
    fireEvent.change(screen.getByLabelText('Reembolso'), { target: { value: 'pendiente' } })
    fireEvent.click(screen.getByRole('button', { name: 'Cerrar' }))
    expect(onCambio).not.toHaveBeenCalled()
  })
})
