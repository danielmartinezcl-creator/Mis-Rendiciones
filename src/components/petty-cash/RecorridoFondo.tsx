import type { PasoRecorrido } from '@/lib/petty-cash-helpers'

/**
 * El recorrido del fondo, sobre vidrio.
 *
 * Muestra los pasos que faltan, no solo los dados: en un trámite bancario de
 * cinco escalones, saber cuánto queda es la mitad de la información. Las
 * fechas salen del registro de auditoría; los pasos, de FUND_STEPS. La fusión
 * la hace `construirRecorrido`, que es la parte con tests.
 *
 * Esto NO reemplaza al historial completo de abajo: ahí siguen el actor, las
 * notas y los montos de cada movimiento, que es el registro que un admin
 * necesita entero.
 */

function fmtFecha(iso: string) {
  const d = new Date(iso)
  const dia  = String(d.getDate()).padStart(2, '0')
  const mes  = String(d.getMonth() + 1).padStart(2, '0')
  const hora = d.toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit', hour12: false })
  return `${dia}/${mes} · ${hora}`
}

const PUNTO: Record<PasoRecorrido['estado'], string> = {
  hecho:     'bg-white/90',
  actual:    'bg-white shadow-[0_0_0_4px_rgba(255,255,255,.26)]',
  pendiente: 'bg-transparent shadow-[inset_0_0_0_1.5px_rgba(255,255,255,.34)]',
}

export function RecorridoFondo({ pasos }: { pasos: PasoRecorrido[] }) {
  return (
    <ol className="flex flex-col">
      {pasos.map((paso, i) => {
        const esUltimo   = i === pasos.length - 1
        const porDelante = paso.estado === 'pendiente'

        return (
          <li key={paso.key} className="flex items-start gap-2.5">
            <span className="flex shrink-0 flex-col items-center self-stretch">
              <span className={`mt-1 h-[9px] w-[9px] shrink-0 rounded-full ${PUNTO[paso.estado]}`} />
              {!esUltimo && (
                <span
                  className={`my-0.5 min-h-3 w-[1.5px] flex-1 ${porDelante ? 'bg-white/10' : 'bg-white/25'}`}
                />
              )}
            </span>
            <span className="flex min-w-0 flex-col gap-px pb-2.5">
              <span
                className={`text-xs leading-snug ${
                  porDelante ? 'font-medium text-white/50' : 'font-semibold text-white'
                }`}
              >
                {paso.label}
              </span>
              <span className="font-mono-amount text-[11px] font-normal leading-relaxed text-white/60">
                {paso.fecha ? fmtFecha(paso.fecha) : 'pendiente'}
              </span>
            </span>
          </li>
        )
      })}
    </ol>
  )
}
