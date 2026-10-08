'use client'

import { useState, useMemo, useCallback, useEffect } from 'react'
import { Download, FileSpreadsheet } from 'lucide-react'
import { getUnifiedReportItems } from '@/actions/reports'
import { computeUnifiedKpis, SOURCE_LABELS, SOURCE_COLORS, MOVEMENT_LABELS } from '@/lib/report-helpers'
import { formatCLP, formatDate } from '@/lib/utils'
import type { ReportFilterOptions, UnifiedReportItem } from '@/lib/report-helpers'
import { BarraFiltros } from '@/components/filtros/BarraFiltros'
import { Vistas } from '@/components/filtros/Vistas'
import { clavesPuestas, resumen, type Valores } from '@/lib/filtros/dimensiones'
import { depurarVista, type Vista } from '@/lib/filtros/vistas'
import { aplicarFiltroItems, dimensionesDeInformes } from '@/lib/filtro-items'
import { fechaEnChile } from '@/lib/filtro-documentos'
import { listarVistas, crearVista, borrarVista } from '@/actions/vistas-filtro'

// ─── Constantes ───────────────────────────────────────────────────────────────

const CURRENT_YEAR = new Date().getFullYear()

// ─── Props ────────────────────────────────────────────────────────────────────

interface Props {
  filterOptions: ReportFilterOptions
}

// ─── Component ───────────────────────────────────────────────────────────────

export function InformesClient({ filterOptions }: Props) {
  /* Un solo juego de valores para las doce dimensiones. El panel de 378
     líneas que vivía acá se borró: ver la barra, más abajo. */
  const [valores, setValores] = useState<Valores>({})
  const [vistas,  setVistas]  = useState<Vista[]>([])
  const [hoy] = useState(() => fechaEnChile())

  /* El ALCANCE es lo único que decide cuántas filas viajan, así que es lo
     único que vuelve al servidor. Por omisión, el año en curso. */
  const [alcance, setAlcance] = useState<number | 'todo'>(CURRENT_YEAR)
  const [crudos,  setCrudos]  = useState<UnifiedReportItem[]>([])
  const [cargando, setCargando] = useState(true)
  const [error,    setError]    = useState<string | null>(null)
  const [exporting, setExporting] = useState<'excel' | 'pdf' | null>(null)

  const traer = useCallback(async (a: number | 'todo') => {
    setCargando(true)
    setError(null)
    try {
      const periodo = a === 'todo'
        ? {}
        : { desde: `${a}-01-01`, hasta: `${a}-12-31` }
      const { items } = await getUnifiedReportItems(periodo)
      setCrudos(items)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo traer el informe')
    } finally {
      setCargando(false)
    }
  }, [])

  /* Mismo patrón que /admin/proyectos: el useCallback no tiene dependencias,
     así que entra en la lista sin provocar ningún ciclo. */
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { traer(alcance) }, [alcance, traer])
  useEffect(() => { listarVistas('informes').then(setVistas).catch(() => {}) }, [])

  /* Las obras que aparecen en lo traído. Con el catálogo vacío el chip de
     Proyecto no se dibuja: su única opción sería «Sin proyecto». */
  const proyectos = useMemo(() => [...new Map(
    crudos.filter(i => i.proyecto_id)
      .map(i => [i.proyecto_id!, { id: i.proyecto_id!, etiqueta: i.proyecto_numero ?? i.proyecto_id! }]),
  ).values()].sort((a, b) => a.etiqueta.localeCompare(b.etiqueta)), [crudos])

  const dimensiones = useMemo(() => dimensionesDeInformes({
    empleados:     filterOptions.employees.map(e => ({ id: e.id, etiqueta: e.name })),
    categorias:    filterOptions.categories.map(c => ({ id: c.id, etiqueta: c.name })),
    departamentos: filterOptions.departments,
    proyectos,
  }), [filterOptions, proyectos])

  const vistasLimpias = useMemo(
    () => vistas.map(v => ({ ...v, filtro: depurarVista(v.filtro, dimensiones) })),
    [vistas, dimensiones])

  /* Las doce dimensiones, en el navegador: cada chip responde al instante
     porque no hay viaje de por medio. */
  const items = useMemo(() => aplicarFiltroItems(crudos, valores, hoy), [crudos, valores, hoy])
  const kpis  = useMemo(() => computeUnifiedKpis(items), [items])

  const cuantos = useCallback(
    (v: Valores) => aplicarFiltroItems(crudos, v, hoy).length,
    [crudos, hoy])

  const hasFiltro = clavesPuestas(dimensiones, valores).length > 0

  // ── Exportar ─────────────────────────────────────────────────────────────
  async function handleExport(format: 'excel' | 'pdf') {
    setExporting(format)
    try {
      if (format === 'excel') {
        const { exportUnifiedToExcel } = await import('@/lib/export/excel')
        exportUnifiedToExcel(items, kpis, 'informe-gastos')
      } else {
        const { exportUnifiedToPDF } = await import('@/lib/export/pdf')
        exportUnifiedToPDF(items, kpis, 'Informe Gastos')
      }
    } finally {
      setExporting(null)
    }
  }

  const hasResults = !cargando

  return (
    <div className="space-y-5">
      {/* Encabezado */}
      <div>
        <h1 className="font-display font-extrabold text-2xl tracking-tight tor-on-gradient">Informes</h1>
        <p className="text-sm tor-on-gradient-soft mt-1">Vista unificada de gastos: rendiciones, caja chica, históricos</p>
      </div>

      {/* Las vistas guardadas: sobre el degradado, que son navegación */}
      <Vistas
        vistas={vistasLimpias}
        dimensiones={dimensiones}
        valores={valores}
        onElegir={setValores}
        contar={cuantos}
        onGuardar={async (nombre, v) => {
          const { errores } = await crearVista('informes', nombre, v)
          if (errores?.length) return errores
          setVistas(await listarVistas('informes'))
          return []
        }}
        onBorrar={async (id) => {
          const { error: err } = await borrarVista(id)
          if (err) return err
          setVistas(await listarVistas('informes'))
          return null
        }}
        puedeEditar
      />

      <BarraFiltros
        dimensiones={dimensiones}
        valores={valores}
        onCambio={setValores}
        contar={cuantos}
        sustantivo={['ítem', 'ítems']}
        resumen={hasFiltro
          ? `${items.length} de ${crudos.length} · ${resumen(dimensiones, valores) ?? ''}`
          : null}
      />

      {/* El alcance: lo ÚNICO que vuelve al servidor, con su espera a la vista */}
      <div className="flex items-center gap-2 flex-wrap card-meta tor-on-gradient-soft">
        <span>
          {cargando ? 'Trayendo…' : `${crudos.length.toLocaleString('es-CL')} ítems de `}
          {!cargando && <strong className="font-semibold">{alcance === 'todo' ? 'todo el histórico' : alcance}</strong>}
        </span>
        <label className="inline-flex items-center gap-1.5">
          <span className="sr-only">Qué período traer</span>
          <select
            value={String(alcance)}
            onChange={e => setAlcance(e.target.value === 'todo' ? 'todo' : Number(e.target.value))}
            disabled={cargando}
            className="campo-compacto bg-white/90"
          >
            {[CURRENT_YEAR, CURRENT_YEAR - 1, CURRENT_YEAR - 2].map(a => (
              <option key={a} value={a}>{a}</option>
            ))}
            <option value="todo">Todo el histórico</option>
          </select>
        </label>
      </div>

      {/* Error */}
      {error && (
        <div className="bg-danger-50 border border-danger-200 rounded-card p-4 text-sm text-danger-700">{error}</div>
      )}

      {/* Resultados */}
      {hasResults && kpis && (
        <div className="space-y-4">
          {/* KPI cards — el gasto es el número principal; adelantos, devoluciones
              y traspasos son movimientos de fondos y no se suman al gasto */}
          <div className="grid grid-cols-2 xl:grid-cols-4 gap-3">
            <div className="hoja p-4">
              <p className="text-xs text-ink-500 font-medium">Gastos aprobados</p>
              <p className="text-2xl font-mono-amount font-bold text-success-600 mt-1">{formatCLP(kpis.byMovement.expense.approvedCLP)}</p>
              <p className="text-xs text-ink-400 mt-0.5">{kpis.byMovement.expense.count.toLocaleString('es-CL')} ítems de gasto</p>
            </div>
            <div className="hoja p-4">
              <p className="text-xs text-ink-500 font-medium mb-2">Movimientos de fondos</p>
              <div className="space-y-1">
                {(['advance', 'return', 'transfer'] as const)
                  .filter(m => kpis.byMovement[m].count > 0)
                  .map(m => (
                    <div key={m} className="flex justify-between text-xs">
                      <span className="text-ink-500">{MOVEMENT_LABELS[m]}</span>
                      <span className="font-mono-amount text-ink-600">
                        {kpis.byMovement[m].count} · {formatCLP(kpis.byMovement[m].totalCLP)}
                      </span>
                    </div>
                  ))}
                {(['advance', 'return', 'transfer'] as const).every(m => kpis.byMovement[m].count === 0) && (
                  <p className="text-xs text-ink-400">Sin movimientos en el período</p>
                )}
              </div>
              <p className="text-[11px] text-ink-400 mt-2 leading-tight">No se suman al gasto</p>
            </div>
            <div className="hoja p-4">
              <p className="text-xs text-ink-500 font-medium">Total ítems</p>
              <p className="text-2xl font-mono-amount font-bold text-ink-900 mt-1">{kpis.totalItems.toLocaleString('es-CL')}</p>
              <p className="text-xs text-ink-400 mt-0.5">{formatCLP(kpis.totalCLP)} en total</p>
            </div>
            <div className="hoja p-4">
              <p className="text-xs text-ink-500 font-medium mb-2">Por fuente</p>
              <div className="space-y-1">
                {(Object.entries(kpis.bySource) as [keyof typeof kpis.bySource, { count: number; totalCLP: number }][])
                  .filter(([, d]) => d.count > 0)
                  .map(([src, d]) => (
                    /* `gap`, `min-w-0 truncate` en la etiqueta y `shrink-0` en la
                       cifra: sin eso ninguno de los dos cede y la fila empuja la
                       página a lo ancho (5 px a 768, medido). Estaba latente
                       desde siempre; se vio recién cuando los KPIs dejaron de
                       esperar a que alguien apretara «Generar informe». */
                    <div key={src} className="flex justify-between items-baseline gap-2 text-xs">
                      <span className={`px-1.5 py-0.5 rounded min-w-0 truncate ${SOURCE_COLORS[src].bg} ${SOURCE_COLORS[src].text} font-medium`}>
                        {SOURCE_LABELS[src]}
                      </span>
                      <span className="font-mono-amount text-ink-600 shrink-0">{d.count} · {formatCLP(d.totalCLP)}</span>
                    </div>
                  ))}
              </div>
            </div>
          </div>

          {/* Acciones de export */}
          {items!.length > 0 && (
            <div className="flex justify-end gap-2">
              <button
                onClick={() => handleExport('excel')}
                disabled={!!exporting}
                className="btn-secundario flex items-center gap-2 px-4 py-2 text-sm bg-white"
              >
                <FileSpreadsheet size={15} />
                {exporting === 'excel' ? 'Generando…' : 'Excel'}
              </button>
              <button
                onClick={() => handleExport('pdf')}
                disabled={!!exporting}
                className="btn-secundario flex items-center gap-2 px-4 py-2 text-sm bg-white"
              >
                <Download size={15} />
                {exporting === 'pdf' ? 'Generando…' : 'PDF'}
              </button>
            </div>
          )}

          {/* Tabla */}
          {items!.length === 0 ? (
            <div className="hoja p-10 text-center text-ink-400 text-sm">
              No hay ítems que coincidan con los filtros seleccionados.
            </div>
          ) : (
            <div className="hoja overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-ink-100 text-[13px] text-ink-500 font-semibold">
                      <th className="text-left px-4 py-3">Fuente</th>
                      <th className="text-left px-4 py-3">Empleado</th>
                      <th className="text-left px-4 py-3">Depto</th>
                      <th className="text-left px-4 py-3">Fondo/Rendición</th>
                      <th className="text-left px-4 py-3">Categoría</th>
                      <th className="text-left px-4 py-3">Descripción</th>
                      <th className="text-left px-4 py-3">Proveedor</th>
                      <th className="text-left px-4 py-3">Fecha</th>
                      <th className="text-right px-4 py-3">Monto CLP</th>
                      <th className="text-left px-4 py-3">Estado</th>
                    </tr>
                  </thead>
                  <tbody>
                    {items!.map((item, idx) => (
                      <tr key={item.item_id} className={idx % 2 === 0 ? 'bg-white' : 'bg-ink-50/40'}>
                        <td className="px-4 py-2.5">
                          <span className={`px-1.5 py-0.5 rounded text-xs font-medium ${SOURCE_COLORS[item.source].bg} ${SOURCE_COLORS[item.source].text}`}>
                            {SOURCE_LABELS[item.source]}
                          </span>
                        </td>
                        <td className="px-4 py-2.5 text-ink-800 font-medium">{item.employee_name}</td>
                        <td className="px-4 py-2.5 text-ink-500">{item.department ?? '—'}</td>
                        <td className="px-4 py-2.5 text-ink-700 max-w-[160px] truncate" title={item.parent_title}>{item.parent_title}</td>
                        <td className="px-4 py-2.5">
                          {item.category_name ? (
                            <span className="text-xs text-ink-600" style={item.category_color ? { borderLeft: `3px solid ${item.category_color}`, paddingLeft: 6 } : undefined}>
                              {item.category_name}
                            </span>
                          ) : <span className="text-ink-300">—</span>}
                        </td>
                        <td className="px-4 py-2.5 text-ink-700 max-w-[180px] truncate" title={item.description}>{item.description}</td>
                        <td className="px-4 py-2.5 text-ink-500">{item.merchant ?? '—'}</td>
                        <td className="px-4 py-2.5 text-ink-500 whitespace-nowrap">{formatDate(item.date)}</td>
                        <td className="px-4 py-2.5 text-right font-mono-amount text-ink-800">{formatCLP(item.amount_clp)}</td>
                        <td className="px-4 py-2.5">
                          <span className={`px-2 py-0.5 rounded-item text-xs font-medium ${
                            item.item_status === 'approved' ? 'bg-success-100 text-success-700' :
                            item.item_status === 'rejected' ? 'bg-danger-100 text-danger-700' :
                            'bg-warning-100 text-warning-700'
                          }`}>
                            {item.item_status === 'approved' ? 'Aprobado' : item.item_status === 'rejected' ? 'Rechazado' : 'Pendiente'}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="border-t border-ink-100 px-4 py-3 flex justify-between text-xs text-ink-500">
                <span>{items!.length.toLocaleString('es-CL')} ítem{items!.length !== 1 ? 's' : ''}</span>
                <span className="font-mono-amount font-semibold text-ink-800">Total: {formatCLP(kpis.totalCLP)}</span>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
