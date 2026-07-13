'use client'

import { useState, useEffect, useTransition } from 'react'
import { createPettyCashFund } from '@/actions/petty-cash'
import { createClient } from '@/lib/supabase/client'
import { ArrowLeft } from 'lucide-react'
import Link from 'next/link'

type Employee = { id: string; full_name: string; department: string | null }

export default function NewPettyCashFundPage() {
  const [employees, setEmployees]   = useState<Employee[]>([])
  const [error, setError]           = useState<string | null>(null)
  const [pending, startTrans]       = useTransition()

  const [form, setForm] = useState({
    name:             '',
    employee_id:      '',
    amount_requested: '',
    period_start:     new Date().toISOString().split('T')[0],
    period_end:       '',
    description:      '',
  })

  useEffect(() => {
    const supabase = createClient()
    supabase.from('users').select('id, full_name, department').eq('is_active', true).order('full_name')
      .then(({ data }) => setEmployees(data ?? []))
  }, [])

  function set(k: keyof typeof form, v: string) {
    setForm(f => ({ ...f, [k]: v }))
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const amount = parseFloat(form.amount_requested)
    if (!form.name.trim())      { setError('El nombre del fondo es obligatorio'); return }
    if (!form.employee_id)      { setError('Seleccioná el empleado'); return }
    if (isNaN(amount) || amount <= 0) { setError('Monto inválido'); return }
    if (!form.period_start)     { setError('Indicá la fecha de inicio'); return }
    if (!form.period_end)       { setError('Indicá la fecha de término'); return }
    if (form.period_end < form.period_start) { setError('La fecha de término debe ser posterior a la de inicio'); return }
    setError(null)

    startTrans(async () => {
      try {
        await createPettyCashFund({
          name:             form.name,
          employee_id:      form.employee_id,
          amount_requested: amount,
          currency:         'CLP',
          period_start:     form.period_start,
          period_end:       form.period_end,
          description:      form.description,
        })
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Error al crear el fondo')
      }
    })
  }

  return (
    <div className="max-w-lg mx-auto space-y-4">
      <div className="flex items-center gap-3">
        <Link href="/petty-cash" className="p-2 text-ink-400 hover:text-ink-700 rounded-item hover:bg-ink-100 transition-colors">
          <ArrowLeft size={18} />
        </Link>
        <div>
          <h1 className="font-display font-extrabold text-2xl tracking-tight text-ink-900">Nuevo fondo</h1>
          <p className="text-sm text-ink-500">Creá un fondo de caja chica para un empleado</p>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="bg-white rounded-card shadow-card p-5 border-t-4 border-t-brand-600 space-y-4">
        {/* Nombre del fondo */}
        <div>
          <label className="block text-xs font-semibold text-ink-700 mb-1">Nombre del fondo *</label>
          <input
            value={form.name}
            onChange={e => set('name', e.target.value)}
            placeholder="Ej: Caja Chica Terreno Julio, Viáticos Visita Cliente..."
            className="w-full px-3 py-2 text-sm border border-ink-200 rounded-item focus:outline-none focus:ring-2 focus:ring-brand-600"
          />
        </div>

        {/* Empleado */}
        <div>
          <label className="block text-xs font-semibold text-ink-700 mb-1">Empleado asignado *</label>
          <select
            value={form.employee_id}
            onChange={e => set('employee_id', e.target.value)}
            className="w-full px-3 py-2 text-sm border border-ink-200 rounded-item focus:outline-none focus:ring-2 focus:ring-brand-600 bg-white"
          >
            <option value="">Seleccioná un empleado...</option>
            {employees.map(emp => (
              <option key={emp.id} value={emp.id}>
                {emp.full_name}{emp.department ? ` — ${emp.department}` : ''}
              </option>
            ))}
          </select>
        </div>

        {/* Monto */}
        <div>
          <label className="block text-xs font-semibold text-ink-700 mb-1">Monto solicitado (CLP) *</label>
          <input
            type="number" min="1" step="1"
            value={form.amount_requested}
            onChange={e => set('amount_requested', e.target.value)}
            placeholder="0"
            className="w-full px-3 py-2 text-sm border border-ink-200 rounded-item focus:outline-none focus:ring-2 focus:ring-brand-600 font-mono-amount"
          />
        </div>

        {/* Período */}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-semibold text-ink-700 mb-1">Período desde *</label>
            <input
              type="date"
              value={form.period_start}
              onChange={e => set('period_start', e.target.value)}
              className="w-full px-3 py-2 text-sm border border-ink-200 rounded-item focus:outline-none focus:ring-2 focus:ring-brand-600"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-ink-700 mb-1">Período hasta *</label>
            <input
              type="date"
              value={form.period_end}
              min={form.period_start}
              onChange={e => set('period_end', e.target.value)}
              className="w-full px-3 py-2 text-sm border border-ink-200 rounded-item focus:outline-none focus:ring-2 focus:ring-brand-600"
            />
          </div>
        </div>

        {/* Descripción */}
        <div>
          <label className="block text-xs font-semibold text-ink-700 mb-1">Justificación (opcional)</label>
          <textarea
            value={form.description}
            onChange={e => set('description', e.target.value)}
            rows={3}
            placeholder="Describí para qué se usará este fondo..."
            className="w-full px-3 py-2 text-sm border border-ink-200 rounded-item focus:outline-none focus:ring-2 focus:ring-brand-600 resize-none"
          />
        </div>

        {error && (
          <p className="text-xs text-rose-600 bg-rose-50 px-3 py-2 rounded-item border border-rose-100">{error}</p>
        )}

        <button
          type="submit"
          disabled={pending}
          className="w-full py-2.5 text-sm font-bold text-white rounded-item transition-all active:scale-[.98] disabled:opacity-50"
          style={{ background: 'linear-gradient(130deg, #12152E 0%, #3B4090 100%)' }}
        >
          {pending ? 'Creando fondo...' : 'Crear fondo'}
        </button>
      </form>
    </div>
  )
}
