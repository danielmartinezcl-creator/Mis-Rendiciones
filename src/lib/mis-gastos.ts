// Los indicadores de «Mis gastos», desde gastos ya cargados.
//
// Cuenta rendiciones Y caja chica, y solo GASTOS: hasta el 2026-10-07 la
// pantalla sumaba los adelantos y devoluciones de las cargas históricas como
// si fueran gastos (la misma plata contada dos veces).

export interface GastoMio {
  /** La rendición o el fondo: para contar «en N documentos» */
  documentoId:       string
  fecha:             string
  montoClp:          number
  categoriaId:       string | null
  categoriaNombre:   string | null
  aprobado:          boolean
  /** Enviado y sin decidir. Un borrador o un fondo activo todavía no se presentó */
  esperandoDecision: boolean
}

export interface ResumenMisGastos {
  /** YYYY-MM, del más viejo al actual */
  meses:           string[]
  porMes:          Record<string, number>
  porCategoria:    { id: string | null; nombre: string; total: number }[]
  totalAprobado:   number
  mesesConGastos:  number
  promedioMensual: number
  pendiente:       { montoClp: number; documentos: number }
}

export function ultimosDoceMeses(hoy: string): string[] {
  const [a, m] = hoy.split('-').map(Number)
  const meses: string[] = []
  for (let i = 11; i >= 0; i--) {
    const total = a * 12 + (m - 1) - i
    meses.push(`${Math.floor(total / 12)}-${String((total % 12) + 1).padStart(2, '0')}`)
  }
  return meses
}

/**
 * Si un gasto pendiente de ese documento está esperando que alguien decida.
 * En caja chica, los gastos se deciden en la liquidación: mientras el fondo
 * está activo (`funds_sent`) todavía no se presentaron. Un pedido de fondo no
 * es un gasto.
 */
export function esperaDecision(tipo: 'rendicion' | 'fondo', status: string): boolean {
  return tipo === 'rendicion'
    ? status === 'submitted' || status === 'pending_l2'
    : status === 'pending_liquidation_approval' || status === 'pending_liquidation_l2'
}

export function resumenMisGastos(gastos: GastoMio[], hoy: string): ResumenMisGastos {
  const meses = ultimosDoceMeses(hoy)
  const porMes: Record<string, number> = Object.fromEntries(meses.map(m => [m, 0]))
  const porCategoria = new Map<string, { id: string | null; nombre: string; total: number }>()
  let totalAprobado = 0

  for (const g of gastos) {
    if (!g.aprobado) continue
    const mes = g.fecha.slice(0, 7)
    if (!(mes in porMes)) continue
    porMes[mes] += g.montoClp
    totalAprobado += g.montoClp
    const clave = g.categoriaId ?? '__sin__'
    const fila = porCategoria.get(clave) ?? { id: g.categoriaId, nombre: g.categoriaNombre ?? 'Sin categoría', total: 0 }
    fila.total += g.montoClp
    porCategoria.set(clave, fila)
  }

  const mesesConGastos = meses.filter(m => porMes[m] > 0).length
  const pendientes = gastos.filter(g => g.esperandoDecision)

  return {
    meses,
    porMes,
    porCategoria:    [...porCategoria.values()].sort((x, y) => y.total - x.total),
    totalAprobado,
    mesesConGastos,
    promedioMensual: mesesConGastos ? totalAprobado / mesesConGastos : 0,
    pendiente: {
      montoClp:   pendientes.reduce((s, g) => s + g.montoClp, 0),
      documentos: new Set(pendientes.map(g => g.documentoId)).size,
    },
  }
}
