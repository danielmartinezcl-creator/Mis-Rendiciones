'use client'

import { EyeOff } from 'lucide-react'

/**
 * «3 rechazados no se muestran · Ver».
 *
 * Los rechazados se esconden por omisión (Daniel, 2026-10-21) para que la lista
 * quede con lo que está en curso. Esta línea es la otra mitad de esa decisión:
 * **esconder algo en silencio es una pantalla que miente**, y alguien que acaba
 * de ver su fondo rechazado y no lo encuentra va a pensar que se borró.
 *
 * Es el mismo trato que la nómina le da a los empleados bloqueados: se ocultan,
 * se dice que están y se ofrece verlos. Nunca se sacan de la consulta — el
 * rechazo y su motivo siguen en el documento, en su historial y en la bitácora.
 */
export function RechazadosOcultos({
  cantidad, sustantivo, onVer,
}: {
  cantidad:   number
  /** ['rechazado', 'rechazados'] o ['rechazada', 'rechazadas'] */
  sustantivo: [string, string]
  onVer:      () => void
}) {
  if (cantidad === 0) return null

  return (
    <p className="card-meta tor-on-gradient-soft flex items-center gap-1.5 px-1">
      <EyeOff size={13} className="shrink-0" aria-hidden />
      <span>
        {cantidad === 1
          ? `1 ${sustantivo[0]} no se muestra`
          : `${cantidad} ${sustantivo[1]} no se muestran`}
      </span>
      <button
        onClick={onVer}
        className="underline underline-offset-2 hover:no-underline font-medium"
      >
        Ver
      </button>
    </p>
  )
}
