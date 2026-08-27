'use client'

import React, { useState, useMemo } from 'react'
import { ItemAttachmentZone } from '@/components/ui/ItemAttachmentZone'
import {
  History,
  ArrowDownToLine,
  ArrowUpFromLine,
  Receipt,
  BookCheck,
  ArrowRightLeft,
  ChevronDown,
  ChevronRight,
  SendHorizontal,
  FileSpreadsheet,
  Trash2,
  Pencil,
  Check,
  X,
  Undo2,
} from 'lucide-react'
import { RevertDefontanaDialog } from '@/components/ui/RevertDefontanaDialog'
import { updateHistoricalExpenseItem, updateHistoricalImportTitle } from '@/actions/admin'
import { deleteExpenseItem } from '@/actions/expenses'
import { formatDate, formatCLP } from '@/lib/utils'
import type { HistoricalImport, HistItem, ItemSavedPatch } from './usePettyCashState'

// ── Interfaces ────────────────────────────────────────────────────────────────

export interface HistoricalSectionProps {
  imports:                    HistoricalImport[]
  isManager:                  boolean
  movingHistId:               string | null
  deletingHistId:             string | null
  onMove:                     (id: string, title: string) => void
  onDelete:                   (id: string, title: string) => void
  onExportDefontana:          (reportId: string, itemTypes: ('expense' | 'advance' | 'return')[], title: string) => Promise<{ warnings: { categories: string[]; unmappedCLP: number } | null }>
  onConfirmContabilizado:     (reportId: string, itemTypes: ('expense' | 'advance' | 'return')[], comprobante: string) => Promise<void>
  onRevertContabilizado:      (reportId: string, itemTypes: ('expense' | 'advance' | 'return')[], reason: string) => Promise<void>
  onItemSaved:                (reportId: string, itemId: string, patch: ItemSavedPatch) => void
  onItemDeleted?:             (reportId: string, itemId: string) => void
  onTitleUpdated:             (reportId: string, title: string) => void
  onTransfer:                 (reportId: string, submitterId: string, defaultAmount: number) => void
  onEditLinkedTransfer?:      (transferId: string, amount: number, date: string, description: string | null) => void
  onDeleteLinkedTransfer?:    (transferId: string) => void
}

// ── Constants ─────────────────────────────────────────────────────────────────

const ITEM_TYPE_ICON: Record<string, React.ReactNode> = {
  advance:  <ArrowDownToLine  size={12} className="text-blue-500 shrink-0" />,
  expense:  <Receipt          size={12} className="text-ink-400 shrink-0" />,
  return:   <ArrowUpFromLine  size={12} className="text-emerald-500 shrink-0" />,
  transfer: <SendHorizontal   size={12} className="text-violet-500 shrink-0" />,
}

const ITEM_TYPE_LABEL: Record<string, string> = {
  advance:  'Adelanto',
  expense:  'Gasto',
  return:   'Devolución',
  transfer: 'Traspaso',
}

// ── HistoricalItemsTable ──────────────────────────────────────────────────────

function HistoricalItemsTable({ reportId, items, onItemSaved, onItemDeleted, onEditLinkedTransfer, onDeleteLinkedTransfer }: {
  reportId:                  string
  items:                     HistItem[]
  onItemSaved:               (reportId: string, itemId: string, patch: ItemSavedPatch) => void
  onItemDeleted?:            (reportId: string, itemId: string) => void
  onEditLinkedTransfer?:     (transferId: string, amount: number, date: string, description: string | null) => void
  onDeleteLinkedTransfer?:   (transferId: string) => void
}) {
  const [editingId,    setEditingId]    = useState<string | null>(null)
  const [editType,     setEditType]     = useState<'expense' | 'advance' | 'return'>('expense')
  const [editDesc,     setEditDesc]     = useState('')
  const [editAmt,      setEditAmt]      = useState('')
  const [editDate,     setEditDate]     = useState('')
  const [editMerchant, setEditMerchant] = useState('')
  const [saving,       setSaving]       = useState(false)
  const [deletingItemId, setDeletingItemId] = useState<string | null>(null)
  const [saveError,    setSaveError]    = useState<string | null>(null)

  function startEdit(item: HistItem) {
    setEditingId(item.id)
    setEditType((item.item_type as 'expense' | 'advance' | 'return') || 'expense')
    setEditDesc(item.description || '')
    setEditAmt(String(item.amount_clp))
    setEditDate(item.date || '')
    setEditMerchant(item.merchant || '')
    setSaveError(null)
  }

  async function saveEdit(itemId: string) {
    const amount = parseFloat(editAmt)
    if (!editDesc.trim()) { setSaveError('La descripción es obligatoria'); return }
    if (isNaN(amount) || amount <= 0) { setSaveError('Monto inválido'); return }
    setSaving(true)
    setSaveError(null)
    const patch: ItemSavedPatch = {
      item_type:   editType,
      description: editDesc.trim(),
      amount_clp:  amount,
      date:        editDate,
      merchant:    editMerchant.trim() || null,
    }
    try {
      await updateHistoricalExpenseItem(itemId, patch)
      // Notifica al padre para actualizar totales del grupo
      onItemSaved(reportId, itemId, patch)
      setEditingId(null)
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'Error al guardar')
    } finally {
      setSaving(false)
    }
  }

  async function deleteItem(item: HistItem) {
    if (!confirm(`¿Eliminar "${item.description || 'este ítem'}"?\n\nEsta acción no se puede deshacer.`)) return
    setDeletingItemId(item.id)
    try {
      await deleteExpenseItem(item.id, reportId)
      onItemDeleted?.(reportId, item.id)
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Error al eliminar')
    } finally {
      setDeletingItemId(null)
    }
  }

  const inputCls = 'px-2 py-1 text-xs border border-ink-200 rounded-item focus:outline-none focus:ring-1 focus:ring-brand-600'

  return (
    <div className="bg-ink-50 border-t border-ink-100 px-4 py-3 space-y-2">
      <table className="w-full text-xs">
        <thead>
          <tr className="text-ink-400 border-b border-ink-200">
            <th className="text-left pb-1.5 font-medium w-28">Tipo</th>
            <th className="text-left pb-1.5 font-medium">Descripción / Destinatario</th>
            <th className="text-left pb-1.5 font-medium w-28">Fecha</th>
            <th className="text-right pb-1.5 font-medium w-24">Monto</th>
            <th className="w-8" />
          </tr>
        </thead>
        <tbody className="divide-y divide-ink-100">
          {items.map(item => {
            const isEdit = editingId === item.id
            return (
              <React.Fragment key={item.id}>
              <tr className={`text-ink-700 ${isEdit ? 'bg-white' : ''}`}>
                {/* Columna Tipo */}
                <td className="py-1.5 pr-2 whitespace-nowrap align-top">
                  {isEdit ? (
                    <select
                      value={editType}
                      onChange={e => setEditType(e.target.value as 'expense' | 'advance' | 'return')}
                      className={inputCls}
                    >
                      <option value="expense">Gasto</option>
                      <option value="advance">Adelanto</option>
                      <option value="return">Devolución</option>
                    </select>
                  ) : (
                    <span className="flex items-center gap-1">
                      {ITEM_TYPE_ICON[item.item_type] ?? null}
                      <span className={
                        item.item_type === 'advance' ? 'text-blue-600 font-medium' :
                        item.item_type === 'return'  ? 'text-emerald-600 font-medium' :
                        'text-ink-600'
                      }>{ITEM_TYPE_LABEL[item.item_type] ?? item.item_type}</span>
                    </span>
                  )}
                </td>

                {/* Columna Descripción / Empleado */}
                {isEdit ? (
                  <td className="py-1.5 pr-2 align-top">
                    <div className="space-y-1">
                      <input value={editDesc} onChange={e => setEditDesc(e.target.value)}
                        placeholder="Descripción"
                        className={`${inputCls} w-full`} />
                      <input value={editMerchant} onChange={e => setEditMerchant(e.target.value)}
                        placeholder="Destinatario / receptor (opcional)"
                        className={`${inputCls} w-full text-ink-500`} />
                    </div>
                  </td>
                ) : (
                  <td className="py-1.5 pr-2 align-top">
                    <p className="text-ink-600 truncate max-w-[180px]">{item.description || '—'}</p>
                    {item.merchant && (
                      <p className="text-ink-400 text-[10px] truncate max-w-[180px]">{item.merchant}</p>
                    )}
                  </td>
                )}

                {/* Columna Fecha */}
                {isEdit ? (
                  <td className="py-1.5 pr-2 align-top">
                    <input type="date" value={editDate} onChange={e => setEditDate(e.target.value)}
                      className={inputCls} />
                  </td>
                ) : (
                  <td className="py-1.5 pr-2 text-ink-400 align-top">{item.date ? formatDate(item.date) : '—'}</td>
                )}

                {/* Columna Monto */}
                {isEdit ? (
                  <td className="py-1.5 text-right align-top">
                    <input type="number" value={editAmt} onChange={e => setEditAmt(e.target.value)}
                      className={`${inputCls} w-24 text-right font-mono-amount`} />
                  </td>
                ) : (
                  <td className={`py-1.5 text-right font-mono-amount font-semibold align-top ${
                    item.item_type === 'advance' ? 'text-blue-600' :
                    item.item_type === 'return'  ? 'text-emerald-600' :
                    'text-ink-900'
                  }`}>{formatCLP(item.amount_clp)}</td>
                )}

                {/* Acciones */}
                {isEdit ? (
                  <td className="py-1.5 pl-1 align-top">
                    <div className="flex gap-0.5">
                      <button onClick={() => saveEdit(item.id)} disabled={saving}
                        title="Guardar"
                        className="p-1 text-brand-600 hover:bg-brand-50 rounded transition-colors disabled:opacity-40">
                        <Check size={13} />
                      </button>
                      <button onClick={() => { setEditingId(null); setSaveError(null) }}
                        title="Cancelar"
                        className="p-1 text-ink-400 hover:bg-ink-100 rounded transition-colors">
                        <X size={13} />
                      </button>
                    </div>
                  </td>
                ) : (
                  <td className="py-1.5 pl-1 align-top">
                    {item.item_type === 'transfer' ? (
                      // Ítems de traspaso: editar/eliminar el traspaso vinculado
                      (item as { transfer_id?: string | null }).transfer_id
                        ? (
                          <div className="flex gap-0.5">
                            {onEditLinkedTransfer && (
                              <button
                                onClick={() => onEditLinkedTransfer(
                                  (item as { transfer_id: string }).transfer_id,
                                  item.amount_clp,
                                  item.date || '',
                                  item.description || null,
                                )}
                                title="Editar traspaso"
                                className="p-1 text-violet-400 hover:text-violet-600 hover:bg-violet-50 rounded transition-colors"
                              >
                                <Pencil size={12} />
                              </button>
                            )}
                            {onDeleteLinkedTransfer && (
                              <button
                                onClick={() => onDeleteLinkedTransfer(
                                  (item as { transfer_id: string }).transfer_id,
                                )}
                                title="Eliminar traspaso"
                                className="p-1 text-rose-300 hover:text-rose-500 hover:bg-rose-50 rounded transition-colors"
                              >
                                <Trash2 size={12} />
                              </button>
                            )}
                          </div>
                        )
                        : null
                    ) : (
                      <div className="flex gap-0.5">
                        <button onClick={() => startEdit(item)} title="Editar ítem"
                          className="p-1 text-ink-300 hover:text-brand-600 rounded transition-colors">
                          <Pencil size={12} />
                        </button>
                        <button
                          onClick={() => deleteItem(item)}
                          disabled={deletingItemId === item.id}
                          title="Eliminar ítem"
                          className="p-1 text-ink-300 hover:text-rose-500 rounded transition-colors disabled:opacity-40"
                        >
                          {deletingItemId === item.id
                            ? <span className="text-[10px]">…</span>
                            : <Trash2 size={12} />}
                        </button>
                      </div>
                    )}
                  </td>
                )}
              </tr>
              {!isEdit && item.item_type !== 'transfer' && (
                <tr>
                  <td colSpan={5} className="pb-2 px-0">
                    <ItemAttachmentZone
                      itemId={item.id}
                      itemType="expense_item"
                      canUpload
                    />
                  </td>
                </tr>
              )}
              </React.Fragment>
            )
          })}
        </tbody>
      </table>
      {saveError && (
        <p className="text-xs text-rose-600 bg-rose-50 px-2 py-1 rounded-item">{saveError}</p>
      )}
    </div>
  )
}

// ── HistoricalSection ─────────────────────────────────────────────────────────

export function HistoricalSection({ imports, isManager, movingHistId, deletingHistId, onMove, onDelete, onExportDefontana, onConfirmContabilizado, onRevertContabilizado, onItemSaved, onItemDeleted, onTitleUpdated, onTransfer, onEditLinkedTransfer, onDeleteLinkedTransfer }: HistoricalSectionProps) {
  const [expandedIds,     setExpandedIds]     = useState<Set<string>>(new Set())
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(() => {
    // Todos los grupos inician colapsados
    const keys = new Set<string>()
    for (const h of imports) keys.add(h.fund_number ?? `__solo__${h.id}`)
    return keys
  })

  // Estado para edición inline del título
  const [editingTitleId, setEditingTitleId] = useState<string | null>(null)
  const [editTitle,      setEditTitle]      = useState('')
  const [savingTitle,    setSavingTitle]    = useState(false)
  const [titleError,     setTitleError]     = useState<string | null>(null)

  // Estado del panel Defontana
  const [defPanelId,        setDefPanelId]        = useState<string | null>(null)
  const [defSelectedTypes,  setDefSelectedTypes]  = useState<Set<string>>(new Set())
  const [defExporting,      setDefExporting]      = useState(false)
  const [defExportWarnings, setDefExportWarnings] = useState<{ categories: string[]; unmappedCLP: number } | null>(null)
  const [defComprobante,    setDefComprobante]    = useState('')
  const [defConfirming,     setDefConfirming]     = useState(false)
  // Reversa de contabilización — guarda la carga y los tipos a revertir
  const [revertTarget,      setRevertTarget]      = useState<{ h: HistoricalImport; types: ('expense' | 'advance' | 'return')[] } | null>(null)

  function openDefPanel(h: HistoricalImport) {
    const pending = new Set<string>()
    for (const item of h.items) {
      if (['expense', 'advance', 'return'].includes(item.item_type || '') && !item.defontana_exported_at) {
        pending.add(item.item_type!)
      }
    }
    setDefSelectedTypes(pending)
    setDefExportWarnings(null)
    setDefComprobante('')
    setDefPanelId(defPanelId === h.id ? null : h.id)
  }

  async function runExport(h: HistoricalImport) {
    const types = Array.from(defSelectedTypes) as ('expense' | 'advance' | 'return')[]
    if (!types.length) return
    setDefExporting(true)
    setDefExportWarnings(null)
    try {
      const result = await onExportDefontana(h.id, types, h.title)
      if (result.warnings) setDefExportWarnings(result.warnings)
      // No cerramos el panel — el usuario debe confirmar la contabilización por separado
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Error al exportar')
    } finally {
      setDefExporting(false)
    }
  }

  async function runConfirmContabilizado(h: HistoricalImport) {
    const types = Array.from(defSelectedTypes) as ('expense' | 'advance' | 'return')[]
    setDefConfirming(true)
    try {
      await onConfirmContabilizado(h.id, types, defComprobante)
      setDefPanelId(null)
      setDefComprobante('')
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Error al confirmar contabilización')
    } finally {
      setDefConfirming(false)
    }
  }

  async function runRevertContabilizado(reason: string) {
    if (!revertTarget) return
    await onRevertContabilizado(revertTarget.h.id, revertTarget.types, reason)
    setRevertTarget(null)
    setDefPanelId(null)
  }

  async function handleSaveTitle(reportId: string) {
    if (!editTitle.trim()) return
    setSavingTitle(true)
    setTitleError(null)
    try {
      await updateHistoricalImportTitle(reportId, editTitle.trim())
      onTitleUpdated(reportId, editTitle.trim())
      setEditingTitleId(null)
    } catch (err) {
      setTitleError(err instanceof Error ? err.message : 'Error al guardar')
    } finally {
      setSavingTitle(false)
    }
  }

  function toggle(id: string) {
    setExpandedIds(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  // Agrupar por fund_number. Los sin fondo forman grupos individuales.
  const groups = useMemo(() => {
    const map = new Map<string, HistoricalImport[]>()
    for (const h of imports) {
      const key = h.fund_number ?? `__solo__${h.id}`
      if (!map.has(key)) map.set(key, [])
      map.get(key)!.push(h)
    }
    return Array.from(map.entries())
  }, [imports])

  const allCollapsed = collapsedGroups.size === groups.length
  function toggleAllGroups() {
    if (allCollapsed) {
      setCollapsedGroups(new Set())
    } else {
      setCollapsedGroups(new Set(groups.map(([key]) => key)))
    }
  }
  function toggleGroup(key: string) {
    setCollapsedGroups(prev => {
      const next = new Set(prev)
      next.has(key) ? next.delete(key) : next.add(key)
      return next
    })
  }

  return (
    <div className="mt-6 space-y-4">
      <div className="flex items-center gap-2">
        <History size={15} className="text-ink-400" />
        <h2 className="text-sm font-semibold text-ink-600">Carga histórica</h2>
        <span className="text-xs text-ink-400">({imports.length})</span>
        <button
          onClick={toggleAllGroups}
          className="ml-auto text-xs text-ink-400 hover:text-ink-700 border border-ink-200 rounded-item px-2.5 py-1 transition-colors flex items-center gap-1.5"
        >
          {allCollapsed
            ? <><ChevronDown size={12} /> Expandir todo</>
            : <><ChevronRight size={12} /> Contraer todo</>
          }
        </button>
      </div>

      {groups.map(([groupKey, group]) => {
        const hasFund       = !groupKey.startsWith('__solo__')
        const fundLabel     = hasFund ? `Fondo N°${groupKey}` : null
        const isCollapsed   = collapsedGroups.has(groupKey)

        // Balance consolidado del grupo (incluyendo traspasos entre cajas)
        const groupAdvance     = group.reduce((s, h) => s + h.advance_total, 0)
        const groupExpense     = group.reduce((s, h) => s + h.expense_total, 0)
        const groupReturn      = group.reduce((s, h) => s + h.return_total,  0)
        const groupTransferOut = group.reduce((s, h) => s + ((h as { transfer_out_total?: number }).transfer_out_total ?? 0), 0)
        const groupTransferIn  = group.reduce((s, h) => s + ((h as { transfer_in_total?:  number }).transfer_in_total  ?? 0), 0)
        const groupDiff        = groupAdvance + groupTransferIn - groupExpense - groupReturn - groupTransferOut
        const isBalanced       = Math.abs(groupDiff) < 1
        const hasActivity      = groupExpense > 0 || groupReturn > 0 || groupTransferOut > 0 || groupTransferIn > 0
        const isPending        = groupAdvance > 0 && !hasActivity
        const isOweEmp         = groupDiff < -1
        const isOweComp        = !isPending && groupDiff > 1

        return (
          <div key={groupKey} className={`rounded-card shadow-card overflow-hidden ${hasFund ? 'border border-blue-100' : ''}`}>
            {/* Cabecera del grupo — siempre visible, clickeable para colapsar */}
            {hasFund && (
              <button
                onClick={() => toggleGroup(groupKey)}
                className="w-full bg-blue-50 px-4 py-2 flex items-center justify-between gap-3 border-b border-blue-100 hover:bg-blue-100 transition-colors"
              >
                <span className="flex items-center gap-1.5 text-xs font-bold text-blue-700">
                  {isCollapsed ? <ChevronRight size={13} /> : <ChevronDown size={13} />}
                  {fundLabel}
                </span>
                <div className="flex items-center gap-3 text-xs">
                  {groupAdvance > 0 && (
                    <span className="text-blue-700 font-mono-amount">
                      <ArrowDownToLine size={10} className="inline mr-0.5" />
                      {formatCLP(groupAdvance)}
                    </span>
                  )}
                  {groupTransferIn > 0 && (
                    <span className="text-violet-600 font-mono-amount">
                      <ArrowRightLeft size={10} className="inline mr-0.5" />
                      +{formatCLP(groupTransferIn)}
                    </span>
                  )}
                  {groupExpense > 0 && (
                    <span className="text-ink-600 font-mono-amount">
                      <Receipt size={10} className="inline mr-0.5" />
                      ({formatCLP(groupExpense)})
                    </span>
                  )}
                  {groupReturn > 0 && (
                    <span className="text-emerald-600 font-mono-amount">
                      <ArrowUpFromLine size={10} className="inline mr-0.5" />
                      ({formatCLP(groupReturn)})
                    </span>
                  )}
                  {groupTransferOut > 0 && (
                    <span className="text-orange-500 font-mono-amount">
                      <ArrowRightLeft size={10} className="inline mr-0.5" />
                      ({formatCLP(groupTransferOut)})
                    </span>
                  )}
                  {isBalanced && (
                    <span className="font-bold text-emerald-600">✓ Cuadra</span>
                  )}
                  {isPending && (
                    <span className="font-bold text-amber-500">⏳ Pendiente de rendir</span>
                  )}
                  {isOweEmp && (
                    <span className="font-bold text-blue-600">↑ Reembolsar al empleado {formatCLP(Math.abs(groupDiff))}</span>
                  )}
                  {isOweComp && (
                    <span className="font-bold text-orange-500">↓ Devolver a empresa {formatCLP(groupDiff)}</span>
                  )}
                </div>
              </button>
            )}

            {/* Filas del grupo — ocultas cuando el grupo está colapsado */}
            {!isCollapsed && <div className="divide-y divide-ink-50">
              {group.map(h => {
                const isExpanded = expandedIds.has(h.id)
                // Determinar qué mostrar como monto principal
                const isAdvanceOnly = h.advance_total > 0 && h.expense_total === 0 && h.return_total === 0
                const isExpenseOnly = h.advance_total === 0 && h.expense_total > 0
                const displayAmount = isAdvanceOnly ? h.advance_total : h.expense_total || h.return_total || h.total_amount

                return (
                  <div key={h.id} className="bg-white">
                    <div className="p-4 flex items-center gap-3">
                      {/* Expand toggle */}
                      <button
                        onClick={() => toggle(h.id)}
                        className="text-ink-300 hover:text-ink-600 transition-colors shrink-0"
                        title={isExpanded ? 'Cerrar detalle' : 'Ver ítems'}
                      >
                        {isExpanded ? <ChevronDown size={15} /> : <ChevronRight size={15} />}
                      </button>

                      {/* Contenido */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          {editingTitleId === h.id ? (
                            <div className="flex items-center gap-1 flex-1 min-w-0">
                              <input
                                value={editTitle}
                                onChange={e => setEditTitle(e.target.value)}
                                onKeyDown={e => {
                                  if (e.key === 'Enter') handleSaveTitle(h.id)
                                  if (e.key === 'Escape') setEditingTitleId(null)
                                }}
                                autoFocus
                                className="flex-1 min-w-0 px-2 py-0.5 text-sm border border-ink-300 rounded-item focus:outline-none focus:ring-1 focus:ring-brand-600 font-semibold text-ink-900"
                              />
                              <button onClick={() => handleSaveTitle(h.id)} disabled={savingTitle}
                                className="p-0.5 text-brand-600 hover:bg-brand-50 rounded disabled:opacity-40">
                                <Check size={13} />
                              </button>
                              <button onClick={() => { setEditingTitleId(null); setTitleError(null) }}
                                className="p-0.5 text-ink-400 hover:bg-ink-100 rounded">
                                <X size={13} />
                              </button>
                              {titleError && <span className="text-xs text-rose-500">{titleError}</span>}
                            </div>
                          ) : (
                            <div className="flex items-center gap-1 group/title min-w-0">
                              <p className="font-semibold text-ink-900 text-sm truncate">{h.title}</p>
                              {isManager && (
                                <button
                                  onClick={() => { setEditingTitleId(h.id); setEditTitle(h.title); setTitleError(null) }}
                                  title="Renombrar"
                                  className="p-0.5 text-ink-200 hover:text-ink-500 rounded opacity-0 group-hover/title:opacity-100 transition-opacity shrink-0"
                                >
                                  <Pencil size={11} />
                                </button>
                              )}
                            </div>
                          )}
                          {!hasFund && h.fund_number && (
                            <span className="text-xs text-ink-400">Fondo N°{h.fund_number}</span>
                          )}
                        </div>
                        <p className="text-xs text-ink-400 mt-0.5">
                          {h.approved_at && <span>Fecha: {formatDate(h.approved_at.split('T')[0])}</span>}
                          <span className="ml-2 text-ink-300">· {h.submitter_name}</span>
                        </p>
                      </div>

                      {/* Monto y acciones */}
                      <div className="flex items-center gap-2 shrink-0">
                        <div className="text-right">
                          {isAdvanceOnly ? (
                            <p className="font-mono-amount font-bold text-blue-600 text-sm">
                              <ArrowDownToLine size={11} className="inline mr-0.5 mb-0.5" />
                              {formatCLP(h.advance_total)}
                            </p>
                          ) : isExpenseOnly ? (
                            <p className="font-mono-amount font-bold text-ink-900 text-sm">{formatCLP(h.expense_total)}</p>
                          ) : (
                            <div className="space-y-0.5">
                              {h.advance_total > 0 && <p className="font-mono-amount text-blue-600 text-xs">{formatCLP(h.advance_total)} adelanto</p>}
                              {h.expense_total > 0 && <p className="font-mono-amount text-ink-700 text-xs">({formatCLP(h.expense_total)}) gastos</p>}
                              {h.return_total  > 0 && <p className="font-mono-amount text-emerald-600 text-xs">({formatCLP(h.return_total)})</p>}
                            </div>
                          )}
                          {(() => {
                            const exportedCount = h.items.filter(i => i.defontana_exported_at).length
                            const totalExportable = h.items.filter(i => ['expense','advance','return'].includes(i.item_type || '')).length
                            return (
                              <div className="flex items-center gap-1.5 mt-0.5 flex-wrap justify-end">
                                <span className="text-xs px-2 py-0.5 rounded-full bg-ink-100 text-ink-500 font-medium">
                                  Histórica
                                </span>
                                {exportedCount > 0 && (
                                  <span
                                    className="text-xs px-2 py-0.5 rounded-full bg-teal-100 text-teal-700 font-medium flex items-center gap-1"
                                    title={h.defontana_export_ref ? `Comprobante: ${h.defontana_export_ref}` : undefined}
                                  >
                                    <BookCheck size={10} />
                                    {exportedCount === totalExportable ? 'Contabilizado' : `${exportedCount}/${totalExportable} contabilizados`}
                                    {h.defontana_export_ref && (
                                      <span className="font-mono opacity-75 text-[10px]">{h.defontana_export_ref}</span>
                                    )}
                                  </span>
                                )}
                              </div>
                            )
                          })()}
                        </div>
                        {isManager && (
                          <>
                            <button
                              onClick={() => onTransfer(h.id, h.submitter_id, h.advance_total || h.total_amount)}
                              title="Registrar traspaso a otro empleado"
                              className="p-1.5 text-violet-400 hover:text-violet-600 hover:bg-violet-50 rounded-item transition-colors"
                            >
                              <SendHorizontal size={14} />
                            </button>
                            <button
                              onClick={() => openDefPanel(h)}
                              title="Exportar a Defontana"
                              className={[
                                'p-1.5 rounded-item transition-colors',
                                defPanelId === h.id
                                  ? 'text-teal-700 bg-teal-100'
                                  : 'text-teal-500 hover:text-teal-700 hover:bg-teal-50',
                              ].join(' ')}
                            >
                              <FileSpreadsheet size={14} />
                            </button>
                            <button
                              onClick={() => onMove(h.id, h.title)}
                              disabled={movingHistId === h.id}
                              title="Mover a Rendiciones"
                              className="p-1.5 text-amber-500 hover:text-amber-700 hover:bg-amber-50 rounded-item transition-colors disabled:opacity-40"
                            >
                              <ArrowRightLeft size={14} />
                            </button>
                            <button
                              onClick={() => onDelete(h.id, h.title)}
                              disabled={deletingHistId === h.id}
                              title="Eliminar"
                              className="p-1.5 text-red-400 hover:text-red-600 hover:bg-red-50 rounded-item transition-colors disabled:opacity-40"
                            >
                              {deletingHistId === h.id ? <span className="text-xs">...</span> : <Trash2 size={14} />}
                            </button>
                          </>
                        )}
                      </div>
                    </div>

                    {/* Panel Defontana export */}
                    {defPanelId === h.id && (() => {
                      const EXPORTABLE = ['expense', 'advance', 'return'] as const
                      const typeInfo = EXPORTABLE.map(type => {
                        const all      = h.items.filter(i => i.item_type === type)
                        const pending  = all.filter(i => !i.defontana_exported_at)
                        const exported = all.filter(i =>  i.defontana_exported_at)
                        const total    = pending.reduce((s, i) => s + i.amount_clp, 0)
                        return { type, all, pending, exported, total }
                      }).filter(t => t.all.length > 0)

                      const hasAnythingPending = typeInfo.some(t => t.pending.length > 0 && defSelectedTypes.has(t.type))
                      const LABEL: Record<string, string> = { expense: 'Gastos', advance: 'Adelantos', return: 'Devoluciones' }

                      return (
                        <div className="border-t border-teal-100 bg-teal-50 px-4 py-4 space-y-3">
                          <div className="flex items-center justify-between">
                            <h4 className="text-sm font-semibold text-teal-900 flex items-center gap-1.5">
                              <FileSpreadsheet size={14} /> Exportar a Defontana
                            </h4>
                            <button onClick={() => setDefPanelId(null)} className="text-teal-400 hover:text-teal-700 transition-colors">
                              <X size={14} />
                            </button>
                          </div>

                          {typeInfo.length === 0 ? (
                            <p className="text-xs text-ink-500">Sin ítems exportables en esta carga.</p>
                          ) : (
                            <div className="space-y-2">
                              {typeInfo.map(({ type, pending, exported, total }) => {
                                const allDone   = pending.length === 0
                                const isChecked = defSelectedTypes.has(type)
                                return (
                                  <label
                                    key={type}
                                    className={`flex items-center gap-3 text-sm rounded-item px-2 py-1.5 bg-white border ${allDone ? 'border-teal-100 opacity-60' : 'border-ink-100 cursor-pointer hover:border-teal-200'}`}
                                  >
                                    <input
                                      type="checkbox"
                                      checked={isChecked && !allDone}
                                      disabled={allDone}
                                      onChange={() => {
                                        setDefSelectedTypes(prev => {
                                          const next = new Set(prev)
                                          next.has(type) ? next.delete(type) : next.add(type)
                                          return next
                                        })
                                      }}
                                      className="accent-teal-600 w-4 h-4 shrink-0"
                                    />
                                    <span className="flex-1 text-ink-700 font-medium">{LABEL[type]}</span>
                                    {allDone ? (
                                      <span className="text-xs text-teal-600 font-medium flex items-center gap-1">
                                        <BookCheck size={11} /> {exported.length} contabilizados
                                      </span>
                                    ) : (
                                      <span className="text-xs text-ink-500">
                                        {pending.length} pendientes · {formatCLP(total)}
                                        {exported.length > 0 && <span className="text-teal-600 ml-1">(+{exported.length} ya contabilizados)</span>}
                                      </span>
                                    )}
                                    {exported.length > 0 && (
                                      <button
                                        onClick={e => { e.preventDefault(); e.stopPropagation(); setRevertTarget({ h, types: [type] }) }}
                                        title={`Revertir la contabilización de ${LABEL[type].toLowerCase()} (${exported.length} ítems)`}
                                        className="shrink-0 p-1 text-amber-500 hover:text-amber-700 hover:bg-amber-50 rounded-item transition-colors"
                                      >
                                        <Undo2 size={12} />
                                      </button>
                                    )}
                                  </label>
                                )
                              })}
                            </div>
                          )}

                          {defExportWarnings && (
                            <div className="bg-amber-50 border border-amber-200 rounded-item px-3 py-2 text-xs text-amber-700">
                              ⚠ Sin cuenta Defontana: {defExportWarnings.categories.join(', ')}
                              {defExportWarnings.unmappedCLP > 0 && ` — ${formatCLP(defExportWarnings.unmappedCLP)} no incluidos en el asiento`}
                            </div>
                          )}

                          {typeInfo.length > 0 && (
                            <div className="space-y-3 pt-1">
                              {/* Paso 1: descargar Excel */}
                              <div className="flex items-center gap-3">
                                <button
                                  onClick={() => runExport(h)}
                                  disabled={defExporting || defConfirming || !hasAnythingPending}
                                  className="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-semibold text-teal-700 bg-white border border-teal-300 hover:bg-teal-50 rounded-item transition-colors disabled:opacity-40"
                                >
                                  {defExporting
                                    ? <><span className="animate-spin inline-block w-3 h-3 border-2 border-teal-500 border-t-transparent rounded-full" /> Generando...</>
                                    : <><FileSpreadsheet size={13} /> Generar Excel para Defontana</>
                                  }
                                </button>
                              </div>

                              {/* Paso 2: confirmar después de cargar en Defontana */}
                              <div className="border-t border-teal-100 pt-3 space-y-2">
                                <p className="text-xs font-semibold text-teal-800">
                                  ✓ Confirmar contabilización
                                </p>
                                <p className="text-xs text-ink-500">
                                  Hacé clic aquí solo después de haber importado el Excel en Defontana exitosamente.
                                </p>
                                {h.defontana_export_ref && (
                                  <p className="text-xs text-teal-600 font-mono">
                                    Último comprobante registrado: {h.defontana_export_ref}
                                  </p>
                                )}
                                <div className="flex items-center gap-2">
                                  <input
                                    type="text"
                                    placeholder="N° comprobante Defontana (opcional)"
                                    value={defComprobante}
                                    onChange={e => setDefComprobante(e.target.value)}
                                    disabled={defExporting || defConfirming}
                                    className="flex-1 border border-ink-200 rounded-item px-3 py-2 text-xs focus:outline-none focus:ring-1 focus:ring-teal-500 disabled:opacity-50"
                                  />
                                </div>
                                <button
                                  onClick={() => runConfirmContabilizado(h)}
                                  disabled={defConfirming || defExporting || (!hasAnythingPending && !defComprobante.trim())}
                                  className="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-bold text-white bg-teal-600 hover:bg-teal-700 rounded-item transition-colors disabled:opacity-40"
                                >
                                  {defConfirming
                                    ? <><span className="animate-spin inline-block w-3 h-3 border-2 border-white border-t-transparent rounded-full" /> Guardando...</>
                                    : <><BookCheck size={13} /> Confirmar contabilización</>
                                  }
                                </button>
                              </div>
                            </div>
                          )}
                        </div>
                      )
                    })()}

                    {/* Detalle expandido */}
                    {isExpanded && h.items.length > 0 && (
                      <HistoricalItemsTable reportId={h.id} items={h.items} onItemSaved={onItemSaved} onItemDeleted={onItemDeleted} onEditLinkedTransfer={onEditLinkedTransfer} onDeleteLinkedTransfer={onDeleteLinkedTransfer} />
                    )}
                    {isExpanded && h.items.length === 0 && (
                      <div className="bg-ink-50 border-t border-ink-100 px-6 py-3 text-xs text-ink-400 text-center">
                        Sin ítems registrados
                      </div>
                    )}
                  </div>
                )
              })}
            </div>}
          </div>
        )
      })}

      {revertTarget && (() => {
        const LABEL: Record<string, string> = { expense: 'Gastos', advance: 'Adelantos', return: 'Devoluciones' }
        const count = revertTarget.h.items.filter(
          i => revertTarget.types.includes(i.item_type as 'expense' | 'advance' | 'return') && i.defontana_exported_at
        ).length
        const tipos = revertTarget.types.map(t => LABEL[t] ?? t).join(', ')
        return (
          <RevertDefontanaDialog
            targetLabel={`${revertTarget.h.title} — ${tipos}`}
            detail={[
              `${count} ítem${count !== 1 ? 's' : ''}`,
              revertTarget.h.defontana_export_ref ? `Comprobante: ${revertTarget.h.defontana_export_ref}` : null,
            ].filter(Boolean).join(' · ')}
            onCancel={() => setRevertTarget(null)}
            onConfirm={runRevertContabilizado}
          />
        )
      })()}
    </div>
  )
}
