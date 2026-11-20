'use client'

import { useState, useEffect, useMemo } from 'react'
import Link from 'next/link'
import { ArrowLeft, Paperclip, Pencil, AlertTriangle, Download, Undo2 } from 'lucide-react'
import {
  getRendicionParaAdmin, getOrgCategories, reclassifyExpenseItem, getCostCenters,
  bulkUpdateExpenseItemsCostCenter, revertDefontanaExport, type RendicionParaAdmin,
} from '@/actions/admin'
import { getApprovalAttachments } from '@/actions/approval-attachments'
import { InsigniaEstado } from '@/components/ui/InsigniaEstado'
import { DescargarComprobante } from '@/components/ui/DescargarComprobante'
import { RecorridoFondo } from '@/components/petty-cash/RecorridoFondo'
import { ApprovalAttachments } from '@/components/approvals/ApprovalAttachments'
import { RevertDefontanaDialog } from '@/components/ui/RevertDefontanaDialog'
import { VisorComprobantes, type Comprobante } from '@/components/ui/VisorComprobantes'
import { useDialogos } from '@/components/ui/Dialogos'
import { construirRecorridoRendicion, gastosSinCategoria, etiquetaDeHistorial } from '@/lib/detalle-rendicion'
import { formatCLP, formatDate, formatDisplayTitle } from '@/lib/utils'
import { mensajeDeError } from '@/lib/errores'
import type { ReportStatus } from '@/lib/constants'

/**
 * El detalle de una rendición para el admin, con la estructura del detalle de un
 * fondo de caja chica (diseño A elegido por Daniel el 2026-11-20): a la izquierda
 * la plata y los gastos, a la derecha el registro. Le suma el visor del diseño B
 * —la boleta en grande sin bajar nada— y el aviso del C cuando hay gastos sin
 * categoría, que es la que decide su cuenta contable.
 *
 * Es solo para mirar y reclasificar: aprobar, cargar y autorizar siguen en sus
 * pantallas (el admin configura, no opera).
 */

type ApprovalAtt = Awaited<ReturnType<typeof getApprovalAttachments>>[number]
type Categoria   = Awaited<ReturnType<typeof getOrgCategories>>[number]
type Centro      = Awaited<ReturnType<typeof getCostCenters>>[number]

const TIPO_MOVIMIENTO: Record<string, string> = {
  advance:  'Adelanto',
  return:   'Devolución',
  transfer: 'Traspaso',
}

function fechaCorta(iso: string | null) {
  return iso ? formatDate(iso) : null
}

export function RendicionAdminClient({ id, inicial }: { id: string; inicial: RendicionParaAdmin }) {
  const { avisar } = useDialogos()
  const [datos, setDatos] = useState(inicial)
  const { reporte, persona, gastos, saldo, historial } = datos

  const [respaldos, setRespaldos]         = useState<ApprovalAtt[]>([])
  const [categorias, setCategorias]       = useState<Categoria[]>([])
  const [reclasificando, setReclasificando] = useState<string | null>(null)
  const [guardando, setGuardando]         = useState(false)
  const [centros, setCentros]             = useState<Centro[]>([])
  const [cambiandoCC, setCambiandoCC]     = useState(false)
  const [ccElegido, setCcElegido]         = useState('')
  const [revirtiendo, setRevirtiendo]     = useState(false)
  const [comprimiendo, setComprimiendo]   = useState(false)
  const [visor, setVisor]                 = useState<number | null>(null)

  async function recargar() {
    const d = await getRendicionParaAdmin(id)
    if (d) setDatos(d)
  }

  async function cargarRespaldos() {
    setRespaldos(await getApprovalAttachments({ reportId: id }))
  }

  useEffect(() => {
    /* Carga inicial de los respaldos; el resto llega del servidor con la página. */
    // eslint-disable-next-line react-hooks/set-state-in-effect
    cargarRespaldos()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id])

  const recorrido = useMemo(() => construirRecorridoRendicion({
    status:       reporte.status,
    createdAt:    reporte.created_at,
    submittedAt:  reporte.submitted_at,
    reimbursedAt: reporte.reimbursed_at,
    cadenaConN2:  reporte.cadena_con_n2,
    historial,
  }), [reporte, historial])

  const sinCategoria = gastosSinCategoria(gastos)

  // El visor recorre los comprobantes, no los gastos: uno con dos archivos son dos paradas
  const comprobantes: Comprobante[] = gastos.flatMap(g => g.adjuntos.map(a => ({
    url:     a.url,
    tipo:    a.tipo,
    nombre:  a.nombre,
    gasto:   g.description,
    detalle: [formatCLP(g.amount_clp), g.category_name ?? 'Sin categoría', g.merchant].filter(Boolean).join(' · '),
  })))
  const indiceDe = new Map<string, number>()
  let n = 0
  for (const g of gastos) for (const a of g.adjuntos) indiceDe.set(a.id, n++)

  async function empezarReclasificar(itemId: string) {
    if (!categorias.length) {
      const todas = await getOrgCategories()
      setCategorias(todas.filter(c => c.is_active))
    }
    setReclasificando(itemId)
    document.getElementById(`gasto-${itemId}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' })
  }

  async function reclasificar(itemId: string, categoriaId: string) {
    setGuardando(true)
    try {
      await reclassifyExpenseItem(itemId, categoriaId)
      setReclasificando(null)
      await recargar()
    } catch (err) {
      avisar(mensajeDeError(err, 'No se pudo cambiar la categoría'), 'error')
    } finally {
      setGuardando(false)
    }
  }

  async function abrirCambioCC() {
    if (!centros.length) setCentros((await getCostCenters()).filter(c => c.imputable))
    setCambiandoCC(true)
  }

  async function guardarCC() {
    setGuardando(true)
    try {
      await bulkUpdateExpenseItemsCostCenter(id, ccElegido || null)
      setCambiandoCC(false)
      avisar('Centro de costo actualizado en todos los gastos')
      await recargar()
    } catch (err) {
      avisar(mensajeDeError(err, 'No se pudo cambiar el centro de costo'), 'error')
    } finally {
      setGuardando(false)
    }
  }

  async function bajarZip() {
    const conUrl = gastos.flatMap(g => g.adjuntos.filter(a => a.url).map(a => ({ g, a })))
    if (!conUrl.length) { avisar('Esta rendición no tiene comprobantes adjuntos.'); return }
    setComprimiendo(true)
    try {
      const JSZip = (await import('jszip')).default
      const zip = new JSZip()
      const bajados = await Promise.allSettled(conUrl.map(async ({ g, a }) => {
        const blob = await (await fetch(a.url!)).blob()
        const ext  = a.nombre.split('.').pop() ?? 'jpg'
        const base = (g.merchant || g.description || 'gasto').replace(/[^a-zA-Z0-9À-ɏ -]/g, '_').slice(0, 30).trim()
        return { nombre: `${g.date ?? 'sin-fecha'}_${base}_${a.id.slice(0, 4)}.${ext}`, blob }
      }))
      for (const b of bajados) if (b.status === 'fulfilled') zip.file(b.value.nombre, b.value.blob)
      const archivo = await zip.generateAsync({ type: 'blob' })
      const link = document.createElement('a')
      link.href = URL.createObjectURL(archivo)
      link.download = `comprobantes_${reporte.title.replace(/[^a-zA-Z0-9]/g, '_').slice(0, 40)}.zip`
      link.click()
      URL.revokeObjectURL(link.href)
    } finally {
      setComprimiendo(false)
    }
  }

  async function revertir(motivo: string) {
    await revertDefontanaExport([id], motivo)
    setRevirtiendo(false)
    await recargar()
  }

  const pendiente = saldo.pendiente
  const lineaSaldo =
    pendiente > 0 ? <>falta reembolsar <b className="text-warning-200">{formatCLP(pendiente)}</b></> :
    pendiente < 0 ? <>tiene que devolver <b className="text-warning-200">{formatCLP(-pendiente)}</b></> :
                    <>saldada</>
  const aprobados = gastos.filter(g => g.status === 'approved').length

  return (
    <div className="max-w-2xl lg:max-w-6xl mx-auto space-y-5">
      {/* Encabezado: la PERSONA es el título, como en el detalle del fondo */}
      <div className="flex items-start gap-3">
        <Link href="/admin/reports" aria-label="Volver a Rendiciones"
          className="p-2 rounded-item text-white/70 hover:text-white hover:bg-white/10 transition-colors mt-0.5">
          <ArrowLeft size={18} />
        </Link>
        <div className="flex-1 min-w-0">
          <p className="text-xs font-semibold uppercase tracking-[.16em] leading-snug tor-on-gradient-soft">
            {formatDisplayTitle(reporte.title)}
          </p>
          <div className="flex items-center gap-2 flex-wrap mt-1.5">
            <h1 className="font-display font-extrabold text-2xl leading-tight tracking-tight text-balance max-w-[24ch] tor-on-gradient">
              {persona.nombre}
            </h1>
            <InsigniaEstado tipo="reporte" estado={reporte.status as ReportStatus} />
          </div>
          <p className="text-xs mt-1 tor-on-gradient-soft">
            {[
              persona.departamento,
              reporte.submitted_at && `enviada ${fechaCorta(reporte.submitted_at)}`,
              reporte.approved_at && `aprobada ${fechaCorta(reporte.approved_at)}`,
            ].filter(Boolean).join(' · ')}
          </p>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            {reporte.status !== 'draft' && <DescargarComprobante tipo="rendicion" id={reporte.id} />}
            {comprobantes.length > 0 && (
              <button onClick={bajarZip} disabled={comprimiendo}
                className="inline-flex items-center gap-1.5 text-xs font-semibold text-white border border-white/30 bg-white/10 hover:bg-white/15 px-3 py-2 rounded-item transition-colors disabled:opacity-50">
                <Download size={13} aria-hidden />
                {comprimiendo ? 'Preparando ZIP…' : 'Comprobantes ZIP'}
              </button>
            )}
          </div>
        </div>
      </div>

      <div className="grid gap-5 items-start lg:grid-cols-[1.25fr_.95fr]">

        {/* ── COLUMNA IZQUIERDA · la plata y los gastos ─────────────────── */}
        <div className="space-y-5 min-w-0">
          <div className="tor-glass rounded-card px-5 py-[18px]">
            <p className="text-xs font-semibold uppercase tracking-[.16em] text-white/75">Gastos aprobados</p>
            <p className="font-mono-amount text-3xl font-extrabold text-white mt-1">{formatCLP(saldo.salidas)}</p>
            <p className="text-xs text-white/85 mt-1">
              {aprobados} de {gastos.length} gasto{gastos.length !== 1 ? 's' : ''} aprobado{aprobados !== 1 ? 's' : ''}
              {' · '}recibido {formatCLP(saldo.recibido)} · {lineaSaldo}
            </p>
          </div>

          <div className="bg-ink-50 rounded-card px-4 py-3 text-sm text-ink-700 border border-ink-100">
            <p className="text-xs font-semibold text-ink-500 mb-0.5">Proyecto</p>
            {reporte.proyecto
              ? [reporte.proyecto.numero, reporte.proyecto.nombre].filter(Boolean).join(' · ')
              : 'Gastos generales'}
            {datos.aprobadorN1 && <span className="text-ink-500"> · aprueba {datos.aprobadorN1}</span>}
          </div>

          {/* El aviso del diseño C: la categoría decide la cuenta contable */}
          {sinCategoria.length > 0 && (
            <div className="bg-warning-50 border border-warning-200 rounded-card px-4 py-3 flex flex-wrap items-center justify-between gap-3">
              <p className="flex items-center gap-2 text-sm font-semibold text-warning-800">
                <AlertTriangle size={16} aria-hidden className="shrink-0" />
                {sinCategoria.length === 1
                  ? '1 gasto no tiene categoría, y la categoría es la que decide su cuenta contable.'
                  : `${sinCategoria.length} gastos no tienen categoría, y la categoría es la que decide su cuenta contable.`}
              </p>
              <button onClick={() => empezarReclasificar(sinCategoria[0].id)}
                className="text-xs font-semibold bg-warning-600 hover:bg-warning-700 text-white px-3 py-2 rounded-item transition-colors">
                Asignar categoría
              </button>
            </div>
          )}

          <div className="hoja overflow-hidden">
            <div className="flex items-center justify-between gap-3 px-4 py-3 border-b border-ink-100">
              <h2 className="text-sm font-semibold text-ink-800">
                Gastos registrados
                <span className="ml-2 text-xs text-ink-400 font-normal">{gastos.length} ítem{gastos.length !== 1 ? 's' : ''}</span>
              </h2>
              {!cambiandoCC && gastos.length > 0 && (
                <button onClick={abrirCambioCC}
                  className="text-xs font-semibold text-brand-600 border border-brand-200 hover:bg-brand-50 px-2.5 py-1 rounded-item transition-colors">
                  Reasignar CC
                </button>
              )}
            </div>

            {cambiandoCC && (
              <div className="px-4 py-3 border-b border-ink-100 bg-ink-50 flex flex-wrap items-center gap-2">
                <label htmlFor="cc-masivo" className="text-xs font-semibold text-ink-600">Centro de costo para todos los gastos</label>
                <select id="cc-masivo" value={ccElegido} onChange={e => setCcElegido(e.target.value)}
                  className="campo-compacto flex-1 min-w-[200px]">
                  <option value="">Sin centro (usa el de la persona)</option>
                  {centros.map(c => <option key={c.id} value={c.id}>{c.descripcion} · {c.id}</option>)}
                </select>
                <button onClick={guardarCC} disabled={guardando} className="btn-primario px-3 py-2 text-xs">
                  {guardando ? 'Guardando…' : 'Aplicar'}
                </button>
                <button onClick={() => setCambiandoCC(false)} className="btn-secundario px-3 py-2 text-xs">Cancelar</button>
              </div>
            )}

            {gastos.length === 0 ? (
              <p className="py-8 text-center text-sm text-ink-400">Sin gastos registrados</p>
            ) : (
              <div className="divide-y divide-ink-50">
                {gastos.map(g => {
                  const movimiento = g.item_type ? TIPO_MOVIMIENTO[g.item_type] : undefined
                  return (
                    <div key={g.id} id={`gasto-${g.id}`} className="px-4 py-3 flex items-start gap-3 scroll-mt-24">
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-ink-800 truncate">{g.description}</p>
                        <p className="flex gap-1.5 text-xs text-ink-400 mt-0.5 min-w-0">
                          {g.merchant && <span className="truncate">{g.merchant}</span>}
                          {g.doc_type && <span className="hidden sm:inline shrink-0">· {g.doc_type}</span>}
                          {g.date && <span className="shrink-0">{g.merchant || g.doc_type ? '· ' : ''}{formatDate(g.date)}</span>}
                        </p>

                        {/* La categoría, con su lápiz: corregirla es lo que más hace el admin acá */}
                        {!movimiento && (
                          reclasificando === g.id ? (
                            <select
                              autoFocus
                              aria-label={`Categoría de ${g.description}`}
                              defaultValue={g.category_id ?? ''}
                              disabled={guardando}
                              onChange={e => e.target.value ? reclasificar(g.id, e.target.value) : setReclasificando(null)}
                              onBlur={() => !guardando && setReclasificando(null)}
                              className="campo-compacto mt-1.5 max-w-[240px]"
                            >
                              <option value="">— cancelar —</option>
                              {categorias.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                            </select>
                          ) : (
                            <button onClick={() => empezarReclasificar(g.id)}
                              className={`mt-1 inline-flex items-center gap-1 text-xs hover:text-brand-600 transition-colors ${g.category_name ? 'text-ink-500' : 'text-warning-700 font-semibold'}`}>
                              {g.category_name ?? 'Sin categoría'}
                              <Pencil size={11} aria-hidden />
                              <span className="sr-only">Cambiar categoría</span>
                            </button>
                          )
                        )}

                        {g.rejection_reason && (
                          <p className="text-xs text-danger-600 mt-1 bg-danger-50 px-2 py-1 rounded-item">Rechazo: {g.rejection_reason}</p>
                        )}

                        {/* Los comprobantes abren el visor, sin descargar nada */}
                        {g.adjuntos.length > 0 ? (
                          <div className="mt-2 flex flex-wrap gap-1.5">
                            {g.adjuntos.map(a => (
                              <button key={a.id} onClick={() => setVisor(indiceDe.get(a.id) ?? null)}
                                className="inline-flex items-center gap-1.5 text-xs text-brand-700 bg-brand-50 hover:bg-brand-100 border border-brand-100 px-2.5 py-1.5 rounded-item transition-colors max-w-full">
                                <Paperclip size={12} aria-hidden className="shrink-0" />
                                <span className="truncate">{a.tipo === 'pdf' ? 'Ver PDF' : a.tipo === 'email' ? 'Ver correo' : 'Ver foto'}</span>
                              </button>
                            ))}
                          </div>
                        ) : !movimiento && (
                          <p className="text-xs text-ink-400 mt-2">Sin comprobante</p>
                        )}
                      </div>

                      <div className="flex flex-col items-end gap-1.5 shrink-0">
                        <span className="font-mono-amount text-sm font-bold text-ink-800">{formatCLP(g.amount_clp)}</span>
                        {movimiento && (
                          <span className="text-[11px] px-1.5 py-0.5 rounded-full font-semibold bg-ink-100 text-ink-600">{movimiento}</span>
                        )}
                        {g.status !== 'pending' && (
                          <span className={`text-[11px] px-1.5 py-0.5 rounded-full font-semibold ${g.status === 'approved' ? 'bg-success-50 text-success-700' : 'bg-danger-50 text-danger-700'}`}>
                            {g.status === 'approved' ? 'Aprobado' : 'Rechazado'}
                          </span>
                        )}
                      </div>
                    </div>
                  )
                })}
                <div className="px-4 py-3 bg-ink-50 flex justify-between">
                  <span className="text-sm font-semibold text-ink-700">Gastos aprobados</span>
                  <span className="font-mono-amount font-bold text-ink-900">{formatCLP(saldo.salidas)}</span>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* ── COLUMNA DERECHA · el registro ──────────────────────────────── */}
        <div className="space-y-5 min-w-0">
          <div className="tor-glass rounded-card px-5 py-[18px]">
            <p className="text-xs font-semibold uppercase tracking-[.16em] text-white/75 mb-3.5">Recorrido de la rendición</p>
            <RecorridoFondo pasos={recorrido} />
          </div>

          <div className="hoja p-4 space-y-2">
            <h2 className="text-sm font-semibold text-ink-800">Contabilidad Defontana</h2>
            {reporte.defontana_exported_at ? (
              <>
                <p className="text-xs">
                  <span className="inline-block bg-success-50 text-success-700 font-semibold px-2 py-0.5 rounded-full">
                    Contabilizado {fechaCorta(reporte.defontana_exported_at)}
                  </span>
                </p>
                {reporte.defontana_export_ref && <p className="text-xs text-ink-500">Comprobante {reporte.defontana_export_ref}</p>}
                <button onClick={() => setRevirtiendo(true)}
                  className="inline-flex items-center gap-1.5 text-xs font-semibold text-danger-600 hover:text-danger-700">
                  <Undo2 size={13} aria-hidden /> Revertir con motivo
                </button>
              </>
            ) : (
              <p className="text-xs text-ink-500">Sin contabilizar. Se exporta desde la lista de Rendiciones.</p>
            )}
          </div>

          <div className="hoja p-4">
            <ApprovalAttachments
              attachments={respaldos}
              target={{ reportId: id }}
              onRefresh={cargarRespaldos}
              titulo="Respaldos extras"
            />
          </div>

          <div className="hoja p-5">
            <h2 className="text-sm font-semibold text-ink-800 mb-3">Historial</h2>
            {historial.length === 0 ? (
              <p className="text-xs text-ink-400">Todavía nadie la revisó.</p>
            ) : (
              <ol className="space-y-3">
                {historial.map((h, i) => (
                  <li key={i} className="text-sm">
                    <p className="font-semibold text-ink-800">{etiquetaDeHistorial(h.action, h.level)}</p>
                    <p className="text-xs text-ink-500">{h.nombre} · {fechaCorta(h.created_at)}</p>
                    {h.notes && (
                      <p className="mt-1 text-xs text-ink-600 bg-ink-50 rounded-item px-2 py-1 whitespace-pre-line break-words">{h.notes}</p>
                    )}
                  </li>
                ))}
              </ol>
            )}
          </div>
        </div>
      </div>

      <VisorComprobantes
        comprobantes={comprobantes}
        indice={visor}
        onCambiar={setVisor}
        onCerrar={() => setVisor(null)}
      />

      {revirtiendo && (
        <RevertDefontanaDialog
          targetLabel={reporte.title}
          detail={reporte.defontana_export_ref}
          onCancel={() => setRevirtiendo(false)}
          onConfirm={revertir}
        />
      )}
    </div>
  )
}
