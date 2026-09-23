'use client'

import { Suspense, useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { KeyRound, Eye, EyeOff, CheckCircle2, AlertTriangle } from 'lucide-react'

export default function SetPasswordPage() {
  return (
    <Suspense fallback={<Cargando />}>
      <SetPasswordForm />
    </Suspense>
  )
}

function Cargando() {
  return (
    <div className="flex justify-center py-8">
      <div className="w-7 h-7 border-2 border-brand-400 border-t-transparent rounded-full animate-spin" />
    </div>
  )
}

function SetPasswordForm() {
  const router       = useRouter()
  const searchParams = useSearchParams()
  const supabase     = createClient()

  /* Con `token_hash` (los correos desde el 2026-09-23) NO se canjea nada al
     abrir la página: el filtro de Outlook abre cada link para revisarlo y se
     gastaría el token antes que la persona. Se canjea al guardar, y un
     escáner nunca envía formularios. Ver `src/lib/access-link.ts`. */
  const tokenHash = searchParams.get('token_hash')

  const [password,        setPassword]        = useState('')
  const [confirm,         setConfirm]         = useState('')
  const [showPass,        setShowPass]        = useState(false)
  const [loading,         setLoading]         = useState(false)
  const [error,           setError]           = useState<string | null>(null)
  const [done,            setDone]            = useState(false)
  const [userEmail,       setUserEmail]       = useState<string | null>(null)
  const [checkingSession, setCheckingSession] = useState(!tokenHash)
  const [linkInvalido,    setLinkInvalido]    = useState(false)
  const [verificado,      setVerificado]      = useState(false)

  /* Sin token: hace falta una sesión ya abierta. */
  useEffect(() => {
    if (tokenHash) return
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

    /* `verificado` evita canjear dos veces: si el paso siguiente falla (una
       contraseña rechazada, por ejemplo), el reintento ya tiene sesión y el
       token quedó gastado. */
    if (tokenHash && !verificado) {
      const { error: otpError } = await supabase.auth.verifyOtp({ token_hash: tokenHash, type: 'recovery' })
      if (otpError) {
        setLinkInvalido(true)
        setLoading(false)
        return
      }
      setVerificado(true)
    }

    const { error: updateError } = await supabase.auth.updateUser({ password })

    if (updateError) {
      setError(updateError.message)
      setLoading(false)
      return
    }

    setDone(true)
    setTimeout(() => { router.push('/'); router.refresh() }, 2000)
  }

  if (checkingSession) return <Cargando />

  if (linkInvalido) {
    return (
      <div className="hoja p-6 text-center space-y-4">
        <AlertTriangle size={40} className="text-warning-500 mx-auto" />
        <div>
          <p className="font-bold text-ink-900">Este link ya no sirve</p>
          <p className="text-sm text-ink-500 mt-1">
            Venció o ya se usó. Pedí uno nuevo con «¿Olvidaste tu contraseña?» en la pantalla de ingreso.
          </p>
        </div>
        <Link href="/login" className="btn-primario inline-block w-full py-2.5 px-4">
          Ir al inicio de sesión
        </Link>
      </div>
    )
  }

  if (done) {
    return (
      <div className="hoja p-6 text-center space-y-3">
        <CheckCircle2 size={40} className="text-success-500 mx-auto" />
        <p className="font-bold text-ink-900">¡Contraseña creada!</p>
        <p className="text-sm text-ink-500">Ingresando a la app…</p>
      </div>
    )
  }

  return (
    <div className="hoja p-6 space-y-5">
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
        Elegí una contraseña para acceder a la app desde ahora.
      </p>

      {error && (
        <div className="bg-danger-50 border border-danger-200 text-danger-700 text-sm rounded-item p-3">
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
              autoComplete="new-password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              placeholder="Mínimo 8 caracteres"
              className="campo w-full py-2.5 pr-10"
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
            autoComplete="new-password"
            value={confirm}
            onChange={e => setConfirm(e.target.value)}
            placeholder="Repetí la contraseña"
            className="campo w-full py-2.5"
          />
        </div>

        {/* Indicador de fortaleza simple */}
        {password.length > 0 && (
          <div className="space-y-1">
            <div className="h-1.5 rounded-full bg-ink-100 overflow-hidden">
              <div
                className={[
                  'h-full rounded-full transition-all duration-300',
                  password.length < 8  ? 'w-1/4 bg-danger-400' :
                  password.length < 12 ? 'w-2/4 bg-warning-400' :
                                         'w-full bg-success-500',
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
          className="btn-primario w-full py-2.5 px-4"
        >
          {loading ? 'Guardando…' : 'Guardar contraseña e ingresar'}
        </button>
      </form>
    </div>
  )
}
