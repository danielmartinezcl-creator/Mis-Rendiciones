'use client'

import { useEffect, useState } from 'react'
import { getMyProfile, updateProfile, sendPasswordReset } from '@/actions/profile'
import type { UserProfile } from '@/lib/supabase/types'

type ProfileWithEmail = UserProfile & { email: string }

const ROLE_LABELS: Record<string, string> = {
  admin:    'Administrador',
  approver: 'Aprobador',
  employee: 'Empleado',
}

const BANKS = [
  'Banco Estado',
  'Banco de Chile',
  'Santander',
  'BCI',
  'Scotiabank',
  'Itaú',
  'BICE',
  'Security',
  'Banco Falabella',
  'Banco Ripley',
  'Global66',
  'Mercado Pago',
  'HSBC',
  'Banco Internacional',
  'Otro',
]

const ACCOUNT_TYPES = [
  { value: 'corriente', label: 'Cuenta Corriente' },
  { value: 'vista',     label: 'Cuenta Vista' },
  { value: 'ahorro',    label: 'Cuenta de Ahorro' },
]

export default function ProfilePage() {
  const [profile,   setProfile]   = useState<ProfileWithEmail | null>(null)
  const [loading,   setLoading]   = useState(true)
  const [saving,    setSaving]    = useState(false)
  const [resetSent, setResetSent] = useState(false)
  const [saved,     setSaved]     = useState(false)
  const [error,     setError]     = useState<string | null>(null)

  // Información personal
  const [fullName,   setFullName]   = useState('')
  const [rut,        setRut]        = useState('')
  const [department, setDepartment] = useState('')

  // Información bancaria
  const [bankName,        setBankName]        = useState('')
  const [bankAccountType, setBankAccountType] = useState('')
  const [bankAccount,     setBankAccount]     = useState('')

  useEffect(() => {
    getMyProfile().then(data => {
      if (data) {
        setProfile(data as ProfileWithEmail)
        setFullName(data.full_name)
        setRut(data.rut ?? '')
        setDepartment(data.department ?? '')
        setBankName(data.bank_name ?? '')
        setBankAccountType(data.bank_account_type ?? '')
        setBankAccount(data.bank_account ?? '')
      }
      setLoading(false)
    })
  }, [])

  async function handleSave(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    setError(null)
    setSaved(false)
    try {
      await updateProfile({
        full_name:        fullName,
        rut:              rut        || null,
        department:       department || null,
        bank_name:        bankName   || null,
        bank_account_type: bankAccountType || null,
        bank_account:     bankAccount || null,
      })
      setSaved(true)
      setTimeout(() => setSaved(false), 3000)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al guardar')
    } finally {
      setSaving(false)
    }
  }

  async function handlePasswordReset() {
    try {
      await sendPasswordReset()
      setResetSent(true)
    } catch {
      setError('No se pudo enviar el email de restablecimiento')
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-48">
        <div className="w-8 h-8 border-2 border-indigo-600 border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  if (!profile) return null

  return (
    <div className="max-w-lg mx-auto space-y-5">
      <div>
        <h1 className="text-xl font-bold text-slate-800">Mi perfil</h1>
        <p className="text-sm text-slate-500 mt-1">Actualiza tu información personal y bancaria</p>
      </div>

      {/* Avatar + rol */}
      <div className="bg-white rounded-[12px] shadow-[0_1px_4px_rgba(0,0,0,.08)] p-5 flex items-center gap-4">
        <div className="w-14 h-14 bg-indigo-100 rounded-full flex items-center justify-center text-indigo-600 font-bold text-xl shrink-0">
          {profile.full_name[0].toUpperCase()}
        </div>
        <div>
          <p className="font-semibold text-slate-800">{profile.full_name}</p>
          <span className="inline-block mt-1 text-xs font-medium bg-indigo-100 text-indigo-700 px-2 py-0.5 rounded-full">
            {ROLE_LABELS[profile.role] ?? profile.role}
          </span>
        </div>
      </div>

      <form onSubmit={handleSave} className="space-y-4">
        {/* ── Información personal ─────────────────────────────── */}
        <div className="bg-white rounded-[12px] shadow-[0_1px_4px_rgba(0,0,0,.08)] p-5 space-y-4">
          <h2 className="text-sm font-semibold text-slate-700 border-b border-slate-100 pb-2">
            Información personal
          </h2>

          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">Nombre completo</label>
            <input
              type="text"
              value={fullName}
              onChange={e => setFullName(e.target.value)}
              required
              className="w-full border border-slate-200 rounded-[8px] px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-600"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">RUT</label>
            <input
              type="text"
              value={rut}
              onChange={e => setRut(e.target.value)}
              placeholder="Ej: 12.345.678-9"
              className="w-full border border-slate-200 rounded-[8px] px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-600"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">Correo electrónico</label>
            <input
              type="email"
              value={profile.email}
              disabled
              className="w-full border border-slate-100 rounded-[8px] px-3 py-2.5 text-sm bg-slate-50 text-slate-400 cursor-not-allowed"
            />
            <p className="text-xs text-slate-400 mt-1">El correo se gestiona desde la cuenta de acceso</p>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">Departamento</label>
            <input
              type="text"
              value={department}
              onChange={e => setDepartment(e.target.value)}
              placeholder="Ej: Operaciones, Administración..."
              className="w-full border border-slate-200 rounded-[8px] px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-600"
            />
          </div>
        </div>

        {/* ── Información bancaria ──────────────────────────────── */}
        <div className="bg-white rounded-[12px] shadow-[0_1px_4px_rgba(0,0,0,.08)] p-5 space-y-4">
          <h2 className="text-sm font-semibold text-slate-700 border-b border-slate-100 pb-2">
            Información bancaria
          </h2>
          <p className="text-xs text-slate-400 -mt-2">Usada por el administrador para procesar reembolsos</p>

          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">Institución bancaria</label>
            <select
              value={bankName}
              onChange={e => setBankName(e.target.value)}
              className="w-full border border-slate-200 rounded-[8px] px-3 py-2.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-indigo-600"
            >
              <option value="">Selecciona un banco...</option>
              {BANKS.map(b => <option key={b} value={b}>{b}</option>)}
            </select>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">Tipo de cuenta</label>
            <select
              value={bankAccountType}
              onChange={e => setBankAccountType(e.target.value)}
              className="w-full border border-slate-200 rounded-[8px] px-3 py-2.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-indigo-600"
            >
              <option value="">Selecciona tipo de cuenta...</option>
              {ACCOUNT_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
            </select>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">Número de cuenta</label>
            <input
              type="text"
              value={bankAccount}
              onChange={e => setBankAccount(e.target.value)}
              placeholder="Ej: 00123456789"
              className="w-full border border-slate-200 rounded-[8px] px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-600"
            />
          </div>
        </div>

        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 text-xs rounded-[8px] p-3">{error}</div>
        )}
        {saved && (
          <div className="bg-emerald-50 border border-emerald-200 text-emerald-700 text-xs rounded-[8px] p-3">
            ✓ Cambios guardados correctamente
          </div>
        )}

        <button
          type="submit"
          disabled={saving}
          className="w-full py-2.5 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white text-sm font-semibold rounded-[12px] transition-colors"
        >
          {saving ? 'Guardando...' : 'Guardar cambios'}
        </button>
      </form>

      {/* Contraseña */}
      <div className="bg-white rounded-[12px] shadow-[0_1px_4px_rgba(0,0,0,.08)] p-5">
        <h2 className="text-sm font-semibold text-slate-700 mb-3">Contraseña</h2>
        {resetSent ? (
          <p className="text-sm text-emerald-600">✓ Email de restablecimiento enviado. Revisa tu bandeja.</p>
        ) : (
          <button
            onClick={handlePasswordReset}
            type="button"
            className="text-sm text-indigo-600 hover:underline"
          >
            Enviar email para cambiar contraseña
          </button>
        )}
      </div>
    </div>
  )
}
