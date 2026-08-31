import { describe, it, expect } from 'vitest'
import {
  buildDefontanaEntries,
  buildSheetRows,
  toSheetCostCenter,
  toSheetRut,
  countVouchers,
  splitByVoucher,
  voucherFileName,
  toBankDocNumber,
  type DefontanaItem,
  type DefontanaReportInput,
  type DefontanaSettings,
} from '@/lib/export/defontana'

// Cuentas reales de PENTA
const FONDOS_POR_RENDIR = '1.1.1010.10.03'   // → 1110101003
const BANCO             = '1.1.1010.20.01'   // → 1110102001

const settings: DefontanaSettings = {
  contraAccount:       FONDOS_POR_RENDIR,
  voucherType:         'Traspaso',
  costCenter:          'EMPGESINGING',
  providerAccount:     '2.1.1070.20.01',
  bankAccount:         BANCO,
  voucherTypeAdvance:  null,
  voucherTypeReturn:   null,
  voucherTypeTransfer: null,
  docTypeAdvance:      'CARGO',
  docTypeReturn:       'ABONO',
}

function item(over: Partial<DefontanaItem> = {}): DefontanaItem {
  return {
    description:            'Movimiento',
    amount_clp:             1000,
    category_name:          null,
    defontana_account_code: null,
    supplier_account_code:  null,
    doc_type:               null,
    doc_number:             null,
    cost_center_id:         null,
    supplier_rut:           null,
    merchant:               null,
    ...over,
  }
}

function report(items: DefontanaItem[], over: Partial<DefontanaReportInput> = {}): DefontanaReportInput {
  return {
    reportId:             '9c78e6f9-7852-4981-affa-6e08786623d9',
    reportTitle:          'Caja Chica N° 174 - Oficina Ingenieria',
    date:                 '2026-02-24',
    employeeName:         'Ana Pérez',
    employeeRut:          '15381452K',
    employeeCostCenterId: 'EMPGESINGING',
    items,
    ...over,
  }
}

describe('toBankDocNumber', () => {
  it('abrevia el año a dos dígitos: 24-02-2026 → 240226', () => {
    expect(toBankDocNumber('2026-02-24')).toBe('240226')
  })

  it('conserva los ceros a la izquierda del día y del mes', () => {
    expect(toBankDocNumber('2026-03-05')).toBe('050326')
  })
})

describe('adelantos', () => {
  const res = buildDefontanaEntries(
    [report([item({ item_type: 'advance', amount_clp: 200_000, date: '2026-02-24', description: 'Adelanto Caja Chica' })])],
    settings,
  )

  it('genera exactamente dos líneas', () => {
    expect(res.lines).toHaveLength(2)
  })

  it('carga Fondos por Rendir al debe con la ficha del empleado', () => {
    const fondos = res.lines[0]
    expect(fondos.cuenta).toBe('1110101003')
    expect(fondos.debe).toBe(200_000)
    expect(fondos.haber).toBe('')
    expect(fondos.cod_ficha).toBe('15381452K')
  })

  it('abona el banco con tipo de documento CARGO y la fecha como número de documento', () => {
    const banco = res.lines[1]
    expect(banco.cuenta).toBe('1110102001')
    expect(banco.haber).toBe(200_000)
    expect(banco.debe).toBe('')
    expect(banco.tipo_doc).toBe('CARGO')
    expect(banco.nro_doc).toBe('240226')
  })

  it('no pone ficha ni centro de costo en la línea del banco', () => {
    expect(res.lines[1].cod_ficha).toBe('')
    expect(res.lines[1].centro_negocios).toBe('')
  })

  it('cuadra el asiento', () => {
    const debe  = res.lines.reduce((s, l) => s + (typeof l.debe  === 'number' ? l.debe  : 0), 0)
    const haber = res.lines.reduce((s, l) => s + (typeof l.haber === 'number' ? l.haber : 0), 0)
    expect(debe).toBe(haber)
  })

  it('usa la fecha del ítem, no la del reporte', () => {
    const otro = buildDefontanaEntries(
      [report([item({ item_type: 'advance', amount_clp: 81_728, date: '2026-03-12' })], { date: '2026-01-01' })],
      settings,
    )
    expect(otro.lines[1].nro_doc).toBe('120326')
  })

  it('agrupa en un solo asiento los adelantos de la misma fecha', () => {
    const dos = buildDefontanaEntries(
      [report([
        item({ item_type: 'advance', amount_clp: 100_000, date: '2026-02-24' }),
        item({ item_type: 'advance', amount_clp: 100_000, date: '2026-02-24' }),
      ])],
      settings,
    )
    expect(dos.lines).toHaveLength(2)
    expect(dos.lines[0].debe).toBe(200_000)
  })

  it('separa en asientos distintos los adelantos de fechas distintas', () => {
    const dos = buildDefontanaEntries(
      [report([
        item({ item_type: 'advance', amount_clp: 200_000, date: '2026-02-24' }),
        item({ item_type: 'advance', amount_clp: 81_728,  date: '2026-03-12' }),
      ])],
      settings,
    )
    expect(dos.lines).toHaveLength(4)
    expect(new Set(dos.lines.map(l => l.numero)).size).toBe(2)
  })

  it('sin cuenta banco no emite líneas y avisa', () => {
    const sinBanco = buildDefontanaEntries(
      [report([item({ item_type: 'advance', amount_clp: 200_000, date: '2026-02-24' })])],
      { ...settings, bankAccount: null },
    )
    expect(sinBanco.lines).toHaveLength(0)
    expect(sinBanco.warnings[0].categories[0]).toContain('cuenta banco')
    expect(sinBanco.warnings[0].unmappedCLP).toBe(200_000)
  })
})

describe('devoluciones', () => {
  const res = buildDefontanaEntries(
    [report([item({ item_type: 'return', amount_clp: 50_000, date: '2026-03-04', description: 'Devolución saldo' })])],
    settings,
  )

  it('invierte el asiento del adelanto: banco al debe, fondos por rendir al haber', () => {
    const fondos = res.lines[0]
    const banco  = res.lines[1]
    expect(fondos.cuenta).toBe('1110101003')
    expect(fondos.haber).toBe(50_000)
    expect(fondos.debe).toBe('')
    expect(banco.cuenta).toBe('1110102001')
    expect(banco.debe).toBe(50_000)
    expect(banco.haber).toBe('')
  })

  it('usa ABONO como tipo de documento del banco', () => {
    expect(res.lines[1].tipo_doc).toBe('ABONO')
    expect(res.lines[1].nro_doc).toBe('040326')
  })
})

describe('traspasos entre responsables', () => {
  const traspaso = item({
    item_type:         'transfer',
    amount_clp:        75_000,
    date:              '2026-03-10',
    description:       'Traspaso a Oficina Central',
    counterpart_rut:   '156435414',
    counterpart_name:  'Carlos Soto',
    is_transfer_payer: true,
  })

  const res = buildDefontanaEntries([report([traspaso])], settings)

  it('mueve Fondos por Rendir contra sí misma, sin tocar el banco', () => {
    expect(res.lines).toHaveLength(2)
    expect(res.lines.every(l => l.cuenta === '1110101003')).toBe(true)
  })

  it('carga al que recibe y abona al que entrega', () => {
    const [recibe, entrega] = res.lines
    expect(recibe.debe).toBe(75_000)
    expect(recibe.cod_ficha).toBe('156435414')
    expect(recibe.nombre).toBe('Carlos Soto')
    expect(entrega.haber).toBe(75_000)
    expect(entrega.cod_ficha).toBe('15381452K')
  })

  it('no duplica el asiento desde el lado que recibe', () => {
    const ladoReceptor = buildDefontanaEntries(
      [report([{ ...traspaso, is_transfer_payer: false }])],
      settings,
    )
    expect(ladoReceptor.lines).toHaveLength(0)
  })

  it('avisa cuando el traspaso no tiene contraparte vinculada', () => {
    const suelto = buildDefontanaEntries(
      [report([{ ...traspaso, counterpart_rut: null, counterpart_name: null }])],
      settings,
    )
    expect(suelto.lines).toHaveLength(0)
    expect(suelto.warnings[0].categories[0]).toContain('contraparte')
  })
})

describe('gastos (comportamiento previo)', () => {
  const gastos = [
    item({ item_type: 'expense', amount_clp: 30_000, defontana_account_code: '4.5.1030.10.13', category_name: 'Insumos', doc_type: 'boleta' }),
    item({ item_type: 'expense', amount_clp: 20_000, defontana_account_code: '4.5.1030.10.13', category_name: 'Insumos', doc_type: 'boleta' }),
  ]

  it('agrupa boletas de la misma cuenta y cierra contra Fondos por Rendir', () => {
    const res = buildDefontanaEntries([report(gastos)], settings)
    expect(res.lines).toHaveLength(2)
    expect(res.lines[0].debe).toBe(50_000)
    expect(res.lines[1].cuenta).toBe('1110101003')
    expect(res.lines[1].haber).toBe(50_000)
  })

  it('sigue tratando como gasto un ítem sin item_type', () => {
    const res = buildDefontanaEntries(
      [report([item({ amount_clp: 10_000, defontana_account_code: '4.5.1030.10.13', doc_type: 'boleta' })])],
      settings,
    )
    expect(res.lines[0].debe).toBe(10_000)
    expect(res.lines[1].haber).toBe(10_000)
  })
})

describe('reporte con movimientos mezclados', () => {
  it('arma un asiento por movimiento, cada uno cuadrado', () => {
    const res = buildDefontanaEntries(
      [report([
        item({ item_type: 'expense', amount_clp: 40_000, defontana_account_code: '4.5.1030.10.13', doc_type: 'boleta' }),
        item({ item_type: 'advance', amount_clp: 100_000, date: '2026-02-24' }),
        item({ item_type: 'return',  amount_clp: 60_000,  date: '2026-03-04' }),
      ])],
      settings,
    )

    const porVoucher = new Map<string, { debe: number; haber: number }>()
    for (const l of res.lines) {
      const acc = porVoucher.get(l.numero) ?? { debe: 0, haber: 0 }
      acc.debe  += typeof l.debe  === 'number' ? l.debe  : 0
      acc.haber += typeof l.haber === 'number' ? l.haber : 0
      porVoucher.set(l.numero, acc)
    }

    expect(porVoucher.size).toBe(3)
    for (const { debe, haber } of porVoucher.values()) {
      expect(debe).toBe(haber)
    }
  })
})

describe('formato del importador (verificado con el fondo 174)', () => {
  const res = buildDefontanaEntries(
    [report([
      item({ item_type: 'expense', amount_clp: 30_000, defontana_account_code: '4.5.1030.10.13', doc_type: 'boleta', cost_center_id: 'EMPGESINGING' }),
    ])],
    settings,
  )
  const rows    = buildSheetRows(res.lines)
  const headers = rows[0]
  const first   = rows[1]

  const col = (name: string) => headers.indexOf(name)

  it('escribe la letra A en la columna Número, no el id del voucher', () => {
    expect(rows.slice(1).every(r => r[col('Número')] === 'A')).toBe(true)
  })

  it('nombra la moneda PESO', () => {
    expect(first[col('Moneda comprobante')]).toBe('PESO')
  })

  it('agrega tres ceros al centro de negocios', () => {
    expect(first[col('Centro de Negocios')]).toBe('EMPGESINGING000')
  })

  it('deja vacío el centro de negocios cuando no hay, sin poner 000 solo', () => {
    expect(toSheetCostCenter('')).toBe('')
  })

  it('conserva las 36 columnas del template', () => {
    expect(headers).toHaveLength(36)
    expect(rows.every(r => r.length === 36)).toBe(true)
  })

  it('mantiene el voucher interno para poder contar los asientos', () => {
    const mixto = buildDefontanaEntries(
      [report([
        item({ item_type: 'expense', amount_clp: 40_000, defontana_account_code: '4.5.1030.10.13', doc_type: 'boleta' }),
        item({ item_type: 'advance', amount_clp: 100_000, date: '2026-02-24' }),
      ])],
      settings,
    )
    expect(countVouchers(mixto)).toBe(2)
    // ...aunque en la planilla las dos salgan como "A"
    expect(new Set(buildSheetRows(mixto.lines).slice(1).map(r => r[0])).size).toBe(1)
  })
})

describe('centro de negocios por tipo de cuenta', () => {
  it('los gastos sí llevan centro de negocios', () => {
    const res = buildDefontanaEntries(
      [report([item({ item_type: 'expense', amount_clp: 30_000, defontana_account_code: '4.5.1030.10.13', doc_type: 'boleta', cost_center_id: 'EMPGESINGING' })])],
      settings,
    )
    expect(res.lines[0].centro_negocios).toBe('EMPGESINGING')
  })

  it('Fondos por Rendir no lleva centro de negocios al cerrar los gastos', () => {
    const res = buildDefontanaEntries(
      [report([item({ item_type: 'expense', amount_clp: 30_000, defontana_account_code: '4.5.1030.10.13', doc_type: 'boleta' })])],
      settings,
    )
    const contrapartida = res.lines[res.lines.length - 1]
    expect(contrapartida.cuenta).toBe('1110101003')
    expect(contrapartida.centro_negocios).toBe('')
  })

  it('ninguna línea de adelanto o devolución lleva centro de negocios', () => {
    const res = buildDefontanaEntries(
      [report([
        item({ item_type: 'advance', amount_clp: 200_000, date: '2026-02-24' }),
        item({ item_type: 'return',  amount_clp: 50_000,  date: '2026-03-04' }),
      ])],
      settings,
    )
    expect(res.lines.every(l => l.centro_negocios === '')).toBe(true)
  })

  it('ninguna línea de traspaso lleva centro de negocios', () => {
    const res = buildDefontanaEntries(
      [report([item({
        item_type: 'transfer', amount_clp: 75_000, date: '2026-03-10',
        counterpart_rut: '156435414', counterpart_name: 'Carlos Soto', is_transfer_payer: true,
      })])],
      settings,
    )
    expect(res.lines.every(l => l.centro_negocios === '')).toBe(true)
  })

  it('en la planilla, sin centro no escribe 000 suelto', () => {
    const res = buildDefontanaEntries(
      [report([item({ item_type: 'advance', amount_clp: 200_000, date: '2026-02-24' })])],
      settings,
    )
    const rows = buildSheetRows(res.lines)
    const ccCol = rows[0].indexOf('Centro de Negocios')
    expect(rows.slice(1).every(r => r[ccCol] === '')).toBe(true)
  })
})

describe('RUT en Código de Ficha (caso fondo 176)', () => {
  const col = (rows: (string | number | '')[][], name: string) => rows[0].indexOf(name)

  it('agrega los puntos al RUT del proveedor: 76247147-7 → 76.247.147-7', () => {
    const res = buildDefontanaEntries(
      [report([item({
        item_type: 'expense', amount_clp: 50_400, doc_type: 'factura',
        supplier_rut: '76247147-7', merchant: 'Hillmann Fresno Juan Francisco',
      })])],
      settings,
    )
    const rows = buildSheetRows(res.lines)
    expect(rows[1][col(rows, 'Código de Ficha')]).toBe('76.247.147-7')
    // Codigo Legal va vacío en las líneas de factura: el documento ya está
    // ingresado en Defontana y este asiento solo rebaja la cuenta del proveedor
    expect(rows[1][col(rows, 'Codigo Legal')]).toBe('')
  })

  it('usa la cuenta de proveedor cuando el documento es factura', () => {
    const res = buildDefontanaEntries(
      [report([item({ item_type: 'expense', amount_clp: 50_400, doc_type: 'factura', supplier_rut: '76247147-7' })])],
      settings,
    )
    expect(res.lines[0].cuenta).toBe('2110702001')
  })

  it('deja intacto un RUT que ya viene con puntos', () => {
    expect(toSheetRut('15.601.823-6')).toBe('15.601.823-6')
  })

  it('normaliza el dígito verificador K a mayúscula', () => {
    expect(toSheetRut('18.531.880-k')).toBe('18.531.880-K')
    expect(toSheetRut('15381452K')).toBe('15.381.452-K')
  })

  it('deja vacío el código de ficha cuando no hay RUT', () => {
    expect(toSheetRut('')).toBe('')
    const res = buildDefontanaEntries(
      [report([item({ item_type: 'expense', amount_clp: 30_000, defontana_account_code: '4.5.1030.10.13', doc_type: 'boleta' })])],
      settings,
    )
    const rows = buildSheetRows(res.lines)
    expect(rows[1][col(rows, 'Código de Ficha')]).toBe('')
  })

  it('formatea también la ficha del empleado en la contrapartida', () => {
    const res = buildDefontanaEntries(
      [report([item({ item_type: 'expense', amount_clp: 30_000, defontana_account_code: '4.5.1030.10.13', doc_type: 'boleta' })])],
      settings,
    )
    const rows = buildSheetRows(res.lines)
    expect(rows[2][col(rows, 'Código de Ficha')]).toBe('15.381.452-K')
  })
})

describe('un comprobante por archivo', () => {
  // Defontana no distingue dos asientos dentro del mismo Excel
  const mixto = buildDefontanaEntries(
    [report([
      item({ item_type: 'expense', amount_clp: 40_000, defontana_account_code: '4.5.1030.10.13', doc_type: 'boleta' }),
      item({ item_type: 'advance', amount_clp: 200_000, date: '2026-02-24' }),
      item({ item_type: 'advance', amount_clp:  81_728, date: '2026-03-12' }),
    ])],
    settings,
  )

  it('parte el resultado en un grupo por asiento', () => {
    const vouchers = splitByVoucher(mixto)
    expect(vouchers).toHaveLength(3)
    expect(vouchers.every(v => v.lines.length === 2)).toBe(true)
  })

  it('cada grupo queda cuadrado por separado', () => {
    for (const v of splitByVoucher(mixto)) {
      const debe  = v.lines.reduce((s, l) => s + (typeof l.debe  === 'number' ? l.debe  : 0), 0)
      const haber = v.lines.reduce((s, l) => s + (typeof l.haber === 'number' ? l.haber : 0), 0)
      expect(debe).toBe(haber)
    }
  })

  it('nombra los archivos con correlativo, tipo y fecha', () => {
    const vouchers = splitByVoucher(mixto)
    const nombres  = vouchers.map((v, i) => voucherFileName(v, i))
    expect(nombres[0]).toMatch(/^01-/)
    expect(nombres.some(n => n.includes('gastos'))).toBe(true)
    expect(nombres.some(n => n.includes('adelanto-2026-02-24'))).toBe(true)
    expect(nombres.some(n => n.includes('adelanto-2026-03-12'))).toBe(true)
    expect(nombres.every(n => n.endsWith('.xlsx'))).toBe(true)
  })

  it('un solo asiento sigue siendo un solo archivo', () => {
    const simple = buildDefontanaEntries(
      [report([item({ item_type: 'advance', amount_clp: 200_000, date: '2026-02-24' })])],
      settings,
    )
    expect(splitByVoucher(simple)).toHaveLength(1)
    expect(countVouchers(simple)).toBe(1)
  })
})
