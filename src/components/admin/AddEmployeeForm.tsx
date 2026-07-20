'use client'

import { useState, useEffect } from 'react'
import { importEmployees } from '@/actions/employees'
import { getCostCenters } from '@/actions/admin'
import type { CostCenter } from '@/lib/supabase/types'

const ROLE_OPTIONS = [
  { value: 'employee',  label: 'Empleado' },
  { value: 'approver',  label: 'Aprobador' },
  { value: 'admin',     label: 'Administrador' },
]

export function AddEmployeeForm({ onDone }: { onDone: () => void }) {
  const [fullName,      setFullName]      = useState('')
  const [email,         setEmail]         = useState('')
  const [role,          setRole]          = useState<'employee' | 'approver' | 'admin'>('employee')
  const [department,    setDepartment]    = useState('')
  const [costCenterId,  setCostCenterId]  = useState('')
  const [costCenters,   setCostCenters]   = useState<CostCenter[]>([])
  const [saving,        setSaving]        = useState(false)
  const [error,         setError]         = useState<string | null>(null)
  const [success,       setSuccess]       = useState(false)

  useEffect(() => {
    getCostCenters().then(cc => setCostCenters(cc.filter(c => c.imputable)))
  }, [])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    setError(null)
    try {
      const results = await importEmployees([{
        full_name:      fullName.trim(),
        email:          email.trim(),
        role,
        department:     department.trim() || undefined,
        cost_center_id: costCenterId || undefined,
      }])
      if (results[0]?.success) {
        setSuccess(true)
        setTimeout(() => {
          setSuccess(false)
          setFullName(''); setEmail(''); setRole('employee')
          setDepartment(''); setCostCenterId('')
          onDone()
        }, 1500)
      } else {
        setError(results[0]?.error ?? 'No se pudo crear el empleado')
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al crear empleado')
    } finally {
      setSaving(false)
    }
  }

  if (success) {
    return (
      <div className="bg-emerald-50 border border-emerald-200 rounded-card p-4 text-center">
        <p className="text-emerald-700 font-semibold text-sm">✓ Empleado agregado</p>
        <p className="text-emerald-600 text-xs mt-1">Recibirá un email para activar su cuenta</p>
      </div>
    )
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <label className="block text-xs font-medium text-slate-600 mb-1">Nombre completo *</label>
          <input
            type="text"
            value={fullName}
            onChange={e => setFullName(e.target.value)}
            required
            placeholder="Ej: María González"
            className="w-full border border-slate-200 rounded-item px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-600"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-slate-600 mb-1">Correo electrónico *</label>
          <input
            type="email"
            value={email}
            onChange={e => setEmail(e.target.value)}
            required
            placeholder="correo@empresa.cl"
            className="w-full border border-slate-200 rounded-item px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-600"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-slate-600 mb-1">Rol</label>
          <select
            value={role}
            onChange={e => setRole(e.target.value as typeof role)}
            className="w-full border border-slate-200 rounded-item px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-brand-600"
          >
            {ROLE_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-xs font-medium text-slate-600 mb-1">Departamento</label>
          <input
            type="text"
            value={department}
            onChange={e => setDepartment(e.target.value)}
            placeholder="Ej: Operaciones (opcional)"
            className="w-full border border-slate-200 rounded-item px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-600"
          />
        </div>
      </div>

      {/* ── Centro de costo ── */}
      <div>
        <label className="block text-xs font-medium text-slate-600 mb-1">Centro de costo</label>
        <select
          value={costCenterId}
          onChange={e => setCostCenterId(e.target.value)}
          className="w-full border border-slate-200 rounded-item px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-brand-600"
        >
          <option value="">— Sin asignar —</option>
          {costCenters.map(cc => (
            <option key={cc.id} value={cc.id}>{cc.id} — {cc.descripcion}</option>
          ))}
        </select>
        <p className="text-xs text-slate-400 mt-1">
          Los gastos de este empleado irán por defecto a este centro de costo.
        </p>
      </div>

      {error && (
        <p className="text-xs text-red-600 bg-red-50 rounded-item p-2">{error}</p>
      )}

      <div className="flex gap-2 pt-1">
        <button
          type="submit"
          disabled={saving}
          className="flex-1 py-2.5 bg-brand-600 hover:bg-brand-700 disabled:opacity-50 text-white text-sm font-semibold rounded-card transition-colors"
        >
          {saving ? 'Creando cuenta...' : 'Agregar empleado'}
        </button>
        <button
          type="button"
          onClick={onDone}
          className="px-4 py-2.5 border border-slate-200 text-slate-600 text-sm rounded-card hover:bg-slate-50 transition-colors"
        >
          Cancelar
        </button>
      </div>
    </form>
  )
}
