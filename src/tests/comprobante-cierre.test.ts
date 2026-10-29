import { describe, it, expect } from 'vitest'
import {
  comprobanteDeFondo, comprobanteDeRendicion, fechaChile, huellaDe, nombreDeArchivo,
  type Comprobante, type FondoDeEntrada, type GastoDeEntrada, type RendicionDeEntrada,
} from '@/lib/comprobante-cierre'

const empleado = { nombre: 'Díaz González Francisco', rut: '12.345.678-9', centroCosto: 'ELECTRICIDAD' }

const gasto = (p: Partial<GastoDeEntrada>): GastoDeEntrada => ({
  date: '2026-10-21', merchant: 'Comercio', description: 'Gasto', categoria: 'EPP', centroCosto: null,
  doc_type: 'boleta', doc_number: null, supplier_rut: null, amount_clp: 1000, status: 'approved',
  rejection_reason: null, ...p,
})

/** Las filas del cuadre suman: la última es la suma de las demás. */
function sumaCuadra(c: Comprobante) {
  const total  = c.cuadre.at(-1)!
  const partes = c.cuadre.slice(0, -1).reduce((s, f) => s + f.monto, 0)
  expect(total.total).toBe(true)
  expect(Math.round(partes)).toBe(Math.round(total.monto))
}

/* El fondo 9db37284 de producción, tal cual: Francisco rindió dos facturas por
   $323.364 de un fondo de $350.000 y devolvió los $26.636. Cierra en cero. */
const fondo174: FondoDeEntrada = {
  id: '9db37284-3362-4ca8-b033-ac6e97e8b8eb', name: 'Caja chica especial', status: 'settled',
  description: 'EPP P4018 Y RP', created_at: '2026-10-21T15:01:48Z',
  amount_approved: 350000, amount_requested: 350000, proyecto: null, empleado,
  items: [
    gasto({ merchant: 'FAMS MULTISERVICIOS MAULE 467', amount_clp: 189786, doc_type: 'factura', doc_number: '25042' }),
    gasto({ merchant: 'COMERCIAL SEGURITEX LIMITADA', amount_clp: 133578, doc_type: 'factura', doc_number: '42323', date: '2026-10-20' }),
  ],
  transfers: [
    { type: 'disbursement', amount: 350000, reference: 'CARGADA EN EL BANCO ', transferred_at: '2026-10-21', created_at: '2026-10-21T15:08:40Z' },
    { type: 'reimbursement_from_employee', amount: 26636, reference: '', transferred_at: '2026-10-22', created_at: '2026-10-22T14:05:22Z' },
  ],
  historial: [
    { action: 'approved', level: 2, created_at: '2026-10-21T15:04:05Z', notes: '', amount: 350000, persona: 'Francisco Hagar' },
    { action: 'submitted_for_approval', level: null, created_at: '2026-10-21T15:01:52Z', notes: null, amount: null, persona: 'Díaz González Francisco' },
    { action: 'approved', level: 1, created_at: '2026-10-21T15:03:24Z', notes: 'COMPRA EPP P4018 ', amount: 350000, persona: 'Katherine Corvalán' },
    { action: 'liquidation_approved', level: 1, created_at: '2026-10-22T13:03:46Z', notes: '', amount: null, persona: 'Katherine Corvalán' },
  ],
}

describe('comprobanteDeFondo', () => {
  const c = comprobanteDeFondo(fondo174)

  it('cierra en cero el fondo real 9db37284', () => {
    expect(c.resultado).toEqual({ texto: 'Saldado: no queda nada pendiente', monto: 0 })
    sumaCuadra(c)
  })

  it('el recorrido sale en orden, con el nivel de cada aprobación y sin espacios sueltos', () => {
    expect(c.recorrido.map(p => p.accion)).toEqual([
      'Enviado a autorización', 'Fondo autorizado (N1)', 'Fondo autorizado (N2)', 'Liquidación aprobada (N1)',
    ])
    expect(c.recorrido[1]).toMatchObject({ persona: 'Katherine Corvalán', nota: 'COMPRA EPP P4018', monto: 350000 })
    expect(c.enviado).toBe('2026-10-21T15:01:52Z')
  })

  it('los gastos van por fecha y con el documento legible', () => {
    expect(c.gastos.map(g => g.documento)).toEqual(['Factura 42323', 'Factura 25042'])
    expect(c.motivo).toBe('EPP P4018 Y RP')
  })

  it('un gasto rechazado aparece, con su motivo, pero no descuenta del fondo', () => {
    const r = comprobanteDeFondo({
      ...fondo174, status: 'pending_liquidation_approval', transfers: fondo174.transfers.slice(0, 1),
      items: [...fondo174.items, gasto({ amount_clp: 9870, status: 'rejected', rejection_reason: 'Sin boleta' })],
    })
    expect(r.gastos.find(g => g.estado === 'Rechazado')?.motivoRechazo).toBe('Sin boleta')
    // 350.000 − 323.364: lo rechazado no se gastó de verdad
    expect(r.resultado).toEqual({ texto: 'El empleado debe devolver a la empresa', monto: 26636 })
    sumaCuadra(r)
  })

  it('una entrega que el banco todavía no autoriza no cuenta como devuelta ni pagada', () => {
    const r = comprobanteDeFondo({ ...fondo174, status: 'pending_bank_auth', items: [], transfers: fondo174.transfers.slice(0, 1) })
    expect(r.movimientos[0].concepto).toMatch(/esperando autorización/)
  })
})

describe('comprobanteDeRendicion', () => {
  const base: RendicionDeEntrada = {
    id: 'aaaaaaaa-0000-0000-0000-00000000c0de', title: 'Rendición octubre', status: 'approved',
    created_at: '2026-10-01T12:00:00Z', submitted_at: '2026-10-02T12:00:00Z', reimbursed_amount: null,
    is_historical_import: false, proyecto: '4018 · Nodo', empleado,
    items: [
      { ...gasto({ amount_clp: 30000 }), item_type: 'expense' },
      { ...gasto({ amount_clp: 5000, status: 'rejected', rejection_reason: 'Duplicado' }), item_type: null },
    ],
    historial: [
      { action: 'approved', level: 1, created_at: '2026-10-03T12:00:00Z', notes: null, persona: 'Claudia Lobos' },
      { action: 'bank_authorized', level: null, created_at: '2026-10-04T12:00:00Z', notes: 'TRX-99', persona: 'Roberto Hagar' },
    ],
  }

  it('aprobada sin pagar: la empresa le debe lo aprobado, no lo presentado', () => {
    const c = comprobanteDeRendicion(base)
    expect(c.resultado).toEqual({ texto: 'La empresa le debe reembolsar al empleado', monto: 30000 })
    sumaCuadra(c)
  })

  it('el envío encabeza el recorrido aunque no esté en el historial de aprobaciones', () => {
    const c = comprobanteDeRendicion(base)
    expect(c.recorrido.map(p => p.accion)).toEqual(['Enviada a revisión', 'Aprobada (N1)', 'Transferencia autorizada'])
    expect(c.recorrido[2].nota).toBe('Ref. TRX-99')
  })

  /* N°6 de Claudia Lobos, con sus montos reales: rindió 38.080, el pago está anotado
     como adelanto Y en la carátula (34.080 las dos), y le faltan 4.000. */
  it('el pago anotado por las dos vías se cuenta una vez', () => {
    const c = comprobanteDeRendicion({
      ...base, reimbursed_amount: 34080, is_historical_import: true,
      items: [
        { ...gasto({ amount_clp: 38080 }), item_type: 'expense' },
        { ...gasto({ amount_clp: 34080, description: 'Reembolso' }), item_type: 'advance' },
      ],
      historial: [],
    })
    expect(c.resultado.monto).toBe(4000)
    expect(c.gastos).toHaveLength(1)
    expect(c.movimientos).toHaveLength(1)
    expect(c.sinRecorrido).toMatch(/Carga histórica/)
    expect(c.recorrido).toEqual([])
    sumaCuadra(c)
  })
})

describe('huellaDe', () => {
  it('es la misma para el mismo documento y cambia si cambia un monto', async () => {
    const a = await huellaDe(comprobanteDeFondo(fondo174))
    const b = await huellaDe(comprobanteDeFondo(fondo174))
    const otro = { ...fondo174, items: [gasto({ amount_clp: 1 })] }
    expect(a).toBe(b)
    expect(a).toMatch(/^[0-9A-F]{64}$/)
    expect(await huellaDe(comprobanteDeFondo(otro))).not.toBe(a)
  })
})

describe('nombreDeArchivo', () => {
  it('sin tildes ni símbolos, con el código', () => {
    const c = comprobanteDeFondo({ ...fondo174, name: 'Caja chica N°18 — Peñalolén' })
    expect(nombreDeArchivo(c, 'xlsx')).toBe('Comprobante-Caja-chica-N18-Penalolen-97E8B8EB.xlsx')
  })
})

describe('fechaChile', () => {
  it('una aprobación se lee en hora de Chile, no en la del servidor', () => {
    // Octubre: Chile está en UTC−3
    expect(fechaChile('2026-10-21T15:03:24Z')).toMatchObject({ fecha: '21/10/2026', hora: '12:03' })
    // 01:30 UTC del 22 es todavía el 21 en Chile
    expect(fechaChile('2026-10-22T01:30:00Z')).toMatchObject({ fecha: '21/10/2026', hora: '22:30' })
  })

  it('la fecha de un gasto no tiene zona y queda igual, con su número de día de Excel', () => {
    expect(fechaChile('2026-10-21')).toEqual({ fecha: '21/10/2026', hora: null, serial: 46316 })
  })
})

describe('los dos archivos', () => {
  it('el Excel trae los totales como fórmulas CON su valor, y las fechas como fechas', async () => {
    const XLSX = await import('xlsx')
    const { comprobanteAExcel } = await import('@/lib/export/comprobante-excel')
    const c  = comprobanteDeFondo(fondo174)
    const wb = XLSX.read(await comprobanteAExcel(c, 'H'), { type: 'array' })
    expect(wb.SheetNames).toEqual(['Resumen', 'Gastos', 'Recorrido', 'Transferencias'])

    // El saldo es una fórmula sobre las filas del cuadre, con su resultado guardado
    const resumen = XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets.Resumen, { header: 1, blankrows: true, defval: null })
    const filaSaldo = resumen.findIndex(f => f[1] === 'Saldo en manos del empleado')
    const celda = wb.Sheets.Resumen[`E${filaSaldo + 1}`]
    expect(celda.f).toMatch(/^SUM\(E\d+:E\d+\)$/)
    expect(celda.v).toBe(0)

    const g = wb.Sheets.Gastos
    expect(g.A7).toMatchObject({ t: 'n', v: 46315 })     // 20/10/2026, el primero por fecha
    expect(g.I7).toMatchObject({ t: 'n', v: 133578 })
    // El total respeta los filtros: SUBTOTAL y no SUM
    const total = Object.values(g).find(x => (x as { f?: string })?.f?.startsWith('SUBTOTAL(109')) as { v: number }
    expect(total.v).toBe(323364)
  })

  it('el PDF es un PDF', async () => {
    const { comprobanteAPdf } = await import('@/lib/export/comprobante-pdf')
    const bytes = comprobanteAPdf(comprobanteDeFondo(fondo174), 'H')
    expect(new TextDecoder().decode(bytes.slice(0, 5))).toBe('%PDF-')
  })
})
