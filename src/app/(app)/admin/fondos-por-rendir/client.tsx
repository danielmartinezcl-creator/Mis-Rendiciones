'use client'

import { useMemo, useState } from 'react'
import { Download, Pencil, Check, X, CalendarDays, Info } from 'lucide-react'
import { guardarSaldoInicial, guardarFechaDeCorte, type DatosFxR } from '@/actions/fondos-por-rendir'
import { saldosPorEmpleado, porMes, condicion } from '@/lib/fondos-por-rendir'
import { exportFondosPorRendir } from '@/lib/export/fondos-por-rendir-excel'
import { formatCLP, formatDate } from '@/lib/utils'
import { useDialogos } from '@/components/ui/Dialogos'
import { mensajeDeError } from '@/lib/errores'

/**
 * Un monto de la cuenta. A nivel de módulo y no dentro del render: un
 * componente creado en cada render se remonta entero cada vez, y la regla
 * `react-hooks/static-components` lo marca como error.
 *
 * El cero se dibuja como «—»: en una planilla con 23 filas y 17 cuadradas, una
 * columna de ceros es ruido que tapa los cuatro números que importan.
 */
function Monto({ v, fuerte = false }: { v: number; fuerte?: boolean }) {
  return (
    <span className={`font-mono-amount tabular-nums ${
      v === 0 ? 'text-ink-300' : v < 0 ? 'text-danger-600' : fuerte ? 'text-ink-900 font-bold' : 'text-ink-800'
    }`}>
      {v === 0 ? '—' : formatCLP(v)}
    </span>
  )
}

/**
 * La cuenta FONDOS POR RENDIR: saldo total y composición por empleado.
 *
 * Defontana va PRIMERO (Daniel, 2026-10-22): es la columna que el contador
 * tiene que cuadrar contra el mayor. La de la app al lado dice cuánta plata hay
 * de verdad en manos de cada uno, y la diferencia entre las dos es, exactamente,
 * lo que falta exportar — así el informe sirve además como control.
 *
 * Toda la aritmética vive en `src/lib/fondos-por-rendir.ts`, que es lo que
 * cubren las pruebas y lo que usa la exportación: acá no se suma nada a mano.
 */
export function FondosPorRendirClient({ inicial }: { inicial: DatosFxR }) {
  const { avisar } = useDialogos()
  const [personas, setPersonas]   = useState(inicial.personas)
  const [fechaCorte, setFecha]    = useState(inicial.fechaCorte)
  const [editando, setEditando]   = useState<string | null>(null)
  const [borrador, setBorrador]   = useState('')
  const [editaFecha, setEditaFecha] = useState(false)
  const [guardando, setGuardando] = useState(false)
  const [soloConSaldo, setSoloConSaldo] = useState(false)

  const nombreDe = useMemo(
    () => Object.fromEntries(personas.map(p => [p.id, p])),
    [personas],
  )

  const saldos = useMemo(() => {
    const inicialDe = Object.fromEntries(personas.map(p => [p.id, p.saldoInicial ?? 0]))
    return saldosPorEmpleado(inicial.movimientos)
      .map(s => ({
        ...s,
        nombre:  nombreDe[s.personaId]?.nombre ?? '(sin nombre)',
        rut:     nombreDe[s.personaId]?.rut ?? '',
        // El saldo inicial se suma a la columna que el contador cuadra
        inicial: inicialDe[s.personaId] ?? 0,
        final:   (inicialDe[s.personaId] ?? 0) + s.defontana,
      }))
      .sort((a, b) => b.final - a.final || a.nombre.localeCompare(b.nombre, 'es'))
  }, [inicial.movimientos, personas, nombreDe])

  const visibles = soloConSaldo ? saldos.filter(s => s.final !== 0 || s.app !== 0) : saldos
  const meses    = useMemo(() => porMes(inicial.movimientos, true), [inicial.movimientos])

  const total = saldos.reduce((t, s) => ({
    defontana: t.defontana + s.defontana,
    app:       t.app       + s.app,
    inicial:   t.inicial   + s.inicial,
    final:     t.final     + s.final,
  }), { defontana: 0, app: 0, inicial: 0, final: 0 })

  const sinCargar = saldos.filter(s => (nombreDe[s.personaId]?.saldoInicial ?? null) === null).length

  async function guardarSaldo(personaId: string) {
    const limpio = borrador.trim().replace(/\./g, '').replace(',', '.')
    const monto  = limpio === '' ? null : Number(limpio)
    if (monto !== null && !Number.isFinite(monto)) { avisar('Ese no es un número', 'error'); return }

    setGuardando(true)
    try {
      const r = await guardarSaldoInicial(personaId, monto)
      if (r.error) { avisar(r.error, 'error'); return }
      setPersonas(ps => ps.map(p => p.id === personaId ? { ...p, saldoInicial: monto } : p))
      setEditando(null)
    } catch (e) {
      avisar(mensajeDeError(e, 'No se pudo guardar el saldo inicial'), 'error')
    } finally { setGuardando(false) }
  }

  async function guardarCorte(fecha: string) {
    setGuardando(true)
    try {
      const r = await guardarFechaDeCorte(fecha || null)
      if (r.error) { avisar(r.error, 'error'); return }
      setFecha(fecha || null)
      setEditaFecha(false)
    } catch (e) {
      avisar(mensajeDeError(e, 'No se pudo guardar la fecha de corte'), 'error')
    } finally { setGuardando(false) }
  }

  return (
    <div className="max-w-6xl mx-auto space-y-4">

      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="font-display text-2xl font-bold text-white">Fondos por Rendir</h1>
          <p className="card-label text-white/70 mt-0.5">
            Saldo de la cuenta y su composición por empleado
          </p>
        </div>
        <button
          onClick={() => exportFondosPorRendir({
            movimientos: inicial.movimientos, saldos, meses, fechaCorte,
          })}
          className="btn-primario flex items-center gap-2"
        >
          <Download size={16} aria-hidden /> Exportar a Excel
        </button>
      </div>

      {/* El saldo, en tres cifras */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        {[
          { t: 'Saldo según Defontana', v: total.final,
            n: fechaCorte ? `Incluye el saldo inicial al ${formatDate(fechaCorte)}` : 'Sin saldo inicial cargado' },
          { t: 'Saldo según la app', v: total.app + total.inicial,
            n: 'Todo lo registrado, contabilizado o no' },
          { t: 'Falta contabilizar', v: total.app - total.defontana,
            n: 'La diferencia entre las dos columnas' },
        ].map(k => (
          <div key={k.t} className="tor-glass p-4">
            <p className="card-meta text-white/70">{k.t}</p>
            <p className="font-mono-amount text-2xl font-bold text-white mt-1 tabular-nums">
              {formatCLP(k.v)}
            </p>
            <p className="card-meta text-white/50 mt-1">{k.n}</p>
          </div>
        ))}
      </div>

      {/* La fecha de corte: sin ella el saldo inicial no significa nada */}
      <div className="hoja p-4 flex items-start gap-3 flex-wrap">
        <CalendarDays size={16} className="text-ink-400 shrink-0 mt-0.5" aria-hidden />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-ink-800">Fecha de corte del saldo inicial</p>
          <p className="card-meta text-ink-400 mt-0.5">
            Los movimientos que la app conoce se suman <strong>encima</strong> de los saldos
            iniciales. Es una sola fecha para todos: si cada saldo estuviera medido a un día
            distinto, el total no significaría nada.
          </p>
        </div>
        {editaFecha ? (
          <div className="flex items-center gap-2">
            <input type="date" defaultValue={fechaCorte ?? ''} id="fxr-corte" className="campo-compacto" />
            <button
              disabled={guardando}
              onClick={() => guardarCorte((document.getElementById('fxr-corte') as HTMLInputElement).value)}
              className="btn-primario px-3 py-1.5 text-sm disabled:opacity-50"
            >Guardar</button>
            <button onClick={() => setEditaFecha(false)} className="text-ink-400 hover:text-ink-700 text-sm">Cancelar</button>
          </div>
        ) : (
          <button onClick={() => setEditaFecha(true)} className="flex items-center gap-1.5 text-sm text-brand-600 hover:text-brand-700 shrink-0">
            <Pencil size={13} aria-hidden />
            {fechaCorte ? formatDate(fechaCorte) : 'Definir'}
          </button>
        )}
      </div>

      {sinCargar > 0 && (
        <div className="hoja p-4 bg-info-50 border border-info-200 flex items-start gap-3">
          <Info size={16} className="text-info-600 shrink-0 mt-0.5" aria-hidden />
          <p className="text-sm text-ink-700">
            <strong>{sinCargar} {sinCargar === 1 ? 'persona' : 'personas'} sin saldo inicial cargado.</strong>{' '}
            Hasta que estén, el saldo de esta pantalla solo cubre lo que pasó por la app —
            y la cuenta no arrancó en cero el día que la app empezó a registrar.
          </p>
        </div>
      )}

      {/* La composición */}
      <div className="hoja overflow-hidden">
        <div className="px-4 py-3 border-b border-ink-100 flex items-center justify-between gap-3 flex-wrap">
          <h2 className="text-sm font-semibold text-ink-800">
            Composición por empleado <span className="text-ink-400 font-normal">({visibles.length})</span>
          </h2>
          <label className="flex items-center gap-2 card-meta text-ink-500 cursor-pointer">
            <input type="checkbox" checked={soloConSaldo} onChange={e => setSoloConSaldo(e.target.checked)} />
            Ocultar los que cerraron en cero
          </label>
        </div>

        {/* En una lista, no en una tabla: seis columnas de montos no entran en
            390 px y pelear con el scroller ya salió mal en Centros de costo.
            El corte va en `lg:` porque a `md:` aparece el riel y come 256 px. */}
        <div className="hidden lg:grid grid-cols-[1.6fr_repeat(5,1fr)] gap-2 px-4 py-2 bg-ink-50 card-meta font-semibold text-ink-500">
          <span>Empleado</span>
          <span className="text-right">Saldo inicial</span>
          <span className="text-right">Movimientos</span>
          <span className="text-right">Saldo Defontana</span>
          <span className="text-right">Saldo App</span>
          <span className="text-right">Falta contabilizar</span>
        </div>

        <div className="divide-y divide-ink-50">
          {visibles.map(s => {
            const cond = condicion(s.final)
            return (
              <div key={s.personaId} className="px-4 py-3 lg:grid lg:grid-cols-[1.6fr_repeat(5,1fr)] lg:gap-2 lg:items-center">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-ink-800 truncate">{s.nombre}</p>
                  <p className="card-meta text-ink-400">
                    {s.rut || 'sin RUT'} · {s.movimientos} mov.
                    {' · '}
                    <span className={
                      cond === 'deudor' ? 'text-ink-600' : cond === 'acreedor' ? 'text-danger-600' : 'text-success-600'
                    }>
                      {cond === 'deudor' ? 'Deudor' : cond === 'acreedor' ? 'Acreedor' : 'Cuadrado'}
                    </span>
                  </p>
                </div>

                {/* Saldo inicial — editable */}
                <div className="flex lg:justify-end items-center gap-2 mt-2 lg:mt-0">
                  <span className="lg:hidden card-meta text-ink-400">Saldo inicial</span>
                  {editando === s.personaId ? (
                    <div className="flex items-center gap-1">
                      <input
                        autoFocus value={borrador} onChange={e => setBorrador(e.target.value)}
                        onKeyDown={e => { if (e.key === 'Enter') guardarSaldo(s.personaId); if (e.key === 'Escape') setEditando(null) }}
                        placeholder="0" inputMode="numeric"
                        className="campo-compacto w-28 text-right font-mono-amount"
                        aria-label={`Saldo inicial de ${s.nombre}`}
                      />
                      <button disabled={guardando} onClick={() => guardarSaldo(s.personaId)}
                        className="text-success-600 hover:text-success-700 disabled:opacity-50" aria-label="Guardar">
                        <Check size={15} aria-hidden />
                      </button>
                      <button onClick={() => setEditando(null)} className="text-ink-400 hover:text-ink-700" aria-label="Cancelar">
                        <X size={15} aria-hidden />
                      </button>
                    </div>
                  ) : (
                    <button
                      onClick={() => { setEditando(s.personaId); setBorrador(nombreDe[s.personaId]?.saldoInicial?.toString() ?? '') }}
                      className="flex items-center gap-1.5 hover:bg-ink-50 rounded-item px-1.5 py-0.5 group"
                      aria-label={`Editar el saldo inicial de ${s.nombre}`}
                    >
                      {nombreDe[s.personaId]?.saldoInicial === null
                        ? <span className="card-meta text-warning-600">sin cargar</span>
                        : <Monto v={s.inicial} />}
                      <Pencil size={11} className="text-ink-300 group-hover:text-ink-500" aria-hidden />
                    </button>
                  )}
                </div>

                <div className="flex lg:justify-end items-center gap-2 mt-1 lg:mt-0">
                  <span className="lg:hidden card-meta text-ink-400">Movimientos</span>
                  <span className="card-meta text-ink-500 tabular-nums">{s.movimientos}</span>
                </div>
                <div className="flex lg:justify-end items-center gap-2 mt-1 lg:mt-0">
                  <span className="lg:hidden card-meta text-ink-400">Saldo Defontana</span>
                  <Monto v={s.final} fuerte />
                </div>
                <div className="flex lg:justify-end items-center gap-2 mt-1 lg:mt-0">
                  <span className="lg:hidden card-meta text-ink-400">Saldo App</span>
                  <Monto v={s.inicial + s.app} />
                </div>
                <div className="flex lg:justify-end items-center gap-2 mt-1 lg:mt-0">
                  <span className="lg:hidden card-meta text-ink-400">Falta contabilizar</span>
                  <Monto v={s.diferencia} />
                </div>
              </div>
            )
          })}
        </div>

        <div className="px-4 py-3 bg-ink-50 lg:grid lg:grid-cols-[1.6fr_repeat(5,1fr)] lg:gap-2 lg:items-center">
          <span className="text-sm font-bold text-ink-800">TOTAL</span>
          <span className="hidden lg:block text-right"><Monto v={total.inicial} /></span>
          <span className="hidden lg:block text-right card-meta text-ink-500 tabular-nums">
            {inicial.movimientos.length}
          </span>
          <span className="hidden lg:block text-right"><Monto v={total.final} fuerte /></span>
          <span className="hidden lg:block text-right"><Monto v={total.inicial + total.app} /></span>
          <span className="hidden lg:block text-right"><Monto v={total.app - total.defontana} /></span>
        </div>
      </div>

      {/* El movimiento del mes, que es como se cuadra una cuenta de balance */}
      <div className="hoja overflow-hidden">
        <h2 className="text-sm font-semibold text-ink-800 px-4 py-3 border-b border-ink-100">
          Movimiento por mes <span className="text-ink-400 font-normal">· solo lo contabilizado</span>
        </h2>
        <div className="grid grid-cols-[1fr_repeat(4,1fr)] gap-2 px-4 py-2 bg-ink-50 card-meta font-semibold text-ink-500">
          <span>Mes</span>
          <span className="text-right">Debe</span>
          <span className="text-right">Haber</span>
          <span className="text-right">Variación</span>
          <span className="text-right">Acumulado</span>
        </div>
        <div className="divide-y divide-ink-50">
          {meses.map(m => (
            <div key={m.mes} className="grid grid-cols-[1fr_repeat(4,1fr)] gap-2 px-4 py-2 items-center">
              <span className="text-sm text-ink-700 font-mono-amount">{m.mes}</span>
              <span className="text-right"><Monto v={m.debe} /></span>
              <span className="text-right"><Monto v={m.haber} /></span>
              <span className="text-right"><Monto v={m.variacion} /></span>
              <span className="text-right"><Monto v={m.acumulado + total.inicial} fuerte /></span>
            </div>
          ))}
        </div>
        <p className="px-4 py-3 card-meta text-ink-400 border-t border-ink-100">
          El acumulado incluye el saldo inicial de todos ({formatCLP(total.inicial)}).
        </p>
      </div>

    </div>
  )
}
