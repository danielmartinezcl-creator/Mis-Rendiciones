import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { BloqueDevolver } from '@/components/petty-cash/BloqueDevolver'

/**
 * El formulario de «Devolver para corregir».
 *
 * Se prueba acá porque el botón **solo lo ve quien puede decidir** ese paso, y
 * el admin no opera: con la sesión de Daniel la pantalla nunca lo dibuja. Haría
 * falta la sesión de Katherine, que es quien aprueba el fondo de Francisco.
 */

const props = {
  etiqueta:    'El fondo vuelve a borrador para que lo corrija y lo reenvíe.',
  notas:       '',
  setNotas:    () => {},
  pendiente:   false,
  onConfirmar: () => {},
  onCancelar:  () => {},
}

describe('BloqueDevolver', () => {
  it('dice a dónde vuelve el documento', () => {
    render(<BloqueDevolver {...props} />)
    expect(screen.getByText(/vuelve a borrador/i)).toBeDefined()
  })

  it('sin motivo no deja confirmar', () => {
    // Devolver sin decir qué corregir es peor que rechazar: la persona recibe
    // el documento de vuelta sin saber qué hacer con él.
    render(<BloqueDevolver {...props} notas="   " />)
    expect(screen.getByRole('button', { name: /Confirmar devolución/ }).hasAttribute('disabled')).toBe(true)
  })

  it('con motivo, confirma', () => {
    const onConfirmar = vi.fn()
    render(<BloqueDevolver {...props} notas="Falta el detalle de los EPP" onConfirmar={onConfirmar} />)
    const boton = screen.getByRole('button', { name: /Confirmar devolución/ })
    expect(boton.hasAttribute('disabled')).toBe(false)
    fireEvent.click(boton)
    expect(onConfirmar).toHaveBeenCalledOnce()
  })

  it('mientras envía no se puede confirmar dos veces', () => {
    render(<BloqueDevolver {...props} notas="algo" pendiente />)
    expect(screen.getByRole('button', { name: /Devolviendo/ }).hasAttribute('disabled')).toBe(true)
  })

  it('la etiqueta cambia para una liquidación', () => {
    // La plata ya está con la persona: vuelve a «fondos enviados», no a borrador.
    render(<BloqueDevolver {...props} etiqueta="Vuelve a «fondos enviados» para que corrija los gastos y reenvíe la liquidación." />)
    expect(screen.getByText(/fondos enviados/i)).toBeDefined()
  })
})
