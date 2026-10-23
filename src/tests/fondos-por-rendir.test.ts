import { describe, it, expect } from 'vitest'
import {
  afectaLaCuenta, sentidoDeItem, saldosPorEmpleado, porMes, condicion,
  DEBE, HABER, type MovimientoFxR,
} from '@/lib/fondos-por-rendir'

/**
 * La cuenta Fondos por Rendir.
 *
 * Los casos con montos reales salen de la medición del 2026-10-23 contra
 * producción: 674 movimientos, 23 empleados, saldo contabilizado $1.679.318.
 */

const mov = (p: Partial<MovimientoFxR> = {}): MovimientoFxR => ({
  personaId: 'u1', fecha: '2026-05-05', documento: 'doc', tipo: 'expense',
  glosa: '', monto: -1000, contabilizado: true, ...p,
})

describe('afectaLaCuenta', () => {
  it('un gasto rechazado no abona la cuenta', () => {
    // Si el gasto se repudia, lo que la persona debe no baja.
    expect(afectaLaCuenta('expense', 'rejected')).toBe(false)
  })

  it('un gasto pendiente sí cuenta: ocurrió y espera revisión', () => {
    expect(afectaLaCuenta('expense', 'pending')).toBe(true)
    expect(afectaLaCuenta('expense', 'approved')).toBe(true)
  })

  it('SOLO se filtran los gastos — a un traspaso no lo aprueba nadie', () => {
    /* Los 8 traspasos de producción están en el `pending` por omisión de la
       columna, y uno «rechazado» no existe como concepto: filtrarlos por estado
       dejaría fuera $222.150 de plata que se movió con total certeza. Es la
       trampa que ya documentó `computeApprovedAmount`. */
    for (const tipo of ['advance', 'return', 'transfer', 'disbursement']) {
      expect(afectaLaCuenta(tipo, 'rejected'), tipo).toBe(true)
      expect(afectaLaCuenta(tipo, 'pending'), tipo).toBe(true)
    }
  })
})

describe('sentidoDeItem', () => {
  it('el adelanto va al debe y el gasto al haber', () => {
    expect(sentidoDeItem('advance', false)).toBe(DEBE)
    expect(sentidoDeItem('expense', false)).toBe(HABER)
  })

  it('la devolución va al HABER: baja lo que la persona tiene en mano', () => {
    expect(sentidoDeItem('return', false)).toBe(HABER)
  })

  it('el traspaso depende de quién paga, y eso no es una columna', () => {
    // Deja un ítem en los documentos de las DOS partes con el mismo monto
    // positivo: sin la dirección, se contaría la misma plata dos veces.
    expect(sentidoDeItem('transfer', true)).toBe(HABER)   // paga: sale de su caja
    expect(sentidoDeItem('transfer', false)).toBe(DEBE)   // recibe: lo financia
  })

  it('un tipo que no conoce no mueve la cuenta', () => {
    expect(sentidoDeItem('loquesea', false)).toBe(0)
  })

  it('un monto NEGATIVO invierte el sentido, que es como la contabilidad anota una reversa', () => {
    /* «Rechazo gasto TAG» (Francisco, 05-05-2026) es un gasto de −9.870: la
       reversa de un TAG personal. HABER × −9.870 = +9.870, o sea un DEBE que le
       restituye la deuda. Las cargas históricas usan montos negativos para los
       ajustes —hay dos «Redondeo» de −1 igual— y se resuelven por signo, no por
       estado. */
    expect(sentidoDeItem('expense', false) * -9870).toBe(9870)
  })
})

describe('saldosPorEmpleado', () => {
  it('separa lo contabilizado de lo registrado', () => {
    const s = saldosPorEmpleado([
      mov({ tipo: 'advance', monto: 100000, contabilizado: true }),
      mov({ tipo: 'expense', monto: -30000, contabilizado: false }),
    ])[0]
    expect(s.defontana).toBe(100000)
    expect(s.app).toBe(70000)
    expect(s.diferencia).toBe(-30000)   // lo que falta contabilizar
  })

  it('devuelve a quien quedó en CERO, con su conteo de movimientos', () => {
    /* Para cuadrar contra el mayor hace falta ver que alguien pasó por la cuenta
       y cerró: una fila ausente y una en cero dicen cosas distintas. Alexis
       Villa tiene 66 movimientos y saldo cero. */
    const s = saldosPorEmpleado([
      mov({ tipo: 'advance', monto: 50000 }),
      mov({ tipo: 'expense', monto: -50000 }),
    ])
    expect(s).toHaveLength(1)
    expect(s[0].defontana).toBe(0)
    expect(s[0].movimientos).toBe(2)
  })

  it('la composición solo mira lo contabilizado, y cierra con el saldo', () => {
    // Los montos son los de Francisco Díaz al 2026-10-23
    const s = saldosPorEmpleado([
      mov({ tipo: 'advance',  monto:  9174930 }),
      mov({ tipo: 'transfer', monto:    36780 }),
      mov({ tipo: 'expense',  monto: -7098356 }),
      mov({ tipo: 'return',   monto:  -823166 }),
    ])[0]
    expect(s.adelantos).toBe(9174930)
    expect(s.recibidos).toBe(36780)
    expect(s.gastos).toBe(-7098356)
    expect(s.devoluciones).toBe(-823166)
    expect(s.adelantos + s.recibidos + s.gastos + s.devoluciones + s.pagados).toBe(s.defontana)
    expect(s.defontana).toBe(1290188)
  })

  it('el traspaso pagado y el recibido no caen en la misma columna', () => {
    const s = saldosPorEmpleado([
      mov({ tipo: 'transfer', monto:  10000 }),
      mov({ tipo: 'transfer', monto: -58372 }),
    ])[0]
    expect(s.recibidos).toBe(10000)
    expect(s.pagados).toBe(-58372)
  })

  it('separa a las personas', () => {
    const s = saldosPorEmpleado([
      mov({ personaId: 'a', tipo: 'advance', monto: 300000 }),
      mov({ personaId: 'b', tipo: 'expense', monto: -17240 }),
    ])
    expect(s).toHaveLength(2)
    expect(s.find(x => x.personaId === 'a')!.defontana).toBe(300000)
    expect(s.find(x => x.personaId === 'b')!.defontana).toBe(-17240)
  })
})

describe('porMes', () => {
  it('acumula en orden y separa debe de haber', () => {
    const m = porMes([
      mov({ fecha: '2026-01-10', monto:  400000 }),
      mov({ fecha: '2026-01-20', monto: -156378 }),
      mov({ fecha: '2026-02-05', monto:  100000 }),
    ], false)
    expect(m.map(x => x.mes)).toEqual(['2026-01', '2026-02'])
    expect(m[0]).toMatchObject({ debe: 400000, haber: -156378, variacion: 243622, acumulado: 243622 })
    expect(m[1].acumulado).toBe(343622)
  })

  it('con `soloContabilizado` deja fuera lo que no tiene comprobante', () => {
    const m = porMes([
      mov({ fecha: '2026-01-10', monto: 100, contabilizado: true }),
      mov({ fecha: '2026-01-11', monto: 900, contabilizado: false }),
    ], true)
    expect(m[0].debe).toBe(100)
  })

  it('un movimiento sin fecha no inventa un mes', () => {
    expect(porMes([mov({ fecha: '' })], false)).toEqual([])
  })
})

describe('condicion', () => {
  it('deudor, acreedor y cuadrado', () => {
    // Las tres son Fondos por Rendir: la cuenta se define por el ORIGEN de la
    // transacción, no por el signo del saldo (Daniel, 2026-10-22).
    expect(condicion(1290188)).toBe('deudor')
    expect(condicion(-171701)).toBe('acreedor')
    expect(condicion(0)).toBe('cuadrado')
  })
})
