import { describe, it, expect, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { CorreoTab } from '@/components/admin/CorreoTab'

/**
 * La pestaña «Correo» de Configuración, que muestra a quién le llega un correo.
 *
 * Se prueba acá y no en el navegador porque **el caso que importa solo existe en
 * producción**: `CORREO_SOLO_A` vive en Vercel, así que en local la pantalla
 * siempre cae en «fuera de producción» y el camino de la lista no se ejercita.
 * Simular producción en local para verlo sería poner `VERCEL_ENV=production` con
 * la base real al lado — exactamente lo que mandó 52 invitaciones el 2026-10-07.
 */

const estado = vi.hoisted(() => ({ valor: null as unknown }))
vi.mock('@/actions/admin', () => ({
  getEstadoCorreo: () => Promise.resolve(estado.valor),
}))

const PILOTO = {
  puedeEnviar: true,
  motivo:      null,
  desde:       'Mi Rendición <no-reply@mi-rendicion.com>',
  soloA:       ['fdiaz@pentaingenieros.cl', 'danielmartinez.cl@gmail.com'],
  pausado:     true,
  entorno:     'production',
}

describe('CorreoTab', () => {
  it('con lista cargada dice que solo salen a esas direcciones, y las nombra', async () => {
    estado.valor = PILOTO
    render(<CorreoTab />)

    await waitFor(() => expect(screen.getByText('Solo salen a una lista acotada')).toBeDefined())
    expect(screen.getByText('Reciben correo (2)')).toBeDefined()
    for (const correo of PILOTO.soloA) expect(screen.getByText(correo)).toBeDefined()
    // Que nadie más recibe es la mitad del mensaje, y la que se malinterpreta.
    expect(screen.getByText(/nadie más recibe nada/i)).toBeDefined()
  })

  it('sin lista avisa que le llega a cualquiera', async () => {
    estado.valor = { ...PILOTO, soloA: [], pausado: false }
    render(<CorreoTab />)

    await waitFor(() => expect(screen.getByText('Los correos salen normalmente')).toBeDefined())
    expect(screen.queryByText(/Reciben correo/)).toBeNull()
  })

  it('cortado, muestra el motivo que da el candado', async () => {
    estado.valor = {
      puedeEnviar: false,
      motivo:      'Fuera de producción no se envían correos (VERCEL_ENV no es «production»).',
      desde:       null,
      soloA:       [],
      pausado:     false,
      entorno:     'local',
    }
    render(<CorreoTab />)

    await waitFor(() => expect(screen.getByText('No sale ningún correo')).toBeDefined())
    expect(screen.getByText(/VERCEL_ENV no es/)).toBeDefined()
  })

  it('dice dónde se cambia, porque desde acá no se cambia', async () => {
    estado.valor = PILOTO
    render(<CorreoTab />)

    await waitFor(() => expect(screen.getByText(/Environment Variables/)).toBeDefined())
    // Sin esta advertencia, un cambio en Vercel parecería no haber servido.
    expect(screen.getByText(/volver a desplegar/i)).toBeDefined()
  })
})
