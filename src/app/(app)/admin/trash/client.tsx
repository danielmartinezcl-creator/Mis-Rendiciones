'use client'

import { useState } from 'react'
import { getTrashItems, restoreFromTrash, permanentlyDeleteFromTrash } from '@/actions/admin'
import { formatDate, formatCLP } from '@/lib/utils'
import { Trash2, RotateCcw, AlertTriangle, Archive, Users, Wallet } from 'lucide-react'

type TrashItems = Awaited<ReturnType<typeof getTrashItems>>
type Tab = 'reports' | 'funds' | 'users'

function daysLeft(deletedAt: string): number {
  const deleted = new Date(deletedAt).getTime()
  const elapsed = Math.floor((Date.now() - deleted) / 86_400_000)
  return Math.max(0, 90 - elapsed)
}

function DaysLeftBadge({ deletedAt }: { deletedAt: string }) {
  const days = daysLeft(deletedAt)
  if (days <= 7)  return <span className="text-xs font-semibold text-red-600 bg-red-50 px-2 py-0.5 rounded-full">{days}d restantes</span>
  if (days <= 30) return <span className="text-xs font-semibold text-amber-600 bg-amber-50 px-2 py-0.5 rounded-full">{days}d restantes</span>
  return <span className="text-xs text-slate-400 bg-slate-100 px-2 py-0.5 rounded-full">{days}d restantes</span>
}

interface Props { initialItems: TrashItems }

export function TrashClient({ initialItems }: Props) {
  const [items,    setItems]    = useState<TrashItems>(initialItems)
  const [tab,      setTab]      = useState<Tab>('reports')
  const [loading,  setLoading]  = useState<string | null>(null)

  async function reload() {
    const fresh = await getTrashItems()
    setItems(fresh)
  }

  async function handleRestore(type: 'report' | 'fund' | 'user', id: string, label: string) {
    if (!confirm(`¿Restaurar "${label}"? El ítem volverá a su módulo original.`)) return
    setLoading(id)
    try {
      await restoreFromTrash(type, id)
      await reload()
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Error al restaurar')
    } finally {
      setLoading(null)
    }
  }

  async function handlePermanentDelete(type: 'report' | 'fund' | 'user', id: string, label: string) {
    const confirmed = window.prompt(
      `⚠ ELIMINACIÓN PERMANENTE\n\n"${label}"\n\nEsta acción NO tiene vuelta atrás. Todos los datos asociados se borrarán definitivamente.\n\nEscribí ELIMINAR para confirmar:`
    )
    if (confirmed !== 'ELIMINAR') return
    setLoading(id)
    try {
      await permanentlyDeleteFromTrash(type, id)
      await reload()
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Error al eliminar')
    } finally {
      setLoading(null)
    }
  }

  const tabs = [
    { id: 'reports' as Tab, label: 'Rendiciones',  icon: Archive,  count: items.reports.length },
    { id: 'funds'   as Tab, label: 'Cajas Chicas',  icon: Wallet,   count: items.funds.length },
    { id: 'users'   as Tab, label: 'Empleados',    icon: Users,    count: items.users.length },
  ]

  const total = items.reports.length + items.funds.length + items.users.length

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-start gap-3">
        <div className="p-2.5 rounded-item bg-slate-100 text-slate-500 shrink-0">
          <Trash2 size={20} />
        </div>
        <div>
          <h1 className="text-xl font-bold text-slate-800">Papelera</h1>
          <p className="text-sm text-slate-500 mt-0.5">
            Los ítems eliminados se guardan aquí durante 90 días y luego se borran automáticamente.
          </p>
        </div>
      </div>

      {total === 0 ? (
        <div className="bg-white rounded-card shadow-[0_1px_4px_rgba(0,0,0,.08)] p-12 text-center">
          <Trash2 size={40} className="mx-auto text-slate-200 mb-3" />
          <p className="text-slate-500 font-medium">La papelera está vacía</p>
          <p className="text-xs text-slate-400 mt-1">Los ítems eliminados aparecerán aquí</p>
        </div>
      ) : (
        <>
          {/* Tabs */}
          <div className="flex gap-1 bg-slate-100 p-1 rounded-item w-fit">
            {tabs.map(t => (
              <button
                key={t.id}
                onClick={() => setTab(t.id)}
                className={[
                  'flex items-center gap-1.5 px-3 py-1.5 rounded-[10px] text-sm font-medium transition-colors',
                  tab === t.id ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500 hover:text-slate-700',
                ].join(' ')}
              >
                <t.icon size={14} />
                {t.label}
                {t.count > 0 && (
                  <span className={[
                    'text-xs font-bold px-1.5 py-0.5 rounded-full',
                    tab === t.id ? 'bg-slate-100 text-slate-600' : 'bg-slate-200 text-slate-500',
                  ].join(' ')}>
                    {t.count}
                  </span>
                )}
              </button>
            ))}
          </div>

          {/* Rendiciones */}
          {tab === 'reports' && (
            <div className="space-y-2">
              {items.reports.length === 0 ? (
                <EmptyTab label="rendiciones eliminadas" />
              ) : (
                items.reports.map(r => (
                  <div key={r.id} className="bg-white rounded-card shadow-[0_1px_4px_rgba(0,0,0,.08)] p-4 flex items-center gap-3 flex-wrap">
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-slate-800 truncate">{r.title}</p>
                      <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                        <span className="text-xs text-slate-400">por {r.submitter_name}</span>
                        <span className="text-xs text-slate-300">·</span>
                        <span className="text-xs text-slate-400">
                          Eliminada {formatDate(r.deleted_at!.split('T')[0])}
                        </span>
                        <span className="text-xs text-slate-300">·</span>
                        <span className="font-mono-amount text-xs text-slate-600">{formatCLP(r.total_amount)}</span>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <DaysLeftBadge deletedAt={r.deleted_at!} />
                      <button
                        onClick={() => handleRestore('report', r.id, r.title)}
                        disabled={loading === r.id}
                        title="Restaurar"
                        className="p-1.5 rounded-item text-brand-600 hover:bg-brand-50 transition-colors disabled:opacity-40"
                      >
                        <RotateCcw size={15} />
                      </button>
                      <button
                        onClick={() => handlePermanentDelete('report', r.id, r.title)}
                        disabled={loading === r.id}
                        title="Eliminar permanentemente"
                        className="p-1.5 rounded-item text-red-500 hover:bg-red-50 transition-colors disabled:opacity-40"
                      >
                        <Trash2 size={15} />
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          )}

          {/* Cajas Chicas */}
          {tab === 'funds' && (
            <div className="space-y-2">
              {items.funds.length === 0 ? (
                <EmptyTab label="cajas chicas eliminadas" />
              ) : (
                items.funds.map(f => (
                  <div key={f.id} className="bg-white rounded-card shadow-[0_1px_4px_rgba(0,0,0,.08)] p-4 flex items-center gap-3 flex-wrap">
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-slate-800 truncate">{f.name}</p>
                      <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                        <span className="text-xs text-slate-400">empleado: {f.employee_name}</span>
                        <span className="text-xs text-slate-300">·</span>
                        <span className="text-xs text-slate-400">
                          Eliminada {formatDate(f.deleted_at!.split('T')[0])}
                        </span>
                        <span className="text-xs text-slate-300">·</span>
                        <span className="font-mono-amount text-xs text-slate-600">{formatCLP(f.amount_requested)}</span>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <DaysLeftBadge deletedAt={f.deleted_at!} />
                      <button
                        onClick={() => handleRestore('fund', f.id, f.name)}
                        disabled={loading === f.id}
                        title="Restaurar"
                        className="p-1.5 rounded-item text-brand-600 hover:bg-brand-50 transition-colors disabled:opacity-40"
                      >
                        <RotateCcw size={15} />
                      </button>
                      <button
                        onClick={() => handlePermanentDelete('fund', f.id, f.name)}
                        disabled={loading === f.id}
                        title="Eliminar permanentemente"
                        className="p-1.5 rounded-item text-red-500 hover:bg-red-50 transition-colors disabled:opacity-40"
                      >
                        <Trash2 size={15} />
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          )}

          {/* Empleados */}
          {tab === 'users' && (
            <div className="space-y-2">
              <div className="flex items-start gap-2 p-3 bg-amber-50 border border-amber-100 rounded-item text-amber-700 text-sm">
                <AlertTriangle size={14} className="shrink-0 mt-0.5" />
                <span>Los empleados eliminados no pueden iniciar sesión. Al restaurar recuperan el acceso automáticamente.</span>
              </div>
              {items.users.length === 0 ? (
                <EmptyTab label="empleados eliminados" />
              ) : (
                items.users.map(u => (
                  <div key={u.id} className="bg-white rounded-card shadow-[0_1px_4px_rgba(0,0,0,.08)] p-4 flex items-center gap-3 flex-wrap">
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-slate-800">{u.full_name}</p>
                      <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                        <span className="text-xs text-slate-400 capitalize">{u.role}</span>
                        {u.department && <>
                          <span className="text-xs text-slate-300">·</span>
                          <span className="text-xs text-slate-400">{u.department}</span>
                        </>}
                        <span className="text-xs text-slate-300">·</span>
                        <span className="text-xs text-slate-400">
                          Eliminado {formatDate(u.deleted_at!.split('T')[0])}
                        </span>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <DaysLeftBadge deletedAt={u.deleted_at!} />
                      <button
                        onClick={() => handleRestore('user', u.id, u.full_name)}
                        disabled={loading === u.id}
                        title="Restaurar acceso"
                        className="p-1.5 rounded-item text-brand-600 hover:bg-brand-50 transition-colors disabled:opacity-40"
                      >
                        <RotateCcw size={15} />
                      </button>
                      <button
                        onClick={() => handlePermanentDelete('user', u.id, u.full_name)}
                        disabled={loading === u.id}
                        title="Eliminar permanentemente"
                        className="p-1.5 rounded-item text-red-500 hover:bg-red-50 transition-colors disabled:opacity-40"
                      >
                        <Trash2 size={15} />
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          )}
        </>
      )}
    </div>
  )
}

function EmptyTab({ label }: { label: string }) {
  return (
    <div className="bg-white rounded-card shadow-[0_1px_4px_rgba(0,0,0,.08)] p-8 text-center">
      <p className="text-sm text-slate-400">No hay {label}</p>
    </div>
  )
}
