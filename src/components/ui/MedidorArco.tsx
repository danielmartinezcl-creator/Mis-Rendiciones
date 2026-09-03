/**
 * El medidor de arco de Tornasol.
 *
 * Vive sobre vidrio oscuro, así que sus tonos son los -300: sobre un fondo
 * oscuro los -600 no tienen contraste. Van como clases (`stroke-brand-300`) y
 * NO como `stroke="var(--color-brand-300)"` — Tailwind v4 solo emite las
 * variables de `@theme` cuya utilidad detecta en uso, y una referencia desde un
 * `var()` inline no cuenta: el arco saldría sin color y sin aviso.
 *
 * No decide cuándo alarmar: eso lo sabe quien tiene el saldo. Acá solo pinta.
 */
interface Props {
  /** Porcentaje consumido del fondo, 0–100. */
  usado: number
  /** Lado del cuadrado en píxeles. El grosor del arco es fijo. */
  tamano: number
  /** Tiñe el arco de ámbar. Lo decide el consumidor, no el medidor. */
  alerta?: boolean
  /** Descripción para lectores de pantalla. */
  etiqueta: string
}

const GROSOR = 7

export function MedidorArco({ usado, tamano, alerta = false, etiqueta }: Props) {
  const pct           = Math.max(0, Math.min(100, Math.round(usado)))
  const radio         = (tamano - GROSOR - 2) / 2
  const circunferencia = 2 * Math.PI * radio
  const recorrido      = (circunferencia * pct) / 100

  return (
    <span
      className="relative shrink-0"
      style={{ width: tamano, height: tamano }}
      role="img"
      aria-label={etiqueta}
    >
      <svg width={tamano} height={tamano} className="block -rotate-90" aria-hidden="true">
        <circle
          cx={tamano / 2} cy={tamano / 2} r={radio}
          fill="none" strokeWidth={GROSOR}
          className="stroke-white/20"
        />
        {/* En cero no se dibuja nada. Con `strokeLinecap="round"` un arco de
            largo cero igual pinta el redondeo de las puntas: un punto que se
            lee como un 1% que no existe. */}
        {pct > 0 && (
          <circle
            cx={tamano / 2} cy={tamano / 2} r={radio}
            fill="none" strokeWidth={GROSOR} strokeLinecap="round"
            strokeDasharray={`${recorrido.toFixed(1)} ${circunferencia.toFixed(1)}`}
            className={alerta ? 'stroke-warning-300' : 'stroke-brand-300'}
          />
        )}
      </svg>
      <span className="absolute inset-0 flex flex-col items-center justify-center gap-px">
        <span
          className="font-mono-amount font-extrabold leading-none text-white"
          style={{ fontSize: Math.round(tamano * 0.24) }}
        >
          {pct}%
        </span>
        <span className="text-[10px] uppercase leading-none tracking-[.1em] text-white/70">
          usado
        </span>
      </span>
    </span>
  )
}
