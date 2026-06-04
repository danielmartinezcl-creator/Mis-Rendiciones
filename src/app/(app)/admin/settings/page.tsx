'use client'

import { useEffect, useState } from 'react'
import { getOrgCategories, addCategory, toggleCategoryActive } from '@/actions/admin'
import type { ExpenseCategory } from '@/lib/supabase/types'

export default function AdminSettingsPage() {
  const [categories, setCategories] = useState<ExpenseCategory[]>([])
  const [loading,    setLoading]    = useState(true)

  const [catName,   setCatName]   = useState('')
  const [catIcon,   setCatIcon]   = useState('')
  const [catColor,  setCatColor]  = useState('#6366f1')
  const [catSaving, setCatSaving] = useState(false)

  async function load() {
    const cats = await getOrgCategories()
    setCategories(cats)
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

  if (loading) {
    return (
      <div className="flex items-center justify-center h-48">
        <div className="w-8 h-8 border-2 border-indigo-600 border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  const inputCls = 'w-full px-3 py-2.5 border border-slate-200 rounded-[8px] text-sm focus:outline-none focus:ring-2 focus:ring-indigo-600'

  return (
    <div className="space-y-6 max-w-2xl">
      <h1 className="text-xl font-bold text-slate-800">Configuración</h1>

      {/* ── Categorías de gasto ─────────────────────────────── */}
      <section className="space-y-3">
        <div>
          <h2 className="text-sm font-semibold text-slate-700">Categorías de gasto</h2>
          <p className="text-xs text-slate-400 mt-0.5">Las categorías globales están disponibles para todas las organizaciones. Puedes agregar categorías propias de tu empresa.</p>
        </div>

        <form onSubmit={handleAddCategory} className="bg-white rounded-[12px] shadow-[0_1px_4px_rgba(0,0,0,.08)] p-4 space-y-3">
          <h3 className="font-semibold text-slate-800 text-sm">Nueva categoría</h3>
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
              {cat.color && <span className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: cat.color }} />}
              <span className="flex-1 text-sm font-medium text-slate-700">{cat.name}</span>
              {!cat.org_id && <span className="text-xs text-slate-400 italic">global</span>}
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
      </section>

      {/* ── Cadenas de aprobación ───────────────────────────── */}
      <section className="space-y-3">
        <h2 className="text-sm font-semibold text-slate-700">Cadenas de aprobación</h2>
        <div className="bg-indigo-50 border border-indigo-200 rounded-[12px] p-4 flex gap-3">
          <span className="text-xl shrink-0">⛓</span>
          <div>
            <p className="text-sm font-medium text-indigo-800">Las aprobaciones se configuran por empleado</p>
            <p className="text-xs text-indigo-600 mt-1">
              Ve a <strong>Empleados</strong> y despliega la tarjeta de cada persona para asignar su aprobador N1 y, si corresponde, un aprobador N2 en cadena.
            </p>
          </div>
        </div>
      </section>
    </div>
  )
}
