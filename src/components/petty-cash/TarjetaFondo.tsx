import { formatCLP } from '@/lib/utils'
import { tramoDelFondo } from '@/lib/petty-cash-helpers'
import type { FundStatusConst } from '@/lib/constants'
import { MedidorArco } from '@/components/ui/MedidorArco'

/**
 * La tarjeta héroe del fondo — sección 7 de la spec de Tornasol.
 *
 * La idea que la sostiene: **la tarjeta cambia de significado según el tramo**.
 * No muestra siempre lo mismo con otro color. Antes de que llegue la
 * transferencia no hay medidor, porque no hay nada que medir, y esa ausencia
 * es información. Con el dinero adentro la cifra grande es el saldo. Liquidado,
 * es el total del período y la tarjeta se apaga porque está archivada.
 *
 * Va sobre `.tor-glass` y no sobre un componente propio: el vidrio es un
 * material, igual que la hoja, y el selector de legibilidad de globals.css ya
 * excluye `.tor-glass` por nombre. Una clase nueva habría que agregarla ahí.
 */
interface Props {
  status:          FundStatusConst
  montoSolicitado: number
  montoAprobado:   number | null
  rendido:         number
  /** Cuándo llegó la plata — fecha del paso «fondos enviados». */
  desde:           string | null
  /** `settled_at` del fondo. */
  cerradoEl:       string | null
  /** Notas de la auditoría de rechazo. */
  motivoRechazo:   string | null
  /** El escritorio tiene lugar para una cifra más grande. */
  grande?:         boolean
}

/** Bajo este porcentaje de saldo disponible, el arco pasa a ámbar. */
const UMBRAL_ALERTA = 25

const ESPERA_POR_ESTADO: Partial<Record<FundStatusConst, string>> = {
  draft:             'Todavía no se envió a autorización.',
  pending_approval:  'Esperando la autorización del aprobador.',
  approved:          'Autorizado. Falta enviarlo al banco.',
  pending_bank_load: 'En el banco, esperando la carga de la transferencia.',
  pending_bank_auth: 'Carga lista. Esperando la autorización bancaria.',
}

function fmtDia(iso: string) {
  const d = new Date(iso)
  return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}`
}

export function TarjetaFondo({
  status, montoSolicitado, montoAprobado, rendido,
  desde, cerradoEl, motivoRechazo, grande = false,
}: Props) {
  const tramo    = tramoDelFondo(status)
  const aprobado = montoAprobado ?? montoSolicitado
  const cifra    = grande ? 'text-[46px]' : 'text-[34px]'

  const marco = [
    'tor-glass rounded-card px-5 pb-5 pt-[18px]',
    tramo === 'cerrado'   ? 'opacity-60' : '',
    tramo === 'rechazado' ? 'ring-1 ring-warning-300/70' : '',
  ].filter(Boolean).join(' ')

  return (
    <div className={marco}>
      <Rotulo tramo={tramo} montoAprobado={montoAprobado} />

      {tramo === 'con-dinero' ? (
        <ConDinero aprobado={aprobado} rendido={rendido} desde={desde} cifra={cifra} grande={grande} />
      ) : (
        <p className={`font-mono-amount mt-[7px] font-extrabold leading-[.95] tracking-[-.045em] text-white ${cifra}`}>
          {formatCLP(tramo === 'rechazado' ? montoSolicitado : aprobado)}
        </p>
      )}

      {tramo === 'antes' && (
        <p className="mt-2 text-xs leading-normal text-white/70">
          {ESPERA_POR_ESTADO[status]} El fondo no tiene saldo todavía.
        </p>
      )}

      {/* La tarjeta entera va al 60%, que es el gesto de «archivado» que pide la
          §7. Pero el texto de apoyo al 70% dentro de un contenedor al 60% queda
          en un 42% efectivo, por debajo de lo legible. Se compensa acá: el
          apagado se nota igual y la línea se lee. */}
      {tramo === 'cerrado' && (
        <p className="mt-2 text-xs leading-normal text-white/90">
          {cerradoEl ? `Cerrado el ${fmtDia(cerradoEl)}. ` : ''}
          Rendido {formatCLP(rendido)} ·{' '}
          {aprobado - rendido >= 0
            ? `devuelto ${formatCLP(aprobado - rendido)}`
            : `reembolsado a la empresa ${formatCLP(rendido - aprobado)}`}.
        </p>
      )}

      {tramo === 'rechazado' && (
        <p className="mt-2 text-xs leading-normal text-warning-300">
          {motivoRechazo ?? 'Sin motivo registrado.'}
        </p>
      )}
    </div>
  )
}

/** El rótulo dice qué ES la cifra. Sin él, tres tramos muestran un número sin nombre. */
function Rotulo({ tramo, montoAprobado }: { tramo: string; montoAprobado: number | null }) {
  const texto =
    tramo === 'con-dinero' ? 'Disponible en caja chica' :
    tramo === 'cerrado'    ? 'Total del período · fondo liquidado' :
    tramo === 'rechazado'  ? 'Fondo rechazado' :
    montoAprobado == null  ? 'Monto solicitado · sin autorizar todavía' :
                             'Monto autorizado · aún no transferido'

  // El rechazo se lee en el rótulo, no solo en el motivo tres líneas más abajo.
  return (
    <p
      className={`text-xs font-semibold uppercase leading-snug tracking-[.16em] ${
        tramo === 'rechazado' ? 'text-warning-300' : 'text-white/75'
      }`}
    >
      {texto}
    </p>
  )
}

/**
 * El único tramo con medidor. La barra segmentada de abajo repite la misma
 * proporción que el arco: el arco se lee de un vistazo y la barra pone las dos
 * cifras al lado, que es lo que hace falta para decidir si alcanza.
 */
function ConDinero({
  aprobado, rendido, desde, cifra, grande,
}: { aprobado: number; rendido: number; desde: string | null; cifra: string; grande: boolean }) {
  const disponible = aprobado - rendido
  const usadoPct   = aprobado > 0 ? Math.min(100, (rendido / aprobado) * 100) : 0
  const alerta     = 100 - usadoPct < UMBRAL_ALERTA

  return (
    <>
      <div className="flex items-start justify-between gap-4">
        <p className={`font-mono-amount mt-[7px] font-extrabold leading-[.95] tracking-[-.045em] text-white ${cifra}`}>
          {formatCLP(disponible)}
        </p>
        <MedidorArco
          usado={usadoPct}
          tamano={grande ? 92 : 76}
          alerta={alerta}
          etiqueta={`${Math.round(usadoPct)} por ciento del fondo usado`}
        />
      </div>

      <div className="mt-[15px] flex h-[7px] gap-0.5 overflow-hidden rounded-full">
        <span className="block h-full bg-white" style={{ width: `${usadoPct}%` }} />
        <span className="block h-full bg-white/50" style={{ width: `${100 - usadoPct}%` }} />
      </div>
      <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1.5">
        <span className="flex items-center gap-1.5 text-[11px] text-white/80">
          <span className="block h-2 w-2 rounded-xs bg-white" />
          Rendido {formatCLP(rendido)}
        </span>
        <span className="flex items-center gap-1.5 text-[11px] text-white/80">
          <span className="block h-2 w-2 rounded-xs bg-white/50" />
          Disponible {formatCLP(disponible)}
        </span>
      </div>

      <p className="mt-2 text-xs leading-normal text-white/70">
        Usaste {formatCLP(rendido)} de {formatCLP(aprobado)}
        {desde ? ` desde el ${fmtDia(desde)}` : ''}.
      </p>
    </>
  )
}
