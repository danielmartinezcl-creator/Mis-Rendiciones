import { describe, it, expect } from 'vitest'
import { render, screen, fireEvent, act } from '@testing-library/react'
import { ProveedorDialogos, useDialogos } from '@/components/ui/Dialogos'

/* El botón de un borrado irreversible no se habilita hasta escribir la
   palabra exacta: es lo que hacía el `window.prompt` que reemplazó. */

function Disparador({ onRespuesta }: { onRespuesta: (ok: boolean) => void }) {
  const { confirmar } = useDialogos()
  return (
    <button onClick={async () => onRespuesta(await confirmar({
      titulo: '¿Eliminar?', aceptar: 'Eliminar', peligro: true, palabra: 'ELIMINAR',
    }))}>
      abrir
    </button>
  )
}

function montar() {
  const respuestas: boolean[] = []
  render(<ProveedorDialogos><Disparador onRespuesta={ok => respuestas.push(ok)} /></ProveedorDialogos>)
  fireEvent.click(screen.getByText('abrir'))
  return {
    respuestas,
    campo:  screen.getByRole('textbox'),
    boton:  screen.getByRole('button', { name: 'Eliminar' }),
  }
}

describe('confirmar con palabra', () => {
  it('el botón arranca deshabilitado', () => {
    const { boton } = montar()
    expect(boton).toBeDisabled()
  })

  it('sigue deshabilitado con la palabra mal escrita o en minúsculas', () => {
    const { campo, boton } = montar()
    fireEvent.change(campo, { target: { value: 'eliminar' } })
    expect(boton).toBeDisabled()
    fireEvent.change(campo, { target: { value: 'ELIMINA' } })
    expect(boton).toBeDisabled()
  })

  it('con la palabra exacta se habilita y confirma', async () => {
    const { campo, boton, respuestas } = montar()
    fireEvent.change(campo, { target: { value: 'ELIMINAR' } })
    expect(boton).toBeEnabled()
    await act(async () => { fireEvent.click(boton) })
    expect(respuestas).toEqual([true])
  })

  it('Enter con la palabra incompleta no confirma', async () => {
    const { campo, respuestas } = montar()
    fireEvent.change(campo, { target: { value: 'ELIM' } })
    await act(async () => { fireEvent.keyDown(campo, { key: 'Enter' }) })
    expect(respuestas).toEqual([])
  })

  it('al reabrir, el campo vuelve vacío', async () => {
    const { campo } = montar()
    fireEvent.change(campo, { target: { value: 'ELIMINAR' } })
    await act(async () => { fireEvent.click(screen.getByText('Cancelar')) })
    fireEvent.click(screen.getByText('abrir'))
    expect(screen.getByRole('textbox')).toHaveValue('')
  })
})
