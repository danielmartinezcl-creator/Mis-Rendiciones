'use client'

type StepDef = { readonly key: string; readonly label: string; readonly short: string }

interface Props {
  steps:         readonly StepDef[]
  currentStatus: string
}

export function CompactStepper({ steps, currentStatus }: Props) {
  const idx = steps.findIndex(s => s.key === currentStatus)

  return (
    <div
      className="flex items-center w-full"
      title={idx >= 0 ? `Paso ${idx + 1} de ${steps.length}: ${steps[idx].label}` : currentStatus}
    >
      {steps.map((step, i) => {
        const done   = idx >= 0 && i < idx
        const active = i === idx
        const isLast = i === steps.length - 1

        return (
          <div key={step.key} className={`flex items-center ${isLast ? '' : 'flex-1'} min-w-0`}>
            <div
              className={[
                'w-2 h-2 rounded-full shrink-0 transition-all duration-200',
                done   ? 'bg-brand-500'                             :
                active ? 'bg-brand-600 ring-2 ring-brand-200 scale-125' :
                         'bg-ink-200',
              ].join(' ')}
            />
            {!isLast && (
              <div className={[
                'h-px flex-1 mx-0.5',
                done ? 'bg-brand-400' : 'bg-ink-200',
              ].join(' ')} />
            )}
          </div>
        )
      })}
    </div>
  )
}
