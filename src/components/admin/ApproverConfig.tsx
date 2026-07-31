'use client'

import { useState } from 'react'
import { setEmployeeApprovers, setEmployeeBackupApprover } from '@/actions/admin'
import type { UserProfile } from '@/lib/supabase/types'

interface Props {
  employee: UserProfile
  allUsers: UserProfile[]
  onSaved: () => void
}

export function ApproverConfig({ employee, allUsers, onSaved }: Props) {
  const [l1Id,        setL1Id]        = useState<string>(employee.approver_l1_id        ?? '')
  const [l2Id,        setL2Id]        = useState<string>(employee.approver_l2_id        ?? '')
  const [backupId,    setBackupId]    = useState<string>(employee.approver_l1_backup_id ?? '')
  const [backupFrom,  setBackupFrom]  = useState<string>(employee.backup_active_from    ?? '')
  const [backupUntil, setBackupUntil] = useState<string>(employee.backup_active_until   ?? '')
  const [saving, setSaving] = useState(false)
  const [saved,  setSaved]  = useState(false)
  const [error,  setError]  = useState<string | null>(null)

  const options = allUsers.filter(u => u.id !== employee.id && u.is_active)

  function roleLabel(role: string) {
    return role === 'admin' ? 'Admin' : role === 'approver' ? 'Aprobador' : 'Empleado'
  }

  async function handleSave() {
    setSaving(true)
    setError(null)
    setSaved(false)
    try {
      await setEmployeeApprovers(employee.id, l1Id || null, l2Id || null)
      await setEmployeeBackupApprover(
        employee.id,
        backupId    || null,
        backupFrom  || null,
        backupUntil || null,
      )
      setSaved(true)
      setTimeout(() => { setSaved(false); onSaved() }, 1200)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al guardar')
    } finally {
      setSaving(false)
    }
  }

  const l1Name     = options.find(u => u.id === l1Id)?.full_name
  const l2Name     = options.find(u => u.id === l2Id)?.full_name
  const backupName = options.find(u => u.id === backupId)?.full_name

  if (saved) {
    return <p className="text-xs text-emerald-600 font-medium py-1">✓ Aprobadores actualizados</p>
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
          onChange={e => {
            setL1Id(e.target.value)
            if (!e.target.value) { setL2Id(''); setBackupId(''); setBackupFrom(''); setBackupUntil('') }
          }}
          className="w-full border border-slate-200 rounded-item px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-brand-600"
        >
          <option value="">Sin aprobador asignado</option>
          {options.map(u => (
            <option key={u.id} value={u.id}>{u.full_name} ({roleLabel(u.role)})</option>
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
            className="w-full border border-slate-200 rounded-item px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-brand-600"
          >
            <option value="">Sin segundo nivel</option>
            {options.filter(u => u.id !== l1Id).map(u => (
              <option key={u.id} value={u.id}>{u.full_name} ({roleLabel(u.role)})</option>
            ))}
          </select>
          <p className="text-xs text-slate-400 mt-1">
            Flujo: {employee.full_name.split(' ')[0]} → {l1Name}{l2Id ? ` → ${l2Name}` : ''} → Aprobado
          </p>
        </div>
      )}

      {/* Aprobador suplente — solo si hay N1 */}
      {l1Id && (
        <div className="border border-amber-200 bg-amber-50 rounded-item p-3 space-y-2">
          <p className="text-xs font-semibold text-amber-800">Aprobador suplente de N1</p>
          <p className="text-xs text-amber-700">
            Si {l1Name ?? 'el N1'} está de vacaciones, otro aprobador puede revisar temporalmente dentro del período indicado.
          </p>
          <select
            value={backupId}
            onChange={e => {
              setBackupId(e.target.value)
              if (!e.target.value) { setBackupFrom(''); setBackupUntil('') }
            }}
            className="w-full border border-amber-300 rounded-item px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-amber-500"
          >
            <option value="">Sin suplente</option>
            {options.filter(u => u.id !== l1Id).map(u => (
              <option key={u.id} value={u.id}>{u.full_name} ({roleLabel(u.role)})</option>
            ))}
          </select>
          {backupId && (
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="block text-xs font-medium text-amber-800 mb-1">Desde</label>
                <input
                  type="date"
                  value={backupFrom}
                  onChange={e => setBackupFrom(e.target.value)}
                  className="w-full border border-amber-300 rounded-item px-2 py-1.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-amber-500"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-amber-800 mb-1">Hasta</label>
                <input
                  type="date"
                  value={backupUntil}
                  onChange={e => setBackupUntil(e.target.value)}
                  className="w-full border border-amber-300 rounded-item px-2 py-1.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-amber-500"
                />
              </div>
            </div>
          )}
          {backupId && backupFrom && backupUntil && (
            <p className="text-xs text-amber-700">
              {backupName} verá las rendiciones de {employee.full_name.split(' ')[0]} del {backupFrom} al {backupUntil}
            </p>
          )}
        </div>
      )}

      {error && <p className="text-xs text-red-600 bg-red-50 rounded p-2">{error}</p>}

      <button
        onClick={handleSave}
        disabled={saving}
        className="px-4 py-1.5 bg-brand-600 hover:bg-brand-700 disabled:opacity-50 text-white text-xs font-semibold rounded-item transition-colors"
      >
        {saving ? 'Guardando...' : 'Guardar aprobadores'}
      </button>
    </div>
  )
}
