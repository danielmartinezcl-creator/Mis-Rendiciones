'use client'

import { useEffect, useState } from 'react'
import {
  Utensils, Building2, GraduationCap, Fuel, Smartphone,
  Clapperboard, Package, Tag, Wrench, Car, Link2,
  Mail, Pencil, Check, X, Send, Trash2, AlertTriangle,
  Briefcase, Coffee, Home, Heart, ShoppingBag, Plane,
  Globe, DollarSign, FileText, Stethoscope, Hotel, Bus,
  type LucideIcon,
} from 'lucide-react'
import {
  getOrgCategories, addCategory, toggleCategoryActive,
  updateCategory, deleteCategory,
  getOrgEmployees, updateEmployee, updateEmployeeEmail,
  resendInvitation, deleteEmployee,
  getSpendingLimits, updateSpendingLimits,
} from '@/actions/admin'
import type { ExpenseCategory } from '@/lib/supabase/types'
import type { UserProfile } from '@/lib/supabase/types'

type Tab = 'categories' | 'employees' | 'chains' | 'limits'
type EmployeeWithEmail = UserProfile & { email: string }

/* ── Catálogo de íconos seleccionables ─────────────────────────────────── */
export const ICON_CATALOG: Array<{ key: string; Icon: LucideIcon; label: string }> = [
  { key: 'utensils',       Icon: Utensils,      label: 'Alimentación' },
  { key: 'coffee',         Icon: Coffee,        label: 'Café' },
  { key: 'building2',      Icon: Building2,     label: 'Alojamiento' },
  { key: 'hotel',          Icon: Hotel,         label: 'Hotel' },
  { key: 'graduation-cap', Icon: GraduationCap, label: 'Capacitación' },
  { key: 'fuel',           Icon: Fuel,          label: 'Combustible' },
  { key: 'smartphone',     Icon: Smartphone,    label: 'Comunicaciones' },
  { key: 'clapperboard',   Icon: Clapperboard,  label: 'Entretenimiento' },
  { key: 'package',        Icon: Package,       label: 'Materiales' },
  { key: 'wrench',         Icon: Wrench,        label: 'Servicios' },
  { key: 'car',            Icon: Car,           label: 'Vehículo' },
  { key: 'bus',            Icon: Bus,           label: 'Transporte' },
  { key: 'plane',          Icon: Plane,         label: 'Viajes' },
  { key: 'briefcase',      Icon: Briefcase,     label: 'Negocio' },
  { key: 'shopping-bag',   Icon: ShoppingBag,   label: 'Compras' },
  { key: 'home',           Icon: Home,          label: 'Inmueble' },
  { key: 'heart',          Icon: Heart,         label: 'Salud' },
  { key: 'stethoscope',    Icon: Stethoscope,   label: 'Médico' },
  { key: 'dollar-sign',    Icon: DollarSign,    label: 'Financiero' },
  { key: 'globe',          Icon: Globe,         label: 'Internacional' },
  { key: 'file-text',      Icon: FileText,      label: 'Documentos' },
  { key: 'tag',            Icon: Tag,           label: 'Otro' },
]

function getIconByKey(key: string | null | undefined): LucideIcon {
  if (!key) return Tag
  return ICON_CATALOG.find(e => e.key === key)?.Icon ?? Tag
}

function CategoryIcon({ icon, color }: { icon?: string | null; color?: string | null }) {
  const Icon = getIconByKey(icon)
  const bg   = color ?? '#8A95AD'
  return (
    <span className="w-9 h-9 rounded-item flex items-center justify-center shrink-0"
          style={{ backgroundColor: bg + '22', color: bg }}>
      <Icon size={17} strokeWidth={2} />
    </span>
  )
}

/* ── Selector de ícono ─────────────────────────────────────────────────── */
function IconPicker({ value, color, onChange }: { value: string; color: string; onChange: (key: string) => void }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {ICON_CATALOG.map(({ key, Icon, label }) => (
        <button
          key={key}
          type="button"
          title={label}
          onClick={() => onChange(key)}
          className={[
            'w-9 h-9 rounded-item flex items-center justify-center transition-all border',
            value === key
              ? 'shadow-sm scale-105'
              : 'border-ink-200 text-ink-400 hover:text-ink-700 hover:border-ink-400 bg-white',
          ].join(' ')}
          style={value === key ? {
            backgroundColor: color + '22',
            borderColor: color,
            color: color,
          } : {}}
        >
          <Icon size={16} strokeWidth={2} />
        </button>
      ))}
    </div>
  )
}

const ROLE_LABEL: Record<string, string> = {
  admin: 'Admin', approver: 'Aprobador', employee: 'Empleado',
}
const ROLE_CLS: Record<string, string> = {
  admin: 'bg-purple-100 text-purple-700',
  approver: 'bg-blue-100 text-blue-700',
  employee: 'bg-slate-100 text-slate-600',
}

/* ══════════════════════════════════════════════════════════════════════════ */
export default function AdminSettingsPage() {
  const [activeTab, setActiveTab] = useState<Tab>('categories')

  return (
    <div className="space-y-5 max-w-2xl">
      <h1 className="font-display font-extrabold text-2xl tracking-tight text-ink-900">Configuración</h1>

      {/* ── Tabs ── */}
      <div className="flex gap-1 bg-ink-100 p-1 rounded-item w-fit">
        {([
          { id: 'categories', label: 'Categorías' },
          { id: 'employees',  label: 'Empleados' },
          { id: 'chains',     label: 'Aprobación' },
          { id: 'limits',     label: 'Límites' },
        ] as { id: Tab; label: string }[]).map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={[
              'px-4 py-1.5 rounded-[10px] text-sm font-semibold transition-all duration-150',
              activeTab === tab.id
                ? 'bg-white text-ink-900 shadow-xs'
                : 'text-ink-500 hover:text-ink-800',
            ].join(' ')}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {activeTab === 'categories' && <CategoriesTab />}
      {activeTab === 'employees'  && <EmployeesTab />}
      {activeTab === 'chains'     && <ChainsTab />}
      {activeTab === 'limits'     && <LimitsTab />}
    </div>
  )
}

/* ── Tab: Categorías ───────────────────────────────────────────────────── */
function CategoriesTab() {
  const [categories, setCategories] = useState<ExpenseCategory[]>([])
  const [loading,    setLoading]    = useState(true)

  // Form nueva categoría
  const [catName,   setCatName]   = useState('')
  const [catColor,  setCatColor]  = useState('#4A50A0')
  const [catIcon,   setCatIcon]   = useState('tag')
  const [catSaving, setCatSaving] = useState(false)

  // Edición inline
  const [editCat,    setEditCat]    = useState<{ id: string; name: string; color: string; icon: string } | null>(null)
  const [editSaving, setEditSaving] = useState(false)

  // Eliminación
  const [deleteCat,    setDeleteCat]    = useState<string | null>(null)
  const [deleteLoading, setDeleteLoading] = useState(false)

  async function load() {
    setCategories(await getOrgCategories())
    setLoading(false)
  }
  useEffect(() => { load() }, [])

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault()
    if (!catName.trim()) return
    setCatSaving(true)
    try {
      await addCategory({ name: catName, color: catColor, icon: catIcon })
      setCatName(''); setCatColor('#4A50A0'); setCatIcon('tag')
      await load()
    } finally { setCatSaving(false) }
  }

  async function handleEdit(e: React.FormEvent) {
    e.preventDefault()
    if (!editCat || !editCat.name.trim()) return
    setEditSaving(true)
    try {
      await updateCategory(editCat.id, { name: editCat.name, color: editCat.color, icon: editCat.icon })
      setEditCat(null)
      await load()
    } finally { setEditSaving(false) }
  }

  async function handleDelete(id: string) {
    setDeleteLoading(true)
    try {
      await deleteCategory(id)
      setDeleteCat(null)
      await load()
    } finally { setDeleteLoading(false) }
  }

  const inputCls = 'w-full px-3 py-2.5 border border-ink-200 rounded-item text-sm focus:outline-none focus:ring-2 focus:ring-brand-600'

  if (loading) return <Spinner />

  return (
    <section className="space-y-3">
      <p className="text-xs text-ink-400">Las categorías globales están disponibles para todas las organizaciones. Podés agregar y modificar categorías propias de tu empresa.</p>

      {/* ── Formulario nueva categoría ── */}
      <form onSubmit={handleAdd} className="bg-white rounded-card shadow-card p-4 space-y-3">
        <h3 className="font-semibold text-ink-800 text-sm">Nueva categoría</h3>

        {/* Nombre + color */}
        <div className="flex gap-2">
          <input type="text" value={catName} onChange={e => setCatName(e.target.value)}
            placeholder="Nombre de la categoría" className={inputCls} required />
          <div className="shrink-0">
            <label className="block text-xs text-ink-400 mb-1 text-center">Color</label>
            <input type="color" value={catColor} onChange={e => setCatColor(e.target.value)}
              title="Color" className="w-11 h-8 rounded-item border border-ink-200 cursor-pointer p-0.5" />
          </div>
        </div>

        {/* Selector de ícono */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <p className="text-xs font-semibold text-ink-600">Ícono</p>
            <div className="flex items-center gap-2">
              <CategoryIcon icon={catIcon} color={catColor} />
              <span className="text-xs text-ink-400">Vista previa</span>
            </div>
          </div>
          <IconPicker value={catIcon} color={catColor} onChange={setCatIcon} />
        </div>

        <button type="submit" disabled={catSaving || !catName.trim()}
          className="px-4 py-2 bg-brand-600 hover:bg-brand-700 disabled:opacity-50 text-white text-sm font-bold rounded-item transition-all duration-[180ms] active:scale-[.97]">
          {catSaving ? 'Guardando…' : '+ Agregar'}
        </button>
      </form>

      {/* ── Lista de categorías ── */}
      <div className="space-y-2">
        {categories.map(cat => {
          const isOrgCat  = !!cat.org_id
          const isEditing = editCat?.id === cat.id
          const isDeleting = deleteCat === cat.id

          // ── Modo edición ──
          if (isEditing) {
            return (
              <form key={cat.id} onSubmit={handleEdit}
                className="bg-white rounded-card shadow-card p-4 space-y-3 border-t-2 border-t-brand-600">
                <div className="flex items-center justify-between">
                  <p className="text-xs font-semibold text-ink-600">Editar categoría</p>
                  <button type="button" onClick={() => setEditCat(null)}
                    className="p-1 text-ink-300 hover:text-ink-600 rounded transition-colors">
                    <X size={15} />
                  </button>
                </div>
                <div className="flex gap-2">
                  <input type="text" value={editCat.name}
                    onChange={e => setEditCat(c => c && ({ ...c, name: e.target.value }))}
                    className={inputCls} placeholder="Nombre" required />
                  <div className="shrink-0">
                    <label className="block text-xs text-ink-400 mb-1 text-center">Color</label>
                    <input type="color" value={editCat.color}
                      onChange={e => setEditCat(c => c && ({ ...c, color: e.target.value }))}
                      className="w-11 h-8 rounded-item border border-ink-200 cursor-pointer p-0.5" />
                  </div>
                </div>
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <p className="text-xs font-semibold text-ink-600">Ícono</p>
                    <div className="flex items-center gap-2">
                      <CategoryIcon icon={editCat.icon} color={editCat.color} />
                      <span className="text-xs text-ink-400">Vista previa</span>
                    </div>
                  </div>
                  <IconPicker value={editCat.icon} color={editCat.color}
                    onChange={key => setEditCat(c => c && ({ ...c, icon: key }))} />
                </div>
                <div className="flex gap-2">
                  <button type="submit" disabled={editSaving || !editCat.name.trim()}
                    className="inline-flex items-center gap-1.5 px-3 py-2 bg-brand-600 hover:bg-brand-700 disabled:opacity-50 text-white text-xs font-bold rounded-item transition-colors">
                    <Check size={12} />{editSaving ? 'Guardando…' : 'Guardar cambios'}
                  </button>
                  <button type="button" onClick={() => setEditCat(null)}
                    className="px-3 py-2 text-xs text-ink-500 hover:text-ink-800 border border-ink-200 rounded-item transition-colors">
                    Cancelar
                  </button>
                </div>
              </form>
            )
          }

          // ── Vista normal ──
          return (
            <div key={cat.id}
              className={['bg-white rounded-card shadow-card overflow-hidden transition-opacity',
                !cat.is_active && 'opacity-40'].filter(Boolean).join(' ')}>

              <div className="p-3 flex items-center gap-3">
                <CategoryIcon icon={cat.icon} color={cat.color} />
                <span className="flex-1 text-sm font-medium text-ink-800">{cat.name}</span>

                {/* Badge global (informativo, no bloquea edición) */}
                {!isOrgCat && <span className="text-xs text-ink-400 italic shrink-0">global</span>}

                {/* Acciones — disponibles para todas las categorías */}
                {!isDeleting && (
                  <div className="flex items-center gap-1 shrink-0">
                    {isOrgCat && (
                      <button
                        onClick={() => toggleCategoryActive(cat.id, cat.is_active).then(load)}
                        title={cat.is_active ? 'Desactivar' : 'Activar'}
                        className="text-xs text-ink-400 hover:text-ink-700 transition-colors font-medium px-2 py-1 hover:bg-ink-100 rounded-item">
                        {cat.is_active ? 'Desactivar' : 'Activar'}
                      </button>
                    )}
                    <button
                      onClick={() => setEditCat({ id: cat.id, name: cat.name, color: cat.color ?? '#4A50A0', icon: cat.icon ?? 'tag' })}
                      title="Editar categoría"
                      className="p-1.5 text-ink-300 hover:text-brand-600 rounded-item hover:bg-brand-50 transition-colors">
                      <Pencil size={14} />
                    </button>
                    <button
                      onClick={() => setDeleteCat(cat.id)}
                      title="Eliminar categoría"
                      className="p-1.5 text-ink-300 hover:text-rose-600 rounded-item hover:bg-rose-50 transition-colors">
                      <Trash2 size={14} />
                    </button>
                  </div>
                )}
              </div>

              {/* Confirmación de eliminación */}
              {isDeleting && (
                <div className="border-t border-rose-100 bg-rose-50 px-4 py-3 space-y-2">
                  <div className="flex items-start gap-2">
                    <AlertTriangle size={14} className="text-rose-500 shrink-0 mt-0.5" />
                    <p className="text-xs text-rose-700 font-semibold">
                      ¿Eliminar &quot;{cat.name}&quot;? Las rendiciones existentes que usan esta categoría no se verán afectadas.
                    </p>
                  </div>
                  <div className="flex gap-2">
                    <button onClick={() => handleDelete(cat.id)} disabled={deleteLoading}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-rose-600 hover:bg-rose-700 disabled:opacity-50 text-white text-xs font-bold rounded-item transition-colors">
                      <Trash2 size={11} />{deleteLoading ? 'Eliminando…' : 'Confirmar'}
                    </button>
                    <button onClick={() => setDeleteCat(null)}
                      className="px-3 py-1.5 text-xs text-ink-500 hover:text-ink-800 border border-ink-200 rounded-item transition-colors">
                      Cancelar
                    </button>
                  </div>
                </div>
              )}
            </div>
          )
        })}
      </div>
    </section>
  )
}

/* ── Tab: Empleados ────────────────────────────────────────────────────── */
function EmployeesTab() {
  const [employees, setEmployees] = useState<EmployeeWithEmail[]>([])
  const [loading,   setLoading]   = useState(true)

  /* Email edit */
  const [emailEdit,   setEmailEdit]   = useState<{ id: string; value: string } | null>(null)
  const [emailSaving, setEmailSaving] = useState(false)
  const [emailError,  setEmailError]  = useState<string | null>(null)

  /* Inline edit completo (nombre + rol + depto) */
  const [editFull, setEditFull] = useState<{
    id: string; name: string; role: UserProfile['role']; dept: string
  } | null>(null)
  const [editSaving, setEditSaving] = useState(false)

  /* Resend */
  const [resending, setResending] = useState<string | null>(null)
  const [resendOk,  setResendOk]  = useState<string | null>(null)

  /* Delete confirm */
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null)
  const [deleting,      setDeleting]      = useState(false)

  async function load() {
    setEmployees((await getOrgEmployees()) as EmployeeWithEmail[])
    setLoading(false)
  }
  useEffect(() => { load() }, [])

  /* ── Email ── */
  async function handleSaveEmail(userId: string) {
    if (!emailEdit) return
    const val = emailEdit.value.trim()
    if (!val.includes('@')) { setEmailError('Correo inválido'); return }
    setEmailSaving(true); setEmailError(null)
    try {
      await updateEmployeeEmail(userId, val)
      setEmailEdit(null); await load()
    } catch (err) {
      setEmailError(err instanceof Error ? err.message : 'Error')
    } finally { setEmailSaving(false) }
  }

  /* ── Edición completa ── */
  async function handleSaveEdit() {
    if (!editFull) return
    setEditSaving(true)
    try {
      await updateEmployee(editFull.id, {
        role:       editFull.role,
        department: editFull.dept.trim() || null,
        can_submit:  editFull.role !== 'approver',
        can_approve: editFull.role === 'approver' || editFull.role === 'admin',
      })
      setEditFull(null); await load()
    } finally { setEditSaving(false) }
  }

  /* ── Resend ── */
  async function handleResend(userId: string) {
    setResending(userId)
    try {
      await resendInvitation(userId)
      setResendOk(userId)
      setTimeout(() => setResendOk(null), 3000)
    } catch { /* silencioso */ }
    finally { setResending(null) }
  }

  /* ── Delete ── */
  async function handleDelete(userId: string) {
    setDeleting(true)
    try {
      await deleteEmployee(userId)
      setDeleteConfirm(null); await load()
    } finally { setDeleting(false) }
  }

  if (loading) return <Spinner />

  return (
    <section className="space-y-2">
      <p className="text-xs text-ink-400 mb-3">
        Gestioná el acceso de los integrantes de tu organización. Para agregar nuevos empleados usá el módulo <strong>Empleados</strong> en el menú.
      </p>

      {employees.map(emp => {
        const isEditingEmail = emailEdit?.id === emp.id
        const isEditingFull  = editFull?.id === emp.id
        const isDeleting     = deleteConfirm === emp.id

        return (
          <div key={emp.id}
            className={['bg-white rounded-card shadow-card overflow-hidden transition-opacity',
              !emp.is_active && 'opacity-50'].filter(Boolean).join(' ')}>

            <div className="p-4 space-y-3">

              {/* ── Fila principal ── */}
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 bg-brand-100 rounded-full flex items-center justify-center text-brand-700 font-bold text-sm shrink-0">
                  {emp.full_name[0].toUpperCase()}
                </div>

                {isEditingFull ? (
                  <div className="flex-1 space-y-2">
                    <input
                      value={editFull.name}
                      onChange={e => setEditFull(f => f && ({ ...f, name: e.target.value }))}
                      className="w-full px-2.5 py-1.5 border border-brand-500 rounded-item text-sm focus:outline-none focus:ring-2 focus:ring-brand-600"
                      placeholder="Nombre completo"
                    />
                    <div className="flex gap-2">
                      <select
                        value={editFull.role}
                        onChange={e => setEditFull(f => f && ({ ...f, role: e.target.value as UserProfile['role'] }))}
                        className="flex-1 border border-ink-200 rounded-item px-2.5 py-1.5 text-xs bg-white focus:outline-none focus:ring-2 focus:ring-brand-600"
                      >
                        <option value="employee">Empleado</option>
                        <option value="approver">Aprobador</option>
                        <option value="admin">Admin</option>
                      </select>
                      <input
                        value={editFull.dept}
                        onChange={e => setEditFull(f => f && ({ ...f, dept: e.target.value }))}
                        className="flex-1 px-2.5 py-1.5 border border-ink-200 rounded-item text-xs focus:outline-none focus:ring-2 focus:ring-brand-600"
                        placeholder="Departamento"
                      />
                    </div>
                    <div className="flex gap-2">
                      <button onClick={handleSaveEdit} disabled={editSaving}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-brand-600 hover:bg-brand-700 disabled:opacity-50 text-white text-xs font-bold rounded-item transition-colors">
                        <Check size={11} />{editSaving ? 'Guardando…' : 'Guardar'}
                      </button>
                      <button onClick={() => setEditFull(null)}
                        className="px-3 py-1.5 text-xs text-ink-500 hover:text-ink-800 border border-ink-200 rounded-item transition-colors">
                        Cancelar
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="font-semibold text-ink-900 text-sm">{emp.full_name}</p>
                      <span className={`text-xs font-medium px-1.5 py-0.5 rounded-full ${ROLE_CLS[emp.role] ?? ROLE_CLS.employee}`}>
                        {ROLE_LABEL[emp.role] ?? 'Empleado'}
                      </span>
                      {!emp.is_active && <span className="text-xs text-rose-500 font-medium">Inactivo</span>}
                    </div>
                    {emp.department && <p className="text-xs text-ink-400 mt-0.5">{emp.department}</p>}
                  </div>
                )}

                {/* Botones de acción */}
                {!isEditingFull && !isDeleting && (
                  <div className="flex items-center gap-1 shrink-0">
                    <button
                      onClick={() => setEditFull({ id: emp.id, name: emp.full_name, role: emp.role, dept: emp.department ?? '' })}
                      title="Editar datos"
                      className="p-1.5 text-ink-300 hover:text-brand-600 rounded-item hover:bg-brand-50 transition-colors"
                    >
                      <Pencil size={14} />
                    </button>
                    <button
                      onClick={() => handleResend(emp.id)}
                      disabled={resending === emp.id}
                      title="Reenviar invitación"
                      className={[
                        'p-1.5 rounded-item transition-colors',
                        resendOk === emp.id
                          ? 'text-emerald-600 bg-emerald-50'
                          : 'text-ink-300 hover:text-brand-600 hover:bg-brand-50',
                        resending === emp.id && 'opacity-50',
                      ].join(' ')}
                    >
                      {resendOk === emp.id ? <Check size={14} /> : <Send size={14} />}
                    </button>
                    <button
                      onClick={() => setDeleteConfirm(emp.id)}
                      title="Eliminar empleado"
                      className="p-1.5 text-ink-300 hover:text-rose-600 rounded-item hover:bg-rose-50 transition-colors"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                )}
              </div>

              {/* ── Email ── */}
              {!isEditingFull && (
                <div className="flex items-center gap-2">
                  <Mail size={13} className="text-ink-400 shrink-0" />
                  {isEditingEmail ? (
                    <div className="flex-1 flex items-center gap-2 flex-wrap">
                      <input
                        type="email"
                        value={emailEdit.value}
                        onChange={e => setEmailEdit({ id: emp.id, value: e.target.value })}
                        onKeyDown={e => { if (e.key === 'Enter') handleSaveEmail(emp.id); if (e.key === 'Escape') setEmailEdit(null) }}
                        autoFocus
                        className="flex-1 min-w-0 px-2.5 py-1 border border-brand-500 rounded-item text-sm focus:outline-none focus:ring-2 focus:ring-brand-600"
                        placeholder="correo@empresa.cl"
                      />
                      <div className="flex gap-1 shrink-0">
                        <button onClick={() => handleSaveEmail(emp.id)} disabled={emailSaving}
                          className="inline-flex items-center gap-1 px-2.5 py-1 bg-brand-600 hover:bg-brand-700 disabled:opacity-50 text-white text-xs font-bold rounded-item transition-colors">
                          <Check size={11} />{emailSaving ? '…' : 'Guardar'}
                        </button>
                        <button onClick={() => { setEmailEdit(null); setEmailError(null) }}
                          className="p-1.5 text-ink-400 hover:text-ink-700 rounded-item hover:bg-ink-100 transition-colors">
                          <X size={13} />
                        </button>
                      </div>
                      {emailError && <p className="w-full text-xs text-rose-600">{emailError}</p>}
                    </div>
                  ) : (
                    <div className="flex-1 flex items-center gap-2 min-w-0">
                      <span className="text-xs text-ink-500 truncate">
                        {emp.email || <span className="italic text-ink-300">sin correo</span>}
                      </span>
                      <button
                        onClick={() => { setEmailEdit({ id: emp.id, value: emp.email ?? '' }); setEmailError(null) }}
                        className="shrink-0 p-1 text-ink-300 hover:text-brand-600 rounded transition-colors"
                        title="Editar correo"
                      >
                        <Pencil size={11} />
                      </button>
                    </div>
                  )}
                </div>
              )}

              {/* ── Confirmación de eliminación ── */}
              {isDeleting && (
                <div className="bg-rose-50 border border-rose-200 rounded-item p-3 space-y-2">
                  <div className="flex items-start gap-2">
                    <AlertTriangle size={15} className="text-rose-500 shrink-0 mt-0.5" />
                    <div>
                      <p className="text-xs font-semibold text-rose-700">¿Eliminar a {emp.full_name}?</p>
                      <p className="text-xs text-rose-600 mt-0.5">Se revoca el acceso a la app. Las rendiciones históricas se conservan.</p>
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <button onClick={() => handleDelete(emp.id)} disabled={deleting}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-rose-600 hover:bg-rose-700 disabled:opacity-50 text-white text-xs font-bold rounded-item transition-colors">
                      <Trash2 size={11} />{deleting ? 'Eliminando…' : 'Confirmar eliminación'}
                    </button>
                    <button onClick={() => setDeleteConfirm(null)}
                      className="px-3 py-1.5 text-xs text-ink-500 hover:text-ink-800 border border-ink-200 rounded-item transition-colors">
                      Cancelar
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        )
      })}
    </section>
  )
}

/* ── Tab: Cadenas de aprobación ────────────────────────────────────────── */
function ChainsTab() {
  return (
    <section className="space-y-3">
      <div className="bg-brand-50 border border-brand-200 rounded-card p-4 flex gap-3 items-start">
        <Link2 size={18} className="text-brand-600 shrink-0 mt-0.5" />
        <div>
          <p className="text-sm font-medium text-brand-800">Las aprobaciones se configuran por empleado</p>
          <p className="text-xs text-brand-600 mt-1">
            Ve a <strong>Empleados</strong> en el menú y desplegá la tarjeta de cada persona para asignar su aprobador N1 y, si corresponde, un aprobador N2 en cadena.
          </p>
        </div>
      </div>
    </section>
  )
}

/* ── Tab: Límites de gasto ──────────────────────────────────────────────── */
function LimitsTab() {
  const [maxItem, setMaxItem] = useState('')
  const [maxFund, setMaxFund] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving,  setSaving]  = useState(false)
  const [saved,   setSaved]   = useState(false)
  const [error,   setError]   = useState<string | null>(null)

  useEffect(() => {
    getSpendingLimits().then(limits => {
      setMaxItem(limits.maxItemAmount != null ? String(limits.maxItemAmount) : '')
      setMaxFund(limits.maxFundAmount != null ? String(limits.maxFundAmount) : '')
      setLoading(false)
    })
  }, [])

  async function handleSave(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    setError(null)
    try {
      await updateSpendingLimits({
        maxItemAmount: maxItem ? parseInt(maxItem.replace(/\./g, ''), 10) : null,
        maxFundAmount: maxFund ? parseInt(maxFund.replace(/\./g, ''), 10) : null,
      })
      setSaved(true)
      setTimeout(() => setSaved(false), 3000)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al guardar')
    } finally {
      setSaving(false)
    }
  }

  if (loading) return <Spinner />

  return (
    <section className="space-y-4">
      <div>
        <h2 className="text-base font-display font-bold text-ink-900">Límites de gasto</h2>
        <p className="text-sm text-ink-500 mt-0.5">
          Configura montos máximos para ítems y fondos. Deja en blanco para no tener límite.
          Los límites son controles duros: el sistema rechaza el gasto si se excede.
        </p>
      </div>

      <form onSubmit={handleSave} className="bg-white rounded-card shadow-card p-5 space-y-5">
        <div>
          <label className="block text-sm font-semibold text-ink-700 mb-1">
            Monto máximo por ítem (CLP)
          </label>
          <p className="text-xs text-ink-400 mb-2">
            Aplica a cada gasto individual en rendiciones y en caja chica.
          </p>
          <div className="flex items-center gap-2">
            <span className="text-sm text-ink-500 font-mono-amount">$</span>
            <input
              type="text"
              inputMode="numeric"
              value={maxItem}
              onChange={e => setMaxItem(e.target.value.replace(/[^\d.]/g, ''))}
              placeholder="Sin límite"
              className="w-full max-w-xs border border-ink-200 rounded-item px-3 py-2 text-sm font-mono-amount focus:outline-none focus:ring-2 focus:ring-brand-600"
            />
          </div>
          {maxItem && !isNaN(parseInt(maxItem)) && (
            <p className="text-xs text-ink-400 mt-1">
              = $ {parseInt(maxItem).toLocaleString('es-CL')} CLP por ítem
            </p>
          )}
        </div>

        <div>
          <label className="block text-sm font-semibold text-ink-700 mb-1">
            Monto máximo por fondo de caja chica (CLP)
          </label>
          <p className="text-xs text-ink-400 mb-2">
            Límite al solicitar un nuevo fondo. El EFF puede aprobar menos, pero no más.
          </p>
          <div className="flex items-center gap-2">
            <span className="text-sm text-ink-500 font-mono-amount">$</span>
            <input
              type="text"
              inputMode="numeric"
              value={maxFund}
              onChange={e => setMaxFund(e.target.value.replace(/[^\d.]/g, ''))}
              placeholder="Sin límite"
              className="w-full max-w-xs border border-ink-200 rounded-item px-3 py-2 text-sm font-mono-amount focus:outline-none focus:ring-2 focus:ring-brand-600"
            />
          </div>
          {maxFund && !isNaN(parseInt(maxFund)) && (
            <p className="text-xs text-ink-400 mt-1">
              = $ {parseInt(maxFund).toLocaleString('es-CL')} CLP por fondo
            </p>
          )}
        </div>

        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-item p-3">{error}</div>
        )}
        {saved && (
          <div className="bg-emerald-50 border border-emerald-200 text-emerald-700 text-sm rounded-item p-3">
            ✓ Límites guardados correctamente
          </div>
        )}

        <button
          type="submit"
          disabled={saving}
          className="inline-flex items-center gap-2 px-5 py-2.5 bg-brand-600 hover:bg-brand-700 disabled:opacity-50 text-white text-sm font-bold rounded-item transition-colors"
        >
          <Check size={14} />
          {saving ? 'Guardando…' : 'Guardar límites'}
        </button>
      </form>
    </section>
  )
}

/* ── Spinner compartido ─────────────────────────────────────────────────── */
function Spinner() {
  return (
    <div className="flex items-center justify-center h-32">
      <div className="w-7 h-7 border-2 border-brand-600 border-t-transparent rounded-full animate-spin" />
    </div>
  )
}
