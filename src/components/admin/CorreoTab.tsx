'use client'

import { useEffect, useState } from 'react'
import { Mail, MailX, MailCheck, Users, Info, AlertTriangle, Send, CheckCircle2, XCircle } from 'lucide-react'
import { getEstadoCorreo, probarCorreo } from '@/actions/admin'
import { mensajeDeError } from '@/lib/errores'

/**
 * El estado del correo saliente, para mirarlo sin entrar a Vercel.
 *
 * Daniel, 2026-10-20: «¿dónde puedo ver la lista de los que pueden recibir el
 * correo, por si necesito hacer algún cambio?». No había dónde: `CORREO_SOLO_A`
 * y `CORREO_PAUSADO` son variables de entorno y ninguna pantalla las mostraba.
 *
 * **Quién recibe no se edita acá, a propósito.** Abrir el correo a más gente
 * exige entrar a Vercel, y esa fricción es la que faltó el 2026-10-07, cuando un
 * clic mandó 52 invitaciones reales. Un botón acá podría ampliar a quién le llega
 * un correo con una sesión de admin; por eso la pantalla dice dónde se cambia en
 * vez de cambiarlo.
 *
 * Lo único que la pantalla manda hacia afuera es el correo de prueba, y va
 * **solo a la dirección de quien lo pide** (`probarCorreo` la saca de la sesión,
 * no de un parámetro). No hay destinatario que elegir, así que no hay nada que
 * ampliar.
 *
 * Lo que se muestra sale del MISMO `revisarConfigCorreo` que decide si un correo
 * sale: si la pantalla dijera que todo está bien y el envío fallara igual, sería
 * peor que no tener pantalla. Y como «puede enviar» no es «envió» —el 2026-10-21
 * la pantalla decía la verdad y el correo no salía igual—, abajo está la prueba.
 */

type Estado = Awaited<ReturnType<typeof getEstadoCorreo>>

export function CorreoTab() {
  const [estado, setEstado] = useState<Estado | null>(null)
  const [error, setError]   = useState<string | null>(null)
  /* El resultado de la prueba va INLINE y no en un aviso flotante: cuando falla
     trae el motivo de Resend, que hay que poder leer y copiar. */
  const [prueba, setPrueba]       = useState<{ enviado: boolean; motivo: string } | null>(null)
  const [probando, setProbando]   = useState(false)
  const [destino, setDestino]     = useState('')

  useEffect(() => {
    getEstadoCorreo()
      .then(setEstado)
      .catch(e => setError(e instanceof Error ? e.message : 'No se pudo leer el estado del correo'))
  }, [])

  async function probar() {
    setProbando(true)
    setPrueba(null)
    try {
      setPrueba(await probarCorreo(destino || undefined))
    } catch (e) {
      setPrueba({ enviado: false, motivo: mensajeDeError(e, 'No se pudo hacer la prueba') })
    } finally {
      setProbando(false)
    }
  }

  if (error)   return <div className="hoja p-4 text-sm text-danger-700">{error}</div>
  if (!estado) return <div className="hoja p-4 text-sm text-ink-500">Cargando…</div>

  const restringido = estado.soloA.length > 0
  const Icono = estado.puedeEnviar ? (restringido ? Users : MailCheck) : MailX

  return (
    <div className="space-y-4">

      {/* Qué está pasando hoy, en una línea */}
      <div className={`hoja p-4 border-l-4 ${
        !estado.puedeEnviar ? 'border-l-danger-400'
        : restringido       ? 'border-l-warning-400'
        :                     'border-l-success-400'
      }`}>
        <div className="flex items-start gap-3">
          <Icono size={20} className={
            !estado.puedeEnviar ? 'text-danger-500 shrink-0 mt-0.5'
            : restringido       ? 'text-warning-600 shrink-0 mt-0.5'
            :                     'text-success-600 shrink-0 mt-0.5'
          } aria-hidden />
          <div className="min-w-0">
            <p className="text-[16px] font-semibold text-ink-800">
              {!estado.puedeEnviar ? 'No sale ningún correo'
               : restringido       ? 'Solo salen a una lista acotada'
               :                     'Los correos salen normalmente'}
            </p>
            {estado.motivo && (
              <p className="card-label text-ink-600 mt-1">{estado.motivo}</p>
            )}
            {estado.puedeEnviar && !restringido && (
              <p className="card-label text-ink-600 mt-1">
                Cualquier persona de la organización puede recibir avisos y links de acceso.
              </p>
            )}
          </div>
        </div>
      </div>

      {/* A quiénes llega */}
      {restringido && (
        <div className="hoja p-4">
          <div className="flex items-center gap-2 mb-1">
            <Users size={16} className="text-ink-400" aria-hidden />
            <p className="text-sm font-semibold text-ink-800">
              Reciben correo ({estado.soloA.length})
            </p>
          </div>
          <p className="card-meta text-ink-400 mb-3">
            Con esta lista cargada, <strong>nadie más recibe nada</strong>: ni avisos ni links
            de contraseña, aunque la app los intente enviar.
          </p>
          <ul className="divide-y divide-ink-50">
            {estado.soloA.map(correo => (
              <li key={correo} className="py-2 flex items-center gap-2 min-w-0">
                <Mail size={13} className="text-ink-300 shrink-0" aria-hidden />
                <span className="text-sm text-ink-700 truncate">{correo}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* La prueba. Lo de arriba dice si el correo PUEDE salir; esto, si SALE.
          El 2026-10-21 esa diferencia importó: la pantalla informaba «solo salen
          a una lista acotada», la persona que faltaba estaba en la lista, su
          aviso se había guardado, y el correo no había salido. */}
      <div className="hoja p-4">
        <div className="flex items-center gap-2 mb-1">
          <Send size={16} className="text-ink-400" aria-hidden />
          <p className="text-sm font-semibold text-ink-800">Probar el envío</p>
        </div>
        <p className="card-meta text-ink-400 mb-3">
          Manda un correo por el mismo camino que los avisos de la app. Es la única forma
          de distinguir «está bien configurado» de «el correo llega». Va a{' '}
          <strong>tu propia dirección</strong>
          {restringido && <> o a una de las del piloto; a nadie más, ni cambiando esto</>}.
        </p>

        <div className="flex flex-col sm:flex-row sm:items-center gap-2">
          {/* Con piloto en curso se puede elegir, porque la pregunta real es si
              llega al correo CORPORATIVO: una prueba al Gmail del admin puede
              salir verde mientras @pentaingenieros.cl lo rechaza o lo filtra.
              Quién es elegible lo decide el servidor (`destinoDePrueba`). */}
          {restringido && (
            <select
              value={destino}
              onChange={e => setDestino(e.target.value)}
              className="campo-compacto sm:max-w-xs"
              aria-label="A qué dirección enviar la prueba"
            >
              <option value="">
                {estado.miCorreo ? `A mí (${estado.miCorreo})` : 'A mi dirección'}
              </option>
              {estado.soloA
                .filter(c => c !== estado.miCorreo)
                .map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          )}
          <button
            onClick={probar}
            disabled={probando}
            className="btn-primario disabled:opacity-50 shrink-0"
          >
            {probando ? 'Enviando…' : 'Enviar un correo de prueba'}
          </button>
        </div>

        {prueba && (
          <div className={`mt-3 p-3 rounded-item flex items-start gap-2 ${
            prueba.enviado ? 'bg-success-50 border border-success-200' : 'bg-danger-50 border border-danger-200'
          }`}>
            {prueba.enviado
              ? <CheckCircle2 size={16} className="text-success-600 shrink-0 mt-0.5" aria-hidden />
              : <XCircle      size={16} className="text-danger-500 shrink-0 mt-0.5" aria-hidden />}
            <div className="min-w-0 text-sm">
              <p className="font-semibold text-ink-800">
                {prueba.enviado ? 'El correo salió' : 'No salió'}
              </p>
              {/* `break-words`: un motivo de Resend puede ser una línea larga sin espacios */}
              <p className="text-ink-600 break-words">{prueba.motivo}</p>
            </div>
          </div>
        )}
      </div>

      {/* El detalle técnico, para diagnosticar */}
      <div className="hoja p-4 space-y-2">
        <p className="text-sm font-semibold text-ink-800">Detalle</p>
        <dl className="text-sm divide-y divide-ink-50">
          <div className="py-2 flex justify-between gap-3">
            <dt className="text-ink-500">Entorno</dt>
            <dd className="text-ink-800 font-medium">{estado.entorno}</dd>
          </div>
          <div className="py-2 flex justify-between gap-3">
            <dt className="text-ink-500">Pausa general</dt>
            <dd className="text-ink-800 font-medium">{estado.pausado ? 'Puesta' : 'Sin pausa'}</dd>
          </div>
          <div className="py-2 flex justify-between gap-3 min-w-0">
            <dt className="text-ink-500 shrink-0">Remitente</dt>
            <dd className="text-ink-800 font-medium truncate">{estado.desde ?? '—'}</dd>
          </div>
        </dl>
      </div>

      {/* Dónde se cambia — y por qué no se cambia acá */}
      <div className="hoja p-4 bg-info-50 border border-info-200">
        <div className="flex items-start gap-3">
          <Info size={16} className="text-info-600 shrink-0 mt-0.5" aria-hidden />
          <div className="text-sm text-ink-700 space-y-2">
            <p>
              Esto se cambia en <strong>Vercel → proyecto mi-rendicion → Settings →
              Environment Variables</strong>, con las variables <code className="font-mono-amount text-xs">CORREO_SOLO_A</code> (las
              direcciones, separadas por coma) y <code className="font-mono-amount text-xs">CORREO_PAUSADO</code>.
            </p>
            <p className="flex items-start gap-1.5">
              <AlertTriangle size={14} className="text-warning-600 shrink-0 mt-0.5" aria-hidden />
              <span>
                Después de editarlas hay que <strong>volver a desplegar</strong>: se leen cuando
                arranca el servidor, así que un cambio sin despliegue no tiene efecto.
              </span>
            </p>
            <p className="text-ink-500">
              No se editan desde acá a propósito. Ampliar a quién le llega un correo tiene que
              costar más que un clic.
            </p>
          </div>
        </div>
      </div>

    </div>
  )
}
