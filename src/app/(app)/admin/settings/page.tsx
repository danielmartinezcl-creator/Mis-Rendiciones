'use client'

import { useEffect, useState } from 'react'
import {
  Utensils, Building2, GraduationCap, Fuel, Smartphone,
  Clapperboard, Package, Tag, Wrench, Car, Link2,
  Mail, Pencil, Check, X, Send, Trash2, AlertTriangle,
  type LucideIcon,
} from 'lucide-react'
import {
  getOrgCategories, addCategory, toggleCategoryActive,
  getOrgEmployees, updateEmployee, updateEmployeeEmail,
  resendInvitation, deleteEmployee,
} from '@/actions/admin'
import type { ExpenseCategory } from '@/lib/supabase/types'
import type { UserProfile } from '@/lib/supabase/types'

type Tab = 'categories' | 'employees' | 'chains'
type EmployeeWithEmail = UserProfile & { email: string }

/* ── Íconos de categoría ────────────────────────────────────────────────── */
const ICON_MAP: Array<{ keywords: string[]; Icon: LucideIcon }> = [
  { keywords: ['alimenta', 'comida', 'restaurant'],     Icon: Utensils },
  { keywords: ['alojamient', 'hotel', 'hosped'],        Icon: Building2 },
  { keywords: ['capacita', 'training', 'curso'],        Icon: GraduationCap },
  { keywords: ['combustibl', 'bencin', 'gasolina'],     Icon: Fuel },
  { keywords: ['comunicac', 'telefon', 'celular'],      Icon: Smartphone },
  { keywords: ['entretenim', 'recreac', 'divers'],      Icon: Clapperboard },
  { keywords: ['material', 'suministr', 'insumo'],      Icon: Package },
  { keywords: ['servicio', 'mantenc'],                  Icon: Wrench },
  { keywords: ['transport', 'vehic', 'taxi', 'uber'],   Icon: Car },
  { keywords: ['otro', 'other', 'miscel'],              Icon: Tag },
]
function getCategoryIcon(name: string): LucideIcon {
  const lower = name.toLowerCase()
  return ICON_MAP.find(e => e.keywords.some(k => lower.includes(k)))?.Icon ?? Tag
}
function CategoryIcon({ name, color }: { name: string; color?: string | null }) {
  const Icon = getCategoryIcon(name)
  const bg   = color ?? '#8A95AD'
  return (
    <span className="w-9 h-9 rounded-item flex items-center justify-center shrink-0"
          style={{ backgroundColor: bg + '22', color: bg }}>
      <Icon size={17} strokeWidth={2} />
    </span>
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
    </div>
  )
}

/* ── Tab: Categorías ───────────────────────────────────────────────────── */
function CategoriesTab() {
  const [categories, setCategories] = useState<ExpenseCategory[]>([])
  const [loading,    setLoading]    = useState(true)
  const [catName,    setCatName]    = useState('')
  const [catColor,   setCatColor]   = useState('#4A50A0')
  const [catSaving,  setCatSaving]  = useState(false)

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
      await addCategory({ name: catName, color: catColor || undefined })
      setCatName(''); setCatColor('#4A50A0')
      await load()
    } finally { setCatSaving(false) }
  }

  const inputCls = 'w-full px-3 py-2.5 border border-ink-200 rounded-item text-sm focus:outline-none focus:ring-2 focus:ring-brand-600'

  if (loading) return <Spinner />

  return (
    <section className="space-y-3">
      <p className="text-xs text-ink-400">Las categorías globales están disponibles para todas las organizaciones. Podés agregar categorías propias de tu empresa.</p>

      <form onSubmit={handleAdd} className="bg-white rounded-card shadow-card p-4 space-y-3">
        <h3 className="font-semibold text-ink-800 text-sm">Nueva categoría</h3>
        <div className="flex gap-2">
          <input type="text" value={catName} onChange={e => setCatName(e.target.value)}
            placeholder="Nombre de la categoría" className={inputCls} required />
          <input type="color" value={catColor} onChange={e => setCatColor(e.target.value)}
            title="Color" className="w-11 h-11 rounded-item border border-ink-200 cursor-pointer p-1 shrink-0" />
        </div>
        {catName.trim() && (
          <div className="flex items-center gap-2 text-xs text-ink-500">
            <CategoryIcon name={catName} color={catColor} />
            <span>Vista previa del ícono asignado automáticamente</span>
          </div>
        )}
        <button type="submit" disabled={catSaving || !catName.trim()}
          className="px-4 py-2 bg-brand-600 hover:bg-brand-700 disabled:opacity-50 text-white text-sm font-bold rounded-item transition-all duration-[180ms] active:scale-[.97]">
          {catSaving ? 'Guardando…' : '+ Agregar'}
        </button>
      </form>

      <div className="space-y-2">
        {categories.map(cat => (
          <div key={cat.id}
            className={['bg-white rounded-card shadow-card p-3 flex items-center gap-3 transition-opacity',
              !cat.is_active && 'opacity-40'].filter(Boolean).join(' ')}>
            <CategoryIcon name={cat.name} color={cat.color} />
            <span className="flex-1 text-sm font-medium text-ink-800">{cat.name}</span>
            {!cat.org_id && <span className="text-xs text-ink-400 italic">global</span>}
            {cat.org_id && (
              <button onClick={() => toggleCategoryActive(cat.id, cat.is_active).then(load)}
                className="text-xs text-ink-400 hover:text-ink-600 transition-colors font-medium">
                {cat.is_active ? 'Desactivar' : 'Activar'}
              </button>
            )}
          </div>
        ))}
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

/* ── Spinner compartido ─────────────────────────────────────────────────── */
function Spinner() {
  return (
    <div className="flex items-center justify-center h-32">
      <div className="w-7 h-7 border-2 border-brand-600 border-t-transparent rounded-full animate-spin" />
    </div>
  )
}
