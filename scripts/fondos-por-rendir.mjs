/**
 * Reporte de la cuenta FONDOS POR RENDIR: saldo total y composición por empleado.
 *
 * Pedido de Daniel (2026-10-22) para la contabilidad. Informes NO puede armarlo:
 * su hoja «Por Empleado» suma adelantos, devoluciones y traspasos con el MISMO
 * signo (no es un saldo), no resuelve la dirección de un traspaso, y sobre todo
 * `getUnifiedReportItems` nunca lee `petty_cash_transfers` — así que la entrega
 * de un fondo vivo, que es un movimiento puro de esta cuenta, le es invisible.
 *
 * ESTO ES UN PROTOTIPO, no la fuente de la verdad. Existe para que Daniel mire
 * el formato y pase el saldo inicial antes de que se construya la pantalla.
 * Cuando esa pantalla se haga, la lógica de acá va a `src/lib/` con sus pruebas
 * y este script la importa o desaparece.
 *
 *   node scripts/fondos-por-rendir.mjs [ruta-de-salida.xlsx]
 */

import fs from 'node:fs'
import path from 'node:path'
import XLSX from 'xlsx'

// ── Credenciales ─────────────────────────────────────────────────────────────
// Solo LECTURA. La llave de servicio saltea RLS, que es lo que hace falta para
// ver los movimientos de todos.
const env = Object.fromEntries(
  fs.readFileSync('.env.local', 'utf8').split(/\r?\n/)
    .filter(l => l && !l.startsWith('#') && l.includes('='))
    .map(l => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1).trim()]),
)
const URL = env.NEXT_PUBLIC_SUPABASE_URL
const KEY = env.SUPABASE_SERVICE_ROLE_KEY
if (!URL || !KEY) throw new Error('Faltan NEXT_PUBLIC_SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY en .env.local')

/** PostgREST pagina de a 1000 por omisión: se pide por tramos hasta que corta. */
async function traer(tabla, columnas) {
  const filas = []
  for (let desde = 0; ; desde += 1000) {
    const r = await fetch(`${URL}/rest/v1/${tabla}?select=${columnas}`, {
      headers: {
        apikey: KEY, Authorization: `Bearer ${KEY}`,
        Range: `${desde}-${desde + 999}`, 'Range-Unit': 'items',
      },
    })
    if (!r.ok) throw new Error(`${tabla}: ${r.status} ${await r.text()}`)
    const tramo = await r.json()
    filas.push(...tramo)
    if (tramo.length < 1000) return filas
  }
}

// ── Las reglas de la cuenta ──────────────────────────────────────────────────
/*
 * EL SIGNO (Daniel, 2026-10-22, corrigiéndome):
 *
 *   DEBE  (+) = la empresa le entregó plata      → saldo DEUDOR
 *   HABER (−) = el empleado rindió o devolvió    → saldo ACREEDOR
 *
 * Un saldo acreedor **sigue siendo Fondos por Rendir**: la cuenta se define por
 * el ORIGEN de la transacción, no por el signo del saldo. Yo había propuesto
 * reclasificarlo como cuenta por pagar y era una lectura de manual que acá no
 * corresponde.
 *
 * CONTABILIZADO: la marca propia del movimiento **o la de su cabecera**. Hay 28
 * cargas con la marca solo en la cabecera (el estado «legacy» que documenta el
 * panel de Defontana): mirar solo la marca propia desviaba el total en $76.583.
 *
 * LA PAPELERA QUEDA FUERA (Daniel, 2026-10-23). Además de ser su decisión, es lo
 * correcto: «9 FD ESPECIAL» tiene sus $830.000 dos veces —como transferencia del
 * fondo borrado y como adelanto de su carga histórica viva—, así que incluir la
 * papelera los contaría dos veces. Los otros tres fondos borrados con marca de
 * Defontana también están cubiertos por cargas vivas.
 */

const DEBE  = +1
const HABER = -1

/** Qué le hace cada tipo de ítem a la cuenta. `transfer` depende de la dirección. */
const SENTIDO_ITEM = { advance: DEBE, expense: HABER, return: HABER }
/** Y cada transferencia de un fondo vivo, por el sentido del dinero. */
const SENTIDO_TRANSFERENCIA = {
  disbursement: DEBE, refund_to_employee: DEBE, reimbursement_from_employee: HABER,
}

/**
 * Un gasto RECHAZADO no se contabiliza, así que no abona la cuenta (Daniel,
 * 2026-10-23). La plata sigue en manos de la persona: si el gasto se repudia,
 * lo que debe no baja.
 *
 * **Solo se filtran los GASTOS.** Un adelanto, una devolución y un traspaso no
 * los aprueba nadie —los 8 traspasos de producción están en el `pending` por
 * omisión de la columna—, así que mirarles el estado dejaría fuera $222.150 de
 * plata que se movió con total certeza. Es la misma trampa que ya documentó
 * `computeApprovedAmount`.
 *
 * Un `pending` SÍ cuenta: el gasto ocurrió y está esperando revisión. Lo que no
 * cuenta es lo rechazado, que es una decisión tomada.
 */
const cuentaEnLaCuenta = (tipo, estado) => tipo !== 'expense' || estado !== 'rejected'

async function movimientos() {
  const [usuarios, reportes, items, traspasos, fondos, transferencias, gastosFondo] = await Promise.all([
    traer('users', 'id,full_name,rut'),
    traer('expense_reports', 'id,submitter_id,title,deleted_at,defontana_exported_at'),
    traer('expense_items', 'report_id,date,item_type,amount_clp,defontana_exported_at,transfer_id,description,deleted_at,status'),
    traer('fund_transfers', 'id,payer_report_id'),
    traer('petty_cash_funds', 'id,employee_id,name,deleted_at'),
    traer('petty_cash_transfers', 'fund_id,type,amount,transferred_at,defontana_exported_at,reference'),
    traer('petty_cash_items', 'fund_id,date,amount_clp,defontana_exported_at,description,status'),
  ])

  const porId      = (xs) => Object.fromEntries(xs.map(x => [x.id, x]))
  const reportePor = porId(reportes)
  const fondoPor   = porId(fondos)
  const pagadorDe  = Object.fromEntries(traspasos.map(t => [t.id, t.payer_report_id]))
  const persona    = porId(usuarios)

  const movs = []
  const sumar = (m) => { if (m.monto) movs.push(m) }

  for (const i of items) {
    const r = reportePor[i.report_id]
    if (!r || r.deleted_at || i.deleted_at) continue
    if (!cuentaEnLaCuenta(i.item_type, i.status)) continue
    const sentido = i.item_type === 'transfer'
      // La dirección NO es una columna: sale de quién paga el traspaso, igual
      // que `is_transfer_payer` en el export a Defontana.
      ? (pagadorDe[i.transfer_id] === r.id ? HABER : DEBE)
      : SENTIDO_ITEM[i.item_type]
    if (!sentido) continue
    sumar({
      personaId: r.submitter_id, fecha: i.date,
      documento: r.title, tipo: i.item_type, glosa: i.description ?? '',
      monto: sentido * Number(i.amount_clp ?? 0),
      // La marca de la cabecera cuenta: es el estado «legacy»
      contabilizado: !!(i.defontana_exported_at || r.defontana_exported_at),
    })
  }

  for (const t of transferencias) {
    const f = fondoPor[t.fund_id]
    if (!f || f.deleted_at) continue
    sumar({
      personaId: f.employee_id, fecha: t.transferred_at,
      documento: f.name, tipo: t.type, glosa: t.reference ?? '',
      monto: SENTIDO_TRANSFERENCIA[t.type] * Number(t.amount ?? 0),
      contabilizado: !!t.defontana_exported_at,
    })
  }

  for (const g of gastosFondo) {
    const f = fondoPor[g.fund_id]
    if (!f || f.deleted_at) continue
    if (!cuentaEnLaCuenta('expense', g.status)) continue
    sumar({
      personaId: f.employee_id, fecha: g.date,
      documento: f.name, tipo: 'expense', glosa: g.description ?? '',
      monto: HABER * Number(g.amount_clp ?? 0),
      contabilizado: !!g.defontana_exported_at,
    })
  }

  return { movs, persona }
}

// ── El libro ─────────────────────────────────────────────────────────────────

const ETIQUETA = {
  advance: 'Adelanto / reembolso al empleado',
  expense: 'Gasto rendido',
  return:  'Devolución del empleado',
  transfer: 'Traspaso entre cajas',
  disbursement: 'Entrega del fondo',
  refund_to_employee: 'Devolución al empleado',
  reimbursement_from_employee: 'Reembolso a la empresa',
}

const ancho = (...n) => n.map(wch => ({ wch }))

function main() {
  return movimientos().then(({ movs, persona }) => {
    const salida = process.argv[2] ?? path.join(process.env.USERPROFILE ?? '.', 'Desktop', 'Fondos por Rendir.xlsx')
    const wb = XLSX.utils.book_new()
    const hoy = new Date().toLocaleDateString('es-CL')

    // Agrupado por persona. Defontana PRIMERO (es la columna que el contador
    // tiene que cuadrar); la de la app al lado dice cuánta plata hay de verdad.
    const porPersona = {}
    for (const m of movs) {
      const p = (porPersona[m.personaId] ??= {
        movimientos: 0, defontana: 0, app: 0,
        adelantos: 0, recibidos: 0, gastos: 0, devoluciones: 0, pagados: 0,
      })
      p.movimientos++
      p.app += m.monto
      if (m.contabilizado) p.defontana += m.monto
      if (m.tipo === 'advance' || m.tipo === 'disbursement' || m.tipo === 'refund_to_employee') p.adelantos += m.monto
      else if (m.tipo === 'transfer') { if (m.monto > 0) p.recibidos += m.monto; else p.pagados += m.monto }
      else if (m.tipo === 'return' || m.tipo === 'reimbursement_from_employee') p.devoluciones += m.monto
      else p.gastos += m.monto
    }

    /* Van TODOS los que tuvieron movimiento, incluidos los que quedaron en cero
       (Daniel, 2026-10-23): para cuadrar contra el mayor hace falta ver que una
       persona pasó por la cuenta y cerró, no que no aparezca. Una fila ausente
       y una en cero dicen cosas distintas. */
    const filas = Object.entries(porPersona)
      .map(([id, p]) => ({ id, nombre: persona[id]?.full_name ?? '(sin nombre)', rut: persona[id]?.rut ?? '', ...p }))
      .sort((a, b) => b.defontana - a.defontana || a.nombre.localeCompare(b.nombre, 'es'))

    // ── Hoja 1: saldo por empleado ──────────────────────────────────────────
    const h1 = [
      ['FONDOS POR RENDIR — saldo por empleado'],
      [`Generado el ${hoy}. Excluye documentos en la papelera.`],
      ['Saldo DEUDOR (+): la empresa le entregó plata.  Saldo ACREEDOR (−): el empleado rindió o devolvió de más.'],
      [],
      ['RUT', 'Empleado', 'Movimientos', 'Saldo Defontana', 'Saldo App', 'Diferencia', 'Condición', 'Saldo inicial (completar)', 'Saldo final'],
    ]
    const PRIMERA = h1.length + 1
    for (const f of filas) {
      h1.push([f.rut, f.nombre, f.movimientos, f.defontana, f.app, f.app - f.defontana,
               f.defontana === 0 ? 'Cuadrado' : f.defontana > 0 ? 'Deudor' : 'Acreedor', null, null])
    }
    const ULTIMA = h1.length
    h1.push(['', 'TOTAL', null, null, null, null, '', null, null])

    const ws1 = XLSX.utils.aoa_to_sheet(h1)
    /* Una celda con fórmula necesita TAMBIÉN un valor cacheado: el build libre
       de SheetJS descarta al escribir las celdas que solo traen `f`, y la
       columna quedaba vacía sin ningún error. El valor que se cachea es el que
       la fórmula da hoy (con el saldo inicial todavía en blanco), así que la
       planilla ya se lee bien antes de que Excel recalcule. */
    const formula = (celda, f, v) => { ws1[celda] = { t: 'n', f, v } }

    // D = Defontana · E = App · F = diferencia · H = saldo inicial · I = saldo final
    // El saldo final se recalcula solo cuando Daniel complete la columna H
    filas.forEach((f, i) => formula(`I${PRIMERA + i}`, `H${PRIMERA + i}+D${PRIMERA + i}`, f.defontana))

    const suma  = (f) => filas.reduce((s, x) => s + f(x), 0)
    const tot   = ULTIMA + 1
    const sumas = {
      C: suma(f => f.movimientos),
      D: suma(f => f.defontana),
      E: suma(f => f.app),
      F: suma(f => f.app - f.defontana),
      H: 0,
      I: suma(f => f.defontana),
    }
    for (const [col, v] of Object.entries(sumas)) {
      formula(`${col}${tot}`, `SUM(${col}${PRIMERA}:${col}${ULTIMA})`, v)
    }
    ws1['!cols'] = ancho(14, 28, 12, 16, 16, 14, 11, 24, 16)
    XLSX.utils.book_append_sheet(wb, ws1, 'Saldo por empleado')

    // ── Hoja 2: composición (lo contabilizado) ──────────────────────────────
    const h2 = [
      ['COMPOSICIÓN DEL SALDO — solo movimientos ya contabilizados en Defontana'],
      ['El Debe aumenta lo que la persona tiene en mano; el Haber lo baja.'],
      [],
      ['RUT', 'Empleado', 'Adelantos (debe)', 'Traspasos recibidos (debe)',
       'Gastos rendidos (haber)', 'Devoluciones (haber)', 'Traspasos pagados (haber)', 'Saldo'],
    ]
    const compPor = {}
    for (const m of movs) {
      if (!m.contabilizado) continue
      const c = (compPor[m.personaId] ??= { adelantos: 0, recibidos: 0, gastos: 0, devoluciones: 0, pagados: 0, saldo: 0 })
      c.saldo += m.monto
      if (m.tipo === 'advance' || m.tipo === 'disbursement' || m.tipo === 'refund_to_employee') c.adelantos += m.monto
      else if (m.tipo === 'transfer') { if (m.monto > 0) c.recibidos += m.monto; else c.pagados += m.monto }
      else if (m.tipo === 'return' || m.tipo === 'reimbursement_from_employee') c.devoluciones += m.monto
      else c.gastos += m.monto
    }
    for (const f of filas) {
      const c = compPor[f.id]
      if (!c) continue
      h2.push([f.rut, f.nombre, c.adelantos, c.recibidos, c.gastos, c.devoluciones, c.pagados, c.saldo])
    }
    const ws2 = XLSX.utils.aoa_to_sheet(h2)
    ws2['!cols'] = ancho(14, 28, 17, 24, 22, 20, 23, 15)
    XLSX.utils.book_append_sheet(wb, ws2, 'Composición')

    // ── Hoja 3: movimiento por mes ──────────────────────────────────────────
    const meses = {}
    for (const m of movs) {
      const mes = (m.fecha ?? '').slice(0, 7)
      if (!mes) continue
      const x = (meses[mes] ??= { debeD: 0, haberD: 0, debeA: 0, haberA: 0 })
      if (m.contabilizado) { if (m.monto > 0) x.debeD += m.monto; else x.haberD += m.monto }
      if (m.monto > 0) x.debeA += m.monto; else x.haberA += m.monto
    }
    const h3 = [
      ['MOVIMIENTO POR MES'],
      ['El saldo acumulado NO incluye el saldo inicial anterior a la app: hay que sumarlo aparte.'],
      [],
      ['Mes', 'Debe (Defontana)', 'Haber (Defontana)', 'Variación', 'Acumulado',
       '', 'Debe (App)', 'Haber (App)', 'Variación', 'Acumulado'],
    ]
    let accD = 0, accA = 0
    for (const mes of Object.keys(meses).sort()) {
      const x = meses[mes]
      accD += x.debeD + x.haberD
      accA += x.debeA + x.haberA
      h3.push([mes, x.debeD, x.haberD, x.debeD + x.haberD, accD, '', x.debeA, x.haberA, x.debeA + x.haberA, accA])
    }
    const ws3 = XLSX.utils.aoa_to_sheet(h3)
    ws3['!cols'] = ancho(10, 17, 18, 13, 14, 3, 13, 14, 13, 14)
    XLSX.utils.book_append_sheet(wb, ws3, 'Por mes')

    // ── Hoja 4: detalle, para trazar cualquier diferencia ───────────────────
    const h4 = movs
      .slice()
      .sort((a, b) => String(a.fecha).localeCompare(String(b.fecha)))
      .map(m => ({
        Fecha: m.fecha,
        Empleado: persona[m.personaId]?.full_name ?? '',
        RUT: persona[m.personaId]?.rut ?? '',
        Documento: m.documento,
        Movimiento: ETIQUETA[m.tipo] ?? m.tipo,
        Glosa: m.glosa,
        Debe: m.monto > 0 ? m.monto : null,
        Haber: m.monto < 0 ? -m.monto : null,
        'En Defontana': m.contabilizado ? 'Sí' : 'No',
      }))
    const ws4 = XLSX.utils.json_to_sheet(h4)
    ws4['!cols'] = ancho(12, 26, 14, 40, 30, 36, 13, 13, 13)
    XLSX.utils.book_append_sheet(wb, ws4, 'Detalle')

    XLSX.writeFile(wb, salida)

    const totD = filas.reduce((s, f) => s + f.defontana, 0)
    const totA = filas.reduce((s, f) => s + f.app, 0)
    console.log(`Escrito: ${salida}`)
    const conSaldo = filas.filter(f => f.defontana !== 0 || f.app !== 0).length
    console.log(`  ${movs.length} movimientos · ${filas.length} empleados (${conSaldo} con saldo, ${filas.length - conSaldo} cuadrados)`)
    console.log(`  Saldo Defontana: ${totD.toLocaleString('es-CL')}`)
    console.log(`  Saldo App:       ${totA.toLocaleString('es-CL')}`)
    console.log(`  Diferencia:      ${(totA - totD).toLocaleString('es-CL')} (lo que falta contabilizar)`)
  })
}

main().catch(e => { console.error(e); process.exit(1) })
