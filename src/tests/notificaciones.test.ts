import { describe, it, expect } from 'vitest'
import { textoNotificacion } from '@/lib/notificaciones'

/* La fila de `notifications` no trae texto: solo el tipo y a qué documento
   apunta. Hasta el 2026-09-25 el aviso leía `title` y `body` —dos columnas que
   la tabla nunca tuvo— y cada notificación pintaba una caja vacía. */

// Espejo del CHECK notifications_type_check (migraciones 032 y 036)
const TIPOS = [
  'submission', 'approval', 'rejection', 'reimbursement',
  'bank_load', 'bank_auth', 'funds_sent', 'config_missing',
  'reminder',
] as const

const rendicion = { report_id: 'r-1', fund_id: null }
const fondo     = { report_id: null,  fund_id: 'f-1' }

describe('textoNotificacion', () => {
  it('ningún tipo queda en blanco, apunte a una rendición o a un fondo', () => {
    for (const type of TIPOS) {
      for (const doc of [rendicion, fondo]) {
        expect(textoNotificacion({ type, ...doc })?.trim(), `${type} ${doc.fund_id ? 'fondo' : 'rendición'}`)
          .toBeTruthy()
      }
    }
  })

  it('el mismo tipo dice rendición o fondo según a qué apunte', () => {
    expect(textoNotificacion({ type: 'submission', ...rendicion })).toBe('Una rendición espera tu aprobación.')
    expect(textoNotificacion({ type: 'submission', ...fondo })).toBe('Un fondo de caja chica espera tu aprobación.')
    expect(textoNotificacion({ type: 'rejection', ...rendicion })).toBe('Tu rendición fue rechazada.')
    expect(textoNotificacion({ type: 'rejection', ...fondo })).toBe('Un fondo de caja chica fue rechazado.')
  })

  it('el aviso de configuración no necesita documento', () => {
    expect(textoNotificacion({ type: 'config_missing', report_id: null, fund_id: null }))
      .toBe('Alguien no pudo enviar porque no tiene aprobador. Asígnale uno en Empleados.')
  })

  it('un tipo que no conoce no inventa un aviso', () => {
    expect(textoNotificacion({ type: 'reminder_draft', ...rendicion })).toBeNull()
    // Ni aunque el nombre coincida con algo del prototipo de un objeto
    expect(textoNotificacion({ type: 'constructor', ...rendicion })).toBeNull()
  })

  it('sin documento, un tipo que depende de él no adivina cuál es', () => {
    expect(textoNotificacion({ type: 'approval', report_id: null, fund_id: null })).toBeNull()
  })
})
