'use client'

import { useEffect, useState } from 'react'
import { getOrgEmployees, updateEmployee } from '@/actions/admin'
import type { UserProfile } from '@/lib/supabase/types'

const ROLE_LABELS: Record<string, string> = {
  admin:    'Administrador',
  approver: 'Aprobador',
  employee: 'Empleado',
}

export default function AdminEmployeesPage() {
  const [employees, setEmployees] = useState<UserProfile[]>([])
  const [loading,   setLoading]   = useState(true)
  const [saving,    setSaving]    = useState<string | null>(null)

  async function load() {
    const data = await getOrgEmployees()
    setEmployees(data)
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  async function handleUpdate(
    userId: string,
    updates: Parameters<typeof updateEmployee>[1]
  ) {
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
      <div>
        <h1 className="text-xl font-bold text-slate-800">Empleados</h1>
        <p className="text-sm text-slate-500 mt-1">{employees.length} persona{employees.length !== 1 ? 's' : ''} en la organización</p>
      </div>

      <div className="space-y-2">
        {employees.map(emp => (
          <div
            key={emp.id}
            className={[
              'bg-white rounded-[12px] shadow-[0_1px_4px_rgba(0,0,0,.08)] p-4',
              !emp.is_active && 'opacity-60',
            ].filter(Boolean).join(' ')}
          >
            <div className="flex items-center gap-3 flex-wrap">
              {/* Avatar */}
              <div className="w-10 h-10 bg-indigo-100 rounded-full flex items-center justify-center text-indigo-600 font-bold text-sm shrink-0">
                {emp.full_name[0].toUpperCase()}
              </div>

              {/* Info */}
              <div className="flex-1 min-w-0">
                <p className="font-semibold text-slate-800 truncate">{emp.full_name}</p>
                {emp.department && <p className="text-xs text-slate-400">{emp.department}</p>}
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

            {/* Permisos + Estado */}
            <div className="flex flex-wrap gap-3 mt-3 pt-3 border-t border-slate-100">
              <label className="flex items-center gap-1.5 text-xs text-slate-600 cursor-pointer">
                <input
                  type="checkbox"
                  checked={emp.can_submit}
                  disabled={saving === emp.id}
                  onChange={e => handleUpdate(emp.id, { can_submit: e.target.checked })}
                  className="rounded text-indigo-600"
                />
                Puede rendir
              </label>
              <label className="flex items-center gap-1.5 text-xs text-slate-600 cursor-pointer">
                <input
                  type="checkbox"
                  checked={emp.can_approve}
                  disabled={saving === emp.id}
                  onChange={e => handleUpdate(emp.id, { can_approve: e.target.checked })}
                  className="rounded text-indigo-600"
                />
                Puede aprobar
              </label>
              <label className="flex items-center gap-1.5 text-xs text-slate-600 cursor-pointer ml-auto">
                <input
                  type="checkbox"
                  checked={emp.is_active}
                  disabled={saving === emp.id}
                  onChange={e => handleUpdate(emp.id, { is_active: e.target.checked })}
                  className="rounded text-indigo-600"
                />
                Activo
              </label>
            </div>

            {saving === emp.id && (
              <p className="text-xs text-indigo-500 mt-2">Guardando...</p>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}
