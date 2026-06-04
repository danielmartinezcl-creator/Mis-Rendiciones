'use client'

import { useEffect, useState } from 'react'
import { getOrgEmployees, updateEmployee } from '@/actions/admin'
import { EmployeeImport } from '@/components/admin/EmployeeImport'
import { AddEmployeeForm } from '@/components/admin/AddEmployeeForm'
import { ApproverConfig } from '@/components/admin/ApproverConfig'
import type { UserProfile } from '@/lib/supabase/types'

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
  const [employees,     setEmployees]     = useState<UserProfile[]>([])
  const [loading,       setLoading]       = useState(true)
  const [saving,        setSaving]        = useState<string | null>(null)
  const [panel,         setPanel]         = useState<'none' | 'add' | 'import'>('none')
  const [expandedApprover, setExpandedApprover] = useState<string | null>(null)

  async function load() {
    const data = await getOrgEmployees()
    setEmployees(data)
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

  if (loading) {
    return (
      <div className="flex items-center justify-center h-48">
        <div className="w-8 h-8 border-2 border-indigo-600 border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-xl font-bold text-slate-800">Empleados</h1>
          <p className="text-sm text-slate-500 mt-1">{employees.length} persona{employees.length !== 1 ? 's' : ''} en la organización</p>
        </div>
        <div className="flex gap-2 shrink-0">
          <button
            onClick={() => setPanel(p => p === 'add' ? 'none' : 'add')}
            className={[
              'px-4 py-2 text-sm font-semibold rounded-[12px] transition-colors border',
              panel === 'add'
                ? 'bg-slate-100 border-slate-300 text-slate-600'
                : 'bg-white border-indigo-600 text-indigo-600 hover:bg-indigo-50',
            ].join(' ')}
          >
            {panel === 'add' ? '✕ Cerrar' : '➕ Agregar empleado'}
          </button>
          <button
            onClick={() => setPanel(p => p === 'import' ? 'none' : 'import')}
            className={[
              'px-4 py-2 text-sm font-semibold rounded-[12px] transition-colors',
              panel === 'import'
                ? 'bg-slate-100 text-slate-600'
                : 'bg-indigo-600 hover:bg-indigo-700 text-white',
            ].join(' ')}
          >
            {panel === 'import' ? '✕ Cerrar' : '📊 Importar nómina'}
          </button>
        </div>
      </div>

      {/* Panel: agregar uno */}
      {panel === 'add' && (
        <div className="bg-white rounded-[12px] shadow-[0_1px_4px_rgba(0,0,0,.08)] p-5 border-t-4 border-t-indigo-500">
          <h2 className="text-sm font-semibold text-slate-700 mb-4">Agregar empleado</h2>
          <AddEmployeeForm onDone={() => { setPanel('none'); load() }} />
        </div>
      )}

      {/* Panel: importar Excel */}
      {panel === 'import' && (
        <div className="bg-white rounded-[12px] shadow-[0_1px_4px_rgba(0,0,0,.08)] p-5 border-t-4 border-t-indigo-500">
          <h2 className="text-sm font-semibold text-slate-700 mb-4">Importar empleados desde Excel</h2>
          <EmployeeImport onDone={() => { setPanel('none'); load() }} />
        </div>
      )}

      {/* Lista de empleados */}
      <div className="space-y-2">
        {employees.length === 0 && panel === 'none' && (
          <div className="text-center py-12 text-slate-400">
            <p className="text-2xl mb-2">👥</p>
            <p className="text-sm">Sin empleados aún</p>
            <div className="flex gap-3 justify-center mt-3">
              <button onClick={() => setPanel('add')} className="text-indigo-600 text-sm hover:underline">Agregar uno</button>
              <span className="text-slate-300">|</span>
              <button onClick={() => setPanel('import')} className="text-indigo-600 text-sm hover:underline">Importar nómina</button>
            </div>
          </div>
        )}

        {employees.map(emp => {
          const badge   = ROLE_BADGE[emp.role] ?? ROLE_BADGE.employee
          const isOpen  = expandedApprover === emp.id
          const summary = approverSummary(emp, employees)
          const hasApprover = !!emp.approver_l1_id

          return (
            <div
              key={emp.id}
              className={[
                'bg-white rounded-[12px] shadow-[0_1px_4px_rgba(0,0,0,.08)] overflow-hidden',
                !emp.is_active && 'opacity-60',
              ].filter(Boolean).join(' ')}
            >
              {/* Fila principal */}
              <div className="p-4">
                <div className="flex items-center gap-3 flex-wrap">
                  {/* Avatar */}
                  <div className="w-10 h-10 bg-indigo-100 rounded-full flex items-center justify-center text-indigo-600 font-bold text-sm shrink-0">
                    {emp.full_name[0].toUpperCase()}
                  </div>

                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="font-semibold text-slate-800 truncate">{emp.full_name}</p>
                      <span className={`text-xs font-medium px-1.5 py-0.5 rounded-full ${badge.cls}`}>{badge.label}</span>
                    </div>
                    {emp.department && <p className="text-xs text-slate-400 mt-0.5">{emp.department}</p>}
                  </div>

                  {/* Rol */}
                  <select
                    value={emp.role}
                    disabled={saving === emp.id}
                    onChange={e => handleUpdate(emp.id, { role: e.target.value as UserProfile['role'] })}
                    className="text-xs border border-slate-200 rounded-[8px] px-2 py-1.5 bg-white focus:outline-none focus:ring-2 focus:ring-indigo-600"
                  >
                    <option value="employee">Empleado</option>
                    <option value="approver">Aprobador</option>
                    <option value="admin">Administrador</option>
                  </select>
                </div>

                {/* Permisos + Estado + Aprobadores */}
                <div className="flex flex-wrap items-center gap-3 mt-3 pt-3 border-t border-slate-100">
                  <label className="flex items-center gap-1.5 text-xs text-slate-600 cursor-pointer">
                    <input type="checkbox" checked={emp.can_submit} disabled={saving === emp.id}
                      onChange={e => handleUpdate(emp.id, { can_submit: e.target.checked })}
                      className="rounded text-indigo-600" />
                    Puede rendir
                  </label>
                  <label className="flex items-center gap-1.5 text-xs text-slate-600 cursor-pointer">
                    <input type="checkbox" checked={emp.can_approve} disabled={saving === emp.id}
                      onChange={e => handleUpdate(emp.id, { can_approve: e.target.checked })}
                      className="rounded text-indigo-600" />
                    Puede aprobar
                  </label>
                  <label className="flex items-center gap-1.5 text-xs text-slate-600 cursor-pointer">
                    <input type="checkbox" checked={emp.is_active} disabled={saving === emp.id}
                      onChange={e => handleUpdate(emp.id, { is_active: e.target.checked })}
                      className="rounded text-indigo-600" />
                    Activo
                  </label>

                  {/* Botón aprobadores */}
                  <button
                    onClick={() => setExpandedApprover(isOpen ? null : emp.id)}
                    className={[
                      'ml-auto flex items-center gap-1.5 text-xs font-medium px-2.5 py-1.5 rounded-[8px] transition-colors',
                      isOpen
                        ? 'bg-indigo-100 text-indigo-700'
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

              {/* Panel de cadena de aprobación */}
              {isOpen && (
                <div className="border-t border-slate-100 bg-slate-50 px-4 py-4">
                  <p className="text-xs font-semibold text-slate-600 mb-3 uppercase tracking-wide">Cadena de aprobación</p>
                  <ApproverConfig
                    employee={emp}
                    allUsers={employees}
                    onSaved={() => { setExpandedApprover(null); load() }}
                  />
                </div>
              )}

              {saving === emp.id && (
                <p className="text-xs text-indigo-500 px-4 pb-3">Guardando...</p>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
