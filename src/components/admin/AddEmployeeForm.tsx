'use client'

import { useState, useEffect } from 'react'
import { RotateCcw } from 'lucide-react'
import { importEmployees } from '@/actions/employees'
import { getCostCenters, restoreFromTrash, enableBlockedEmployee, updateEmployee } from '@/actions/admin'
import type { CostCenter } from '@/lib/supabase/types'
import type { EstadoCuenta } from '@/lib/alta-repetida'
import { useDialogos } from '@/components/ui/Dialogos'

const ROLE_OPTIONS = [
  { value: 'employee',  label: 'Empleado' },
  { value: 'approver',  label: 'Aprobador' },
  { value: 'admin',     label: 'Administrador' },
]

/* Lo que hay que hacer con una ficha que ya existe, según dónde esté. Cada
   estado tiene su acción propia: la papelera se restaura, el bloqueo se
   habilita, la desactivación se reactiva. */
const RECUPERAR: Record<Exclude<EstadoCuenta, 'activa'>, {
  /** El botón: el verbo real, nunca «Confirmar». */
  verbo: string
  /** El aviso de después. Va escrito, no derivado del verbo. */
  hecho: string
  hacer: (id: string) => Promise<unknown>
}> = {
  papelera:  { verbo: 'Restaurar', hecho: 'restaurado',  hacer: (id) => restoreFromTrash('user', id) },
  bloqueada: { verbo: 'Habilitar', hecho: 'habilitado',  hacer: (id) => enableBlockedEmployee(id) },
  inactiva:  { verbo: 'Reactivar', hecho: 'reactivado',  hacer: (id) => updateEmployee(id, { is_active: true }) },
}

type Existente = { id: string; nombre: string; estado: EstadoCuenta }

export function AddEmployeeForm({ onDone }: { onDone: () => void }) {
  const { confirmar, avisar } = useDialogos()
  const [fullName,      setFullName]      = useState('')
  const [email,         setEmail]         = useState('')
  const [role,          setRole]          = useState<'employee' | 'approver' | 'admin'>('employee')
  const [department,    setDepartment]    = useState('')
  const [costCenterId,  setCostCenterId]  = useState('')
  const [costCenters,   setCostCenters]   = useState<CostCenter[]>([])
  const [saving,        setSaving]        = useState(false)
  const [error,         setError]         = useState<string | null>(null)
  const [existente,     setExistente]     = useState<Existente | null>(null)
  const [success,       setSuccess]       = useState(false)

  useEffect(() => {
    getCostCenters().then(cc => setCostCenters(cc.filter(c => c.imputable)))
  }, [])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    setError(null)
    setExistente(null)
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
        setExistente(results[0]?.existente ?? null)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al crear empleado')
    } finally {
      setSaving(false)
    }
  }

  /* El alta no es el único camino de vuelta: a quien ya existe se lo recupera
     desde acá, con su historial, en vez de mandar al admin a buscarlo a otra
     pantalla sabiendo solo que «el correo ya está tomado». */
  async function recuperar(quien: Existente) {
    if (quien.estado === 'activa') return
    const { verbo, hecho, hacer } = RECUPERAR[quien.estado]
    const ok = await confirmar({
      titulo:  `${verbo} a ${quien.nombre}`,
      detalle: quien.estado === 'papelera'
        ? 'Sale de la papelera con su historial y recupera el acceso.'
        : 'Vuelve a la nómina con su historial y recupera el acceso.',
      aceptar: verbo,
    })
    if (!ok) return
    setSaving(true)
    try {
      await hacer(quien.id)
      avisar(`${quien.nombre}, ${hecho}`)
      setError(null); setExistente(null)
      setFullName(''); setEmail(''); setRole('employee')
      setDepartment(''); setCostCenterId('')
      onDone()
    } catch (err) {
      avisar(err instanceof Error ? err.message : 'No se pudo recuperar la ficha', 'error')
    } finally {
      setSaving(false)
    }
  }

  if (success) {
    return (
      <div className="bg-success-50 border border-success-200 rounded-card p-4 text-center">
        <p className="text-success-700 font-semibold text-sm">✓ Empleado agregado</p>
        <p className="text-success-600 text-xs mt-1">Podés enviarle la invitación desde la lista de empleados.</p>
      </div>
    )
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <label className="block text-xs font-medium text-ink-600 mb-1">Nombre completo *</label>
          <input
            type="text"
            value={fullName}
            onChange={e => setFullName(e.target.value)}
            required
            placeholder="Ej: María González"
            className="campo w-full"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-ink-600 mb-1">Correo electrónico *</label>
          <input
            type="email"
            value={email}
            onChange={e => setEmail(e.target.value)}
            required
            placeholder="correo@empresa.cl"
            className="campo w-full"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-ink-600 mb-1">Rol</label>
          <select
            value={role}
            onChange={e => setRole(e.target.value as typeof role)}
            className="campo w-full"
          >
            {ROLE_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-xs font-medium text-ink-600 mb-1">Departamento</label>
          <input
            type="text"
            value={department}
            onChange={e => setDepartment(e.target.value)}
            placeholder="Ej: Operaciones (opcional)"
            className="campo w-full"
          />
        </div>
      </div>

      {/* ── Centro de costo ── */}
      <div>
        <label className="block text-xs font-medium text-ink-600 mb-1">Centro de costo</label>
        <select
          value={costCenterId}
          onChange={e => setCostCenterId(e.target.value)}
          className="campo w-full"
        >
          <option value="">— Sin asignar —</option>
          {costCenters.map(cc => (
            <option key={cc.id} value={cc.id}>{cc.id} — {cc.descripcion}</option>
          ))}
        </select>
        <p className="text-xs text-ink-400 mt-1">
          Los gastos de este empleado irán por defecto a este centro de costo.
        </p>
      </div>

      {error && (
        <div className="bg-danger-50 border border-danger-200 rounded-item p-3 space-y-2">
          <p className="text-xs text-danger-700">{error}</p>
          {/* La salida, no solo la negativa: si la ficha se puede volver a
              poner en pie, se hace desde acá. */}
          {existente && (
            <button
              type="button"
              onClick={() => recuperar(existente)}
              disabled={saving}
              className="btn-primario inline-flex items-center gap-1.5 px-3 py-2 text-xs"
            >
              <RotateCcw size={14} />
              {existente.estado === 'activa' ? 'Ver ficha' : RECUPERAR[existente.estado].verbo} a {existente.nombre}
            </button>
          )}
        </div>
      )}

      <div className="flex gap-2 pt-1">
        <button
          type="submit"
          disabled={saving}
          className="btn-primario flex-1 py-2.5 text-sm"
        >
          {saving ? 'Creando...' : 'Agregar Empleado'}
        </button>
        <button
          type="button"
          onClick={onDone}
          className="px-4 py-2.5 border border-ink-200 text-ink-600 text-sm rounded-card hover:bg-ink-50 transition-colors"
        >
          Cancelar
        </button>
      </div>
      {/* Crear no envía nada: la invitación sale aparte, desde la nómina. */}
      <p className="text-xs text-ink-400">Para enviar e-mail presiona en invitar</p>
    </form>
  )
}
