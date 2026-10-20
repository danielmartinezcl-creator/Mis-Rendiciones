/**
 * ¿Queda algo pendiente en este documento? La plata que falta pagar o devolver.
 *
 * Pedido de Daniel el 2026-10-20: «me cuesta saber cuáles tienen algo pendiente por
 * devolver o que le reembolse la empresa, mirando las carátulas de cada rendición».
 *
 * Lo que había era un distintivo de CUADRE: comparaba `reimbursed_amount` contra
 * `approved_amount` y decía «Cuadrado», «Exceso de reembolso» o «Pendiente por
 * reembolsar». No servía, por tres motivos medidos en producción ese día:
 *
 * 1. **Solo aparecía con `status = 'reimbursed'`.** Las 115 rendiciones con saldo que
 *    NO están marcadas reembolsadas —justo las que hay que revisar— no mostraban nada.
 * 2. **`reimbursed_amount` casi nunca está cargado**: 23 de las 37 marcadas como
 *    reembolsadas no tienen monto, y el distintivo decía «— Sin registro». El monto es
 *    opcional en `markAsReimbursed`, así que es la norma, no la excepción.
 * 3. **`approved_amount` no significa lo mismo en todas las filas**: en 149 de 155 es
 *    la suma de los gastos aprobados y en 1 es el neto (la que alguien revirtió, porque
 *    `revertReimbursement` lo recalcula con `computeApprovedAmount`). Comparar contra
 *    una columna que cambia de significado según su historia no puede dar un resultado
 *    estable.
 *
 * Así que el saldo se calcula de los ÍTEMS, que son el expediente, y no de las
 * columnas de la cabecera.
 *
 * ## La misma plata registrada por dos vías
 *
 * El hallazgo que gobierna este módulo: **el reembolso al empleado está registrado de
 * dos formas distintas según el documento, y nada en el esquema dice cuál se usó.**
 *
 * - Como ítem `advance` (las cargas históricas: era la única forma hasta que existió
 *   `agregarMovimientoHistorico`; ver el punto 1 de `movimientos-historicos.ts`).
 * - Como `reimbursed_amount` en la cabecera (lo que escribe `markAsReimbursed`).
 * - En varias, **las dos a la vez**.
 *
 * Por eso lo recibido es `max(vía de los ítems, vía de la cabecera)` y **nunca la
 * suma**: las dos columnas describen el mismo hecho —cuánta plata recibió la persona—
 * y sumarlas la cuenta dos veces. Es el mismo error que «sumar adelantos y gastos en
 * un KPI de total», ya anotado en el contexto del proyecto.
 *
 * Medido sobre las 155 rendiciones de producción el 2026-10-20: con `max()` quedan 59
 * en saldo cero; sumando las dos vías, 27. Y en las 13 donde ambas tienen dato, `max()`
 * mejora el resultado en las 13, sin una sola excepción. Los cuatro casos que lo
 * prueban están fijados en `saldo-rendicion.test.ts` con sus montos reales:
 *
 * | Rendición | Gastos | Adelantos | `reimbursed_amount` | Pendiente |
 * |---|---|---|---|---|
 * | N°8 Claudia  | 173.701 | 0      | 173.701 | 0 — pagada solo por carátula |
 * | N°2 A. Peña  |  17.240 | 0      | null    | +17.240 — aprobada sin pagar |
 * | N°6 Claudia  |  38.080 | 34.080 |  34.080 | +4.000 — las dos vías, el mismo pago |
 * | N°7 Claudia  |  85.571 | 87.571 |  85.571 | −2.000 — recibió de más |
 *
 * ## El signo de la devolución
 *
 * Una devolución (`return`) es plata que el empleado YA entregó de vuelta, así que
 * **reduce lo que tiene en mano**: va con signo contrario al adelanto. No es una
 * preferencia, se midió: de las 24 filas con devoluciones, restándola quedan 21 en
 * cero y sumándola, 0.
 *
 * ⚠️ **`computeApprovedAmount` la resta igual que un adelanto** (`approval-helpers.ts`),
 * o sea con el signo invertido respecto de esto. En un caso de adelanto 100.000,
 * gastos 60.000 y devolución 40.000 —saldado— esa función devuelve −80.000. No se
 * corrigió acá porque gobierna el monto a pagar del flujo vivo y merece su propia
 * revisión; hoy no se ejercita porque las 155 rendiciones son históricas.
 */

export type EstadoSaldo = 'saldado' | 'por-reembolsar' | 'por-devolver'

export interface ItemDeSaldo {
  item_type?: string | null
  amount_clp: number
  status:     string | null
  /** Resuelto contra `fund_transfers.payer_report_id`; solo importa en los `transfer`. */
  is_transfer_payer?: boolean
}

export interface SaldoRendicion {
  /** Lo que salió: gastos aprobados y los traspasos que este documento pagó. */
  salidas:          number
  /** Lo recibido según los ítems: adelantos − devoluciones + traspasos recibidos. */
  recibidoItems:    number
  /** Lo recibido según la cabecera (`reimbursed_amount`). */
  recibidoCaratula: number
  /** El mayor de los dos, nunca la suma. Ver la cabecera del módulo. */
  recibido:         number
  /** Positivo: la empresa le debe. Negativo: tiene que devolver. */
  pendiente:        number
  estado:           EstadoSaldo
  /** Las dos vías traen dato: el pago quedó anotado por duplicado. */
  dobleRegistro:    boolean
}

/* El peso no tiene decimales, pero los montos pasaron por conversiones de moneda y
   por recálculos: una diferencia de menos de un peso es ruido de redondeo, no un
   saldo. Es el mismo umbral que usaba el distintivo de cuadre. */
const TOLERANCIA = 1

/** Un traspaso cuenta de un solo lado, y de cuál depende de quién pagó.
 *
 *  Para quien lo paga es plata que salió de su caja, igual que un gasto; para quien lo
 *  recibe es financiamiento, igual que un adelanto. La misma regla que `totalDeGastos`
 *  de `movimientos-historicos.ts`, y por el mismo motivo: un traspaso deja un ítem con
 *  el mismo monto positivo en los documentos de las dos partes.
 *
 *  Un traspaso no lo aprueba nadie —`createFundTransfer` no escribe `status`, así que
 *  los 8 de producción quedaron en `pending`— por eso cuenta sin mirar su estado.
 *  Filtrarlo dejaría afuera plata que se movió con total certeza. */
const esTraspasoQuePaga   = (i: ItemDeSaldo) => i.item_type === 'transfer' && i.is_transfer_payer === true
const esTraspasoQueRecibe = (i: ItemDeSaldo) => i.item_type === 'transfer' && i.is_transfer_payer !== true

/** Un ítem sin tipo es un gasto: los anteriores a la migración 009 no lo tienen. Mismo
 *  criterio que el export a Defontana. */
const esGastoAprobado = (i: ItemDeSaldo) =>
  i.status === 'approved' && (!i.item_type || i.item_type === 'expense')

const suma = (items: ItemDeSaldo[]) => items.reduce((acc, i) => acc + i.amount_clp, 0)

export function saldoDeRendicion(
  items: ItemDeSaldo[],
  reimbursedAmount: number | null | undefined,
): SaldoRendicion {
  const salidas =
      suma(items.filter(esGastoAprobado))
    + suma(items.filter(esTraspasoQuePaga))

  const recibidoItems =
      suma(items.filter(i => i.status === 'approved' && i.item_type === 'advance'))
    - suma(items.filter(i => i.status === 'approved' && i.item_type === 'return'))
    + suma(items.filter(esTraspasoQueRecibe))

  const recibidoCaratula = reimbursedAmount ?? 0
  const recibido  = Math.max(recibidoItems, recibidoCaratula)
  const pendiente = salidas - recibido

  return {
    salidas,
    recibidoItems,
    recibidoCaratula,
    recibido,
    pendiente,
    estado: Math.abs(pendiente) < TOLERANCIA
      ? 'saldado'
      : pendiente > 0 ? 'por-reembolsar' : 'por-devolver',
    /* Las dos vías con dato. No es un error en sí —es cómo quedaron 13 documentos—
       pero explica por qué el distintivo viejo decía «Exceso de reembolso»: restaba
       el mismo pago dos veces. Se muestra en la explicación del distintivo. */
    dobleRegistro: recibidoItems !== 0 && recibidoCaratula !== 0,
  }
}

/** El texto del distintivo. Acá y no en el componente para que las dos pantallas que
 *  lo muestran —`/admin/reports` y `/admin/carga-historica`— no puedan divergir: el
 *  distintivo de cuadre estaba duplicado en las dos, con el mismo código copiado. */
export function etiquetaDeSaldo(estado: EstadoSaldo): string {
  switch (estado) {
    case 'saldado':         return 'Saldado'
    case 'por-reembolsar':  return 'Falta reembolsar'
    case 'por-devolver':    return 'Falta devolver'
  }
}
