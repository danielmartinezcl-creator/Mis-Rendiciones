import { describe, it, expect } from 'vitest'
import {
  MOVIMIENTOS,
  totalDeGastos,
  necesitaSiembra,
  erroresDeMovimiento,
  filaDeMovimiento,
  movimientoPorClave,
  totalesDeCargaHistorica,
  motivoNoSeBorra,
  movimientosDisponibles,
} from '@/lib/movimientos-historicos'

describe('totalDeGastos', () => {
  it('el adelanto no es plata gastada: no entra en el total', () => {
    const total = totalDeGastos([
      { item_type: 'expense', amount_clp: 10_000 },
      { item_type: 'advance', amount_clp: 200_000 },
    ])
    expect(total).toBe(10_000)
  })

  it('tampoco entran devoluciones ni traspasos', () => {
    const total = totalDeGastos([
      { item_type: 'expense',  amount_clp: 5_000 },
      { item_type: 'return',   amount_clp: 1_000 },
      { item_type: 'transfer', amount_clp: 8_640 },
    ])
    expect(total).toBe(5_000)
  })

  // Mismo criterio que el export a Defontana (`!i.item_type || i.item_type === 'expense'`):
  // los ítems anteriores a la migración 009 no tienen tipo y son gastos.
  it('un ítem sin tipo cuenta como gasto, igual que en el export', () => {
    expect(totalDeGastos([{ item_type: null, amount_clp: 3_000 }])).toBe(3_000)
    expect(totalDeGastos([{ amount_clp: 3_000 }])).toBe(3_000)
  })

  it('sin ítems, cero', () => {
    expect(totalDeGastos([])).toBe(0)
  })
})

describe('totalesDeCargaHistorica', () => {
  // Medido el 2026-10-19: 8 de las 145 cargas históricas tienen ítems `pending`.
  // Recalcular el aprobado sumando todos los gastos inflaría esas ocho.
  it('el total son los gastos; el aprobado, solo los gastos aprobados', () => {
    const { total, aprobado } = totalesDeCargaHistorica([
      { item_type: 'expense', amount_clp: 10_000, status: 'approved' },
      { item_type: 'expense', amount_clp: 4_000,  status: 'pending' },
    ])
    expect(total).toBe(14_000)
    expect(aprobado).toBe(10_000)
  })

  it('un gasto rechazado no suma en el aprobado', () => {
    const { total, aprobado } = totalesDeCargaHistorica([
      { item_type: 'expense', amount_clp: 10_000, status: 'approved' },
      { item_type: 'expense', amount_clp: 7_000,  status: 'rejected' },
    ])
    expect(total).toBe(17_000)
    expect(aprobado).toBe(10_000)
  })

  it('el adelanto no entra en ninguno de los dos, ni aprobado', () => {
    const { total, aprobado } = totalesDeCargaHistorica([
      { item_type: 'advance', amount_clp: 200_000, status: 'approved' },
      { item_type: 'expense', amount_clp: 5_000,   status: 'approved' },
    ])
    expect(total).toBe(5_000)
    expect(aprobado).toBe(5_000)
  })

  it('sin ítems, los dos en cero', () => {
    expect(totalesDeCargaHistorica([])).toEqual({ total: 0, aprobado: 0 })
  })
})

describe('necesitaSiembra', () => {
  // El caso de las 27 cargas de agosto: contabilizadas desde /admin/reports, que
  // marca la cabecera y no los ítems. Sin sembrar, el panel las ve todas exportadas
  // y un movimiento agregado después nunca aparecería como pendiente.
  it('cabecera marcada y ningún ítem marcado: hay que sembrar', () => {
    expect(necesitaSiembra(true, 0)).toBe(true)
  })

  it('marca por ítem: no se siembra', () => {
    expect(necesitaSiembra(true, 3)).toBe(false)
  })

  it('sin contabilizar: no hay nada que sembrar', () => {
    expect(necesitaSiembra(false, 0)).toBe(false)
  })
})

describe('erroresDeMovimiento', () => {
  const valido = { clave: 'adelanto' as const, descripcion: 'Adelanto', fecha: '2026-09-30', montoCLP: 50_000 }

  it('un movimiento completo no tiene errores', () => {
    expect(erroresDeMovimiento(valido)).toEqual([])
  })

  it('un monto en cero no se registra', () => {
    expect(erroresDeMovimiento({ ...valido, montoCLP: 0 })).toContain('El monto debe ser mayor a 0')
  })

  it('un monto negativo tampoco', () => {
    expect(erroresDeMovimiento({ ...valido, montoCLP: -5_000 })).toContain('El monto debe ser mayor a 0')
  })

  it('sin fecha no se registra', () => {
    expect(erroresDeMovimiento({ ...valido, fecha: '' })).toContain('La fecha es obligatoria')
  })

  it('un gasto sin categoría no se registra', () => {
    const errores = erroresDeMovimiento({ ...valido, clave: 'gasto', categoryId: null })
    expect(errores).toContain('Elegí la categoría del gasto')
  })

  it('un adelanto no necesita categoría', () => {
    expect(erroresDeMovimiento({ ...valido, clave: 'adelanto', categoryId: null })).toEqual([])
  })

  it('una clave que no existe no se registra', () => {
    expect(erroresDeMovimiento({ ...valido, clave: 'cualquiera' as never }).length).toBeGreaterThan(0)
  })
})

describe('MOVIMIENTOS', () => {
  // La decisión: el reembolso NO es un item_type nuevo. Contablemente es el mismo
  // asiento del adelanto (Debe Fondos por Rendir / Haber Banco, línea de banco CARGO),
  // y un tipo nuevo exigiría migración, tipo de comprobante propio y tocar el generador.
  it('el reembolso se guarda como adelanto: es el mismo asiento', () => {
    expect(movimientoPorClave('reembolso')?.itemType).toBe('advance')
  })

  it('la palabra reembolso está entre las opciones de la pantalla', () => {
    const etiquetas = MOVIMIENTOS.map(m => m.etiqueta.toLowerCase())
    expect(etiquetas.some(e => e.includes('reembolso'))).toBe(true)
  })

  it('cada opción escribe un item_type que la base admite', () => {
    const admitidos = ['expense', 'advance', 'return']
    for (const m of MOVIMIENTOS) expect(admitidos).toContain(m.itemType)
  })

  it('una clave desconocida no devuelve movimiento', () => {
    expect(movimientoPorClave('traspaso')).toBeUndefined()
  })
})

describe('movimientosDisponibles', () => {
  it('con el catálogo de categorías a mano se pueden registrar las cuatro', () => {
    expect(movimientosDisponibles(true)).toHaveLength(MOVIMIENTOS.length)
  })

  // /petty-cash no carga el catálogo de categorías, y un gasto sin categoría no se
  // puede imputar a ninguna cuenta. Los movimientos de fondos no la necesitan: van
  // contra Fondos por Rendir.
  it('sin catálogo no se ofrece gasto: no habría cómo imputarlo', () => {
    expect(movimientosDisponibles(false).some(m => m.itemType === 'expense')).toBe(false)
  })

  it('sin catálogo el reembolso se sigue ofreciendo', () => {
    expect(movimientosDisponibles(false).some(m => m.clave === 'reembolso')).toBe(true)
  })
})

describe('motivoNoSeBorra', () => {
  it('un movimiento sin contabilizar se borra', () => {
    expect(motivoNoSeBorra({ item_type: 'advance', defontana_exported_at: null }, false)).toBeNull()
  })

  it('un traspaso no se borra desde acá: mueve dos documentos', () => {
    const motivo = motivoNoSeBorra({ item_type: 'transfer', defontana_exported_at: null }, false)
    expect(motivo).toContain('traspaso')
  })

  it('un movimiento contabilizado pide revertir el comprobante primero', () => {
    const motivo = motivoNoSeBorra({ item_type: 'advance', defontana_exported_at: '2026-10-19T21:08:06Z' }, false)
    expect(motivo).toContain('Defontana')
  })

  // En estado legacy el ítem no tiene marca propia, pero el comprobante de la cabecera
  // vale por todos: borrarlo descuadra un asiento ya emitido.
  it('en estado legacy tampoco, aunque el ítem no tenga marca propia', () => {
    const motivo = motivoNoSeBorra({ item_type: 'expense', defontana_exported_at: null }, true)
    expect(motivo).toContain('Defontana')
  })
})

describe('filaDeMovimiento', () => {
  const ctx = { reportId: 'rep-1', orgId: 'org-1', empleado: 'Lobos Moraga Claudia' }

  it('un adelanto se guarda sin categoría ni centro de costo', () => {
    const fila = filaDeMovimiento(
      { clave: 'adelanto', descripcion: 'Adelanto', fecha: '2026-09-30', montoCLP: 50_000, categoryId: 'cat-1', costCenterId: 'cc-1' },
      ctx,
    )
    expect(fila.category_id).toBeNull()
    expect(fila.cost_center_id).toBeNull()
    expect(fila.item_type).toBe('advance')
  })

  it('un gasto conserva su categoría y su centro de costo', () => {
    const fila = filaDeMovimiento(
      { clave: 'gasto', descripcion: 'Bencina', fecha: '2026-09-30', montoCLP: 20_000, categoryId: 'cat-1', costCenterId: 'cc-1' },
      ctx,
    )
    expect(fila.category_id).toBe('cat-1')
    expect(fila.cost_center_id).toBe('cc-1')
    expect(fila.item_type).toBe('expense')
  })

  it('la descripción vacía toma la del movimiento elegido', () => {
    const fila = filaDeMovimiento(
      { clave: 'reembolso', descripcion: '   ', fecha: '2026-09-30', montoCLP: 173_701 },
      ctx,
    )
    expect(fila.description).toBe('Reembolso al empleado')
  })

  it('nace aprobada y en CLP, como el resto de la carga histórica', () => {
    const fila = filaDeMovimiento(
      { clave: 'devolucion', descripcion: 'Devolución saldo', fecha: '2026-09-30', montoCLP: 8_000 },
      ctx,
    )
    expect(fila.status).toBe('approved')
    expect(fila.currency).toBe('CLP')
    expect(fila.exchange_rate).toBe(1)
    expect(fila.amount).toBe(8_000)
    expect(fila.amount_clp).toBe(8_000)
  })

  it('nace sin marca de Defontana, para que el panel la ofrezca', () => {
    const fila = filaDeMovimiento(
      { clave: 'reembolso', descripcion: '', fecha: '2026-09-30', montoCLP: 173_701 },
      ctx,
    )
    expect(fila.defontana_exported_at).toBeNull()
  })

  // El monto llega del navegador y el peso chileno no tiene decimales. El redondeo del
  // formulario no alcanza: la acción recibe el objeto tal cual.
  it('redondea el monto: el peso chileno no lleva decimales', () => {
    const fila = filaDeMovimiento(
      { clave: 'reembolso', descripcion: '', fecha: '2026-09-30', montoCLP: 173_700.6 },
      ctx,
    )
    expect(fila.amount_clp).toBe(173_701)
    expect(fila.amount).toBe(173_701)
  })

  it('el empleado queda en merchant, como en la importación', () => {
    const fila = filaDeMovimiento(
      { clave: 'reembolso', descripcion: '', fecha: '2026-09-30', montoCLP: 1_000 },
      ctx,
    )
    expect(fila.merchant).toBe('Lobos Moraga Claudia')
  })
})

/* Los 8 traspasos que existen en las cargas históricas de PENTA, medidos el
   2026-10-20. La regla la fijó Daniel ese día: «el traspaso cuenta, incluilo
   en el total» — y los datos muestran que cuenta del lado que PAGA. */
describe('un traspaso suma en la caja que paga, no en la que recibe', () => {
  const gasto = (amount_clp: number) => ({ item_type: 'expense', amount_clp, status: 'approved' })
  const traspaso = (amount_clp: number, is_transfer_payer: boolean) =>
    ({ item_type: 'transfer', amount_clp, status: 'approved', is_transfer_payer })

  /* Caja Chica N°180 le traspasa 8.640 a Francisco: 330.864 de gastos más el
     traspaso son los 339.504 que la cabecera ya tenía guardados. */
  it('quien paga suma el traspaso a su total', () => {
    expect(totalesDeCargaHistorica([gasto(330_864), traspaso(8_640, true)]))
      .toEqual({ total: 339_504, aprobado: 339_504 })
  })

  /* CAJA CHICA N°1 ESTEBAN VARAS recibe 21.592 de Katherine. Junto con el
     adelanto de 150.000 financia sus 171.592 de gastos: no se le suma. */
  it('quien recibe NO lo suma: es financiamiento, como un adelanto', () => {
    expect(totalesDeCargaHistorica([
      { item_type: 'advance', amount_clp: 150_000, status: 'approved' },
      traspaso(21_592, false),
    ])).toEqual({ total: 0, aprobado: 0 })
  })

  /* El mismo traspaso deja un ítem en los documentos de las dos partes, con el
     mismo monto positivo. Si contara en los dos, la plata se contaría dos veces. */
  it('el mismo traspaso no suma en los dos lados', () => {
    const pagador  = totalesDeCargaHistorica([gasto(100_000), traspaso(30_000, true)]).total
    const receptor = totalesDeCargaHistorica([gasto(100_000), traspaso(30_000, false)]).total
    expect(pagador).toBe(130_000)
    expect(receptor).toBe(100_000)
  })

  /* Sin el dato de dirección, un traspaso NO suma: es el valor seguro. Un
     callsite que se olvide de resolverlo deja el total como estaba, en vez de
     inflarlo en silencio por los dos lados. */
  it('sin saber la dirección, no suma', () => {
    expect(totalesDeCargaHistorica([
      gasto(100_000),
      { item_type: 'transfer', amount_clp: 30_000, status: 'approved' },
    ]).total).toBe(100_000)
  })

  /* Rendicion N°3 Leonel Caceres: recibe 52.703 y gastó 52.703. El total es
     52.703, no 105.406 — que es justo lo que decía el cálculo sin dirección. */
  it('recibir y gastar lo mismo no duplica el total', () => {
    expect(totalesDeCargaHistorica([gasto(52_703), traspaso(52_703, false)]).total)
      .toBe(52_703)
  })

  /* A un traspaso no lo aprueba nadie: createFundTransfer ni escribe status,
     y los 8 de producción están en el pending por omisión. Filtrarlos por
     estado dejaría fuera del aprobado plata que salió con total certeza. */
  it('un traspaso pagado cuenta aunque su estado sea pending', () => {
    expect(totalesDeCargaHistorica([
      gasto(192_680),
      { item_type: 'transfer', amount_clp: 28_140, status: 'pending', is_transfer_payer: true },
    ])).toEqual({ total: 220_820, aprobado: 220_820 })
  })

  it('un gasto pendiente sí queda fuera del aprobado', () => {
    expect(totalesDeCargaHistorica([
      gasto(192_680),
      { item_type: 'expense', amount_clp: 5_000, status: 'pending' },
    ])).toEqual({ total: 197_680, aprobado: 192_680 })
  })
})
