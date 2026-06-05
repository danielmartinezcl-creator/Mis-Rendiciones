'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import { KeyRound, Eye, EyeOff, CheckCircle2 } from 'lucide-react'

export default function SetPasswordPage() {
  const [password,        setPassword]        = useState('')
  const [confirm,         setConfirm]         = useState('')
  const [showPass,        setShowPass]        = useState(false)
  const [loading,         setLoading]         = useState(false)
  const [error,           setError]           = useState<string | null>(null)
  const [done,            setDone]            = useState(false)
  const [userEmail,       setUserEmail]       = useState<string | null>(null)
  const [checkingSession, setCheckingSession] = useState(true)

  const router  = useRouter()
  const supabase = createClient()

  /* Verificar que hay sesión activa (llega desde el link de invitación o reset) */
  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      if (!data.user) {
        router.replace('/login?error=session_expired')
      } else {
        setUserEmail(data.user.email ?? null)
        setCheckingSession(false)
      }
    })
  }, [])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (password.length < 8) {
      setError('La contraseña debe tener al menos 8 caracteres')
      return
    }
    if (password !== confirm) {
      setError('Las contraseñas no coinciden')
      return
    }
    setLoading(true)
    setError(null)

    const { error: updateError } = await supabase.auth.updateUser({ password })

    if (updateError) {
      setError(updateError.message)
      setLoading(false)
      return
    }

    setDone(true)
    setTimeout(() => router.push('/'), 2000)
  }

  if (checkingSession) {
    return (
      <div className="flex justify-center py-8">
        <div className="w-7 h-7 border-2 border-brand-400 border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  if (done) {
    return (
      <div className="bg-white rounded-card shadow-card p-6 text-center space-y-3">
        <CheckCircle2 size={40} className="text-emerald-500 mx-auto" />
        <p className="font-bold text-ink-900">¡Contraseña creada!</p>
        <p className="text-sm text-ink-500">Ingresando a la app…</p>
      </div>
    )
  }

  return (
    <div className="bg-white rounded-card shadow-card p-6 space-y-5">
      <div className="flex items-center gap-3">
        <div className="w-9 h-9 bg-brand-50 rounded-item flex items-center justify-center shrink-0">
          <KeyRound size={18} className="text-brand-600" />
        </div>
        <div>
          <h2 className="font-bold text-ink-900 text-base">Creá tu contraseña</h2>
          {userEmail && <p className="text-xs text-ink-400 mt-0.5">{userEmail}</p>}
        </div>
      </div>

      <p className="text-sm text-ink-500">
        Es tu primera vez aquí. Elegí una contraseña para acceder a la app desde ahora.
      </p>

      {error && (
        <div className="bg-rose-50 border border-rose-200 text-rose-700 text-sm rounded-item p-3">
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-ink-700 mb-1">
            Nueva contraseña
          </label>
          <div className="relative">
            <input
              type={showPass ? 'text' : 'password'}
              required
              value={password}
              onChange={e => setPassword(e.target.value)}
              placeholder="Mínimo 8 caracteres"
              className="w-full px-3 py-2.5 pr-10 border border-ink-200 rounded-item text-sm focus:outline-none focus:ring-2 focus:ring-brand-600"
            />
            <button
              type="button"
              onClick={() => setShowPass(s => !s)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-ink-400 hover:text-ink-700 transition-colors"
            >
              {showPass ? <EyeOff size={16} /> : <Eye size={16} />}
            </button>
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-ink-700 mb-1">
            Repetir contraseña
          </label>
          <input
            type={showPass ? 'text' : 'password'}
            required
            value={confirm}
            onChange={e => setConfirm(e.target.value)}
            placeholder="Repetí la contraseña"
            className="w-full px-3 py-2.5 border border-ink-200 rounded-item text-sm focus:outline-none focus:ring-2 focus:ring-brand-600"
          />
        </div>

        {/* Indicador de fortaleza simple */}
        {password.length > 0 && (
          <div className="space-y-1">
            <div className="h-1.5 rounded-full bg-ink-100 overflow-hidden">
              <div
                className={[
                  'h-full rounded-full transition-all duration-300',
                  password.length < 8  ? 'w-1/4 bg-rose-400' :
                  password.length < 12 ? 'w-2/4 bg-amber-400' :
                                         'w-full bg-emerald-500',
                ].join(' ')}
              />
            </div>
            <p className="text-xs text-ink-400">
              {password.length < 8  ? 'Muy corta' :
               password.length < 12 ? 'Aceptable' : 'Contraseña fuerte ✓'}
            </p>
          </div>
        )}

        <button
          type="submit"
          disabled={loading || !password || !confirm}
          className="w-full bg-brand-600 hover:bg-brand-700 disabled:opacity-50 text-white font-bold py-2.5 px-4 rounded-item transition-all duration-[180ms] active:scale-[.98]"
        >
          {loading ? 'Guardando…' : 'Guardar contraseña e ingresar'}
        </button>
      </form>
    </div>
  )
}
