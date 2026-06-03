'use client'

import { useEffect, useState } from 'react'
import {
  getOrgCategories, addCategory, toggleCategoryActive,
  getOrgPolicies, addPolicy, setDefaultPolicy, getOrgEmployees,
} from '@/actions/admin'
import type { ExpenseCategory, ApprovalPolicy, UserProfile } from '@/lib/supabase/types'

type Tab = 'categories' | 'policies'

export default function AdminSettingsPage() {
  const [tab,        setTab]        = useState<Tab>('categories')
  const [categories, setCategories] = useState<ExpenseCategory[]>([])
  const [policies,   setPolicies]   = useState<ApprovalPolicy[]>([])
  const [employees,  setEmployees]  = useState<UserProfile[]>([])
  const [loading,    setLoading]    = useState(true)

  // Formulario categoría
  const [catName,  setCatName]  = useState('')
  const [catIcon,  setCatIcon]  = useState('')
  const [catColor, setCatColor] = useState('#6366f1')
  const [catSaving, setCatSaving] = useState(false)

  // Formulario política
  const [polName,      setPolName]      = useState('')
  const [polApprovers, setPolApprovers] = useState<string[]>([])
  const [polSaving,    setPolSaving]    = useState(false)

  async function load() {
    const [cats, pols, emps] = await Promise.all([
      getOrgCategories(),
      getOrgPolicies(),
      getOrgEmployees(),
    ])
    setCategories(cats)
    setPolicies(pols)
    setEmployees(emps.filter(e => e.can_approve || e.role === 'admin'))
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  async function handleAddCategory(e: React.FormEvent) {
    e.preventDefault()
    if (!catName.trim()) return
    setCatSaving(true)
    try {
      await addCategory({ name: catName, icon: catIcon || undefined, color: catColor || undefined })
      setCatName('')
      setCatIcon('')
      await load()
    } finally {
      setCatSaving(false)
    }
  }

  async function handleToggleCat(id: string, current: boolean) {
    await toggleCategoryActive(id, !current)
    await load()
  }

  async function handleAddPolicy(e: React.FormEvent) {
    e.preventDefault()
    if (!polName.trim() || polApprovers.length === 0) return
    setPolSaving(true)
    try {
      await addPolicy({ name: polName, approverIds: polApprovers })
      setPolName('')
      setPolApprovers([])
      await load()
    } finally {
      setPolSaving(false)
    }
  }

  async function handleSetDefault(id: string) {
    await setDefaultPolicy(id)
    await load()
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-48">
        <div className="w-8 h-8 border-2 border-indigo-600 border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  const inputCls = 'w-full px-3 py-2.5 border border-slate-200 rounded-[8px] text-sm focus:outline-none focus:ring-2 focus:ring-indigo-600'

  return (
    <div className="space-y-4 max-w-2xl">
      <h1 className="text-xl font-bold text-slate-800">Configuración</h1>

      {/* Tabs */}
      <div className="flex gap-1 bg-slate-100 rounded-[10px] p-1">
        {(['categories', 'policies'] as Tab[]).map(t => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={[
              'flex-1 py-2 text-sm font-medium rounded-[8px] transition-colors',
              tab === t ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500 hover:text-slate-700',
            ].join(' ')}
          >
            {t === 'categories' ? 'Categorías' : 'Políticas de aprobación'}
          </button>
        ))}
      </div>

      {/* ── Categorías ── */}
      {tab === 'categories' && (
        <div className="space-y-4">
          {/* Formulario nueva categoría */}
          <form onSubmit={handleAddCategory} className="bg-white rounded-[12px] shadow-[0_1px_4px_rgba(0,0,0,.08)] p-4 space-y-3">
            <h3 className="font-semibold text-slate-800 text-sm">Agregar categoría</h3>
            <div className="grid grid-cols-[1fr_auto_auto] gap-2">
              <input
                type="text"
                value={catName}
                onChange={e => setCatName(e.target.value)}
                placeholder="Nombre de la categoría"
                className={inputCls}
                required
              />
              <input
                type="text"
                value={catIcon}
                onChange={e => setCatIcon(e.target.value)}
                placeholder="🏷️"
                className="w-14 px-2 py-2.5 border border-slate-200 rounded-[8px] text-sm text-center focus:outline-none focus:ring-2 focus:ring-indigo-600"
              />
              <input
                type="color"
                value={catColor}
                onChange={e => setCatColor(e.target.value)}
                className="w-10 h-10 rounded-[8px] border border-slate-200 cursor-pointer p-0.5"
              />
            </div>
            <button
              type="submit"
              disabled={catSaving || !catName.trim()}
              className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white text-sm font-semibold rounded-[8px] transition-colors"
            >
              {catSaving ? 'Guardando...' : '+ Agregar'}
            </button>
          </form>

          {/* Lista de categorías */}
          <div className="space-y-2">
            {categories.map(cat => (
              <div
                key={cat.id}
                className={[
                  'bg-white rounded-[12px] shadow-[0_1px_4px_rgba(0,0,0,.08)] p-3 flex items-center gap-3',
                  !cat.is_active && 'opacity-50',
                ].filter(Boolean).join(' ')}
              >
                {cat.icon && <span className="text-xl">{cat.icon}</span>}
                {cat.color && (
                  <span
                    className="w-3 h-3 rounded-full shrink-0"
                    style={{ backgroundColor: cat.color }}
                  />
                )}
                <span className="flex-1 text-sm font-medium text-slate-700">{cat.name}</span>
                {!cat.org_id && (
                  <span className="text-xs text-slate-400 italic">global</span>
                )}
                {cat.org_id && (
                  <button
                    onClick={() => handleToggleCat(cat.id, cat.is_active)}
                    className="text-xs text-slate-400 hover:text-slate-600 transition-colors"
                  >
                    {cat.is_active ? 'Desactivar' : 'Activar'}
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Políticas ── */}
      {tab === 'policies' && (
        <div className="space-y-4">
          {/* Formulario nueva política */}
          <form onSubmit={handleAddPolicy} className="bg-white rounded-[12px] shadow-[0_1px_4px_rgba(0,0,0,.08)] p-4 space-y-3">
            <h3 className="font-semibold text-slate-800 text-sm">Nueva política de aprobación</h3>
            <input
              type="text"
              value={polName}
              onChange={e => setPolName(e.target.value)}
              placeholder="Nombre de la política"
              className={inputCls}
              required
            />
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">
                Aprobadores (Nivel 1)
              </label>
              {employees.length === 0 && (
                <p className="text-xs text-slate-400">No hay usuarios con permiso de aprobación.</p>
              )}
              <div className="space-y-1">
                {employees.map(emp => (
                  <label key={emp.id} className="flex items-center gap-2 text-sm cursor-pointer">
                    <input
                      type="checkbox"
                      checked={polApprovers.includes(emp.id)}
                      onChange={e => {
                        setPolApprovers(prev =>
                          e.target.checked
                            ? [...prev, emp.id]
                            : prev.filter(id => id !== emp.id)
                        )
                      }}
                      className="rounded text-indigo-600"
                    />
                    {emp.full_name}
                    <span className="text-xs text-slate-400 capitalize">({emp.role})</span>
                  </label>
                ))}
              </div>
            </div>
            <button
              type="submit"
              disabled={polSaving || !polName.trim() || polApprovers.length === 0}
              className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white text-sm font-semibold rounded-[8px] transition-colors"
            >
              {polSaving ? 'Guardando...' : '+ Agregar política'}
            </button>
          </form>

          {/* Lista de políticas */}
          <div className="space-y-2">
            {policies.map(pol => (
              <div key={pol.id} className="bg-white rounded-[12px] shadow-[0_1px_4px_rgba(0,0,0,.08)] p-4 flex items-center gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="font-semibold text-slate-800 text-sm">{pol.name}</p>
                    {pol.is_default && (
                      <span className="text-xs bg-indigo-100 text-indigo-700 px-2 py-0.5 rounded-full font-medium">
                        Por defecto
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-slate-400 mt-0.5">
                    {(pol.levels as any[])?.length ?? 0} nivel(es) de aprobación
                  </p>
                </div>
                {!pol.is_default && (
                  <button
                    onClick={() => handleSetDefault(pol.id)}
                    className="text-xs text-indigo-600 hover:text-indigo-700 font-medium transition-colors"
                  >
                    Usar por defecto
                  </button>
                )}
              </div>
            ))}
            {policies.length === 0 && (
              <p className="text-sm text-slate-400 text-center py-6">
                No hay políticas configuradas.
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
