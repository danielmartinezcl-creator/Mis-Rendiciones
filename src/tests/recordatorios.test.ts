import { describe, it, expect } from 'vitest'
import {
  tanda, diasEsperando, esperandoDesde, recordatoriosDePaso, recordatoriosDeBorrador,
  recordatoriosDeSaldo, destinatariosSaldoBajo, correoDeRecordatorios, filaDeRecordatorio,
  type Recordatorio, type DocumentoEsperando, type FondoVivo,
} from '@/lib/recordatorios'
import type { Persona, Cadena, EntradaHistorial, TipoDocumento } from '@/lib/permisos'

// Las mismas personas que permisos.test.ts: la configuración de PENTA del 2026-09-24.
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

const CADENA_FD: Cadena = { l1: 'kc', l2: 'fh', suplenteL1Vigente: null }

const AHORA = new Date('2026-09-25T12:00:00.000Z')
const DIA = 86_400_000
const haceDias = (n: number) => new Date(AHORA.getTime() - n * DIA).toISOString()
const cargo = (actorId: string): EntradaHistorial => ({ actorId, accion: 'bank_load_confirmed', nivel: 1 })
const quienes = (rs: Recordatorio[]) => rs.map(r => r.userId)

// Un documento de Francisco Díaz que espera en `estado` desde hace `dias` días.
function esperando(
  estado: string, dias: number,
  extra: { tipo?: TipoDocumento; cadena?: Cadena; historial?: EntradaHistorial[] } = {},
): DocumentoEsperando {
  const tipo = extra.tipo ?? 'rendicion'
  return {
    orgId:  'penta',
    docId:  tipo === 'rendicion' ? 'r1' : 'f1',
    estado,
    titulo: 'Viaje a Concepción',
    desde:  haceDias(dias),
    doc:    { tipo, beneficiarioId: 'fd', cadena: extra.cadena ?? CADENA_FD, historial: extra.historial ?? [] },
  }
}

describe('tanda: a los 3 días y después cada 3', () => {
  it('antes del umbral, nada', () => {
    expect(tanda(0, 3, 3)).toBeNull()
    expect(tanda(2, 3, 3)).toBeNull()
  })

  it('el día del umbral sale el primero, y los días siguientes siguen siendo ese mismo', () => {
    expect(tanda(3, 3, 3)).toBe(1)
    expect(tanda(4, 3, 3)).toBe(1)
    expect(tanda(5, 3, 3)).toBe(1)
  })

  it('cada 3 días, uno nuevo', () => {
    expect(tanda(6, 3, 3)).toBe(2)
    expect(tanda(15, 3, 3)).toBe(5)
  })

  it('el del borrador es semanal', () => {
    expect(tanda(13, 7, 7)).toBe(1)
    expect(tanda(14, 7, 7)).toBe(2)
  })

  it('una fecha inválida o en el futuro no recuerda nada', () => {
    expect(tanda(Number.NaN, 3, 3)).toBeNull()
    expect(tanda(-4, 3, 3)).toBeNull()
  })
})

describe('desde cuándo espera', () => {
  it('cuenta días completos', () => {
    const desde = '2026-09-22T12:00:00.000Z'
    expect(diasEsperando(desde, new Date('2026-09-25T11:59:59.000Z'))).toBe(2)
    expect(diasEsperando(desde, new Date('2026-09-25T12:00:00.000Z'))).toBe(3)
  })

  it('la marca más reciente: el envío o la última entrada del historial', () => {
    expect(esperandoDesde([
      '2026-09-19T10:00:00+00:00', null, '2026-09-25T09:00:00+00:00', '2026-09-24T09:00:00+00:00',
    ])).toBe('2026-09-25T09:00:00+00:00')
  })

  it('compara instantes, no textos', () => {
    // Las 10:00 en UTC+2 son las 08:00 UTC: anteriores a las 09:00 UTC
    expect(esperandoDesde(['2026-09-25T10:00:00+02:00', '2026-09-25T09:00:00Z'])).toBe('2026-09-25T09:00:00Z')
  })

  it('sin ninguna marca, null', () => {
    expect(esperandoDesde([null, undefined])).toBeNull()
  })
})

describe('recordatoriosDePaso: a quién le toca actuar', () => {
  it('rendición enviada hace 3 días: solo a Katherine, su N1, con link a la bandeja', () => {
    const [r, ...resto] = recordatoriosDePaso(esperando('submitted', 3), PENTA, AHORA)
    expect(resto).toEqual([])
    expect(r).toMatchObject({ orgId: 'penta', userId: 'kc', reportId: 'r1', fundId: null, link: '/approvals/r1', dias: 3 })
  })

  it('con 2 días todavía no se recuerda', () => {
    expect(recordatoriosDePaso(esperando('submitted', 2), PENTA, AHORA)).toEqual([])
  })

  it('suplente N1 vigente: solo a él (D8)', () => {
    const cadena = { ...CADENA_FD, suplenteL1Vigente: 'dm' }
    expect(quienes(recordatoriosDePaso(esperando('submitted', 4, { cadena }), PENTA, AHORA))).toEqual(['dm'])
  })

  it('en N2 le toca a Francisco Hagar, no al N1', () => {
    expect(quienes(recordatoriosDePaso(esperando('pending_l2', 3), PENTA, AHORA))).toEqual(['fh'])
  })

  it('carga bancaria: solo el titular, con link a la cola del banco', () => {
    const rs = recordatoriosDePaso(esperando('pending_bank_load', 3), PENTA, AHORA)
    expect(quienes(rs)).toEqual(['kc'])
    expect(rs[0].link).toBe('/banco')
  })

  it('autorización: el titular que no cargó', () => {
    const rs = recordatoriosDePaso(esperando('pending_bank_auth', 3, { historial: [cargo('kc')] }), PENTA, AHORA)
    expect(quienes(rs)).toEqual(['fh'])
  })

  it('sin carga registrada nadie puede autorizar: no hay a quién recordarle', () => {
    expect(recordatoriosDePaso(esperando('pending_bank_auth', 9), PENTA, AHORA)).toEqual([])
  })

  it('fondo: el link va al fondo, no a la bandeja de rendiciones', () => {
    const [r] = recordatoriosDePaso(esperando('pending_approval', 3, { tipo: 'fondo' }), PENTA, AHORA)
    expect(r).toMatchObject({ userId: 'kc', fundId: 'f1', reportId: null, link: '/petty-cash/f1' })
  })

  it('liquidación: el mismo N1, y el texto dice que es una liquidación', () => {
    const [r] = recordatoriosDePaso(esperando('pending_liquidation_approval', 3, { tipo: 'liquidacion' }), PENTA, AHORA)
    expect(r.userId).toBe('kc')
    expect(r.texto).toContain('liquidación')
  })

  it('un estado que no espera a nadie no recuerda nada', () => {
    expect(recordatoriosDePaso(esperando('approved', 30), PENTA, AHORA)).toEqual([])
  })
})

describe('recordatoriosDePaso: la clave que evita duplicados', () => {
  const DESDE = '2026-09-10T14:30:00.000Z'
  const doc = { ...esperando('pending_bank_load', 0), desde: DESDE }
  const claveAlDia = (dias: number) =>
    recordatoriosDePaso(doc, PENTA, new Date(Date.parse(DESDE) + dias * DIA))[0].clave

  it('no se repite al día siguiente; a los 3 días, sí', () => {
    expect(claveAlDia(4)).toBe(claveAlDia(3))
    expect(claveAlDia(5)).toBe(claveAlDia(3))
    expect(claveAlDia(6)).not.toBe(claveAlDia(3))
  })

  it('si el documento vuelve al mismo paso otro día, es un recordatorio nuevo', () => {
    const deVuelta = { ...doc, desde: '2026-09-20T14:30:00.000Z' }
    const [r] = recordatoriosDePaso(deVuelta, PENTA, new Date('2026-09-23T15:00:00.000Z'))
    expect(r.clave).not.toBe(claveAlDia(3))
  })

  it('dos personas a quienes les toca: una clave para cada una', () => {
    // Con Francisco Hagar también titular de carga, el recordatorio va a los dos
    const personas = [KC, { ...FH, bank_load_backup: false }, RH, DM, FD]
    const rs = recordatoriosDePaso(esperando('pending_bank_load', 3), personas, AHORA)
    expect(quienes(rs).sort()).toEqual(['fh', 'kc'])
    expect(new Set(rs.map(r => r.clave)).size).toBe(2)
  })

  it('cabe en dedup_key (varchar 150) aun en el peor caso', () => {
    const uuid = (d: string) => `${d.repeat(8)}-${d.repeat(4)}-${d.repeat(4)}-${d.repeat(4)}-${d.repeat(12)}`
    const personas = [
      persona(uuid('1'), 'Quien rinde'),
      persona(uuid('2'), 'Quien carga', { can_load_bank_transfer: true }),
      persona(uuid('3'), 'Quien autoriza', { can_authorize_bank_transfer: true }),
    ]
    const largo: DocumentoEsperando = {
      orgId: uuid('9'), docId: uuid('4'), estado: 'pending_bank_auth', titulo: 'x', desde: haceDias(300),
      doc: {
        tipo: 'rendicion', beneficiarioId: uuid('1'), historial: [cargo(uuid('2'))],
        cadena: { l1: null, l2: null, suplenteL1Vigente: null },
      },
    }
    const [r] = recordatoriosDePaso(largo, personas, AHORA)
    expect(r.userId).toBe(uuid('3'))
    expect(r.clave.length).toBeLessThanOrEqual(150)
  })
})

describe('recordatoriosDeBorrador: una vez por semana, a quien rinde', () => {
  const borrador = (dias: number, userId: string | null = 'fd') =>
    ({ orgId: 'penta', reportId: 'r9', titulo: 'Gastos de septiembre', userId, creado: haceDias(dias) })

  it('a los 7 días le llega a quien rinde, con link a su rendición', () => {
    const [r, ...resto] = recordatoriosDeBorrador(borrador(7), PENTA, AHORA)
    expect(resto).toEqual([])
    expect(r).toMatchObject({ userId: 'fd', reportId: 'r9', fundId: null, link: '/expenses/r9', dias: 7 })
  })

  it('a los 6 días todavía no', () => {
    expect(recordatoriosDeBorrador(borrador(6), PENTA, AHORA)).toEqual([])
  })

  it('a los 13 días es el mismo recordatorio que a los 7; a los 14, otro', () => {
    const CREADO = '2026-09-01T12:00:00.000Z'
    const b = { orgId: 'penta', reportId: 'r9', titulo: 'x', userId: 'fd', creado: CREADO }
    const claveAlDia = (dias: number) =>
      recordatoriosDeBorrador(b, PENTA, new Date(Date.parse(CREADO) + dias * DIA))[0].clave
    expect(claveAlDia(13)).toBe(claveAlDia(7))
    expect(claveAlDia(14)).not.toBe(claveAlDia(7))
  })

  it('si quien rinde ya no está activo, o la rendición no tiene dueño, nada', () => {
    expect(recordatoriosDeBorrador(borrador(10), [KC, { ...FD, activo: false }], AHORA)).toEqual([])
    expect(recordatoriosDeBorrador(borrador(10, null), PENTA, AHORA)).toEqual([])
  })
})

describe('recordatoriosDeSaldo: el fondo se está quedando sin plata', () => {
  const fondo = (
    gastos: FondoVivo['items'], aprobado: number | null = 100_000,
  ): FondoVivo => ({
    orgId: 'penta', fundId: 'f1', nombre: 'Caja chica septiembre', beneficiarioId: 'fd', managerId: 'kc',
    aprobado, items: gastos, transferencias: [],
  })

  it('con 15 % disponible le avisa al beneficiario, con link al fondo', () => {
    const rs = recordatoriosDeSaldo(fondo([{ amount_clp: 85_000, status: 'approved' }]), PENTA)
    expect(quienes(rs)).toEqual(['fd'])
    expect(rs[0]).toMatchObject({ fundId: 'f1', reportId: null, link: '/petty-cash/f1', dias: null })
  })

  it('con 20 % justo no avisa: tiene que quedar menos', () => {
    expect(recordatoriosDeSaldo(fondo([{ amount_clp: 80_000, status: 'approved' }]), PENTA)).toEqual([])
  })

  it('un gasto rechazado no cuenta como gastado', () => {
    expect(recordatoriosDeSaldo(fondo([{ amount_clp: 85_000, status: 'rejected' }]), PENTA)).toEqual([])
  })

  it('una sola vez por fondo: la clave no cambia aunque el saldo siga bajando', () => {
    const al15 = recordatoriosDeSaldo(fondo([{ amount_clp: 85_000, status: 'approved' }]), PENTA)
    const al5  = recordatoriosDeSaldo(fondo([{ amount_clp: 95_000, status: 'approved' }]), PENTA)
    expect(al5.map(r => r.clave)).toEqual(al15.map(r => r.clave))
  })

  it('sin monto aprobado no hay porcentaje que calcular', () => {
    expect(recordatoriosDeSaldo(fondo([], null), PENTA)).toEqual([])
    expect(recordatoriosDeSaldo(fondo([], 0), PENTA)).toEqual([])
  })
})

describe('destinatariosSaldoBajo', () => {
  it('solo al beneficiario, no al EFF (Daniel, 2026-09-25: el EFF se suma si en la práctica hace falta)', () => {
    expect(destinatariosSaldoBajo('fd', 'kc', PENTA)).toEqual(['fd'])
  })

  it('nunca a alguien inactivo', () => {
    expect(destinatariosSaldoBajo('fd', 'kc', PENTA.map(p => ({ ...p, activo: false })))).toEqual([])
  })

  it('la misma persona no lo recibe dos veces', () => {
    const ids = destinatariosSaldoBajo('fd', 'fd', PENTA)
    expect(ids.length).toBe(new Set(ids).size)
  })

  it('sin beneficiario ni EFF, a nadie', () => {
    expect(destinatariosSaldoBajo(null, null, PENTA)).toEqual([])
  })
})

describe('filaDeRecordatorio: lo que se guarda en notifications', () => {
  // Hasta el 2026-09-25 el cron escribía title, body y link —columnas que la
  // tabla no tiene— con tipos que el CHECK rechaza, y no miraba el error.
  it('solo columnas que existen: el texto y el link viajan en el correo, no en la fila', () => {
    const [r] = recordatoriosDePaso(esperando('submitted', 3), PENTA, AHORA)
    expect(filaDeRecordatorio(r)).toEqual({
      org_id: 'penta', user_id: 'kc', type: 'reminder',
      report_id: 'r1', fund_id: null, read: false, dedup_key: r.clave,
    })
  })

  it('el de un fondo apunta al fondo', () => {
    const [r] = recordatoriosDePaso(esperando('pending_approval', 3, { tipo: 'fondo' }), PENTA, AHORA)
    expect(filaDeRecordatorio(r)).toMatchObject({ report_id: null, fund_id: 'f1' })
  })
})

describe('correoDeRecordatorios: un correo por persona con todo lo pendiente', () => {
  const APP = 'https://www.mi-rendicion.com'
  const pendiente = (extra: Partial<Recordatorio> = {}): Recordatorio => ({
    orgId: 'penta', userId: 'kc', reportId: 'r1', fundId: null, clave: 'k1',
    texto: 'Aprobar la rendición de Francisco Díaz: Viaje a Concepción', link: '/approvals/r1', dias: 4,
    ...extra,
  })

  it('escapa lo que escribió la persona', () => {
    const { html } = correoDeRecordatorios([pendiente({ texto: 'Aprobar: <a href="https://otro.sitio">Revisar</a>' })], APP)
    expect(html).not.toContain('href="https://otro.sitio"')
    expect(html).toContain('&lt;a href=&quot;https://otro.sitio&quot;&gt;')
  })

  it('un link absoluto por cada pendiente', () => {
    const { html } = correoDeRecordatorios([pendiente(), pendiente({ clave: 'k2', link: '/banco' })], APP)
    expect(html).toContain(`href="${APP}/approvals/r1"`)
    expect(html).toContain(`href="${APP}/banco"`)
  })

  it('el asunto dice cuántos pendientes hay', () => {
    expect(correoDeRecordatorios([pendiente()], APP).asunto).toMatch(/\b1 pendiente\b/)
    expect(correoDeRecordatorios([pendiente(), pendiente({ clave: 'k2' })], APP).asunto).toMatch(/\b2 pendientes\b/)
  })
})
