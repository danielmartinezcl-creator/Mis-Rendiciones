/**
 * Agregar un movimiento a una carga histórica YA importada.
 *
 * Hasta el 2026-10-19 no se podía: `commitHistoricalImport` era la única función que
 * insertaba ítems y corría una sola vez. Si la planilla fuente no traía la fila del
 * pago, la única salida era cargar un documento aparte o rehacer la carga completa.
 *
 * Dos cosas que no se deducen del código y conviene saber antes de tocar esto:
 *
 * 1. **El reembolso al empleado NO es un tipo de movimiento nuevo.** Contablemente es
 *    el mismo asiento del adelanto —Debe Fondos por Rendir / Haber Banco, línea de
 *    banco `CARGO`— porque en los dos casos sale plata del banco y se debita la cuenta
 *    de la persona. Lo único que cambia es el orden en el tiempo: en caja chica primero
 *    se entrega y después se gasta; en una rendición se gasta primero y se paga después.
 *    Un `item_type` propio exigiría migración (el CHECK admite cuatro valores), un tipo
 *    de comprobante nuevo en `organizations` y tocar `buildBankVoucher`, que solo conoce
 *    dos direcciones. Así que es una ETIQUETA: dos opciones del selector escriben
 *    `advance`. La palabra «reembolso» tiene que estar en la pantalla —Daniel la buscó y
 *    no la encontró— pero el dato que viaja a Defontana no cambia.
 *
 * 2. **El total de una carga histórica es solo gastos.** `commitHistoricalImport` lo
 *    define así al crear, pero `calculateReportTotal` suma TODOS los ítems, y los
 *    recálculos posteriores a una edición o un borrado rompían el total. Medido en
 *    producción el 2026-10-19: tres cargas desviadas, una de ellas por $278.710.
 *    Por eso existe `totalDeGastos` y por eso hay que usarla en cualquier recálculo
 *    sobre una carga histórica.
 */

/** Los tipos que la base admite para lo que esta pantalla registra. `transfer` queda
 *  afuera a propósito: un traspaso se registra desde el traspaso, que mueve los dos
 *  lados a la vez. */
export type ItemTypeMovimiento = 'expense' | 'advance' | 'return'

export type ClaveMovimiento = 'gasto' | 'adelanto' | 'reembolso' | 'devolucion'

export interface MovimientoNuevo {
  clave:         ClaveMovimiento
  descripcion:   string
  fecha:         string
  montoCLP:      number
  categoryId?:   string | null
  costCenterId?: string | null
}

/** Las opciones del selector. Son cuatro aunque los tipos sean tres: «Adelanto a
 *  rendir» y «Reembolso al empleado» escriben el mismo `advance` (ver el punto 1 de
 *  arriba), y se distinguen por la descripción, que es lo que se lee en la lista. */
export const MOVIMIENTOS = [
  { clave: 'gasto',      etiqueta: 'Gasto',                 itemType: 'expense', descripcionPorDefecto: 'Gasto' },
  { clave: 'adelanto',   etiqueta: 'Adelanto a rendir',     itemType: 'advance', descripcionPorDefecto: 'Adelanto' },
  { clave: 'reembolso',  etiqueta: 'Reembolso al empleado', itemType: 'advance', descripcionPorDefecto: 'Reembolso al empleado' },
  { clave: 'devolucion', etiqueta: 'Devolución',            itemType: 'return',  descripcionPorDefecto: 'Devolución' },
] as const satisfies readonly {
  clave: ClaveMovimiento
  etiqueta: string
  itemType: ItemTypeMovimiento
  descripcionPorDefecto: string
}[]

export function movimientoPorClave(clave: string) {
  return MOVIMIENTOS.find(m => m.clave === clave)
}

/** Los movimientos que una pantalla puede ofrecer.
 *
 *  Sin el catálogo de categorías no se ofrece «Gasto»: un gasto se imputa a una cuenta
 *  y sin categoría no hay cómo. Los movimientos de fondos no la necesitan — van contra
 *  Fondos por Rendir, que no lleva categoría ni centro de negocios. Es el caso de
 *  `/petty-cash`, que no carga el catálogo. */
export function movimientosDisponibles(hayCategorias: boolean) {
  return hayCategorias
    ? [...MOVIMIENTOS]
    : MOVIMIENTOS.filter(m => m.itemType !== 'expense')
}

/** Lo que SALIÓ de una carga histórica: los gastos y los traspasos que ella pagó.
 *
 *  Un adelanto es la plata que se entrega y el gasto es en qué se usó — sumarlos
 *  cuenta dos veces la misma plata, así que el adelanto queda afuera. Un ítem sin
 *  tipo cuenta como gasto, el mismo criterio que el export a Defontana: los
 *  anteriores a la migración 009 no lo tienen.
 *
 *  **El traspaso cuenta, pero solo del lado que PAGA** (Daniel, 2026-10-20). Un
 *  traspaso deja un ítem en los documentos de las dos partes, con el mismo monto
 *  positivo: para quien lo paga es plata que salió de su caja, igual que un gasto;
 *  para quien lo recibe es financiamiento, igual que un adelanto. Sumarlo en los dos
 *  lados contaría la misma plata dos veces, y sumarlo del lado que recibe le daría
 *  un «total gastado» a una caja que todavía no gastó nada.
 *
 *  Medido en producción el 2026-10-20, los 8 traspasos de las cargas históricas: en
 *  los 4 que pagan el total guardado ya los incluye (Caja Chica N°180: 330.864 +
 *  8.640 = 339.504) y en los 4 que reciben no (CAJA CHICA N°1 ESTEBAN VARAS: el
 *  traspaso de 21.592 financia sus gastos junto con el adelanto de 150.000, no se
 *  suma a ellos).
 *
 *  La dirección NO es una columna: se resuelve contra `fund_transfers.payer_report_id`,
 *  igual que `is_transfer_payer` en el export a Defontana. Por eso entra como dato
 *  del ítem y esta función no toca la base.
 */
export function totalDeGastos(
  items: { item_type?: string | null; amount_clp: number; is_transfer_payer?: boolean }[],
): number {
  return items
    .filter(i =>
      !i.item_type
      || i.item_type === 'expense'
      || (i.item_type === 'transfer' && i.is_transfer_payer === true))
    .reduce((suma, i) => suma + i.amount_clp, 0)
}

/** Los dos montos de la cabecera de una carga histórica, en una sola función para que
 *  un recálculo no pueda arreglar uno y dejar el otro viejo.
 *
 *  `total_amount` es lo que salió; `approved_amount`, solo lo aprobado. No es teórico:
 *  medido el 2026-10-19, 8 de las 145 cargas históricas tienen ítems en `pending`, y
 *  sumarlos al aprobado inflaría el monto que la pantalla compara contra lo reembolsado.
 *
 *  `status` es obligatorio en el tipo a propósito: así el compilador obliga a traerlo
 *  en el `select`, en vez de dejar que un callsite lo omita y el aprobado quede en cero. */
export function totalesDeCargaHistorica(
  items: {
    item_type?: string | null
    amount_clp: number
    status: string | null
    /** Resuelto contra `fund_transfers`; solo importa en los ítems `transfer`. */
    is_transfer_payer?: boolean
  }[],
): { total: number; aprobado: number } {
  return {
    total:    totalDeGastos(items),
    aprobado: totalDeGastos(items.filter(i => i.status === 'approved')),
  }
}

/** ¿Hay que bajar la marca de Defontana de la cabecera a los ítems antes de insertar?
 *
 *  Una carga contabilizada desde `/admin/reports` tiene la marca en la cabecera y no
 *  en los ítems, y el panel por tipo trata ese estado como «todo exportado»
 *  (`legacyHeaderOnly` → `pending = []`). Si se agrega un movimiento sin sembrar, nace
 *  sin marca pero el panel lo cuenta como contabilizado y nunca ofrece su comprobante.
 *  Mismo patrón que `revertHistoricalFundDefontana`. */
export function necesitaSiembra(cabeceraMarcada: boolean, itemsMarcados: number): boolean {
  return cabeceraMarcada && itemsMarcados === 0
}

/** Por qué un movimiento de una carga histórica no se puede borrar, o null si se puede.
 *
 *  `cargaLegacy` es el estado en que la carga se contabilizó desde `/admin/reports`: la
 *  marca está en la cabecera y no en los ítems, así que el ítem no tiene marca propia
 *  pero su asiento SÍ se emitió. Sin este parámetro, las 27 cargas en ese estado
 *  dejarían borrar movimientos ya contabilizados. */
export function motivoNoSeBorra(
  item: { item_type?: string | null; defontana_exported_at: string | null },
  cargaLegacy: boolean,
): string | null {
  if (item.item_type === 'transfer')
    return 'Un traspaso se elimina desde el traspaso, que mueve los dos documentos a la vez'
  if (item.defontana_exported_at || cargaLegacy)
    return 'Está contabilizado en Defontana: revertí el comprobante antes de eliminarlo'
  return null
}

export function erroresDeMovimiento(mov: MovimientoNuevo): string[] {
  const errores: string[] = []
  const elegido = movimientoPorClave(mov.clave)

  if (!elegido) errores.push('Elegí qué movimiento registrar')
  if (!(mov.montoCLP > 0)) errores.push('El monto debe ser mayor a 0')
  if (!mov.fecha) errores.push('La fecha es obligatoria')
  // Solo el gasto se imputa a una cuenta: el adelanto y la devolución van contra
  // Fondos por Rendir, que no lleva centro de negocios ni categoría.
  if (elegido?.itemType === 'expense' && !mov.categoryId) errores.push('Elegí la categoría del gasto')

  return errores
}

/** La fila a insertar en `expense_items`, con la misma forma que le da
 *  `commitHistoricalImport` a las de la importación. Vive acá, y no suelta en la
 *  acción, porque la regla que importa —categoría y centro de costo en null si no es
 *  gasto— es justo la que un insert escrito a mano olvida. */
export function filaDeMovimiento(
  mov: MovimientoNuevo,
  ctx: { reportId: string; orgId: string; empleado: string },
) {
  const elegido = movimientoPorClave(mov.clave)
  if (!elegido) throw new Error('Movimiento desconocido')

  const esGasto = elegido.itemType === 'expense'
  // El peso chileno no tiene decimales, y el monto llega del navegador: redondear en el
  // formulario no alcanza, porque la acción recibe el objeto tal cual.
  const monto = Math.round(mov.montoCLP)

  return {
    report_id:            ctx.reportId,
    org_id:               ctx.orgId,
    description:          mov.descripcion.trim() || elegido.descripcionPorDefecto,
    amount:               monto,
    currency:             'CLP' as const,
    exchange_rate:        1,
    exchange_rate_source: 'manual' as const,
    amount_clp:           monto,
    date:                 mov.fecha,
    item_type:            elegido.itemType,
    category_id:          esGasto ? (mov.categoryId    ?? null) : null,
    cost_center_id:       esGasto ? (mov.costCenterId  ?? null) : null,
    // Un gasto agregado a mano después de la importación no trae tipo de documento:
    // 'otro' lo agrupa como boleta en el asiento, que es lo correcto salvo factura.
    doc_type:             'otro' as const,
    doc_number:           null,
    supplier_rut:         null,
    merchant:             ctx.empleado || null,
    status:               'approved' as const,
    // Nace pendiente para que el panel por tipo ofrezca su comprobante.
    defontana_exported_at: null,
  }
}
