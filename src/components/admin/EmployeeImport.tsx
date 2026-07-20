'use client'

import { useRef, useState, useEffect } from 'react'
import { importEmployees } from '@/actions/employees'
import { getCostCenters } from '@/actions/admin'
import type { ImportEmployeeRow, ImportResult } from '@/actions/employees'
import type { CostCenter } from '@/lib/supabase/types'
import { Download, AlertTriangle, CheckCircle, XCircle, Loader2 } from 'lucide-react'

type PreviewRow = ImportEmployeeRow & { _key: number }

const ROLE_OPTIONS = [
  { value: 'employee',  label: 'Empleado' },
  { value: 'approver',  label: 'Aprobador' },
  { value: 'admin',     label: 'Administrador' },
]

function mapHeader(h: string): keyof ImportEmployeeRow | null {
  const s = h.toLowerCase().trim()
  if (['nombre', 'nombre y apellido', 'name', 'full_name', 'nombre completo'].includes(s)) return 'full_name'
  if (['email', 'correo', 'e-mail', 'correo electrónico', 'correo electronico'].includes(s)) return 'email'
  if (['rol', 'role', 'perfil'].includes(s)) return 'role'
  if (['rut', 'rut empleado', 'r.u.t.'].includes(s)) return 'rut'
  if (['cargo', 'puesto', 'título', 'titulo', 'position', 'job title', 'departamento', 'department', 'área', 'area'].includes(s)) return 'department'
  if (['centro de costo', 'centro costo', 'cost center', 'cc', 'centro'].includes(s)) return 'cost_center_id'
  return null
}

function normalizeRole(val: string): 'admin' | 'approver' | 'employee' {
  const v = val.toLowerCase().trim()
  if (['admin', 'administrador', 'administradora'].includes(v)) return 'admin'
  if (['approver', 'aprobador', 'aprobadora'].includes(v)) return 'approver'
  return 'employee'
}

function resolveCostCenter(raw: string, costCenters: CostCenter[]): string {
  const s = raw.trim()
  if (!s) return ''
  const byId = costCenters.find(cc => cc.id.toLowerCase() === s.toLowerCase())
  if (byId) return byId.id
  const byDesc = costCenters.find(cc => cc.descripcion.toLowerCase() === s.toLowerCase())
  if (byDesc) return byDesc.id
  const partial = costCenters.find(cc => cc.descripcion.toLowerCase().includes(s.toLowerCase()))
  if (partial) return partial.id
  return s
}

async function downloadTemplate(costCenters: CostCenter[]) {
  const XLSX = await import('xlsx')
  const wb = XLSX.utils.book_new()

  const nominaData = [
    ['Nombre', 'Email', 'RUT', 'Centro de Costo', 'Cargo', 'Rol'],
    ['María González López', 'mgonzalez@empresa.cl', '12.345.678-9', 'EMPGESFINADM', 'Contadora', 'empleado'],
    ['Juan Pérez Díaz', 'jperez@empresa.cl', '9.876.543-2', 'EMPGESGEGGEG', 'Gerente General', 'aprobador'],
  ]
  const wsNomina = XLSX.utils.aoa_to_sheet(nominaData)
  wsNomina['!cols'] = [
    { wch: 28 }, { wch: 30 }, { wch: 14 }, { wch: 20 }, { wch: 22 }, { wch: 14 },
  ]

  const ccData = [
    ['ID (usar en "Centro de Costo")', 'Descripción', 'Imputable'],
    ...costCenters
      .filter(cc => cc.activo)
      .sort((a, b) => a.id.localeCompare(b.id))
      .map(cc => [cc.id, cc.descripcion, cc.imputable ? 'Sí' : 'No']),
  ]
  const wsCenters = XLSX.utils.aoa_to_sheet(ccData)
  wsCenters['!cols'] = [{ wch: 26 }, { wch: 36 }, { wch: 10 }]

  XLSX.utils.book_append_sheet(wb, wsNomina, 'Nomina')
  XLSX.utils.book_append_sheet(wb, wsCenters, 'Centros de Costo')

  XLSX.writeFile(wb, 'plantilla-nomina.xlsx')
}

export function EmployeeImport({ onDone }: { onDone: () => void }) {
  const inputRef                      = useRef<HTMLInputElement>(null)
  const [step,       setStep]         = useState<'upload' | 'preview' | 'results'>('upload')
  const [preview,    setPreview]      = useState<PreviewRow[]>([])
  const [results,    setResults]      = useState<ImportResult[]>([])
  const [isParsing,  setIsParsing]    = useState(false)
  const [isImporting, setIsImporting] = useState(false)
  const [parseError, setParseError]   = useState<string | null>(null)
  const [importError, setImportError] = useState<string | null>(null)
  const [detectedCols, setDetectedCols] = useState<string[]>([])
  const [costCenters, setCostCenters] = useState<CostCenter[]>([])
  const [closeCountdown, setCloseCountdown] = useState(0)

  useEffect(() => {
    getCostCenters().then(cc => setCostCenters(cc)).catch(() => {/* silencioso */})
  }, [])

  // Countdown de 10 s cuando aparecen errores en la pantalla de resultados
  useEffect(() => {
    if (step !== 'results') return
    const errors = results.filter(r => !r.success)
    if (errors.length === 0) return
    setCloseCountdown(10)
    const iv = setInterval(() => {
      setCloseCountdown(prev => {
        if (prev <= 1) { clearInterval(iv); return 0 }
        return prev - 1
      })
    }, 1000)
    return () => clearInterval(iv)
  }, [step, results])

  async function handleFile(file: File) {
    setParseError(null)
    setImportError(null)
    setDetectedCols([])
    setIsParsing(true)

    try {
      const XLSX = await import('xlsx')
      const buffer = await file.arrayBuffer()
      const wb = XLSX.read(buffer, { type: 'array' })

      if (!wb.SheetNames.length) {
        setParseError('El archivo no contiene hojas de cálculo.')
        return
      }

      // Siempre leer la primera hoja (Nomina)
      const ws = wb.Sheets[wb.SheetNames[0]]
      const json = XLSX.utils.sheet_to_json<Record<string, string>>(ws, { defval: '' })

      if (json.length === 0) {
        setParseError('El archivo está vacío o solo tiene encabezados. Agrega filas de datos.')
        return
      }

      // Detectar qué columnas se encontraron
      const firstRow = json[0]
      const foundCols = Object.keys(firstRow)
      setDetectedCols(foundCols)

      const mappedFields = new Set(foundCols.map(mapHeader).filter(Boolean))
      if (!mappedFields.has('full_name')) {
        setParseError(
          `No se encontró la columna "Nombre" en el archivo.\n` +
          `Columnas detectadas: ${foundCols.join(', ')}\n` +
          `Descargá la plantilla y usá los encabezados exactos.`
        )
        return
      }
      if (!mappedFields.has('email')) {
        setParseError(
          `No se encontró la columna "Email" en el archivo.\n` +
          `Columnas detectadas: ${foundCols.join(', ')}\n` +
          `Descargá la plantilla y usá los encabezados exactos.`
        )
        return
      }

      const rows: PreviewRow[] = json.map((row, i) => {
        const mapped: Partial<ImportEmployeeRow> = {}
        for (const [col, val] of Object.entries(row)) {
          const field = mapHeader(col)
          if (!field) continue
          if (field === 'role') {
            mapped.role = normalizeRole(String(val))
          } else if (field === 'cost_center_id') {
            mapped.cost_center_id = resolveCostCenter(String(val), costCenters)
          } else {
            (mapped as Record<string, string>)[field] = String(val).trim()
          }
        }
        return {
          _key:           i,
          full_name:      mapped.full_name      ?? '',
          email:          mapped.email          ?? '',
          role:           mapped.role           ?? 'employee',
          rut:            mapped.rut            ?? '',
          department:     mapped.department     ?? '',
          cost_center_id: mapped.cost_center_id ?? '',
        }
      })

      setPreview(rows)
      setStep('preview')
    } catch (err) {
      console.error('[EmployeeImport] Error al parsear:', err)
      setParseError(
        `No se pudo leer el archivo.\n` +
        `Asegurate de que sea un .xlsx válido y que no esté abierto en Excel.\n` +
        `Error: ${err instanceof Error ? err.message : String(err)}`
      )
    } finally {
      setIsParsing(false)
    }
  }

  function updateRow(key: number, field: keyof ImportEmployeeRow, value: string) {
    setPreview(prev => prev.map(r => r._key === key ? { ...r, [field]: value } : r))
  }

  function removeRow(key: number) {
    setPreview(prev => {
      const next = prev.filter(r => r._key !== key)
      if (next.length === 0) setStep('upload')
      return next
    })
  }

  async function handleImport() {
    setImportError(null)

    const invalid = preview.filter(r => !r.email.includes('@') || !r.full_name.trim())
    if (invalid.length > 0) {
      setImportError(
        `${invalid.length} fila${invalid.length > 1 ? 's' : ''} con datos incompletos: ` +
        invalid.slice(0, 3).map(r => r.full_name || r.email || `Fila ${r._key + 1}`).join(', ') +
        (invalid.length > 3 ? ` y ${invalid.length - 3} más.` : '.') +
        ' Completá o eliminá esas filas antes de importar.'
      )
      return
    }

    setIsImporting(true)
    try {
      const rows: ImportEmployeeRow[] = preview.map(r => ({
        full_name:      r.full_name,
        email:          r.email,
        role:           r.role,
        rut:            r.rut          || undefined,
        department:     r.department   || undefined,
        cost_center_id: r.cost_center_id || undefined,
      }))
      const res = await importEmployees(rows)
      setResults(res)
      setPreview([])
      setStep('results')
    } catch (err) {
      console.error('[EmployeeImport] Error en importEmployees:', err)
      setImportError(
        `Error al conectar con el servidor: ${err instanceof Error ? err.message : String(err)}`
      )
    } finally {
      setIsImporting(false)
    }
  }

  const inputCls = 'w-full border border-slate-200 rounded px-1.5 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-brand-600'

  // ── Resultados ──────────────────────────────────────────────────────────────
  if (step === 'results') {
    const ok  = results.filter(r => r.success)
    const err = results.filter(r => !r.success)
    const canClose = closeCountdown === 0
    return (
      <div className="space-y-4">
        {/* Errores primero — más visibles */}
        {err.length > 0 && (
          <div className="bg-red-50 border-2 border-red-300 rounded-card p-4">
            <div className="flex items-center gap-2 mb-3">
              <XCircle size={18} className="text-red-600 shrink-0" />
              <p className="font-bold text-red-700">{err.length} empleado{err.length !== 1 ? 's' : ''} no se pudo{err.length !== 1 ? 'ron' : ''} importar</p>
            </div>
            <div className="space-y-2">
              {err.map((r, i) => (
                <div key={i} className="bg-white border border-red-200 rounded-item px-3 py-2 text-xs">
                  <span className="font-semibold text-red-700">{r.full_name}</span>
                  <span className="text-red-500 ml-1">({r.email})</span>
                  <p className="text-red-600 mt-0.5">{r.error}</p>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Éxitos */}
        {ok.length > 0 ? (
          <div className="flex items-start gap-3 bg-emerald-50 border border-emerald-200 rounded-card p-4">
            <CheckCircle size={20} className="text-emerald-600 shrink-0 mt-0.5" />
            <div>
              <p className="font-semibold text-emerald-700">
                {ok.length} empleado{ok.length !== 1 ? 's' : ''} importado{ok.length !== 1 ? 's' : ''} correctamente
              </p>
              <p className="text-xs text-emerald-600 mt-0.5">
                Podés enviarles la invitación desde la lista de empleados.
              </p>
              <ul className="mt-2 space-y-0.5">
                {ok.map((r, i) => (
                  <li key={i} className="text-xs text-emerald-700">✓ {r.full_name} ({r.email})</li>
                ))}
              </ul>
            </div>
          </div>
        ) : (
          <div className="flex items-start gap-3 bg-amber-50 border border-amber-200 rounded-card p-4">
            <AlertTriangle size={20} className="text-amber-600 shrink-0 mt-0.5" />
            <p className="font-semibold text-amber-700">No se pudo importar ningún empleado</p>
          </div>
        )}

        <div className="flex gap-3 pt-1">
          <button
            onClick={() => { setStep('upload'); setPreview([]); setResults([]); setCloseCountdown(0) }}
            className="text-sm text-brand-600 hover:underline"
          >
            Importar más empleados
          </button>
          <button
            onClick={onDone}
            disabled={!canClose}
            className="ml-auto text-sm font-semibold text-white bg-brand-600 hover:bg-brand-700 disabled:bg-slate-300 px-5 py-2 rounded-item transition-colors"
          >
            {canClose ? 'Cerrar' : `Cerrar (${closeCountdown}s)`}
          </button>
        </div>
      </div>
    )
  }

  // ── Preview ─────────────────────────────────────────────────────────────────
  if (step === 'preview') {
    return (
      <div className="space-y-4">
        {/* Paso 2 / banner verde de detección exitosa */}
        <div className="flex items-center justify-between gap-3 p-3 bg-emerald-50 border border-emerald-200 rounded-item">
          <div className="flex items-center gap-2">
            <CheckCircle size={16} className="text-emerald-600 shrink-0" />
            <p className="text-sm font-medium text-emerald-700">
              {preview.length} fila{preview.length !== 1 ? 's' : ''} detectada{preview.length !== 1 ? 's' : ''} — revisá y confirmá para importar
            </p>
          </div>
          <button
            onClick={() => { setStep('upload'); setPreview([]); setParseError(null) }}
            className="text-xs text-slate-400 hover:text-slate-600 shrink-0"
          >
            Cancelar
          </button>
        </div>

        {/* Error de validación — ARRIBA del form */}
        {importError && (
          <div className="flex items-start gap-2 p-3 bg-red-50 border border-red-300 rounded-item">
            <AlertTriangle size={15} className="text-red-600 shrink-0 mt-0.5" />
            <p className="text-xs text-red-700 whitespace-pre-wrap">{importError}</p>
          </div>
        )}

        <div className="overflow-x-auto">
          <table className="w-full text-xs border-collapse min-w-[700px]">
            <thead>
              <tr className="text-left text-slate-500 border-b border-slate-100">
                <th className="pb-2 pr-2 font-medium">Nombre *</th>
                <th className="pb-2 pr-2 font-medium">Email *</th>
                <th className="pb-2 pr-2 font-medium">RUT</th>
                <th className="pb-2 pr-2 font-medium">Centro de Costo</th>
                <th className="pb-2 pr-2 font-medium">Cargo</th>
                <th className="pb-2 pr-2 font-medium">Rol</th>
                <th className="pb-2 font-medium"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {preview.map(row => {
                const ccValid = !row.cost_center_id || costCenters.some(cc => cc.id === row.cost_center_id)
                return (
                  <tr key={row._key}>
                    <td className="py-1.5 pr-2 min-w-[140px]">
                      <input
                        value={row.full_name}
                        onChange={e => updateRow(row._key, 'full_name', e.target.value)}
                        className={inputCls + (!row.full_name.trim() ? ' border-red-300 ring-1 ring-red-300' : '')}
                      />
                    </td>
                    <td className="py-1.5 pr-2 min-w-[160px]">
                      <input
                        value={row.email}
                        onChange={e => updateRow(row._key, 'email', e.target.value)}
                        className={inputCls + (!row.email.includes('@') ? ' border-red-300 ring-1 ring-red-300' : '')}
                      />
                    </td>
                    <td className="py-1.5 pr-2 min-w-[100px]">
                      <input
                        value={row.rut ?? ''}
                        onChange={e => updateRow(row._key, 'rut', e.target.value)}
                        placeholder="12.345.678-9"
                        className={inputCls}
                      />
                    </td>
                    <td className="py-1.5 pr-2 min-w-[160px]">
                      <select
                        value={row.cost_center_id ?? ''}
                        onChange={e => updateRow(row._key, 'cost_center_id', e.target.value)}
                        className={`border rounded px-1.5 py-1 bg-white text-xs focus:outline-none focus:ring-1 focus:ring-brand-600 w-full ${!ccValid ? 'border-amber-400' : 'border-slate-200'}`}
                      >
                        <option value="">— Sin asignar —</option>
                        {costCenters.filter(cc => cc.imputable).map(cc => (
                          <option key={cc.id} value={cc.id}>{cc.id} — {cc.descripcion}</option>
                        ))}
                      </select>
                      {!ccValid && row.cost_center_id && (
                        <p className="text-amber-600 text-[10px] mt-0.5">ID no reconocido</p>
                      )}
                    </td>
                    <td className="py-1.5 pr-2 min-w-[120px]">
                      <input
                        value={row.department ?? ''}
                        onChange={e => updateRow(row._key, 'department', e.target.value)}
                        placeholder="Ej: Contador"
                        className={inputCls}
                      />
                    </td>
                    <td className="py-1.5 pr-2">
                      <select
                        value={row.role}
                        onChange={e => updateRow(row._key, 'role', e.target.value)}
                        className="border border-slate-200 rounded px-1.5 py-1 bg-white text-xs focus:outline-none focus:ring-1 focus:ring-brand-600"
                      >
                        {ROLE_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                      </select>
                    </td>
                    <td className="py-1.5">
                      <button
                        onClick={() => removeRow(row._key)}
                        className="text-red-400 hover:text-red-600 px-1 text-xs"
                        title="Eliminar fila"
                      >
                        ✕
                      </button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>

        <button
          onClick={handleImport}
          disabled={isImporting || preview.length === 0}
          className="w-full py-3 bg-brand-600 hover:bg-brand-700 disabled:opacity-50 text-white text-sm font-bold rounded-card transition-colors flex items-center justify-center gap-2"
        >
          {isImporting ? (
            <><Loader2 size={16} className="animate-spin" /> Importando {preview.length} empleado{preview.length !== 1 ? 's' : ''}…</>
          ) : (
            <>✓ Confirmar e importar {preview.length} empleado{preview.length !== 1 ? 's' : ''}</>
          )}
        </button>
        <p className="text-center text-xs text-slate-400">
          Se enviará un email de activación a cada empleado.
        </p>
      </div>
    )
  }

  // ── Upload inicial ──────────────────────────────────────────────────────────
  return (
    <div className="space-y-3">
      {/* Paso 1: instrucciones */}
      <div className="bg-brand-50 border border-brand-200 rounded-item p-3 text-xs text-brand-800 space-y-1">
        <p className="font-semibold text-brand-700">Cómo importar empleados:</p>
        <ol className="list-decimal list-inside space-y-0.5 text-brand-600">
          <li>Descargá la plantilla Excel con el botón de abajo</li>
          <li>Completá los datos de tus empleados (reemplazá los ejemplos)</li>
          <li>Guardá el archivo y súbelo aquí</li>
        </ol>
      </div>

      {/* Botón descargar plantilla */}
      <button
        onClick={() => downloadTemplate(costCenters)}
        className="w-full flex items-center justify-center gap-2 text-sm font-semibold text-brand-700 border-2 border-brand-300 bg-brand-50 hover:bg-brand-100 px-4 py-2.5 rounded-item transition-colors"
      >
        <Download size={15} />
        Descargar plantilla Excel
      </button>

      {/* Drop zone */}
      <div
        onClick={() => !isParsing && inputRef.current?.click()}
        onDragOver={e => e.preventDefault()}
        onDrop={e => {
          e.preventDefault()
          if (isParsing) return
          const f = e.dataTransfer.files[0]
          if (f) handleFile(f)
        }}
        className={`border-2 border-dashed rounded-card p-8 text-center transition-colors ${
          isParsing
            ? 'border-brand-400 bg-brand-50/50 cursor-wait'
            : 'border-slate-200 cursor-pointer hover:border-brand-500 hover:bg-brand-50/30'
        }`}
      >
        {isParsing ? (
          <div className="flex flex-col items-center gap-2">
            <Loader2 size={28} className="text-brand-600 animate-spin" />
            <p className="text-sm font-medium text-brand-700">Leyendo archivo…</p>
          </div>
        ) : (
          <>
            <p className="text-2xl mb-2">📊</p>
            <p className="text-sm font-medium text-slate-700">Subí tu nómina en Excel</p>
            <p className="text-xs text-slate-400 mt-1">Arrastrá un .xlsx o hacé clic para seleccionar</p>
          </>
        )}
        <input
          ref={inputRef}
          type="file"
          accept=".xlsx,.xls"
          className="hidden"
          onChange={e => {
            const f = e.target.files?.[0]
            if (f) handleFile(f)
            // Reset para permitir subir el mismo archivo de nuevo
            e.target.value = ''
          }}
        />
      </div>

      {/* Error de parseo — muy visible */}
      {parseError && (
        <div className="flex items-start gap-3 p-3 bg-red-50 border border-red-300 rounded-item">
          <XCircle size={18} className="text-red-600 shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-semibold text-red-700 mb-1">Error al leer el archivo</p>
            <p className="text-xs text-red-600 whitespace-pre-wrap">{parseError}</p>
          </div>
        </div>
      )}

      {/* Descripción de columnas */}
      <div className="bg-slate-50 rounded-item p-3 text-xs text-slate-500 space-y-1.5">
        <p className="font-medium text-slate-600">Columnas del Excel (encabezados exactos):</p>
        <div className="flex flex-wrap gap-1.5">
          {['Nombre', 'Email', 'RUT', 'Centro de Costo', 'Cargo', 'Rol'].map(col => (
            <span key={col} className="font-mono bg-white border border-slate-200 px-1.5 py-0.5 rounded text-slate-600">{col}</span>
          ))}
        </div>
        <p className="text-slate-400">
          Solo <strong className="text-slate-600">Nombre</strong> y <strong className="text-slate-600">Email</strong> son obligatorios.
          Roles: <em>empleado</em> (defecto), <em>aprobador</em>, <em>administrador</em>.
        </p>
      </div>
    </div>
  )
}
