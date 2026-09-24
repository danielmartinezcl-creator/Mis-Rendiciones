import { describe, it, expect } from 'vitest'
import {
  puedeActuar, destinatarios, destinatariosInformativos, puedeEnviar,
  validarCadena, dependientesDe, suplenteVigente, pasoSegunEstado, tipoDeFondo,
  type Persona, type Documento, type Cadena, type EntradaHistorial,
} from '@/lib/permisos'

// La configuración de PENTA que describió Daniel el 2026-09-24.
function persona(id: string, nombre: string, extra: Partial<Persona> = {}): Persona {
  return {
    id, nombre, activo: true,
    can_submit: true, can_approve: false, can_manage_petty_cash: false,
    can_load_bank_transfer: false, can_authorize_bank_transfer: false,
    bank_load_backup: false, bank_auth_backup: false,
    ...extra,
  }
}

const KC = persona('kc', 'Katherine Corvalán', { can_approve: true, can_manage_petty_cash: true, can_load_bank_transfer: true })
const FH = persona('fh', 'Francisco Hagar', {
  can_approve: true, can_manage_petty_cash: true,
  can_load_bank_transfer: true, bank_load_backup: true,
  can_authorize_bank_transfer: true,
})
const RH = persona('rh', 'Roberto Hagar', {
  can_approve: true, can_manage_petty_cash: true,
  can_load_bank_transfer: true, bank_load_backup: true,
  can_authorize_bank_transfer: true, bank_auth_backup: true,
})
const DM = persona('dm', 'Daniel Martínez', {
  can_approve: true, can_manage_petty_cash: true,
  can_load_bank_transfer: true, bank_load_backup: true,
})
const FD = persona('fd', 'Francisco Díaz')
const PENTA = [KC, FH, RH, DM, FD]

const CADENAS: Record<string, Cadena> = {
  fd: { l1: 'kc', l2: 'fh', suplenteL1Vigente: null },
  kc: { l1: 'fh', l2: null, suplenteL1Vigente: null },
  fh: { l1: 'rh', l2: null, suplenteL1Vigente: null },
  rh: { l1: 'fh', l2: null, suplenteL1Vigente: null },
}

function rendicionDe(beneficiarioId: string, historial: EntradaHistorial[] = [], cadena?: Cadena): Documento {
  return { tipo: 'rendicion', beneficiarioId, cadena: cadena ?? CADENAS[beneficiarioId], historial }
}
const cargo = (actorId: string): EntradaHistorial => ({ actorId, accion: 'bank_load_confirmed', nivel: 1 })

describe('rendición de Francisco Díaz — el caso normal', () => {
  it('el nivel 1 lo decide Katherine y solo a ella le llega el aviso', () => {
    const doc = rendicionDe('fd')
    expect(puedeActuar(KC, 'decidir_l1', doc, PENTA)).toEqual({ ok: true })
    expect(destinatarios('decidir_l1', doc, PENTA, ['fd'])).toEqual(['kc'])
  })

  it('FH, que es su N2, no decide el nivel 1 aunque entre por link directo', () => {
    const r = puedeActuar(FH, 'decidir_l1', rendicionDe('fd'), PENTA)
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.motivo).toContain('Katherine Corvalán')
  })

  it('el nivel 2 lo decide FH', () => {
    const doc = rendicionDe('fd')
    expect(puedeActuar(FH, 'decidir_l2', doc, PENTA)).toEqual({ ok: true })
    expect(puedeActuar(KC, 'decidir_l2', doc, PENTA).ok).toBe(false)
    expect(destinatarios('decidir_l2', doc, PENTA, ['kc'])).toEqual(['fh'])
  })

  it('tras la aprobación final, el aviso de carga va solo a Katherine (titular)', () => {
    expect(destinatarios('cargar_pago', rendicionDe('fd'), PENTA, ['fh'])).toEqual(['kc'])
  })

  it('Katherine cargó: autoriza FH, y el aviso va solo a él', () => {
    const doc = rendicionDe('fd', [cargo('kc')])
    expect(puedeActuar(FH, 'autorizar_pago', doc, PENTA)).toEqual({ ok: true })
    expect(destinatarios('autorizar_pago', doc, PENTA, ['kc'])).toEqual(['fh'])
  })

  it('aprobar en N2 y autorizar el mismo pago está permitido (regla 4)', () => {
    const doc = rendicionDe('fd', [{ actorId: 'fh', accion: 'approved', nivel: 2 }, cargo('kc')])
    expect(puedeActuar(FH, 'autorizar_pago', doc, PENTA)).toEqual({ ok: true })
  })
})

describe('Katherine no está: FH carga', () => {
  const doc = rendicionDe('fd', [cargo('fh')])

  it('FH no autoriza lo que cargó (regla 3) y el mensaje nombra a Roberto', () => {
    const r = puedeActuar(FH, 'autorizar_pago', doc, PENTA)
    expect(r.ok).toBe(false)
    if (!r.ok) {
      expect(r.motivo).toContain('Tú cargaste este pago')
      expect(r.motivo).toContain('Roberto Hagar')
    }
  })

  it('el aviso de autorizar va directo a Roberto, aunque sea suplente', () => {
    expect(destinatarios('autorizar_pago', doc, PENTA, ['fh'])).toEqual(['rh'])
  })

  it('cuenta la última carga: tras una reversa, vale quien cargó de nuevo', () => {
    expect(puedeActuar(FH, 'autorizar_pago', rendicionDe('fd', [cargo('fh'), cargo('kc')]), PENTA))
      .toEqual({ ok: true })
  })
})

describe('rendición del mismo FH', () => {
  it('la aprueba Roberto, su N1; FH no', () => {
    expect(puedeActuar(RH, 'decidir_l1', rendicionDe('fh'), PENTA)).toEqual({ ok: true })
    expect(puedeActuar(FH, 'decidir_l1', rendicionDe('fh'), PENTA).ok).toBe(false)
  })

  it('FH no autoriza su propio pago (regla 2); el aviso va a Roberto', () => {
    const doc = rendicionDe('fh', [cargo('kc')])
    const r = puedeActuar(FH, 'autorizar_pago', doc, PENTA)
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.motivo).toContain('No puedes autorizar el pago de lo tuyo')
    expect(destinatarios('autorizar_pago', doc, PENTA, ['kc'])).toEqual(['rh'])
  })

  it('Roberto no puede cargarla: después nadie podría autorizar', () => {
    const r = puedeActuar(RH, 'cargar_pago', rendicionDe('fh'), PENTA)
    expect(r.ok).toBe(false)
    if (!r.ok) {
      expect(r.motivo).toContain('nadie podrá autorizar')
      expect(r.motivo).toContain('Katherine Corvalán')
    }
  })

  it('FH sí puede cargar la suya (regla 5): la autoriza Roberto', () => {
    expect(puedeActuar(FH, 'cargar_pago', rendicionDe('fh'), PENTA)).toEqual({ ok: true })
  })
})

describe('rendición de Katherine', () => {
  it('no la aprueba ella aunque esté mal configurada como su propia N1', () => {
    const malConfigurada = rendicionDe('kc', [], { l1: 'kc', l2: null, suplenteL1Vigente: null })
    const r = puedeActuar(KC, 'decidir_l1', malConfigurada, PENTA)
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.motivo).toContain('No puedes aprobar lo tuyo')
    expect(puedeActuar(FH, 'decidir_l1', rendicionDe('kc'), PENTA)).toEqual({ ok: true })
  })

  it('puede cargar su propio reembolso (regla 5) y lo autoriza FH', () => {
    expect(puedeActuar(KC, 'cargar_pago', rendicionDe('kc'), PENTA)).toEqual({ ok: true })
    expect(destinatarios('autorizar_pago', rendicionDe('kc', [cargo('kc')]), PENTA, ['kc'])).toEqual(['fh'])
  })
})

describe('fondos: «lo propio» es lo que recibe uno (D3)', () => {
  it('el fondo n°193: Katherine no aprueba un fondo a su nombre', () => {
    const fondo: Documento = { tipo: 'fondo', beneficiarioId: 'kc', cadena: CADENAS.kc, historial: [] }
    expect(puedeActuar(KC, 'decidir_l1', fondo, PENTA).ok).toBe(false)
    expect(puedeActuar(FH, 'decidir_l1', fondo, PENTA)).toEqual({ ok: true })
  })

  it('Katherine sí aprueba el fondo de Francisco Díaz aunque ella lo haya creado', () => {
    const fondo: Documento = { tipo: 'fondo', beneficiarioId: 'fd', cadena: CADENAS.fd, historial: [] }
    expect(puedeActuar(KC, 'decidir_l1', fondo, PENTA)).toEqual({ ok: true })
  })
})

describe('suplente de nivel 1', () => {
  const conSuplente = rendicionDe('fd', [], { l1: 'kc', l2: 'fh', suplenteL1Vigente: 'rh' })

  it('mientras está vigente, el suplente puede decidir', () => {
    expect(puedeActuar(RH, 'decidir_l1', conSuplente, PENTA)).toEqual({ ok: true })
  })

  it('el titular también puede, si entra a la app', () => {
    expect(puedeActuar(KC, 'decidir_l1', conSuplente, PENTA)).toEqual({ ok: true })
  })

  it('el aviso le llega solo al suplente (D8)', () => {
    expect(destinatarios('decidir_l1', conSuplente, PENTA, ['fd'])).toEqual(['rh'])
  })

  it('suplenteVigente respeta el período, con los dos extremos incluidos', () => {
    expect(suplenteVigente('rh', '2026-09-01', '2026-09-30', '2026-09-01')).toBe('rh')
    expect(suplenteVigente('rh', '2026-09-01', '2026-09-30', '2026-09-30')).toBe('rh')
    expect(suplenteVigente('rh', '2026-09-01', '2026-09-30', '2026-10-01')).toBeNull()
    expect(suplenteVigente('rh', null, '2026-09-30', '2026-09-15')).toBeNull()
    expect(suplenteVigente(null, '2026-09-01', '2026-09-30', '2026-09-15')).toBeNull()
  })
})

describe('permisos que faltan y personas inactivas', () => {
  it('sin «carga banco» no se carga', () => {
    const r = puedeActuar(FD, 'cargar_pago', rendicionDe('kc'), PENTA)
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.motivo).toContain('carga banco')
  })

  it('sin «autoriza banco» no se autoriza', () => {
    expect(puedeActuar(KC, 'autorizar_pago', rendicionDe('fd', [cargo('fh')]), PENTA).ok).toBe(false)
  })

  it('una persona inactiva no puede nada, ni recibe avisos', () => {
    const kcInactiva = { ...KC, activo: false }
    const personas = [kcInactiva, FH, RH, DM, FD]
    expect(puedeActuar(kcInactiva, 'decidir_l1', rendicionDe('fd'), personas).ok).toBe(false)
    // Sin la titular, el aviso va a todos los suplentes que pueden
    expect(destinatarios('cargar_pago', rendicionDe('fd'), personas)).toEqual(['fh', 'rh', 'dm'])
  })
})

describe('pasoSegunEstado y tipoDeFondo', () => {
  it('rendiciones', () => {
    expect(pasoSegunEstado('rendicion', 'submitted')).toBe('decidir_l1')
    expect(pasoSegunEstado('rendicion', 'pending_l2')).toBe('decidir_l2')
    expect(pasoSegunEstado('rendicion', 'pending_bank_load')).toBe('cargar_pago')
    expect(pasoSegunEstado('rendicion', 'pending_bank_auth')).toBe('autorizar_pago')
    expect(pasoSegunEstado('rendicion', 'approved')).toBeNull()
    expect(pasoSegunEstado('rendicion', 'draft')).toBeNull()
  })

  it('fondos y liquidaciones', () => {
    expect(pasoSegunEstado('fondo', 'pending_approval')).toBe('decidir_l1')
    expect(pasoSegunEstado('fondo', 'pending_approval_l2')).toBe('decidir_l2')
    expect(pasoSegunEstado('fondo', 'pending_bank_load')).toBe('cargar_pago')
    expect(pasoSegunEstado('liquidacion', 'pending_liquidation_approval')).toBe('decidir_l1')
    expect(pasoSegunEstado('liquidacion', 'submitted')).toBe('decidir_l1')
    expect(pasoSegunEstado('liquidacion', 'pending_liquidation_l2')).toBe('decidir_l2')
    expect(tipoDeFondo('pending_approval')).toBe('fondo')
    expect(tipoDeFondo('funds_sent')).toBe('fondo')
    expect(tipoDeFondo('submitted')).toBe('liquidacion')
    expect(tipoDeFondo('pending_liquidation_l2')).toBe('liquidacion')
  })
})

describe('puedeEnviar', () => {
  it('rendir exige «rinde»', () => {
    expect(puedeEnviar('rendicion', { ...FD, can_submit: false }, CADENAS.fd).ok).toBe(false)
    expect(puedeEnviar('rendicion', FD, CADENAS.fd)).toEqual({ ok: true })
  })

  it('sin N1 no se envía, y el motivo dice que el administrador ya sabe', () => {
    const r = puedeEnviar('rendicion', FD, { l1: null, l2: null, suplenteL1Vigente: null })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.motivo).toContain('administrador')
  })

  it('un fondo exige «EFF»', () => {
    expect(puedeEnviar('fondo', FD, CADENAS.fd).ok).toBe(false)
    expect(puedeEnviar('fondo', KC, CADENAS.fd)).toEqual({ ok: true })
  })

  it('la liquidación no exige permiso: la envía el beneficiario', () => {
    expect(puedeEnviar('liquidacion', FD, CADENAS.fd)).toEqual({ ok: true })
  })
})

describe('destinatariosInformativos', () => {
  it('quien envió y el beneficiario, sin repetir y sin quien actuó', () => {
    expect(destinatariosInformativos('kc', 'fd')).toEqual(['kc', 'fd'])
    expect(destinatariosInformativos('fd', 'fd')).toEqual(['fd'])
    expect(destinatariosInformativos('kc', 'fd', ['kc'])).toEqual(['fd'])
  })
})

describe('validarCadena', () => {
  it('la cadena de Francisco Díaz es válida', () => {
    expect(validarCadena('fd', { l1: 'kc', l2: 'fh', suplenteL1: null }, PENTA)).toEqual([])
  })

  it('nadie es su propio aprobador', () => {
    expect(validarCadena('kc', { l1: 'kc', l2: null, suplenteL1: null }, PENTA))
      .toContain('Nadie puede ser su propio aprobador')
  })

  it('N2 sin N1, y N1 igual a N2', () => {
    expect(validarCadena('fd', { l1: null, l2: 'fh', suplenteL1: null }, PENTA))
      .toContain('Para tener aprobador N2 hay que tener N1')
    expect(validarCadena('fd', { l1: 'kc', l2: 'kc', suplenteL1: null }, PENTA))
      .toContain('N1 y N2 no pueden ser la misma persona')
  })

  it('el suplente no puede ser el N1 ni el N2', () => {
    expect(validarCadena('fd', { l1: 'kc', l2: 'fh', suplenteL1: 'kc' }, PENTA))
      .toContain('El suplente no puede ser el mismo aprobador N1')
    expect(validarCadena('fd', { l1: 'kc', l2: 'fh', suplenteL1: 'fh' }, PENTA))
      .toContain('El suplente de N1 no puede ser el aprobador N2: decidiría los dos niveles')
  })

  it('todos deben tener «aprueba», estar activos y ser de la organización', () => {
    expect(validarCadena('kc', { l1: 'fd', l2: null, suplenteL1: null }, PENTA))
      .toContain('Francisco Díaz (N1) no tiene el permiso «aprueba»')
    expect(validarCadena('fd', { l1: 'kc', l2: null, suplenteL1: null }, [{ ...KC, activo: false }, FD]))
      .toContain('Katherine Corvalán (N1) no está activo')
    expect(validarCadena('fd', { l1: 'otra-org', l2: null, suplenteL1: null }, PENTA))
      .toContain('El aprobador N1 no pertenece a esta organización')
  })
})

describe('dependientesDe', () => {
  it('lista a quiénes aprueba una persona, en cualquier rol de la cadena', () => {
    const empleados = [
      { id: 'fd', nombre: 'Francisco Díaz',     l1: 'kc', l2: 'fh', suplenteL1: null },
      { id: 'kc', nombre: 'Katherine Corvalán', l1: 'fh', l2: null, suplenteL1: null },
      { id: 'fh', nombre: 'Francisco Hagar',    l1: 'rh', l2: null, suplenteL1: 'kc' },
    ]
    expect(dependientesDe('kc', empleados)).toEqual(['Francisco Díaz', 'Francisco Hagar'])
    expect(dependientesDe('fd', empleados)).toEqual([])
  })
})
