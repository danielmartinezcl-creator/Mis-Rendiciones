'use client'

/**
 * «Devolver para corregir»: el formulario del motivo.
 *
 * Es un componente y no dos copias porque aparece en los dos momentos de
 * decisión de un fondo —la autorización y la liquidación— y el texto de a dónde
 * vuelve cambia entre ellos, que es justo lo que una copia haría divergir.
 *
 * **El motivo es obligatorio.** Devolver sin decir qué corregir es peor que
 * rechazar: la persona recibe su documento de vuelta sin saber qué hacer con
 * él. Los tres rechazos reales del 2026-10-21 traían los suyos —«especificar
 * epp», «Monto se fusionó con otra caja chica»— y por eso servían.
 */
export function BloqueDevolver({
  etiqueta, notas, setNotas, pendiente, onConfirmar, onCancelar,
}: {
  /** Qué le va a pasar al documento: cambia entre fondo y liquidación. */
  etiqueta:    string
  notas:       string
  setNotas:    (v: string) => void
  pendiente:   boolean
  onConfirmar: () => void
  onCancelar:  () => void
}) {
  return (
    <div className="space-y-2">
      <p className="card-meta text-ink-500">{etiqueta}</p>
      <textarea
        value={notas}
        onChange={e => setNotas(e.target.value)}
        placeholder="Qué hay que corregir (obligatorio)"
        rows={2}
        className="campo w-full resize-none"
      />
      <div className="flex gap-2">
        <button
          disabled={pendiente || !notas.trim()}
          onClick={onConfirmar}
          className="flex-1 py-2 bg-warning-500 hover:bg-warning-600 disabled:opacity-50 text-white text-sm font-bold rounded-item transition-colors"
        >
          {pendiente ? 'Devolviendo...' : 'Confirmar devolución'}
        </button>
        <button
          onClick={onCancelar}
          className="px-4 py-2 text-ink-500 hover:text-ink-800 rounded-item hover:bg-ink-100 transition-colors text-sm"
        >
          Cancelar
        </button>
      </div>
    </div>
  )
}
