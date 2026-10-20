import { describe, it, expect } from 'vitest'
import { saldoDeRendicion, etiquetaDeSaldo, type ItemDeSaldo } from '@/lib/saldo-rendicion'

/** Un ítem con lo mínimo; cada prueba cambia lo que le importa. */
const item = (p: Partial<ItemDeSaldo> & { amount_clp: number }): ItemDeSaldo => ({
  item_type: 'expense',
  status:    'approved',
  ...p,
})

const gasto    = (monto: number) => item({ amount_clp: monto, item_type: 'expense' })
const adelanto = (monto: number) => item({ amount_clp: monto, item_type: 'advance' })
const devuelve = (monto: number) => item({ amount_clp: monto, item_type: 'return'  })

describe('saldoDeRendicion', () => {
  it('sin ítems ni monto en la cabecera está saldado', () => {
    const s = saldoDeRendicion([], null)
    expect(s.pendiente).toBe(0)
    expect(s.estado).toBe('saldado')
  })

  it('gastos sin nada recibido: la empresa le debe', () => {
    const s = saldoDeRendicion([gasto(30_000), gasto(20_000)], null)
    expect(s.salidas).toBe(50_000)
    expect(s.pendiente).toBe(50_000)
    expect(s.estado).toBe('por-reembolsar')
  })

  it('adelanto mayor que los gastos: tiene que devolver', () => {
    const s = saldoDeRendicion([adelanto(200_000), gasto(150_000)], null)
    expect(s.pendiente).toBe(-50_000)
    expect(s.estado).toBe('por-devolver')
  })

  it('un gasto rechazado no cuenta como salida', () => {
    const s = saldoDeRendicion(
      [gasto(50_000), item({ amount_clp: 99_000, status: 'rejected' })],
      null,
    )
    expect(s.salidas).toBe(50_000)
  })

  it('un ítem sin tipo cuenta como gasto (anteriores a la migración 009)', () => {
    const s = saldoDeRendicion([item({ amount_clp: 12_000, item_type: null })], null)
    expect(s.salidas).toBe(12_000)
  })

  it('una diferencia de menos de un peso es redondeo, no saldo', () => {
    const s = saldoDeRendicion([gasto(50_000.4), adelanto(50_000)], null)
    expect(s.estado).toBe('saldado')
  })
})

describe('la devolución reduce lo que el empleado tiene en mano', () => {
  /* Medido en producción el 2026-10-20: de las 24 filas con devoluciones, restándola
     quedan 21 en cero y sumándola, 0. Es también el signo contrario al que usa
     `computeApprovedAmount`, que para este caso devuelve −80.000. */
  it('adelanto 100.000, gastos 60.000 y devolución 40.000 está saldado', () => {
    const s = saldoDeRendicion([adelanto(100_000), gasto(60_000), devuelve(40_000)], null)
    expect(s.recibidoItems).toBe(60_000)
    expect(s.pendiente).toBe(0)
    expect(s.estado).toBe('saldado')
  })
})

describe('un traspaso cuenta de un solo lado', () => {
  const traspaso = (monto: number, paga: boolean) =>
    item({ amount_clp: monto, item_type: 'transfer', status: 'pending', is_transfer_payer: paga })

  it('quien lo PAGA lo cuenta como salida, aunque el ítem quede en pending', () => {
    const s = saldoDeRendicion([gasto(330_864), traspaso(8_640, true)], null)
    expect(s.salidas).toBe(339_504)
  })

  it('quien lo RECIBE lo cuenta como financiamiento, junto con su adelanto', () => {
    // CAJA CHICA N°1 ESTEBAN VARAS, con los montos reales que describió Daniel:
    // gastos 171.592 = adelanto 150.000 + traspaso de Katherine 21.592.
    const s = saldoDeRendicion(
      [gasto(171_592), adelanto(150_000), traspaso(21_592, false)],
      null,
    )
    expect(s.recibidoItems).toBe(171_592)
    expect(s.estado).toBe('saldado')
  })
})

describe('el mismo pago por dos vías se cuenta una vez', () => {
  /* Los cuatro casos reales de producción medidos el 2026-10-20. Son los que prueban
     que ni «solo los ítems» ni «ítems menos la carátula» alcanzan: hace falta el
     máximo de las dos vías. */

  it('N°8 Claudia: pagada solo por carátula, sin ítem de reembolso', () => {
    const s = saldoDeRendicion([gasto(173_701)], 173_701)
    expect(s.recibidoItems).toBe(0)
    expect(s.recibido).toBe(173_701)
    expect(s.estado).toBe('saldado')
    expect(s.dobleRegistro).toBe(false)
  })

  it('N°2 Andrés Peña: aprobada y sin pagar', () => {
    const s = saldoDeRendicion([gasto(17_240)], null)
    expect(s.pendiente).toBe(17_240)
    expect(s.estado).toBe('por-reembolsar')
  })

  it('N°6 Claudia: el pago anotado por las dos vías deja 4.000 pendientes', () => {
    const s = saldoDeRendicion([gasto(38_080), adelanto(34_080)], 34_080)
    expect(s.recibido).toBe(34_080)      // no 68.160
    expect(s.pendiente).toBe(4_000)
    expect(s.estado).toBe('por-reembolsar')
    expect(s.dobleRegistro).toBe(true)
  })

  it('N°7 Claudia: recibió 2.000 de más', () => {
    const s = saldoDeRendicion([gasto(85_571), adelanto(87_571)], 85_571)
    expect(s.recibido).toBe(87_571)      // el mayor de las dos vías
    expect(s.pendiente).toBe(-2_000)
    expect(s.estado).toBe('por-devolver')
  })

  it('sumar las dos vías contaría el pago dos veces', () => {
    // La prueba de que el `max()` no es un detalle: con la suma, N°6 daría −30.080
    // y el distintivo viejo lo mostraba como «Exceso de reembolso».
    const s = saldoDeRendicion([gasto(38_080), adelanto(34_080)], 34_080)
    expect(s.pendiente).not.toBe(38_080 - (34_080 + 34_080))
  })

  it('reembolsada sin monto anotado: manda el ítem, y queda saldada', () => {
    // El caso de las 23 que mostraban «— Sin registro» sin decir nada útil.
    const s = saldoDeRendicion([gasto(57_400), adelanto(57_400)], null)
    expect(s.estado).toBe('saldado')
  })
})

describe('etiquetaDeSaldo', () => {
  it('cubre los tres estados', () => {
    expect(etiquetaDeSaldo('saldado')).toBe('Saldado')
    expect(etiquetaDeSaldo('por-reembolsar')).toBe('Falta reembolsar')
    expect(etiquetaDeSaldo('por-devolver')).toBe('Falta devolver')
  })
})
