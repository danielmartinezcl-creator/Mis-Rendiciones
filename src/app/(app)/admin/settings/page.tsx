'use client'

import { useEffect, useState } from 'react'
import {
  Utensils, Building2, GraduationCap, Fuel, Smartphone,
  Clapperboard, Package, Tag, Wrench, Car, Link2,
  type LucideIcon,
} from 'lucide-react'
import { getOrgCategories, addCategory, toggleCategoryActive } from '@/actions/admin'
import type { ExpenseCategory } from '@/lib/supabase/types'

/* ── Mapeo nombre → ícono Lucide ─────────────────────────────────────── */
const ICON_MAP: Array<{ keywords: string[]; Icon: LucideIcon }> = [
  { keywords: ['alimenta', 'comida', 'restaurant', 'aliment'], Icon: Utensils },
  { keywords: ['alojamient', 'hotel', 'hosped', 'arrend'],     Icon: Building2 },
  { keywords: ['capacita', 'training', 'formac', 'curso'],     Icon: GraduationCap },
  { keywords: ['combustibl', 'bencin', 'gasolina', 'diesel'],  Icon: Fuel },
  { keywords: ['comunicac', 'telefon', 'celular', 'internet'],  Icon: Smartphone },
  { keywords: ['entretenim', 'recreac', 'divers'],              Icon: Clapperboard },
  { keywords: ['material', 'suministr', 'insumo', 'repuesto'],  Icon: Package },
  { keywords: ['servicio', 'mantenc', 'servic'],               Icon: Wrench },
  { keywords: ['transport', 'vehic', 'taxi', 'uber', 'tren'],  Icon: Car },
  { keywords: ['otro', 'other', 'miscel'],                     Icon: Tag },
]

function getCategoryIcon(name: string): LucideIcon {
  const lower = name.toLowerCase()
  for (const entry of ICON_MAP) {
    if (entry.keywords.some(k => lower.includes(k))) return entry.Icon
  }
  return Tag
}

function CategoryIcon({ name, color }: { name: string; color?: string | null }) {
  const Icon = getCategoryIcon(name)
  const bg   = color ?? '#8A95AD'
  return (
    <span
      className="w-9 h-9 rounded-item flex items-center justify-center shrink-0"
      style={{ backgroundColor: bg + '22', color: bg }}
    >
      <Icon size={17} strokeWidth={2} />
    </span>
  )
}

export default function AdminSettingsPage() {
  const [categories, setCategories] = useState<ExpenseCategory[]>([])
  const [loading,    setLoading]    = useState(true)

  const [catName,   setCatName]   = useState('')
  const [catColor,  setCatColor]  = useState('#0D9488')
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
      await addCategory({ name: catName, color: catColor || undefined })
      setCatName('')
      setCatColor('#0D9488')
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
        <div className="w-8 h-8 border-2 border-brand-600 border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  const inputCls = 'w-full px-3 py-2.5 border border-ink-200 rounded-item text-sm focus:outline-none focus:ring-2 focus:ring-brand-600'

  return (
    <div className="space-y-6 max-w-2xl">
      <h1 className="font-display font-extrabold text-2xl tracking-tight text-ink-900">Configuración</h1>

      {/* ── Categorías de gasto ─────────────────────────────── */}
      <section className="space-y-3">
        <div>
          <h2 className="text-sm font-semibold text-ink-800">Categorías de gasto</h2>
          <p className="text-xs text-ink-400 mt-0.5">Las categorías globales están disponibles para todas las organizaciones. Podés agregar categorías propias de tu empresa.</p>
        </div>

        <form onSubmit={handleAddCategory} className="bg-white rounded-card shadow-card p-4 space-y-3">
          <h3 className="font-semibold text-ink-800 text-sm">Nueva categoría</h3>
          <div className="flex gap-2">
            <input
              type="text"
              value={catName}
              onChange={e => setCatName(e.target.value)}
              placeholder="Nombre de la categoría"
              className={inputCls}
              required
            />
            <input
              type="color"
              value={catColor}
              onChange={e => setCatColor(e.target.value)}
              title="Color de la categoría"
              className="w-11 h-11 rounded-item border border-ink-200 cursor-pointer p-1 shrink-0"
            />
          </div>
          {catName.trim() && (
            <div className="flex items-center gap-2 text-xs text-ink-500">
              <CategoryIcon name={catName} color={catColor} />
              <span>Vista previa del ícono asignado automáticamente</span>
            </div>
          )}
          <button
            type="submit"
            disabled={catSaving || !catName.trim()}
            className="px-4 py-2 bg-brand-600 hover:bg-brand-700 disabled:opacity-50 text-white text-sm font-bold rounded-item transition-all duration-[180ms] active:scale-[.97]"
          >
            {catSaving ? 'Guardando…' : '+ Agregar'}
          </button>
        </form>

        <div className="space-y-2">
          {categories.map(cat => (
            <div
              key={cat.id}
              className={[
                'bg-white rounded-card shadow-card p-3 flex items-center gap-3 transition-opacity',
                !cat.is_active && 'opacity-40',
              ].filter(Boolean).join(' ')}
            >
              <CategoryIcon name={cat.name} color={cat.color} />
              <span className="flex-1 text-sm font-medium text-ink-800">{cat.name}</span>
              {!cat.org_id && <span className="text-xs text-ink-400 italic">global</span>}
              {cat.org_id && (
                <button
                  onClick={() => handleToggleCat(cat.id, cat.is_active)}
                  className="text-xs text-ink-400 hover:text-ink-600 transition-colors font-medium"
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
        <h2 className="text-sm font-semibold text-ink-800">Cadenas de aprobación</h2>
        <div className="bg-brand-50 border border-brand-200 rounded-card p-4 flex gap-3 items-start">
          <Link2 size={18} className="text-brand-600 shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-medium text-brand-800">Las aprobaciones se configuran por empleado</p>
            <p className="text-xs text-brand-600 mt-1">
              Ve a <strong>Empleados</strong> y desplegá la tarjeta de cada persona para asignar su aprobador N1 y, si corresponde, un aprobador N2 en cadena.
            </p>
          </div>
        </div>
      </section>
    </div>
  )
}
