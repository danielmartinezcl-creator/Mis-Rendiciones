'use client'

import { useEffect, useState } from 'react'
import { Info } from 'lucide-react'
import { buscarNombreRepetido } from '@/actions/expenses'
import { textoDeAviso, type ClaseDocumento, type Coincidencia } from '@/lib/nombre-repetido'

/**
 * «Ya tenés uno con este nombre», debajo del campo del nombre.
 *
 * **Avisa, nunca bloquea** — ver `src/lib/nombre-repetido.ts` para por qué: los
 * nombres repetidos son legítimos y ya son la norma, y lo que se evita es que
 * una persona se equivoque de documento al verlo en una lista.
 *
 * Es un componente y no dos copias del mismo `useEffect` porque lo usan las dos
 * pantallas de creación, y el debounce es justo el detalle que se implementa
 * distinto en cada copia.
 *
 * Tono deliberadamente neutro: ícono de información y no de alerta, en gris y
 * no en ámbar. Un fondo mensual que se llama igual que el del mes pasado no
 * está mal; solo conviene saberlo antes de seguir.
 */

/* 600 ms, el mismo que usa el chequeo de políticas en el formulario de gasto:
   abajo de eso se consulta por cada tecla, y arriba el aviso llega cuando la
   persona ya pasó al campo siguiente. */
const ESPERA_MS = 600

export function AvisoNombreRepetido({
  clase, nombre, beneficiarioId, excluirId,
}: {
  clase:           ClaseDocumento
  nombre:          string
  /** De quién es el documento. Sin esto, de quien pregunta. */
  beneficiarioId?: string | null
  excluirId?:      string
}) {
  const [coincidencias, setCoincidencias] = useState<Coincidencia[]>([])

  useEffect(() => {
    /* Con el campo vacío no se consulta y listo: el estado viejo se ignora al
       dibujar (ver `vacio` abajo), en vez de limpiarlo acá. Llamar a setState
       sincrónicamente dentro de un efecto encadena renders, y la regla
       `react-hooks/set-state-in-effect` lo rechaza — con razón. */
    if (!nombre.trim()) return

    /* `cancelado` y no solo el clearTimeout: la consulta puede volver DESPUÉS
       de que el nombre cambió otra vez, y sin esto el aviso mostraría el
       resultado de un texto que ya no está escrito. */
    let cancelado = false
    const t = setTimeout(() => {
      buscarNombreRepetido({ clase, nombre, beneficiarioId: beneficiarioId ?? undefined, excluirId })
        .then(r => { if (!cancelado) setCoincidencias(r) })
        // Un aviso es una ayuda: si la consulta falla, no se dice nada. Cortar
        // la creación de un fondo porque no se pudo revisar sería peor.
        .catch(() => { if (!cancelado) setCoincidencias([]) })
    }, ESPERA_MS)

    return () => { cancelado = true; clearTimeout(t) }
  }, [clase, nombre, beneficiarioId, excluirId])

  // Campo vacío: nada que avisar, sin importar lo que haya quedado del nombre anterior.
  const texto = nombre.trim() ? textoDeAviso(clase, coincidencias) : null
  if (!texto) return null

  return (
    <p className="card-meta text-ink-500 mt-1.5 flex items-start gap-1.5">
      <Info size={13} className="shrink-0 mt-0.5 text-ink-400" aria-hidden />
      <span>
        {texto} <span className="text-ink-400">Podés seguir igual.</span>
      </span>
    </p>
  )
}
