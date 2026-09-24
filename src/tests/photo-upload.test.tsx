import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'

const runOcr = vi.fn()
vi.mock('@/actions/ocr', () => ({ runOcr: (...a: unknown[]) => runOcr(...a) }))

import { PhotoUpload } from '@/components/expenses/PhotoUpload'
import { ProveedorDialogos } from '@/components/ui/Dialogos'

function montar() {
  const onOcrResult = vi.fn()
  const { container } = render(<ProveedorDialogos><PhotoUpload onOcrResult={onOcrResult} /></ProveedorDialogos>)
  const inputs  = [...container.querySelectorAll<HTMLInputElement>('input[type=file]')]
  const camara  = inputs.find(i => i.hasAttribute('capture'))!
  const archivo = inputs.find(i => !i.hasAttribute('capture'))!
  return { onOcrResult, camara, archivo }
}

describe('PhotoUpload', () => {
  // En el celular, `capture` abre la cámara directo y no deja elegir un archivo
  // guardado: con una sola entrada, los PDF y correos eran imposibles de subir.
  it('tiene una entrada de cámara y otra de archivos SIN capture', () => {
    const { camara, archivo } = montar()
    expect(camara).toBeTruthy()
    expect(archivo).toBeTruthy()
    for (const t of ['.pdf', '.eml', '.msg']) expect(archivo.accept).toContain(t)
  })

  it('un correo se adjunta sin pasar por el OCR', async () => {
    const { archivo, onOcrResult } = montar()
    const correo = new File(['From: jefe'], 'autorizacion.msg', { type: '' })
    fireEvent.change(archivo, { target: { files: [correo] } })
    await waitFor(() => expect(onOcrResult).toHaveBeenCalledWith(null, correo))
    expect(runOcr).not.toHaveBeenCalled()
    expect(screen.getByText('Correo adjuntado ✓')).toBeTruthy()
  })

  it('rechaza un tipo de archivo que no es comprobante', () => {
    const { archivo, onOcrResult } = montar()
    fireEvent.change(archivo, { target: { files: [new File(['x'], 'planilla.xlsx')] } })
    expect(onOcrResult).not.toHaveBeenCalled()
  })
})
