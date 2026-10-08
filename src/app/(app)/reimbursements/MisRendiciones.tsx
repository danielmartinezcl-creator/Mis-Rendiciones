'use client'

import { useMemo, useState } from 'react'
import { AlertTriangle, Filter, ReceiptText } from 'lucide-react'
import { ExpenseReportCard } from '@/components/expenses/ExpenseReportCard'
import { BarraFiltros, type Dimension } from '@/components/filtros/BarraFiltros'
import {
  aplicarFiltro, contarPorCategoria, hayFiltro,
  ETIQUETAS_ESTADO, FILTRO_VACIO, ORDEN_FAMILIAS, SIN_PROYECTO,
  type Filtro, type OpcionesFiltro, type RendicionFiltrable,
} from '@/lib/filtro-documentos'
import { depurarFiltro, escribirFiltro } from '@/lib/filtro-url'
import { etiquetaDeProyecto, textoCoincidencia, textoResumen } from '@/lib/filtro-etiquetas'

interface Props {
  documentos:    RendicionFiltrable[]
  opciones:      OpcionesFiltro
  filtroInicial: Filtro
  /** La fecha de hoy en Chile, del servidor: así servidor y navegador calculan lo mismo */
  hoy:           string
}

const gastos = (n: number) => (n === 1 ? '1 gasto' : `${n} gastos`)

export function MisRendiciones({ documentos, opciones, filtroInicial, hoy }: Props) {
  const categorias = useMemo(() => opciones.categorias.map(c => ({ id: c.id, etiqueta: c.name })), [opciones])

  const [filtro, setFiltro] = useState(() => depurarFiltro(filtroInicial, {
    proyectos:  opciones.proyectos.map(p => p.id),
    categorias: opciones.categorias.map(c => c.id),
    empleados:  [],
  }))

  function cambiar(f: Filtro) {
    setFiltro(f)
    // Se integra con el router de Next 16 sin volver a pedir la página
    window.history.replaceState(null, '', `${window.location.pathname}${escribirFiltro(f)}`)
  }

  const resultado = useMemo(() => aplicarFiltro(documentos, filtro, hoy), [documentos, filtro, hoy])
  const conteo = useMemo(() => contarPorCategoria(documentos), [documentos])

  const dimensiones: Dimension[] = [
    { clave: 'proyectos', opciones: [
      { id: SIN_PROYECTO, etiqueta: 'Sin proyecto' },
      ...opciones.proyectos.map(p => ({ id: p.id, etiqueta: etiquetaDeProyecto(p) })),
    ] },
    { clave: 'categorias', opciones: categorias.map(c => ({ ...c, detalle: gastos(conteo.get(c.id) ?? 0) })) },
    { clave: 'fecha', opciones: [] },
    { clave: 'estados', opciones: ORDEN_FAMILIAS.map(f => ({ id: f, etiqueta: ETIQUETAS_ESTADO.rendicion[f] })) },
  ]

  if (documentos.length === 0) {
    return (
      <div className="max-w-2xl mx-auto space-y-6">
        <h1 className="text-2xl font-display font-bold tor-on-gradient">Mis rendiciones</h1>
        <div className="hoja p-12 text-center">
          <ReceiptText size={40} className="mx-auto mb-3 text-ink-300" aria-hidden="true" />
          <p className="card-label font-medium text-ink-600">Sin rendiciones aún</p>
          <p className="card-meta text-ink-400 mt-1">Toca «Rendir» en la barra de abajo para crear la primera</p>
        </div>
      </div>
    )
  }

  return (
    <div className="max-w-2xl mx-auto space-y-3">
      <div>
        <h1 className="text-2xl font-display font-bold tor-on-gradient">Mis rendiciones</h1>
        <p className="tor-on-gradient-soft text-sm mt-1">
          {documentos.length === 1 ? '1 rendición' : `${documentos.length} rendiciones`}
        </p>
      </div>

      <BarraFiltros
        filtro={filtro}
        onCambio={cambiar}
        dimensiones={dimensiones}
        contar={f => aplicarFiltro(documentos, f, hoy).visibles.length}
        sustantivo={['rendición', 'rendiciones']}
        resumen={hayFiltro(filtro)
          ? textoResumen({ visibles: resultado.visibles.length, total: documentos.length, totalClp: resultado.totalClp }, filtro, categorias)
          : null}
      />

      {resultado.visibles.length === 0 ? (
        <div className="hoja p-8 text-center">
          <Filter size={28} className="mx-auto mb-2 text-ink-300" aria-hidden="true" />
          <p className="card-label text-ink-600">Ninguna rendición cumple este filtro</p>
          <button type="button" onClick={() => cambiar(FILTRO_VACIO)} className="mt-2 card-label font-semibold text-brand-600">
            Limpiar filtros
          </button>
        </div>
      ) : (
        <div className="space-y-3">
          {resultado.visibles.map(({ doc, gastos: coinciden, montoClp }) => (
            <div key={doc.id}>
              <ExpenseReportCard
                report={{ ...doc, currency: doc.currency ?? 'CLP' }}
                coincidencia={filtro.categorias.length
                  ? textoCoincidencia({ gastos: coinciden.length, montoClp }, filtro, categorias)
                  : null}
              />
              {doc.status === 'reimbursed' && doc.payment_reference && (
                <p className="card-meta text-ink-100 ml-2 mt-1">
                  Ref: {doc.payment_reference}
                  {doc.reimbursed_at && ` · ${new Date(doc.reimbursed_at).toLocaleDateString('es-CL')}`}
                </p>
              )}
              {(doc.status === 'rejected' || doc.status === 'partially_approved') && (
                <p className="card-meta text-white ml-2 mt-1 font-medium flex items-center gap-1.5">
                  <AlertTriangle size={14} className="shrink-0" aria-hidden="true" />
                  Requiere corrección — revisa los motivos en el detalle
                </p>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
