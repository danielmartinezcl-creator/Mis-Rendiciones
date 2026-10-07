import { describe, it, expect } from 'vitest'
import { confirmacionInvitacion } from '@/lib/invitaciones'

/**
 * Existe por el incidente del 2026-10-07: «Invitar sin invitar (52)» mandaba 52
 * correos con un solo clic. Solo pedía confirmación cuando alguno YA estaba
 * invitado, así que un lote nuevo —el caso de mayor alcance— salía sin preguntar.
 */
describe('confirmacionInvitacion', () => {
  it('sin destinatarios no hay nada que confirmar', () => {
    expect(confirmacionInvitacion(1 - 1, [])).toBeNull()
  })

  // El botón por fila es un acto deliberado sobre una persona
  it('una persona nueva no pide confirmación', () => {
    expect(confirmacionInvitacion(1, [])).toBeNull()
  })

  it('una persona ya invitada pide confirmar el reenvío, con su nombre', () => {
    const c = confirmacionInvitacion(1, [{ nombre: 'Ana Pérez', fecha: '07/10/2026' }])
    expect(c).not.toBeNull()
    expect(c!.titulo).toContain('Ana Pérez')
    expect(c!.palabra).toBeUndefined()
  })

  // Un clic —humano distraído o automatizado— no alcanza: hay que escribir la
  // palabra. Es lo que habría frenado el incidente.
  it('varias personas nuevas piden escribir INVITAR, con el número a la vista', () => {
    const c = confirmacionInvitacion(52, [])
    expect(c).not.toBeNull()
    expect(c!.palabra).toBe('INVITAR')
    expect(c!.titulo).toContain('52')
    expect(c!.aceptar).toContain('52')
  })

  it('varias con algunas ya invitadas: pide INVITAR y dice cuántas son reenvíos', () => {
    const c = confirmacionInvitacion(10, [
      { nombre: 'Ana', fecha: '07/10/2026' },
      { nombre: 'Beto', fecha: '07/10/2026' },
    ])
    expect(c!.palabra).toBe('INVITAR')
    expect(c!.detalle).toContain('2')
  })

  // El texto viejo decía que el reenvío llegaba como «restablecer contraseña».
  // Era cierto cuando enviaba Supabase; desde que envía la app, llega el mismo
  // correo de bienvenida, y el aviso asustaba con algo que ya no pasa.
  it('ningún texto promete un correo de «restablecer contraseña»', () => {
    const casos = [
      confirmacionInvitacion(1, [{ nombre: 'Ana', fecha: '07/10/2026' }]),
      confirmacionInvitacion(5, []),
      confirmacionInvitacion(5, [{ nombre: 'Ana', fecha: '07/10/2026' }]),
    ]
    for (const c of casos) {
      expect(`${c!.titulo} ${c!.detalle}`.toLowerCase()).not.toContain('restablecer')
    }
  })
})
