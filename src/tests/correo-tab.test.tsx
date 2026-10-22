import { describe, it, expect, vi } from 'vitest'
import { render, screen, waitFor, fireEvent, within } from '@testing-library/react'
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

const estado = vi.hoisted(() => ({
  valor:  null as unknown,
  prueba: { enviado: true, motivo: 'Enviado a daniel@ejemplo.cl.' } as { enviado: boolean; motivo: string },
}))
vi.mock('@/actions/admin', () => ({
  getEstadoCorreo: () => Promise.resolve(estado.valor),
  probarCorreo:    () => Promise.resolve(estado.prueba),
}))

const PILOTO = {
  puedeEnviar: true,
  motivo:      null,
  desde:       'Mi Rendición <no-reply@mi-rendicion.com>',
  soloA:       ['fdiaz@pentaingenieros.cl', 'danielmartinez.cl@gmail.com'],
  pausado:     true,
  entorno:     'production',
  miCorreo:    'danielmartinez.cl@gmail.com',
}

describe('CorreoTab', () => {
  it('con lista cargada dice que solo salen a esas direcciones, y las nombra', async () => {
    estado.valor = PILOTO
    render(<CorreoTab />)

    await waitFor(() => expect(screen.getByText('Solo salen a una lista acotada')).toBeDefined())
    expect(screen.getByText('Reciben correo (2)')).toBeDefined()
    // Dentro de la lista: las mismas direcciones están también en el selector
    // de la prueba de abajo, así que buscarlas en toda la pantalla da dos nodos.
    const lista = screen.getByRole('list')
    for (const correo of PILOTO.soloA) expect(within(lista).getByText(correo)).toBeDefined()
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
      miCorreo:    'danielmartinez.cl@gmail.com',
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

  /* La prueba de envío. Lo que la justifica: el 2026-10-21 la pantalla decía
     «solo salen a una lista acotada» —y era cierto—, la persona que faltaba
     estaba en la lista, su notificación en la app se había guardado, y el correo
     no había salido. «Puede enviar» y «envió» no son lo mismo. */
  it('ofrece probar el envío, y aclara a dónde va', async () => {
    estado.valor = PILOTO
    render(<CorreoTab />)

    await waitFor(() => expect(screen.getByText('Probar el envío')).toBeDefined())
    expect(screen.getByText(/tu propia dirección/i)).toBeDefined()
  })

  it('con piloto deja elegir una dirección corporativa, sin repetir la propia', async () => {
    // Elegir importa: al Gmail del admin el correo puede llegar igual mientras
    // @pentaingenieros.cl lo rechaza, y eso es justo lo que hay que descartar.
    estado.valor = PILOTO
    render(<CorreoTab />)

    await waitFor(() => expect(screen.getByLabelText(/A qué dirección/i)).toBeDefined())
    const opciones = Array.from(
      screen.getByLabelText(/A qué dirección/i).querySelectorAll('option'),
    ).map(o => o.textContent)

    expect(opciones).toContain('fdiaz@pentaingenieros.cl')
    // La propia aparece UNA vez, como «A mí (…)», no otra vez suelta en la lista.
    expect(opciones.filter(o => o === 'danielmartinez.cl@gmail.com')).toHaveLength(0)
    expect(opciones[0]).toContain('A mí')
  })

  it('sin piloto no hay a quién elegir, y no se ofrece', async () => {
    estado.valor = { ...PILOTO, soloA: [], pausado: false }
    render(<CorreoTab />)

    await waitFor(() => expect(screen.getByText('Probar el envío')).toBeDefined())
    expect(screen.queryByLabelText(/A qué dirección/i)).toBeNull()
  })

  it('cuando sale, lo dice', async () => {
    estado.valor  = PILOTO
    estado.prueba = { enviado: true, motivo: 'Enviado a danielmartinez.cl@gmail.com.' }
    render(<CorreoTab />)

    await waitFor(() => expect(screen.getByRole('button', { name: /Enviar un correo de prueba/ })).toBeDefined())
    fireEvent.click(screen.getByRole('button', { name: /Enviar un correo de prueba/ }))

    await waitFor(() => expect(screen.getByText('El correo salió')).toBeDefined())
    // Por «Enviado a» y no por la dirección: esa también está en la lista de
    // arriba, así que buscarla sola encuentra dos nodos.
    expect(screen.getByText(/^Enviado a danielmartinez\.cl@gmail\.com/)).toBeDefined()
  })

  it('cuando no sale, muestra el motivo de Resend tal cual', async () => {
    // El motivo es TODO el valor de la prueba: sin él solo se sabe que falló,
    // que es lo que ya se sabía antes de apretar.
    estado.valor  = PILOTO
    estado.prueba = { enviado: false, motivo: 'Resend lo rechazó: The mi-rendicion.com domain is not verified.' }
    render(<CorreoTab />)

    await waitFor(() => expect(screen.getByRole('button', { name: /Enviar un correo de prueba/ })).toBeDefined())
    fireEvent.click(screen.getByRole('button', { name: /Enviar un correo de prueba/ }))

    await waitFor(() => expect(screen.getByText('No salió')).toBeDefined())
    expect(screen.getByText(/domain is not verified/)).toBeDefined()
  })
})
