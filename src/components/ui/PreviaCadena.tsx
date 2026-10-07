'use client'

// A quién le va a llegar el documento, dicho ANTES de enviarlo.
//
// Es la pieza que hace que el selector de proyecto no sea una pregunta a
// ciegas: muestra el efecto de haber elegido una obra (o de no haberla
// elegido), y convierte el error en algo que se nota antes de enviar y no tres
// días después, cuando alguien pregunta por qué le llegó esto.
//
// El texto sale de la misma función que decide de verdad la cadena, así que no
// puede desincronizarse con lo que va a pasar.

import { useEffect, useState } from 'react'
import { ArrowRight, TriangleAlert } from 'lucide-react'
import { previaDeCadena } from '@/actions/expenses'
import { previaDeCadenaFondo } from '@/actions/petty-cash'
import { formatCLP } from '@/lib/utils'

type Previa = Awaited<ReturnType<typeof previaDeCadena>>

interface Props {
  /** Uno de los dos, nunca ambos: el documento del que se previsualiza la cadena. */
  reportId?: string
  fundId?:   string
  /** Cualquier valor que, al cambiar, obligue a recalcular (proyecto, monto, ítems). */
  recargarCon?: unknown
}

export function PreviaCadena({ reportId, fundId, recargarCon }: Props) {
  const [previa, setPrevia] = useState<Previa>(null)
  const [listo, setListo]   = useState(false)

  useEffect(() => {
    let vigente = true
    const pedir = reportId
      ? previaDeCadena(reportId)
      : fundId ? previaDeCadenaFondo(fundId) : Promise.resolve(null)
    pedir
      .then(p => { if (vigente) { setPrevia(p); setListo(true) } })
      .catch(() => { if (vigente) setListo(true) })
    return () => { vigente = false }
  }, [reportId, fundId, recargarCon])

  // Mientras carga no se muestra nada: un hueco que aparece y desaparece
  // molesta más de lo que informa en algo que se lee una vez.
  if (!listo || !previa) return null

  if (!previa.n1) {
    return (
      <div className="hoja p-4 flex items-start gap-2.5">
        <TriangleAlert size={16} className="text-warning-600 shrink-0 mt-0.5" />
        <p className="card-label text-ink-700">
          <span className="font-semibold">Todavía no hay quién apruebe esto.</span>{' '}
          Si es de un proyecto, elegí el jefe de la obra; si no, pedile a administración
          que configure tu aprobador.
        </p>
      </div>
    )
  }

  return (
    <div className="hoja p-4 flex items-start gap-2.5">
      <ArrowRight size={16} className="text-brand-600 shrink-0 mt-0.5" />
      <p className="card-label text-ink-700">
        Esto va a <span className="font-semibold text-ink-900">{previa.n1}</span>
        {previa.esSuplente && <span className="text-ink-500"> (suplente)</span>}.
        {/* Sin monto (o con 0) el N2 firma siempre, y no hay nada que explicar:
            «como llega a $0» confundiría más de lo que aclara. */}
        {previa.n2 && (
          <>
            {' '}{previa.umbral ? <>Y como llega a {formatCLP(previa.umbral)}, después</> : 'Después'} a{' '}
            <span className="font-semibold text-ink-900">{previa.n2}</span>.
          </>
        )}
      </p>
    </div>
  )
}
