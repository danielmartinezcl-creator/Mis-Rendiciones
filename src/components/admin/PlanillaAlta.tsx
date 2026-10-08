'use client'

// La única carga de empleados: crea a quien no está y completa a quien sí.
// El Excel se lee EN EL NAVEGADOR (no se sube a ningún lado) y la vista previa
// dice fila por fila qué va a pasar antes de escribir nada.
//
// Spec: docs/superpowers/specs/2026-10-01-planilla-de-alta-design.md

import { useState, useEffect, useMemo } from 'react'
import { Upload, Download, AlertTriangle, UserPlus, Loader2 } from 'lucide-react'
import { useDialogos } from '@/components/ui/Dialogos'
import { datosParaPlanilla, cargarPlanillaAlta, otorgarPermisoAprobar } from '@/actions/employees'
import {
  resolverPlanilla, sinPermisoAprobar,
  type FilaPlanilla, type Persona, type CentroCosto,
} from '@/lib/planilla-alta'
import { alertasDeSegregacion, type AprobacionDeDocumento } from '@/lib/segregacion'

const CABECERAS = [
  'Apellido y nombre', 'RUT', 'Correo', 'Cargo', 'Centro de costo', 'Rol',
  'Aprobador 1er Nivel (N1)', 'Aprobador 2do Nivel (N2)',
  'Banco', 'Tipo de Cuenta', 'N° de Cuenta',
]

/* N1 y N2 van VACÍOS en el ejemplo, a propósito (2026-10-07). Con el aprobador
   por proyecto, quien no tiene jefe propio va al aprobador por defecto de la
   organización, así que llenar esa columna es declarar una EXCEPCIÓN. Un
   ejemplo que las trae llenas invita a completarlas para los 57, y cada una
   apaga el aprobador por defecto de esa persona sin que se note. */
const EJEMPLO = [
  'Contreras Pía', '11.111.111-1', 'pia.contreras@penta.cl',
  'Jefa de Obra', 'Administración', 'employee',
  '', '',
  'Banco de Chile', 'Cuenta Corriente', '00012345678',
]

const VACIA: FilaPlanilla = {
  nombre: '', rut: '', correo: '', cargo: '', centroCosto: '', rol: '',
  n1: '', n2: '', banco: '', tipoCuenta: '', numeroCuenta: '',
}

// Tolerante con mayúsculas, tildes y espacios, como el de «Importar nómina».
function mapHeader(h: string): keyof FilaPlanilla | null {
  const s = h.toLowerCase().trim().normalize('NFD').replace(/\p{Diacritic}/gu, '')
  if (['apellido y nombre', 'nombre y apellido', 'nombre', 'nombre completo'].includes(s)) return 'nombre'
  if (['rut', 'r.u.t.', 'rut empleado'].includes(s)) return 'rut'
  if (['correo', 'email', 'e-mail', 'correo electronico'].includes(s)) return 'correo'
  if (['cargo', 'puesto', 'departamento', 'area'].includes(s)) return 'cargo'
  if (['centro de costo', 'centro costo', 'cc', 'centro'].includes(s)) return 'centroCosto'
  if (['rol', 'role', 'perfil'].includes(s)) return 'rol'
  if (['aprobador 1er nivel (n1)', 'aprobador 1er nivel', 'aprobador n1', 'n1'].includes(s)) return 'n1'
  if (['aprobador 2do nivel (n2)', 'aprobador 2do nivel', 'aprobador n2', 'n2'].includes(s)) return 'n2'
  if (['banco'].includes(s)) return 'banco'
  if (['tipo de cuenta', 'tipo cuenta'].includes(s)) return 'tipoCuenta'
  if (['n de cuenta', 'no de cuenta', 'numero de cuenta', 'cuenta'].includes(s)) return 'numeroCuenta'
  return null
}

async function descargarPlantilla() {
  const XLSX = await import('xlsx')
  const wb = XLSX.utils.book_new()
  const ws = XLSX.utils.aoa_to_sheet([CABECERAS, EJEMPLO])
  XLSX.utils.book_append_sheet(wb, ws, 'Empleados')
  XLSX.writeFile(wb, 'planilla-de-alta.xlsx')
}

export function PlanillaAlta({ onDone }: { onDone: () => void }) {
  const { confirmar, avisar } = useDialogos()
  const [personas, setPersonas] = useState<Persona[]>([])
  const [docs, setDocs]         = useState<AprobacionDeDocumento[]>([])
  const [centros,  setCentros]  = useState<CentroCosto[]>([])
  const [filas,    setFilas]    = useState<FilaPlanilla[]>([])
  const [archivo,  setArchivo]  = useState<string | null>(null)
  const [otorgar,  setOtorgar]  = useState<Set<string>>(new Set())
  const [error,    setError]    = useState<string | null>(null)
  const [cargando, setCargando] = useState(false)
  const [fallidas, setFallidas] = useState<{ fila: number; nombre: string; motivo: string }[]>([])
  const [porDefecto, setPorDefecto] = useState<string | null>(null)

  useEffect(() => {
    datosParaPlanilla()
      .then(d => {
        setPersonas(d.personas); setCentros(d.centros); setDocs(d.aprobacionesDeDocumentos)
        setPorDefecto(d.aprobadorPorDefecto)
      })
      .catch(e => setError(e instanceof Error ? e.message : String(e)))
  }, [])

  // Se recalcula acá y no al leer el archivo: así «Darles el permiso» saca las
  // filas del error sin que haya que volver a subir el Excel.
  const resueltas = useMemo(
    () => resolverPlanilla(filas, personas, centros, otorgar),
    [filas, personas, centros, otorgar])

  const validas      = resueltas.filter(r => r.errores.length === 0 && r.accion !== 'ninguna')
  const conError     = resueltas.filter(r => r.errores.length > 0)
  const sinCambios   = resueltas.filter(r => r.errores.length === 0 && r.accion === 'ninguna')
  const porCrear     = validas.filter(r => r.accion === 'crear')
  const cambianMail  = validas.filter(r => r.correoNuevo)
  const faltaPermiso = sinPermisoAprobar(resueltas)
  const alertas      = useMemo(
    () => alertasDeSegregacion(personas, resueltas, undefined, docs), [personas, resueltas, docs])

  async function leerArchivo(file: File) {
    setError(null); setFallidas([])
    try {
      const XLSX = await import('xlsx')
      const wb = XLSX.read(await file.arrayBuffer(), { type: 'array' })
      if (!wb.SheetNames.length) { setError('El archivo no tiene hojas de cálculo.'); return }

      const ws = wb.Sheets[wb.SheetNames[0]]
      const json = XLSX.utils.sheet_to_json<Record<string, string>>(ws, { defval: '' })
      if (!json.length) { setError('El archivo no tiene filas de datos.'); return }

      const columnas = Object.keys(json[0])
      if (!columnas.some(c => mapHeader(c) === 'rut')) {
        setError(
          `No se encontró la columna RUT, que es la que identifica a cada persona.\n` +
          `Columnas detectadas: ${columnas.join(', ')}\n` +
          `Descarga la plantilla y usa esos encabezados.`)
        return
      }

      setFilas(json.map(row => {
        const f: FilaPlanilla = { ...VACIA }
        for (const [col, val] of Object.entries(row)) {
          const campo = mapHeader(col)
          if (campo) f[campo] = String(val ?? '').trim()
        }
        return f
      }))
      setArchivo(`${file.name} · ${json.length} filas`)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    }
  }

  async function darPermiso() {
    try {
      const r = await otorgarPermisoAprobar(faltaPermiso.map(x => x.id))
      if (r.errores.length) avisar(r.errores.join('. '), 'error')
      const d = await datosParaPlanilla()
      setPersonas(d.personas)
      setDocs(d.aprobacionesDeDocumentos)
      setOtorgar(new Set())   // ya está en la base: el recálculo lo toma de ahí
      if (r.ok) avisar(`${r.ok} ${r.ok === 1 ? 'persona ahora puede' : 'personas ahora pueden'} aprobar`)
    } catch (e) {
      avisar(e instanceof Error ? e.message : String(e), 'error')
    }
  }

  async function cargar() {
    const partes = [`${validas.length} ${validas.length === 1 ? 'empleado' : 'empleados'}`]
    if (porCrear.length)    partes.push(`${porCrear.length} ${porCrear.length === 1 ? 'es una cuenta NUEVA' : 'son cuentas NUEVAS'}`)
    if (cambianMail.length) partes.push(`${cambianMail.length} ${cambianMail.length === 1 ? 'cambia' : 'cambian'} de correo de acceso`)
    if (!await confirmar({
      titulo:  `Se van a cargar ${partes.join(', y ')}. ¿Seguimos?`,
      aceptar: 'Cargar',
    })) return

    setCargando(true)
    try {
      const r = await cargarPlanillaAlta(validas.map(v => filas[v.fila - 1]))
      setFallidas(r.fallidas)
      avisar(`Se crearon ${r.creadas} y se actualizaron ${r.actualizadas}`)
      if (!r.fallidas.length) onDone()
    } catch (e) {
      avisar(e instanceof Error ? e.message : String(e), 'error')
    } finally {
      setCargando(false)
    }
  }

  // ── Paso 1: elegir el archivo ──────────────────────────────────────────────
  if (!filas.length) {
    return (
      <div className="space-y-4">
        <p className="text-sm text-ink-600">
          Una sola planilla con todo lo que define a una persona: sus datos bancarios, su
          cargo, su centro de costo y, si corresponde, su cadena de aprobación. Crea a quien
          no está y completa a quien sí. <strong className="font-semibold">Una celda vacía
          nunca borra</strong> lo que la persona ya tenía.
        </p>

        {/* Sin esto, lo natural es llenar N1 para todos «por las dudas», y cada
            una de esas filas apaga el aprobador por defecto de esa persona sin
            que se note hasta que alguien pregunta por qué le llegó una
            rendición. La frase nombra a quien está configurado hoy, no al
            concepto: «el aprobador por defecto» no le dice nada a nadie. */}
        <div className="hoja border border-brand-200 bg-brand-50/50 p-4">
          <p className="text-sm text-ink-700">
            <strong className="font-semibold">Las columnas N1 y N2 van vacías casi siempre.</strong>{' '}
            {porDefecto
              ? <>Quien no tiene jefe propio va al jefe de la obra que elija al rendir y, si no es
                  de una obra, a <strong className="font-semibold">{porDefecto}</strong>. Llenar N1 es
                  declarar una excepción para esa persona.</>
              : <>Quien no tiene jefe propio va al jefe de la obra que elija al rendir. Para lo que
                  no es de una obra todavía no hay aprobador por defecto configurado
                  (Configuración → Aprobación), así que esas personas no pueden enviar.</>}
          </p>
        </div>

        {error && (
          <div className="hoja border border-danger-200 p-4">
            <p className="text-sm text-danger-700 whitespace-pre-line">{error}</p>
          </div>
        )}

        <div className="flex items-center gap-3 flex-wrap">
          <label className="btn-primario inline-flex items-center gap-2 cursor-pointer">
            <Upload size={15} />
            Elegir archivo Excel
            <input
              type="file"
              accept=".xlsx,.xls"
              className="sr-only"
              onChange={e => { const f = e.target.files?.[0]; if (f) leerArchivo(f) }}
            />
          </label>
          <button
            type="button"
            onClick={descargarPlantilla}
            className="btn-secundario inline-flex items-center gap-2"
          >
            <Download size={15} />
            Descargar plantilla
          </button>
        </div>
      </div>
    )
  }

  // ── Paso 2: la vista previa ────────────────────────────────────────────────
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <p className="text-sm text-ink-600">{archivo}</p>
        <button
          type="button"
          onClick={() => { setFilas([]); setArchivo(null); setFallidas([]) }}
          className="text-sm text-brand-600 hover:underline"
        >
          Elegir otro archivo
        </button>
      </div>

      {/* Resumen */}
      <div className="hoja p-4 flex items-center gap-6 flex-wrap">
        <Cifra n={porCrear.length} etiqueta={porCrear.length === 1 ? 'se crea' : 'se crean'} tono="brand" />
        <Cifra n={validas.length - porCrear.length}
               etiqueta={validas.length - porCrear.length === 1 ? 'se actualiza' : 'se actualizan'} tono="ink" />
        <Cifra n={conError.length}
               etiqueta={conError.length === 1 ? 'queda fuera' : 'quedan fuera'} tono="warning" />
        {cambianMail.length > 0 && (
          <Cifra n={cambianMail.length} etiqueta={cambianMail.length === 1 ? 'cambia de correo' : 'cambian de correo'} tono="warning" />
        )}
        {sinCambios.length > 0 && (
          <Cifra n={sinCambios.length} etiqueta="sin novedades" tono="ink" />
        )}
      </div>

      {/* Permiso «aprueba» */}
      {faltaPermiso.length > 0 && (
        <div className="hoja p-4 flex items-start gap-3 flex-wrap">
          <AlertTriangle size={18} className="text-warning-700 shrink-0 mt-0.5" />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-ink-800">
              {faltaPermiso.length === 1
                ? '1 persona va a aprobar pero no tiene el permiso «aprueba»'
                : `${faltaPermiso.length} personas van a aprobar pero no tienen el permiso «aprueba»`}
            </p>
            <p className="text-xs text-ink-600 mt-1">
              {faltaPermiso.map(x => x.nombre).join(' · ')}. Sin el permiso, sus filas no se pueden cargar.
            </p>
          </div>
          <button type="button" onClick={darPermiso} className="btn-secundario shrink-0">
            Darles el permiso
          </button>
        </div>
      )}

      {/* Alertas de segregación — informan, no bloquean */}
      {alertas.length > 0 && (
        <div className="hoja p-4">
          <p className="text-sm font-semibold text-ink-800 mb-2">Revisa antes de confirmar</p>
          <ul className="space-y-1">
            {alertas.map((a, i) => (
              <li key={i} className="text-xs text-warning-700 flex items-start gap-2">
                <span aria-hidden="true">·</span>
                <span>{a.texto}</span>
              </li>
            ))}
          </ul>
          <p className="text-xs text-ink-400 mt-2">
            No impiden cargar: en una organización chica pueden ser deliberadas.
          </p>
        </div>
      )}

      {/* Tabla */}
      <div className="hoja overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-ink-50 text-ink-600 text-left text-xs">
                <th className="px-4 py-3 font-semibold">Apellido y nombre</th>
                <th className="px-4 py-3 font-semibold">RUT</th>
                <th className="px-4 py-3 font-semibold">Correo</th>
                <th className="px-4 py-3 font-semibold">N1</th>
                <th className="px-4 py-3 font-semibold">N2</th>
                <th className="px-4 py-3 font-semibold">Banco</th>
              </tr>
            </thead>
            <tbody>
              {resueltas.map(r => {
                const f = filas[r.fila - 1]
                const malo = r.errores.length > 0
                return (
                  <tr key={r.fila} className={`border-t border-ink-100 ${malo ? 'bg-danger-50' : ''}`}>
                    <td className="px-4 py-3 text-ink-800">
                      {f.nombre || r.persona?.nombre || '—'}
                      {r.accion === 'crear' && !malo && (
                        <span className="ml-2 inline-flex items-center gap-1 text-xs text-brand-600">
                          <UserPlus size={12} /> nueva
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 font-mono-amount text-xs text-ink-600">{f.rut || '—'}</td>
                    {malo ? (
                      <td className="px-4 py-3 text-xs text-warning-700" colSpan={4}>
                        <strong className="font-semibold">Queda fuera:</strong> {r.errores.join('. ')}
                      </td>
                    ) : (
                      <>
                        <td className="px-4 py-3 text-ink-600 text-xs">
                          {f.correo || r.persona?.correo || '—'}
                          {r.correoNuevo && (
                            <span className="block text-warning-700 font-semibold mt-0.5">
                              cambia su correo de acceso · antes {r.persona?.correo}
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-ink-600 text-xs">{r.n1?.nombre ?? '—'}</td>
                        <td className="px-4 py-3 text-ink-600 text-xs">{r.n2?.nombre ?? '—'}</td>
                        <td className="px-4 py-3 text-ink-600 text-xs">
                          {[f.banco, f.tipoCuenta, f.numeroCuenta].filter(Boolean).join(' · ') || '—'}
                        </td>
                      </>
                    )}
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Resultado de una carga con fallas */}
      {fallidas.length > 0 && (
        <div className="hoja p-4">
          <p className="text-sm font-semibold text-ink-800 mb-2">
            {fallidas.length === 1 ? 'Una fila no se pudo cargar' : `${fallidas.length} filas no se pudieron cargar`}
          </p>
          <ul className="space-y-1">
            {fallidas.map(f => (
              <li key={f.fila} className="text-xs text-warning-700">
                Fila {f.fila} — {f.nombre}: {f.motivo}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Pie */}
      <div className="flex items-center gap-3 flex-wrap">
        <p className="text-xs text-ink-400 flex-1 min-w-0">
          Cada empleado actualizado queda en el registro de auditoría.
        </p>
        <button type="button" onClick={onDone} className="btn-secundario">Cancelar</button>
        <button
          type="button"
          onClick={cargar}
          disabled={cargando || validas.length === 0}
          className="btn-primario inline-flex items-center gap-2 disabled:opacity-40"
        >
          {cargando && <Loader2 size={15} className="animate-spin" />}
          Cargar {validas.length} {validas.length === 1 ? 'válida' : 'válidas'}
        </button>
      </div>
    </div>
  )
}

function Cifra({ n, etiqueta, tono }: { n: number; etiqueta: string; tono: 'brand' | 'ink' | 'warning' }) {
  const color = tono === 'brand' ? 'text-brand-600'
              : tono === 'warning' ? 'text-warning-700'
              : 'text-ink-800'
  return (
    <div>
      <p className={`font-mono-amount text-2xl font-bold ${color}`}>{n}</p>
      <p className="text-xs text-ink-600 mt-0.5">{etiqueta}</p>
    </div>
  )
}
