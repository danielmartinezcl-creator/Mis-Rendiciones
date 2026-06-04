'use client'

import { useState } from 'react'
import { setEmployeeApprovers } from '@/actions/admin'
import type { UserProfile } from '@/lib/supabase/types'

interface Props {
  employee: UserProfile
  allUsers: UserProfile[]
  onSaved: () => void
}

export function ApproverConfig({ employee, allUsers, onSaved }: Props) {
  const [l1Id, setL1Id] = useState<string>(employee.approver_l1_id ?? '')
  const [l2Id, setL2Id] = useState<string>(employee.approver_l2_id ?? '')
  const [saving, setSaving] = useState(false)
  const [saved,  setSaved]  = useState(false)
  const [error,  setError]  = useState<string | null>(null)

  // Opciones válidas: cualquier usuario activo distinto del propio empleado
  const options = allUsers.filter(u => u.id !== employee.id && u.is_active)

  async function handleSave() {
    setSaving(true)
    setError(null)
    setSaved(false)
    try {
      await setEmployeeApprovers(
        employee.id,
        l1Id || null,
        l2Id || null,
      )
      setSaved(true)
      setTimeout(() => { setSaved(false); onSaved() }, 1200)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al guardar')
    } finally {
      setSaving(false)
    }
  }

  const l1Name = options.find(u => u.id === l1Id)?.full_name
  const l2Name = options.find(u => u.id === l2Id)?.full_name

  if (saved) {
    return (
      <p className="text-xs text-emerald-600 font-medium py-1">✓ Aprobadores actualizados</p>
    )
  }

  return (
    <div className="space-y-3 pt-1">
      {/* Aprobador N1 */}
      <div>
        <label className="block text-xs font-medium text-slate-600 mb-1">
          Aprobador Nivel 1
          <span className="text-slate-400 font-normal ml-1">— quien aprueba las rendiciones de {employee.full_name.split(' ')[0]}</span>
        </label>
        <select
          value={l1Id}
          onChange={e => { setL1Id(e.target.value); if (e.target.value === '') setL2Id('') }}
          className="w-full border border-slate-200 rounded-[8px] px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-indigo-600"
        >
          <option value="">Sin aprobador asignado</option>
          {options.map(u => (
            <option key={u.id} value={u.id}>{u.full_name} ({u.role === 'admin' ? 'Admin' : u.role === 'approver' ? 'Aprobador' : 'Empleado'})</option>
          ))}
        </select>
      </div>

      {/* Aprobador N2 — solo si hay N1 */}
      {l1Id && (
        <div>
          <label className="block text-xs font-medium text-slate-600 mb-1">
            Aprobador Nivel 2
            <span className="text-slate-400 font-normal ml-1">— opcional, confirma lo que aprueba {l1Name ?? 'el N1'}</span>
          </label>
          <select
            value={l2Id}
            onChange={e => setL2Id(e.target.value)}
            className="w-full border border-slate-200 rounded-[8px] px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-indigo-600"
            disabled={!l1Id}
          >
            <option value="">Sin segundo nivel</option>
            {options
              .filter(u => u.id !== l1Id)
              .map(u => (
                <option key={u.id} value={u.id}>{u.full_name} ({u.role === 'admin' ? 'Admin' : u.role === 'approver' ? 'Aprobador' : 'Empleado'})</option>
              ))}
          </select>
          {l2Id && (
            <p className="text-xs text-slate-400 mt-1">
              Flujo: {employee.full_name.split(' ')[0]} → {l1Name} → {l2Name} → Aprobado
            </p>
          )}
          {!l2Id && (
            <p className="text-xs text-slate-400 mt-1">
              Flujo: {employee.full_name.split(' ')[0]} → {l1Name} → Aprobado
            </p>
          )}
        </div>
      )}

      {error && <p className="text-xs text-red-600 bg-red-50 rounded p-2">{error}</p>}

      <button
        onClick={handleSave}
        disabled={saving}
        className="px-4 py-1.5 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white text-xs font-semibold rounded-[8px] transition-colors"
      >
        {saving ? 'Guardando...' : 'Guardar aprobadores'}
      </button>
    </div>
  )
}
