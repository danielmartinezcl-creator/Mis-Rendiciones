'use client'

import { useEffect, useState } from 'react'
import { getOrgEmployees, updateEmployee, updateEmployeeEmail } from '@/actions/admin'
import { EmployeeImport } from '@/components/admin/EmployeeImport'
import { AddEmployeeForm } from '@/components/admin/AddEmployeeForm'
import { ApproverConfig } from '@/components/admin/ApproverConfig'
import { Mail, Pencil, Check, X, Users } from 'lucide-react'
import type { UserProfile } from '@/lib/supabase/types'

type EmployeeWithEmail = UserProfile & { email: string }

const ROLE_BADGE: Record<string, { label: string; cls: string }> = {
  admin:    { label: 'Admin',      cls: 'bg-purple-100 text-purple-700' },
  approver: { label: 'Aprobador',  cls: 'bg-blue-100 text-blue-700' },
  employee: { label: 'Empleado',   cls: 'bg-slate-100 text-slate-600' },
}

function approverSummary(emp: UserProfile, all: UserProfile[]): string {
  const l1 = all.find(u => u.id === emp.approver_l1_id)
  const l2 = all.find(u => u.id === emp.approver_l2_id)
  if (!l1) return 'Sin aprobador'
  if (l2) return `${l1.full_name.split(' ')[0]} → ${l2.full_name.split(' ')[0]}`
  return l1.full_name.split(' ')[0]
}

export default function AdminEmployeesPage() {
  const [employees,        setEmployees]        = useState<EmployeeWithEmail[]>([])
  const [loading,          setLoading]          = useState(true)
  const [saving,           setSaving]           = useState<string | null>(null)
  const [panel,            setPanel]            = useState<'none' | 'add' | 'import'>('none')
  const [expandedApprover, setExpandedApprover] = useState<string | null>(null)

  /* Estado de edición de email: { userId, value } */
  const [emailEdit, setEmailEdit] = useState<{ id: string; value: string } | null>(null)
  const [emailSaving, setEmailSaving] = useState(false)
  const [emailError, setEmailError] = useState<string | null>(null)

  async function load() {
    const data = await getOrgEmployees()
    setEmployees(data as EmployeeWithEmail[])
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  async function handleUpdate(userId: string, updates: Parameters<typeof updateEmployee>[1]) {
    setSaving(userId)
    try {
      await updateEmployee(userId, updates)
      await load()
    } finally {
      setSaving(null)
    }
  }

  async function handleSaveEmail(userId: string) {
    if (!emailEdit) return
    const newEmail = emailEdit.value.trim()
    if (!newEmail || !newEmail.includes('@')) {
      setEmailError('Ingresá un correo válido')
      return
    }
    setEmailSaving(true)
    setEmailError(null)
    try {
      await updateEmployeeEmail(userId, newEmail)
      setEmailEdit(null)
      await load()
    } catch (err) {
      setEmailError(err instanceof Error ? err.message : 'Error al actualizar el correo')
    } finally {
      setEmailSaving(false)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-48">
        <div className="w-8 h-8 border-2 border-brand-600 border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="font-display font-extrabold text-2xl tracking-tight text-ink-900">Empleados</h1>
          <p className="text-sm text-ink-500 mt-1">{employees.length} persona{employees.length !== 1 ? 's' : ''} en la organización</p>
        </div>
        <div className="flex gap-2 shrink-0">
          <button
            onClick={() => setPanel(p => p === 'add' ? 'none' : 'add')}
            className={[
              'inline-flex items-center gap-2 px-4 py-2 text-sm font-bold rounded-item transition-all duration-[180ms] active:scale-[.97]',
              panel === 'add'
                ? 'bg-ink-100 text-ink-500'
                : 'bg-white border border-brand-600 text-brand-600 hover:bg-brand-50',
            ].join(' ')}
          >
            {panel === 'add'
              ? <><X size={12} />Cerrar</>
              : <><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>Agregar empleado</>
            }
          </button>
          <button
            onClick={() => setPanel(p => p === 'import' ? 'none' : 'import')}
            className={[
              'inline-flex items-center gap-2 px-4 py-2 text-sm font-bold text-white rounded-item transition-all duration-[180ms] active:scale-[.97] shadow-sm hover:shadow-md',
              panel === 'import' ? 'bg-ink-500' : '',
            ].join(' ')}
            style={panel !== 'import' ? { background: 'linear-gradient(130deg, #12152E 0%, #3B4090 100%)' } : undefined}
          >
            {panel === 'import'
              ? <><X size={12} />Cerrar</>
              : <><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>Importar nómina</>
            }
          </button>
        </div>
      </div>

      {/* Panel: agregar uno */}
      {panel === 'add' && (
        <div className="bg-white rounded-card shadow-card p-5 border-t-4 border-t-brand-600">
          <h2 className="text-sm font-semibold text-ink-800 mb-4">Agregar empleado</h2>
          <AddEmployeeForm onDone={() => { setPanel('none'); load() }} />
        </div>
      )}

      {/* Panel: importar Excel */}
      {panel === 'import' && (
        <div className="bg-white rounded-card shadow-card p-5 border-t-4 border-t-brand-600">
          <h2 className="text-sm font-semibold text-ink-800 mb-4">Importar empleados desde Excel</h2>
          <EmployeeImport onDone={() => { setPanel('none'); load() }} />
        </div>
      )}

      {/* Lista de empleados */}
      <div className="space-y-2">
        {employees.length === 0 && panel === 'none' && (
          <div className="text-center py-12 text-ink-400">
            <Users size={36} className="mx-auto mb-3 opacity-30" />
            <p className="text-sm">Sin empleados aún</p>
            <div className="flex gap-3 justify-center mt-3">
              <button onClick={() => setPanel('add')} className="text-brand-600 text-sm hover:underline">Agregar uno</button>
              <span className="text-ink-300">|</span>
              <button onClick={() => setPanel('import')} className="text-brand-600 text-sm hover:underline">Importar nómina</button>
            </div>
          </div>
        )}

        {employees.map(emp => {
          const badge      = ROLE_BADGE[emp.role] ?? ROLE_BADGE.employee
          const isOpen     = expandedApprover === emp.id
          const summary    = approverSummary(emp, employees)
          const hasApprover = !!emp.approver_l1_id
          const isEditingEmail = emailEdit?.id === emp.id

          return (
            <div
              key={emp.id}
              className={[
                'bg-white rounded-card shadow-card overflow-hidden',
                !emp.is_active && 'opacity-60',
              ].filter(Boolean).join(' ')}
            >
              <div className="p-4">
                {/* Fila superior: avatar + info + rol */}
                <div className="flex items-center gap-3 flex-wrap">
                  <div className="w-10 h-10 bg-brand-100 rounded-full flex items-center justify-center text-brand-600 font-bold text-sm shrink-0">
                    {emp.full_name[0].toUpperCase()}
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="font-semibold text-ink-900">{emp.full_name}</p>
                      <span className={`text-xs font-medium px-1.5 py-0.5 rounded-full ${badge.cls}`}>{badge.label}</span>
                    </div>
                    {emp.department && <p className="text-xs text-ink-400 mt-0.5">{emp.department}</p>}
                  </div>

                  <select
                    value={emp.role}
                    disabled={saving === emp.id}
                    onChange={e => handleUpdate(emp.id, { role: e.target.value as UserProfile['role'] })}
                    className="text-xs border border-ink-200 rounded-item px-2 py-1.5 bg-white focus:outline-none focus:ring-2 focus:ring-brand-600"
                  >
                    <option value="employee">Empleado</option>
                    <option value="approver">Aprobador</option>
                    <option value="admin">Administrador</option>
                  </select>
                </div>

                {/* Email */}
                <div className="mt-3 flex items-center gap-2">
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
                        <button
                          onClick={() => handleSaveEmail(emp.id)}
                          disabled={emailSaving}
                          className="inline-flex items-center gap-1 px-2.5 py-1 bg-brand-600 hover:bg-brand-700 disabled:opacity-50 text-white text-xs font-bold rounded-item transition-colors"
                        >
                          <Check size={11} />{emailSaving ? 'Guardando…' : 'Guardar'}
                        </button>
                        <button
                          onClick={() => { setEmailEdit(null); setEmailError(null) }}
                          className="p-1.5 text-ink-400 hover:text-ink-700 rounded-item hover:bg-ink-100 transition-colors"
                        >
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

                {/* Permisos + Estado + Aprobadores */}
                <div className="flex flex-wrap items-center gap-3 mt-3 pt-3 border-t border-ink-100">
                  <label className="flex items-center gap-1.5 text-xs text-ink-600 cursor-pointer">
                    <input type="checkbox" checked={emp.can_submit} disabled={saving === emp.id}
                      onChange={e => handleUpdate(emp.id, { can_submit: e.target.checked })}
                      className="rounded text-brand-600" />
                    Puede rendir
                  </label>
                  <label className="flex items-center gap-1.5 text-xs text-ink-600 cursor-pointer">
                    <input type="checkbox" checked={emp.can_approve} disabled={saving === emp.id}
                      onChange={e => handleUpdate(emp.id, { can_approve: e.target.checked })}
                      className="rounded text-brand-600" />
                    Puede aprobar
                  </label>
                  <label className="flex items-center gap-1.5 text-xs text-ink-600 cursor-pointer">
                    <input type="checkbox" checked={emp.is_active} disabled={saving === emp.id}
                      onChange={e => handleUpdate(emp.id, { is_active: e.target.checked })}
                      className="rounded text-brand-600" />
                    Activo
                  </label>

                  <button
                    onClick={() => setExpandedApprover(isOpen ? null : emp.id)}
                    className={[
                      'ml-auto flex items-center gap-1.5 text-xs font-medium px-2.5 py-1.5 rounded-item transition-colors',
                      isOpen
                        ? 'bg-brand-100 text-brand-700'
                        : hasApprover
                          ? 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100'
                          : 'bg-amber-50 text-amber-700 hover:bg-amber-100',
                    ].join(' ')}
                  >
                    <span>{isOpen ? '▲' : '▼'}</span>
                    <span>
                      {isOpen ? 'Cerrar' : hasApprover ? `⛓ ${summary}` : '⚠ Sin aprobador'}
                    </span>
                  </button>
                </div>
              </div>

              {/* Panel cadena de aprobación */}
              {isOpen && (
                <div className="border-t border-ink-100 bg-ink-50 px-4 py-4">
                  <p className="text-xs font-semibold text-ink-600 mb-3 uppercase tracking-wide">Cadena de aprobación</p>
                  <ApproverConfig
                    employee={emp}
                    allUsers={employees}
                    onSaved={() => { setExpandedApprover(null); load() }}
                  />
                </div>
              )}

              {saving === emp.id && (
                <p className="text-xs text-brand-600 px-4 pb-3">Guardando...</p>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
