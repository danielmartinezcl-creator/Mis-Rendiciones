import { describe, it, expect, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { AvisoNombreRepetido } from '@/components/ui/AvisoNombreRepetido'
import type { Coincidencia } from '@/lib/nombre-repetido'

/**
 * El aviso «ya tenés uno con este nombre».
 *
 * Se prueba acá porque **no hay con qué verlo en el navegador**: al 2026-10-21
 * no queda ni un documento en curso en la base —los fondos están todos en la
 * papelera y las rendiciones de prueba, reembolsadas—, así que la pantalla
 * nunca entra al camino del aviso. La consulta y los filtros sí se verificaron
 * contra datos reales ese día: buscando «Rendicion N°2 Daniel Martinez» la
 * acción trajo 2 filas, `mismoNombre` acertó 1 contra el título guardado en
 * MAYÚSCULAS, y `enCurso` la descartó por estar reembolsada.
 */

const respuesta = vi.hoisted(() => ({ valor: [] as Coincidencia[] }))
vi.mock('@/actions/expenses', () => ({
  buscarNombreRepetido: () => Promise.resolve(respuesta.valor),
}))

const UNA: Coincidencia[] = [
  { id: 'f1', nombre: 'Caja chica obra Norte', desde: '2026-10-03T12:00:00Z', estado: 'funds_sent' },
]

describe('AvisoNombreRepetido', () => {
  it('muestra el aviso y aclara que no bloquea', async () => {
    respuesta.valor = UNA
    render(<AvisoNombreRepetido clase="fondo" nombre="Caja chica obra Norte" />)

    await waitFor(() => expect(screen.getByText(/Ya tenés un fondo sin cerrar/)).toBeDefined())
    // «Podés seguir igual» es la mitad del mensaje: sin eso parece un error.
    expect(screen.getByText(/Podés seguir igual/)).toBeDefined()
  })

  it('sin coincidencias no dibuja nada', async () => {
    respuesta.valor = []
    const { container } = render(<AvisoNombreRepetido clase="fondo" nombre="Nombre nuevo" />)

    await waitFor(() => expect(container.textContent).toBe(''))
  })

  it('con el campo vacío no consulta ni dibuja', async () => {
    respuesta.valor = UNA   // aunque la acción respondiera algo
    const { container } = render(<AvisoNombreRepetido clase="fondo" nombre="   " />)

    await waitFor(() => expect(container.textContent).toBe(''))
  })
})
