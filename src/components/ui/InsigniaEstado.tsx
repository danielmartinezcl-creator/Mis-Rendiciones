import { cn, getStatusLabel } from '@/lib/utils'
import {
  FAMILIA_CLASES, FAMILIA_REPORTE, FAMILIA_FONDO, FUND_STATUS_LABELS,
} from '@/lib/constants'
import type { ReportStatus, FundStatusConst, FamiliaEstado } from '@/lib/constants'

/**
 * La píldora de estado, única para rendiciones y para fondos de caja chica.
 *
 * Antes eran dos componentes con el mismo markup y dos mapas de color de 9 y 10
 * entradas. Ahora el color sale de la FAMILIA del estado (sección 6 de la spec:
 * cuatro familias, no diecinueve colores) y el texto de su etiqueta.
 *
 * Este SÍ merece ser un componente de React —a diferencia de la hoja, que quedó
 * como clase CSS— porque tiene lógica: mapea un estado a una familia, resuelve
 * la etiqueta y decide si muestra el punto.
 */

type Props =
  | { tipo: 'reporte'; estado: ReportStatus; punto?: boolean; className?: string }
  | { tipo: 'fondo';   estado: string;       punto?: boolean; className?: string }

export function InsigniaEstado(props: Props) {
  const { punto = true, className } = props

  let familia: FamiliaEstado
  let etiqueta: string

  if (props.tipo === 'reporte') {
    familia  = FAMILIA_REPORTE[props.estado] ?? 'neutro'
    etiqueta = getStatusLabel(props.estado)
  } else {
    const s  = props.estado as FundStatusConst
    familia  = FAMILIA_FONDO[s] ?? 'neutro'
    etiqueta = FUND_STATUS_LABELS[s] ?? props.estado
  }

  const { pildora, punto: clasePunto } = FAMILIA_CLASES[familia]

  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[14px] font-bold',
        pildora,
        className,
      )}
    >
      {punto && <span className={cn('w-2 h-2 rounded-full shrink-0', clasePunto)} />}
      {etiqueta}
    </span>
  )
}
