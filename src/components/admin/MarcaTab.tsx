'use client'

import { useEffect, useRef, useState } from 'react'
import { Upload, Trash2, Check } from 'lucide-react'
import { Marca } from '@/components/layout/Marca'
import {
  getMyOrgBranding,
  uploadOrgLogo,
  removeOrgLogo,
  updateOrgName,
  type MarcaOrg,
} from '@/actions/organizations'

/**
 * Marca de la organización — la pestaña donde un admin la cambia.
 *
 * La decisión de diseño que importa: **la vista previa se muestra sobre el
 * degradado real, no sobre la hoja blanca del formulario.** Un logo se juzga
 * donde va a vivir, y acá vive sobre el riel oscuro. Sobre blanco, un logo con
 * bordes claros parece perfecto y después desaparece.
 */
export function MarcaTab() {
  const [marca,    setMarca]    = useState<MarcaOrg | null>(null)
  const [nombre,   setNombre]   = useState('')
  const [cargando, setCargando] = useState(true)
  const [guardando, setGuardando] = useState(false)
  const [error,    setError]    = useState<string | null>(null)
  const [listo,    setListo]    = useState(false)
  const archivoRef = useRef<HTMLInputElement>(null)

  async function cargar() {
    const m = await getMyOrgBranding()
    setMarca(m)
    setNombre(m?.nombre ?? '')
    setCargando(false)
  }

  /* El guard `vivo` no es ceremonia: sin él, si alguien cambia de pestaña antes
     de que responda la consulta, el `setState` cae sobre un componente ya
     desmontado. Y de paso satisface `react-hooks/set-state-in-effect`, que
     protesta cuando el estado se toca en el cuerpo del efecto. */
  useEffect(() => {
    let vivo = true
    getMyOrgBranding().then(m => {
      if (!vivo) return
      setMarca(m)
      setNombre(m?.nombre ?? '')
      setCargando(false)
    })
    return () => { vivo = false }
  }, [])

  function avisar() {
    setListo(true)
    setTimeout(() => setListo(false), 3000)
  }

  async function handleArchivo(e: React.ChangeEvent<HTMLInputElement>) {
    const archivo = e.target.files?.[0]
    if (!archivo) return
    setError(null); setGuardando(true)
    try {
      await uploadOrgLogo(archivo)
      await cargar()
      avisar()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo subir el logo')
    } finally {
      setGuardando(false)
      if (archivoRef.current) archivoRef.current.value = ''
    }
  }

  async function handleQuitar() {
    if (!confirm('¿Quitar el logo? Se vuelve al cuadrado con la inicial. El archivo no se borra.')) return
    setError(null); setGuardando(true)
    try {
      await removeOrgLogo()
      await cargar()
      avisar()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo quitar el logo')
    } finally { setGuardando(false) }
  }

  async function handleNombre() {
    setError(null); setGuardando(true)
    try {
      await updateOrgName(nombre)
      await cargar()
      avisar()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo guardar el nombre')
    } finally { setGuardando(false) }
  }

  if (cargando) {
    return <div className="hoja p-5"><div className="h-5 w-40 esqueleto rounded" /></div>
  }

  return (
    <section className="space-y-3">
      <p className="text-xs tor-on-gradient-soft">
        El nombre y el logo que ve tu equipo en el menú lateral y en el encabezado del teléfono.
      </p>

      {/* Vista previa sobre el material real donde vive la marca. */}
      <div className="tor-glass rounded-card p-5">
        <p className="text-xs font-semibold uppercase tracking-[.16em] text-white/75 mb-3">
          Así se ve en el menú
        </p>
        <Marca nombre={nombre || marca?.nombre || 'Tu empresa'} logo={marca?.logo ?? null} />
      </div>

      <div className="hoja p-5 space-y-4">
        <div>
          <label className="block text-xs font-semibold text-ink-600 mb-1" htmlFor="org-nombre">
            Nombre visible
          </label>
          <div className="flex gap-2">
            <input
              id="org-nombre"
              value={nombre}
              onChange={e => setNombre(e.target.value)}
              maxLength={60}
              className="campo flex-1"
              placeholder="Nombre de la empresa"
            />
            <button
              onClick={handleNombre}
              disabled={guardando || !nombre.trim() || nombre.trim() === marca?.nombre}
              className="btn-primario px-4 py-2 text-sm"
            >
              Guardar
            </button>
          </div>
        </div>

        <div>
          <p className="block text-xs font-semibold text-ink-600 mb-1">Logo</p>
          <p className="text-xs text-ink-500 mb-2">
            PNG, JPG, WEBP o SVG, hasta 512 KB. Se muestra en un cuadrado de 36 px, así que
            conviene una marca compacta antes que un logotipo largo.
          </p>
          <div className="flex flex-wrap gap-2">
            <label className="btn-secundario inline-flex items-center gap-2 px-4 py-2 text-sm cursor-pointer">
              <Upload size={14} />
              {marca?.logo ? 'Reemplazar logo' : 'Subir logo'}
              <input
                ref={archivoRef}
                type="file"
                accept="image/png,image/jpeg,image/webp,image/svg+xml"
                onChange={handleArchivo}
                disabled={guardando}
                className="hidden"
              />
            </label>
            {marca?.logo && (
              <button
                onClick={handleQuitar}
                disabled={guardando}
                className="btn-secundario inline-flex items-center gap-2 px-4 py-2 text-sm"
              >
                <Trash2 size={14} />
                Quitar
              </button>
            )}
          </div>
        </div>

        {error && (
          <p className="text-xs text-danger-600 bg-danger-50 border border-danger-200 rounded-item px-3 py-2">
            {error}
          </p>
        )}
        {listo && (
          <p className="text-xs text-success-600 inline-flex items-center gap-1.5">
            <Check size={13} /> Guardado. Se ve al recargar la página.
          </p>
        )}
      </div>
    </section>
  )
}
