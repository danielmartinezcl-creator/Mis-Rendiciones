'use client'

import { Check } from 'lucide-react'

type StepDef = { readonly key: string; readonly label: string; readonly short: string }

interface Props {
  steps:         readonly StepDef[]
  currentStatus: string
}

export function VerticalTimeline({ steps, currentStatus }: Props) {
  const idx = steps.findIndex(s => s.key === currentStatus)

  return (
    <div>
      {steps.map((step, i) => {
        const done    = idx >= 0 && i < idx
        const active  = i === idx
        const isLast  = i === steps.length - 1

        return (
          <div key={step.key} className="flex gap-3">
            {/* Dot + connector */}
            <div className="flex flex-col items-center shrink-0">
              <div className={[
                'w-5 h-5 rounded-full flex items-center justify-center transition-all',
                done   ? 'bg-brand-500'                          :
                active ? 'bg-brand-600 ring-4 ring-brand-100'   :
                         'bg-ink-200',
              ].join(' ')}>
                {done && <Check size={10} className="text-white" strokeWidth={3} />}
                {active && <div className="w-2 h-2 bg-white rounded-full" />}
              </div>
              {!isLast && (
                <div className={[
                  'w-px flex-1 mt-1 mb-1 min-h-[14px]',
                  done ? 'bg-brand-300' : 'bg-ink-200',
                ].join(' ')} />
              )}
            </div>
            {/* Label */}
            <div className={`pb-3 pt-0.5 ${isLast ? '' : ''}`}>
              <p className={[
                'text-sm leading-tight',
                done   ? 'text-ink-500'          :
                active ? 'text-ink-900 font-semibold' :
                         'text-ink-300',
              ].join(' ')}>
                {step.label}
              </p>
            </div>
          </div>
        )
      })}
    </div>
  )
}
