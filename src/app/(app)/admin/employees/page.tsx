'use client'

import { useEffect, useState } from 'react'
import { getOrgEmployees, updateEmployee, updateEmployeeEmail, deleteEmployee, deactivateEmployee } from '@/actions/admin'
import { sendInvitations } from '@/actions/employees'
import { EmployeeImport } from '@/components/admin/EmployeeImport'
import { AddEmployeeForm } from '@/components/admin/AddEmployeeForm'
import { ApproverConfig } from '@/components/admin/ApproverConfig'
import { Mail, Pencil, Check, X, Users, Send, Loader2, Trash2, UserX } from 'lucide-react'
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

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('es-CL', { day: '2-digit', month: '2-digit', year: '2-digit' })
}

export default function AdminEmployeesPage() {
  const [employees,        setEmployees]        = useState<EmployeeWithEmail[]>([])
  const [loading,          setLoading]          = useState(true)
  const [saving,           setSaving]           = useState<string | null>(null)
  const [panel,            setPanel]            = useState<'none' | 'add' | 'import'>('none')
  const [expandedApprover, setExpandedApprover] = useState<string | null>(null)

  // Selección para invitación masiva
  const [selected,        setSelected]         = useState<Set<string>>(new Set())
  const [inviting,        setInviting]         = useState<string | null>(null) // 'bulk' | userId
  const [inviteResults,   setInviteResults]    = useState<{ ok: number; fail: number; msg: string } | null>(null)

  const [emailEdit,  setEmailEdit]  = useState<{ id: string; value: string } | null>(null)
  const [emailSaving, setEmailSaving] = useState(false)
  const [emailError,  setEmailError]  = useState<string | null>(null)

  const [deletingId,     setDeletingId]     = useState<string | null>(null)
  const [deactivatingId, setDeactivatingId] = useState<string | null>(null)

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
    if (!newEmail || !newEmail.includes('@')) { setEmailError('Ingresá un correo válido'); return }
    setEmailSaving(true); setEmailError(null)
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

  async function handleSendInvitations(userIds: string[]) {
    const key = userIds.length > 1 ? 'bulk' : userIds[0]
    setInviting(key)
    setInviteResults(null)
    try {
      const results = await sendInvitations(userIds)
      const ok   = results.filter(r => r.success).length
      const fail = results.filter(r => !r.success).length
      const firstError = results.find(r => !r.success)?.error
      setInviteResults({ ok, fail, msg: firstError ?? '' })
      await load()
    } finally {
      setInviting(null)
    }
  }

  async function handleDeactivate(userId: string, name: string) {
    if (!confirm(`¿Inactivar a ${name}? Seguirá en el sistema pero no aparecerá en listas activas.`)) return
    setDeactivatingId(userId)
    try {
      await deactivateEmployee(userId)
      await load()
    } finally {
      setDeactivatingId(null)
    }
  }

  async function handleDelete(userId: string, name: string) {
    if (!confirm(`¿Eliminar a ${name} definitivamente?\n\nSe eliminará su cuenta y acceso. Sus rendiciones quedarán en el historial sin nombre asignado.\n\nEsta acción no se puede deshacer.`)) return
    setDeletingId(userId)
    try {
      await deleteEmployee(userId)
      await load()
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Error al eliminar empleado')
    } finally {
      setDeletingId(null)
    }
  }

  const notInvited = employees.filter(e => !e.invited_at)

  function toggleSelect(id: string) {
    setSelected(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
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
          <p className="text-sm text-ink-500 mt-1">
            {employees.length} persona{employees.length !== 1 ? 's' : ''} · {notInvited.length} sin invitar
          </p>
        </div>
        <div className="flex gap-2 shrink-0 flex-wrap">
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

      {/* Banner de feedback de invitaciones */}
      {inviteResults && (
        <div className={`flex items-start gap-3 p-3 rounded-item border text-sm ${
          inviteResults.fail === 0
            ? 'bg-emerald-50 border-emerald-200 text-emerald-700'
            : 'bg-amber-50 border-amber-200 text-amber-700'
        }`}>
          <div className="flex-1">
            {inviteResults.ok > 0 && <span className="font-semibold">{inviteResults.ok} invitación{inviteResults.ok !== 1 ? 'es' : ''} enviada{inviteResults.ok !== 1 ? 's' : ''}</span>}
            {inviteResults.fail > 0 && <span className="font-semibold ml-2 text-red-600">{inviteResults.fail} error{inviteResults.fail !== 1 ? 'es' : ''}</span>}
            {inviteResults.msg && <p className="text-xs mt-0.5 text-red-600">{inviteResults.msg}</p>}
          </div>
          <button onClick={() => setInviteResults(null)} className="text-slate-400 hover:text-slate-600"><X size={14} /></button>
        </div>
      )}

      {/* Barra de acciones de invitación */}
      {employees.length > 0 && (
        <div className="flex items-center gap-3 flex-wrap">
          {/* Invitar a todos sin invitar */}
          {notInvited.length > 0 && (
            <button
              onClick={() => handleSendInvitations(notInvited.map(e => e.id))}
              disabled={inviting === 'bulk'}
              className="inline-flex items-center gap-2 px-3 py-1.5 text-xs font-semibold text-white bg-teal-600 hover:bg-teal-700 disabled:opacity-50 rounded-item transition-colors"
            >
              {inviting === 'bulk'
                ? <><Loader2 size={12} className="animate-spin" />Enviando…</>
                : <><Send size={12} />Invitar a todos sin invitar ({notInvited.length})</>
              }
            </button>
          )}

          {/* Invitar seleccionados */}
          {selected.size > 0 && (
            <button
              onClick={() => handleSendInvitations([...selected])}
              disabled={!!inviting}
              className="inline-flex items-center gap-2 px-3 py-1.5 text-xs font-semibold text-white bg-brand-600 hover:bg-brand-700 disabled:opacity-50 rounded-item transition-colors"
            >
              {inviting && inviting !== 'bulk'
                ? <><Loader2 size={12} className="animate-spin" />Enviando…</>
                : <><Send size={12} />Invitar seleccionados ({selected.size})</>
              }
            </button>
          )}

          {selected.size > 0 && (
            <button onClick={() => setSelected(new Set())} className="text-xs text-slate-400 hover:text-slate-600">
              Limpiar selección
            </button>
          )}
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
          const badge        = ROLE_BADGE[emp.role] ?? ROLE_BADGE.employee
          const isOpen       = expandedApprover === emp.id
          const summary      = approverSummary(emp, employees)
          const hasApprover  = !!emp.approver_l1_id
          const isEditingEmail = emailEdit?.id === emp.id
          const isSelected   = selected.has(emp.id)
          const isInvitingSingle = inviting === emp.id

          return (
            <div
              key={emp.id}
              className={[
                'bg-white rounded-card shadow-card overflow-hidden transition-all',
                !emp.is_active && 'opacity-60',
                isSelected && 'ring-2 ring-brand-400',
              ].filter(Boolean).join(' ')}
            >
              <div className="p-4">
                {/* Fila superior: checkbox + avatar + info + rol */}
                <div className="flex items-center gap-3 flex-wrap">
                  {/* Checkbox de selección */}
                  <input
                    type="checkbox"
                    checked={isSelected}
                    onChange={() => toggleSelect(emp.id)}
                    className="w-4 h-4 rounded text-brand-600 border-slate-300 focus:ring-brand-500 shrink-0"
                    title="Seleccionar para invitar"
                  />

                  <div className="w-9 h-9 bg-brand-100 rounded-full flex items-center justify-center text-brand-600 font-bold text-sm shrink-0">
                    {emp.full_name[0].toUpperCase()}
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="font-semibold text-ink-900">{emp.full_name}</p>
                      <span className={`text-xs font-medium px-1.5 py-0.5 rounded-full ${badge.cls}`}>{badge.label}</span>
                      {/* Badge estado invitación */}
                      {emp.invited_at ? (
                        <span className="text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-teal-50 text-teal-700">
                          ✉ invitado {formatDate(emp.invited_at)}
                        </span>
                      ) : (
                        <span className="text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-amber-50 text-amber-700">
                          ⏳ sin invitar
                        </span>
                      )}
                    </div>
                    {emp.department && <p className="text-xs text-ink-400 mt-0.5">{emp.department}</p>}
                  </div>

                  {/* Rol selector + botón invitar individual */}
                  <div className="flex items-center gap-2">
                    {!emp.invited_at && (
                      <button
                        onClick={() => handleSendInvitations([emp.id])}
                        disabled={!!inviting}
                        title="Enviar invitación"
                        className="inline-flex items-center gap-1 px-2 py-1.5 text-xs font-semibold text-teal-700 bg-teal-50 hover:bg-teal-100 disabled:opacity-40 rounded-item transition-colors border border-teal-200"
                      >
                        {isInvitingSingle
                          ? <Loader2 size={11} className="animate-spin" />
                          : <Send size={11} />
                        }
                        Invitar
                      </button>
                    )}

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
                    <input type="checkbox" checked={emp.can_manage_petty_cash} disabled={saving === emp.id}
                      onChange={e => handleUpdate(emp.id, { can_manage_petty_cash: e.target.checked })}
                      className="rounded text-brand-600" />
                    EFF (Caja Chica)
                  </label>
                  <label className="flex items-center gap-1.5 text-xs text-ink-600 cursor-pointer">
                    <input type="checkbox" checked={emp.is_active} disabled={saving === emp.id}
                      onChange={e => handleUpdate(emp.id, { is_active: e.target.checked })}
                      className="rounded text-brand-600" />
                    Activo
                  </label>

                  {/* Acciones: inactivar / eliminar */}
                  <div className="ml-auto flex items-center gap-1">
                    {emp.is_active && (
                      <button
                        onClick={() => handleDeactivate(emp.id, emp.full_name)}
                        disabled={deactivatingId === emp.id || deletingId === emp.id}
                        title="Inactivar empleado"
                        className="p-1.5 text-amber-500 hover:text-amber-700 hover:bg-amber-50 rounded-item transition-colors disabled:opacity-40"
                      >
                        {deactivatingId === emp.id
                          ? <Loader2 size={14} className="animate-spin" />
                          : <UserX size={14} />}
                      </button>
                    )}
                    <button
                      onClick={() => handleDelete(emp.id, emp.full_name)}
                      disabled={deletingId === emp.id || deactivatingId === emp.id}
                      title="Eliminar empleado definitivamente"
                      className="p-1.5 text-red-400 hover:text-red-600 hover:bg-red-50 rounded-item transition-colors disabled:opacity-40"
                    >
                      {deletingId === emp.id
                        ? <Loader2 size={14} className="animate-spin" />
                        : <Trash2 size={14} />}
                    </button>
                  </div>

                  <button
                    onClick={() => setExpandedApprover(isOpen ? null : emp.id)}
                    className={[
                      'flex items-center gap-1.5 text-xs font-medium px-2.5 py-1.5 rounded-item transition-colors',
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
