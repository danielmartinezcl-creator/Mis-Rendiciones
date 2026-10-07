'use client'

// El catálogo de obras, para CORREGIRLO. No hay botón de alta, a propósito: el
// catálogo se arma con el uso —la primera vez que alguien rinde a un número, la
// obra queda creada— y una alta manual crearía números que nadie usa.
//
// Lo que sí se hace acá: arreglar un nombre mal escrito, cambiar el jefe que se
// sugiere cuando una obra cambia de manos, y cerrar las obras terminadas para
// que dejen de aparecer en el autocompletado.

import { useEffect, useMemo, useState } from 'react'
import { Building2, Search } from 'lucide-react'
import { listarProyectos, corregirProyecto, jefesDeProyecto } from '@/actions/proyectos'
import { useDialogos } from '@/components/ui/Dialogos'

type Fila = Awaited<ReturnType<typeof listarProyectos>>[number]
const POR_PAGINA = 25

export default function ProyectosPage() {
  const { avisar } = useDialogos()
  const [filas, setFilas]       = useState<Fila[]>([])
  const [jefes, setJefes]       = useState<{ id: string; full_name: string }[]>([])
  const [cargando, setCargando] = useState(true)
  const [busqueda, setBusqueda] = useState('')
  const [pagina, setPagina]     = useState(0)
  const [guardando, setGuardando] = useState<string | null>(null)

  async function cargar() {
    const [p, j] = await Promise.all([listarProyectos(), jefesDeProyecto()])
    setFilas(p)
    setJefes(j)
    setCargando(false)
  }
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { cargar().catch(() => setCargando(false)) }, [])

  const visibles = useMemo(() => {
    const q = busqueda.trim().toLowerCase()
    if (!q) return filas
    return filas.filter(f =>
      f.numero.toLowerCase().includes(q) || (f.nombre ?? '').toLowerCase().includes(q))
  }, [filas, busqueda])

  const paginas = Math.max(1, Math.ceil(visibles.length / POR_PAGINA))
  const pag = Math.min(pagina, paginas - 1)
  const tramo = visibles.slice(pag * POR_PAGINA, (pag + 1) * POR_PAGINA)

  async function guardar(id: string, cambios: Parameters<typeof corregirProyecto>[1]) {
    setGuardando(id)
    try {
      await corregirProyecto(id, cambios)
      await cargar()
      avisar('Guardado')
    } catch (err) {
      avisar(err instanceof Error ? err.message : 'No se pudo guardar', 'error')
    } finally {
      setGuardando(null)
    }
  }

  return (
    <div className="max-w-5xl mx-auto space-y-4">
      <header>
        <h1 className="text-xl font-bold tor-on-gradient flex items-center gap-2">
          <Building2 size={20} /> Proyectos
        </h1>
        <p className="card-label tor-on-gradient-soft mt-1">
          Se crean solos la primera vez que alguien rinde a un número. Acá se corrigen.
        </p>
      </header>

      <div className="hoja p-4 space-y-4">
        <label className="relative block">
          <span className="sr-only">Buscar por número o nombre</span>
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-400" />
          <input
            value={busqueda}
            onChange={e => { setBusqueda(e.target.value); setPagina(0) }}
            placeholder="Buscar por número o nombre"
            className="campo w-full pl-9 py-2.5"
          />
        </label>

        {cargando ? (
          <p className="card-label text-ink-500 py-6 text-center">Cargando…</p>
        ) : visibles.length === 0 ? (
          <p className="card-label text-ink-500 py-6 text-center">
            {filas.length === 0
              ? 'Todavía no hay proyectos. Aparecen solos cuando alguien rinde a una obra.'
              : 'Ningún proyecto coincide con la búsqueda.'}
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full card-label">
              <thead>
                <tr className="text-left text-ink-500 border-b border-ink-100">
                  <th className="py-2 pr-3 font-semibold">N°</th>
                  <th className="py-2 pr-3 font-semibold">Nombre</th>
                  <th className="py-2 pr-3 font-semibold">Jefe sugerido</th>
                  <th className="py-2 pr-3 font-semibold text-right">Documentos</th>
                  <th className="py-2 font-semibold text-center">Activo</th>
                </tr>
              </thead>
              <tbody>
                {tramo.map(f => (
                  <tr key={f.id} className={`border-b border-ink-100 ${f.activo ? '' : 'opacity-60'}`}>
                    <td className="py-2 pr-3 font-semibold text-ink-900 font-mono-amount whitespace-nowrap">{f.numero}</td>
                    <td className="py-2 pr-3">
                      <input
                        defaultValue={f.nombre ?? ''}
                        disabled={guardando === f.id}
                        onBlur={e => {
                          const v = e.target.value.trim()
                          if (v !== (f.nombre ?? '')) guardar(f.id, { nombre: v || null })
                        }}
                        placeholder="Sin nombre"
                        aria-label={`Nombre de la obra ${f.numero}`}
                        className="campo-compacto w-full"
                      />
                    </td>
                    <td className="py-2 pr-3">
                      <select
                        value={f.jefe_id ?? ''}
                        disabled={guardando === f.id}
                        onChange={e => guardar(f.id, { jefe_id: e.target.value || null })}
                        aria-label={`Jefe de la obra ${f.numero}`}
                        className="campo-compacto w-full"
                      >
                        <option value="">Sin jefe sugerido</option>
                        {/* Si el jefe actual dejó de estar habilitado, igual se muestra
                            para no fingir que la obra no tiene ninguno */}
                        {f.jefe_id && !jefes.some(j => j.id === f.jefe_id) && (
                          <option value={f.jefe_id}>{f.jefe_nombre ?? 'Jefe no habilitado'} (no habilitado)</option>
                        )}
                        {jefes.map(j => <option key={j.id} value={j.id}>{j.full_name}</option>)}
                      </select>
                    </td>
                    <td className="py-2 pr-3 text-right font-mono-amount text-ink-700">
                      {f.documentos}
                    </td>
                    <td className="py-2 text-center">
                      <input
                        type="checkbox"
                        checked={f.activo}
                        disabled={guardando === f.id}
                        onChange={e => guardar(f.id, { activo: e.target.checked })}
                        aria-label={`Obra ${f.numero} activa`}
                        className="rounded text-brand-600"
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {paginas > 1 && (
          <div className="flex items-center justify-between pt-1 border-t border-ink-100">
            <span className="card-meta text-ink-500">
              {visibles.length} proyectos · página {pag + 1} de {paginas}
            </span>
            <div className="flex gap-2">
              <button onClick={() => setPagina(pag - 1)} disabled={pag === 0}
                      className="btn-secundario px-3 py-1.5 card-label">Anterior</button>
              <button onClick={() => setPagina(pag + 1)} disabled={pag >= paginas - 1}
                      className="btn-secundario px-3 py-1.5 card-label">Siguiente</button>
            </div>
          </div>
        )}
      </div>

      <p className="card-meta tor-on-gradient-soft">
        Cambiar el jefe acá cambia la sugerencia para lo que se rinda de ahora en más. Lo ya
        enviado no se mueve: su cadena quedó fija al enviarse.
      </p>
    </div>
  )
}
