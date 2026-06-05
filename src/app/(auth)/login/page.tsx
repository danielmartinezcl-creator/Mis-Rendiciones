'use client'

import { Suspense, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter, useSearchParams } from 'next/navigation'
import { CheckCircle2 } from 'lucide-react'

function LoginForm() {
  const [mode, setMode] = useState<'login' | 'forgot'>('login')

  return mode === 'login'
    ? <SignInForm onForgot={() => setMode('forgot')} />
    : <ForgotForm onBack={() => setMode('login')} />
}

/* ── Formulario de ingreso ───────────────────────────────────────────── */
function SignInForm({ onForgot }: { onForgot: () => void }) {
  const [email,    setEmail]    = useState('')
  const [password, setPassword] = useState('')
  const [loading,  setLoading]  = useState(false)
  const [error,    setError]    = useState<string | null>(null)

  const router       = useRouter()
  const searchParams = useSearchParams()
  const next         = searchParams.get('next') ?? '/'
  const urlError     = searchParams.get('error')

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError(null)

    const supabase = createClient()
    const { error } = await supabase.auth.signInWithPassword({ email, password })

    if (error) {
      setError('Correo o contraseña incorrectos')
      setLoading(false)
      return
    }

    router.push(next)
    router.refresh()
  }

  return (
    <div className="bg-white rounded-card shadow-card p-6">
      <h2 className="text-lg font-bold text-ink-900 mb-5">Iniciar sesión</h2>

      {urlError === 'session_expired' && (
        <div className="bg-amber-50 border border-amber-200 text-amber-700 text-sm rounded-item p-3 mb-4">
          El link expiró. Pedí que te reenvíen la invitación.
        </div>
      )}

      {error && (
        <div className="bg-rose-50 border border-rose-200 text-rose-700 text-sm rounded-item p-3 mb-4">
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label htmlFor="email" className="block text-sm font-medium text-ink-700 mb-1">
            Correo electrónico
          </label>
          <input
            id="email"
            type="email"
            required
            value={email}
            onChange={e => setEmail(e.target.value)}
            className="w-full px-3 py-2.5 border border-ink-200 rounded-item text-sm focus:outline-none focus:ring-2 focus:ring-brand-600 focus:border-transparent"
            placeholder="tu@empresa.cl"
          />
        </div>

        <div>
          <div className="flex items-center justify-between mb-1">
            <label htmlFor="password" className="block text-sm font-medium text-ink-700">
              Contraseña
            </label>
            <button
              type="button"
              onClick={onForgot}
              className="text-xs text-brand-600 hover:underline"
            >
              ¿Olvidaste tu contraseña?
            </button>
          </div>
          <input
            id="password"
            type="password"
            required
            value={password}
            onChange={e => setPassword(e.target.value)}
            className="w-full px-3 py-2.5 border border-ink-200 rounded-item text-sm focus:outline-none focus:ring-2 focus:ring-brand-600 focus:border-transparent"
            placeholder="••••••••"
          />
        </div>

        <button
          type="submit"
          disabled={loading}
          className="w-full bg-brand-600 hover:bg-brand-700 disabled:opacity-50 text-white font-bold py-2.5 px-4 rounded-item transition-all duration-[180ms] active:scale-[.98]"
        >
          {loading ? 'Ingresando…' : 'Ingresar'}
        </button>
      </form>
    </div>
  )
}

/* ── Formulario de recuperación ─────────────────────────────────────── */
function ForgotForm({ onBack }: { onBack: () => void }) {
  const [email,   setEmail]   = useState('')
  const [loading, setLoading] = useState(false)
  const [sent,    setSent]    = useState(false)
  const [error,   setError]   = useState<string | null>(null)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError(null)

    const supabase = createClient()
    const appUrl   = process.env.NEXT_PUBLIC_APP_URL ?? window.location.origin

    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${appUrl}/api/auth/callback?next=/set-password`,
    })

    if (error) {
      setError('No se pudo enviar el correo. Verificá la dirección.')
      setLoading(false)
      return
    }

    setSent(true)
  }

  if (sent) {
    return (
      <div className="bg-white rounded-card shadow-card p-6 text-center space-y-4">
        <CheckCircle2 size={40} className="text-emerald-500 mx-auto" />
        <div>
          <p className="font-bold text-ink-900">Correo enviado</p>
          <p className="text-sm text-ink-500 mt-1">
            Revisá tu bandeja de entrada en <strong>{email}</strong> y hacé clic en el link para crear una nueva contraseña.
          </p>
        </div>
        <button
          onClick={onBack}
          className="text-sm text-brand-600 hover:underline"
        >
          Volver al inicio de sesión
        </button>
      </div>
    )
  }

  return (
    <div className="bg-white rounded-card shadow-card p-6">
      <h2 className="text-lg font-bold text-ink-900 mb-1">Recuperar contraseña</h2>
      <p className="text-sm text-ink-500 mb-5">
        Ingresá tu correo y te enviaremos un link para crear una nueva contraseña.
      </p>

      {error && (
        <div className="bg-rose-50 border border-rose-200 text-rose-700 text-sm rounded-item p-3 mb-4">
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-ink-700 mb-1">
            Correo electrónico
          </label>
          <input
            type="email"
            required
            value={email}
            onChange={e => setEmail(e.target.value)}
            className="w-full px-3 py-2.5 border border-ink-200 rounded-item text-sm focus:outline-none focus:ring-2 focus:ring-brand-600"
            placeholder="tu@empresa.cl"
          />
        </div>

        <button
          type="submit"
          disabled={loading || !email}
          className="w-full bg-brand-600 hover:bg-brand-700 disabled:opacity-50 text-white font-bold py-2.5 px-4 rounded-item transition-all duration-[180ms] active:scale-[.98]"
        >
          {loading ? 'Enviando…' : 'Enviar link de recuperación'}
        </button>

        <button
          type="button"
          onClick={onBack}
          className="w-full text-sm text-ink-500 hover:text-ink-800 transition-colors"
        >
          ← Volver al inicio de sesión
        </button>
      </form>
    </div>
  )
}

export default function LoginPage() {
  return (
    <Suspense fallback={
      <div className="bg-white rounded-card shadow-card p-6 text-center text-ink-500">
        Cargando...
      </div>
    }>
      <LoginForm />
    </Suspense>
  )
}
