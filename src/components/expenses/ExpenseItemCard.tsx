'use client'

import { CurrencyAmount } from '@/components/ui/CurrencyAmount'
import { ItemStatusAccent } from '@/components/ui/Badge'
import { formatDate } from '@/lib/utils'
import { DOC_TYPES } from '@/lib/constants'
import type { ExpenseItem, ExpenseCategory, Attachment } from '@/lib/supabase/types'
import type { ItemStatus } from '@/lib/constants'

interface ExpenseItemCardProps {
  item: ExpenseItem & {
    expense_categories: Pick<ExpenseCategory, 'name' | 'icon' | 'color'> | null
    attachments: Pick<Attachment, 'id' | 'storage_path' | 'file_type'>[]
  }
  canDelete?: boolean
  onDelete?:  (id: string) => void
}

export function ExpenseItemCard({ item, canDelete, onDelete }: ExpenseItemCardProps) {
  const docLabel = DOC_TYPES.find(d => d.value === item.doc_type)?.label

  return (
    <ItemStatusAccent status={item.status as ItemStatus}>
      <div className="bg-white rounded-[12px] shadow-[0_1px_4px_rgba(0,0,0,.08)] p-4 space-y-3">
        {/* Fila principal: descripción + monto */}
        <div className="flex items-start justify-between gap-2">
          <div className="flex-1 min-w-0">
            <p className="font-semibold text-slate-800 truncate">{item.description}</p>
            {item.merchant && (
              <p className="text-xs text-slate-400 mt-0.5">{item.merchant}</p>
            )}
          </div>
          <div className="text-right shrink-0">
            <CurrencyAmount amount={item.amount_clp} currency="CLP" size="md" />
            {item.currency !== 'CLP' && (
              <p className="text-xs text-slate-400 mt-0.5">
                {item.currency} {item.amount.toLocaleString('es-CL')}
              </p>
            )}
          </div>
        </div>

        {/* Metadatos */}
        <div className="flex flex-wrap gap-2 text-xs text-slate-500">
          <span>{formatDate(item.date)}</span>
          {item.expense_categories && (
            <span className="flex items-center gap-1">
              <span>{item.expense_categories.icon}</span>
              {item.expense_categories.name}
            </span>
          )}
          {docLabel && <span>{docLabel}</span>}
          {item.doc_number && <span>N° {item.doc_number}</span>}
          {item.attachments.length > 0 && (
            <span>📎 {item.attachments.length} adjunto{item.attachments.length !== 1 ? 's' : ''}</span>
          )}
          {item.ocr_confidence && (
            <span className="text-indigo-400">✦ OCR {Math.round(item.ocr_confidence * 100)}%</span>
          )}
        </div>

        {/* Motivo de rechazo */}
        {item.status === 'rejected' && item.rejection_reason && (
          <div className="bg-red-50 border border-red-200 rounded-[8px] p-2">
            <p className="text-xs text-red-600 font-medium">Motivo de rechazo:</p>
            <p className="text-xs text-red-500 mt-0.5">{item.rejection_reason}</p>
          </div>
        )}

        {/* Notas */}
        {item.notes && (
          <p className="text-xs text-slate-400 italic">{item.notes}</p>
        )}

        {/* Eliminar */}
        {canDelete && onDelete && (
          <button
            type="button"
            onClick={() => onDelete(item.id)}
            className="text-xs text-red-400 hover:text-red-600 transition-colors"
          >
            Eliminar ítem
          </button>
        )}
      </div>
    </ItemStatusAccent>
  )
}
