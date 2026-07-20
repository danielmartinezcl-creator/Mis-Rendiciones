'use client'

import { useRef, useState, useEffect } from 'react'
import { importEmployees } from '@/actions/employees'
import { getCostCenters } from '@/actions/admin'
import type { ImportEmployeeRow, ImportResult } from '@/actions/employees'
import type { CostCenter } from '@/lib/supabase/types'
import { Download } from 'lucide-react'

type PreviewRow = ImportEmployeeRow & { _key: number }

const ROLE_OPTIONS = [
  { value: 'employee',  label: 'Empleado' },
  { value: 'approver',  label: 'Aprobador' },
  { value: 'admin',     label: 'Administrador' },
]

function mapHeader(h: string): keyof ImportEmployeeRow | null {
  const s = h.toLowerCase().trim()
  if (['nombre', 'nombre y apellido', 'name', 'full_name', 'nombre completo'].includes(s)) return 'full_name'
  if (['email', 'correo', 'e-mail', 'correo electrónico'].includes(s)) return 'email'
  if (['rol', 'role', 'perfil'].includes(s)) return 'role'
  if (['rut', 'rut empleado', 'r.u.t.'].includes(s)) return 'rut'
  if (['cargo', 'puesto', 'título', 'position', 'job title', 'departamento', 'department', 'área', 'area'].includes(s)) return 'department'
  if (['centro de costo', 'centro costo', 'cost center', 'cc', 'centro'].includes(s)) return 'cost_center_id'
  return null
}

function normalizeRole(val: string): 'admin' | 'approver' | 'employee' {
  const v = val.toLowerCase().trim()
  if (['admin', 'administrador', 'administradora'].includes(v)) return 'admin'
  if (['approver', 'aprobador', 'aprobadora'].includes(v)) return 'approver'
  return 'employee'  // default
}

function resolveCostCenter(raw: string, costCenters: CostCenter[]): string {
  const s = raw.trim()
  if (!s) return ''
  // Exacto por ID (case insensitive)
  const byId = costCenters.find(cc => cc.id.toLowerCase() === s.toLowerCase())
  if (byId) return byId.id
  // Exacto por descripción
  const byDesc = costCenters.find(cc => cc.descripcion.toLowerCase() === s.toLowerCase())
  if (byDesc) return byDesc.id
  // Parcial por descripción
  const partial = costCenters.find(cc => cc.descripcion.toLowerCase().includes(s.toLowerCase()))
  if (partial) return partial.id
  return s  // devolver el valor crudo; se marcará como no reconocido en preview
}

async function downloadTemplate(costCenters: CostCenter[]) {
  const XLSX = await import('xlsx')
  const wb = XLSX.utils.book_new()

  // Hoja 1: Nómina
  const nominaData = [
    ['Nombre', 'Email', 'RUT', 'Centro de Costo', 'Cargo', 'Rol'],
    ['María González López', 'mgonzalez@empresa.cl', '12.345.678-9', 'EMPGESFINADM', 'Contadora', 'empleado'],
    ['Juan Pérez Díaz', 'jperez@empresa.cl', '9.876.543-2', 'EMPGESGEGGEG', 'Gerente General', 'aprobador'],
  ]
  const wsNomina = XLSX.utils.aoa_to_sheet(nominaData)

  // Anchos de columna
  wsNomina['!cols'] = [
    { wch: 28 }, { wch: 30 }, { wch: 14 }, { wch: 20 }, { wch: 22 }, { wch: 14 },
  ]

  // Hoja 2: Centros de costo disponibles
  const ccData = [
    ['ID (usar en "Centro de Costo")', 'Descripción', 'Imputable'],
    ...costCenters
      .filter(cc => cc.activo)
      .sort((a, b) => a.id.localeCompare(b.id))
      .map(cc => [cc.id, cc.descripcion, cc.imputable ? 'Sí' : 'No']),
  ]
  const wsCenters = XLSX.utils.aoa_to_sheet(ccData)
  wsCenters['!cols'] = [{ wch: 26 }, { wch: 36 }, { wch: 10 }]

  XLSX.utils.book_append_sheet(wb, wsNomina, 'Nómina')
  XLSX.utils.book_append_sheet(wb, wsCenters, 'Centros de Costo')

  XLSX.writeFile(wb, 'plantilla-nomina.xlsx')
}

export function EmployeeImport({ onDone }: { onDone: () => void }) {
  const inputRef                      = useRef<HTMLInputElement>(null)
  const [preview,  setPreview]        = useState<PreviewRow[] | null>(null)
  const [importing, setImporting]     = useState(false)
  const [results,  setResults]        = useState<ImportResult[] | null>(null)
  const [parseError, setParseError]   = useState<string | null>(null)
  const [costCenters, setCostCenters] = useState<CostCenter[]>([])

  useEffect(() => {
    getCostCenters().then(cc => setCostCenters(cc))
  }, [])

  async function handleFile(file: File) {
    setParseError(null)
    setPreview(null)
    setResults(null)

    try {
      const XLSX = await import('xlsx')
      const buffer = await file.arrayBuffer()
      const wb = XLSX.read(buffer, { type: 'array' })
      const ws = wb.Sheets[wb.SheetNames[0]]
      const json = XLSX.utils.sheet_to_json<Record<string, string>>(ws, { defval: '' })

      if (json.length === 0) {
        setParseError('El archivo está vacío o no tiene filas de datos.')
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
    } catch (err) {
      console.error('[EmployeeImport] Error al parsear archivo:', err)
      setParseError('No se pudo leer el archivo. Asegúrate de que sea un .xlsx válido.')
    }
  }

  function updateRow(key: number, field: keyof ImportEmployeeRow, value: string) {
    setPreview(prev =>
      prev?.map(r => r._key === key ? { ...r, [field]: value } : r) ?? null
    )
  }

  function removeRow(key: number) {
    setPreview(prev => prev?.filter(r => r._key !== key) ?? null)
  }

  async function handleImport() {
    if (!preview?.length) return
    const invalid = preview.filter(r => !r.email.includes('@') || !r.full_name.trim())
    if (invalid.length > 0) {
      setParseError(`${invalid.length} fila(s) con nombre o email inválido.`)
      return
    }

    setImporting(true)
    setParseError(null)
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
      setPreview(null)
      setResults(res)
      // No llamar onDone() aquí — deja que el usuario vea los resultados primero
    } catch (err) {
      setParseError(err instanceof Error ? err.message : 'Error al importar')
    } finally {
      setImporting(false)
    }
  }

  const inputCls = 'w-full border border-slate-200 rounded px-1.5 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-brand-600'

  // ── Resultados ──────────────────────────────────────────────────────────────
  if (results) {
    const ok  = results.filter(r => r.success)
    const err = results.filter(r => !r.success)
    return (
      <div className="space-y-4">
        <div className="bg-emerald-50 border border-emerald-200 rounded-card p-4">
          <p className="font-semibold text-emerald-700">
            {ok.length} empleado{ok.length !== 1 ? 's' : ''} importado{ok.length !== 1 ? 's' : ''} correctamente
          </p>
          <p className="text-xs text-emerald-600 mt-1">Recibirán un email para activar su cuenta.</p>
        </div>
        {err.length > 0 && (
          <div className="bg-red-50 border border-red-200 rounded-card p-4 space-y-1">
            <p className="font-semibold text-red-700 text-sm">Errores ({err.length})</p>
            {err.map((r, i) => (
              <p key={i} className="text-xs text-red-600">{r.email}: {r.error}</p>
            ))}
          </div>
        )}
        <div className="flex gap-3">
          <button
            onClick={() => { setResults(null); setPreview(null) }}
            className="text-sm text-brand-600 hover:underline"
          >
            Importar más empleados
          </button>
          <button
            onClick={onDone}
            className="text-sm font-semibold text-white bg-brand-600 hover:bg-brand-700 px-4 py-1.5 rounded-item transition-colors"
          >
            Cerrar
          </button>
        </div>
      </div>
    )
  }

  // ── Preview ─────────────────────────────────────────────────────────────────
  if (preview) {
    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <p className="text-sm font-medium text-slate-700">
            {preview.length} fila{preview.length !== 1 ? 's' : ''} detectada{preview.length !== 1 ? 's' : ''}
          </p>
          <button onClick={() => setPreview(null)} className="text-xs text-slate-400 hover:text-slate-600">
            Cancelar
          </button>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-xs border-collapse min-w-[700px]">
            <thead>
              <tr className="text-left text-slate-500 border-b border-slate-100">
                <th className="pb-2 pr-2 font-medium">Nombre</th>
                <th className="pb-2 pr-2 font-medium">Email</th>
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
                      <input value={row.full_name}
                        onChange={e => updateRow(row._key, 'full_name', e.target.value)}
                        className={inputCls + (!row.full_name.trim() ? ' border-red-300 ring-1 ring-red-300' : '')}
                      />
                    </td>
                    <td className="py-1.5 pr-2 min-w-[160px]">
                      <input value={row.email}
                        onChange={e => updateRow(row._key, 'email', e.target.value)}
                        className={inputCls + (!row.email.includes('@') ? ' border-red-300 ring-1 ring-red-300' : '')}
                      />
                    </td>
                    <td className="py-1.5 pr-2 min-w-[100px]">
                      <input value={row.rut ?? ''}
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
                      <input value={row.department ?? ''}
                        onChange={e => updateRow(row._key, 'department', e.target.value)}
                        placeholder="Ej: Contador"
                        className={inputCls}
                      />
                    </td>
                    <td className="py-1.5 pr-2">
                      <select value={row.role}
                        onChange={e => updateRow(row._key, 'role', e.target.value)}
                        className="border border-slate-200 rounded px-1.5 py-1 bg-white text-xs focus:outline-none focus:ring-1 focus:ring-brand-600"
                      >
                        {ROLE_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                      </select>
                    </td>
                    <td className="py-1.5">
                      <button onClick={() => removeRow(row._key)}
                        className="text-red-400 hover:text-red-600 px-1 text-xs" title="Eliminar fila">
                        ✕
                      </button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>

        {parseError && (
          <p className="text-xs text-red-600 bg-red-50 rounded p-2">{parseError}</p>
        )}

        <button
          onClick={handleImport}
          disabled={importing || preview.length === 0}
          className="w-full py-2.5 bg-brand-600 hover:bg-brand-700 disabled:opacity-50 text-white text-sm font-semibold rounded-card transition-colors"
        >
          {importing ? 'Importando...' : `Confirmar e importar ${preview.length} empleado${preview.length !== 1 ? 's' : ''}`}
        </button>
      </div>
    )
  }

  // ── Upload inicial ──────────────────────────────────────────────────────────
  return (
    <div className="space-y-3">
      {/* Botón descargar plantilla */}
      <div className="flex justify-end">
        <button
          onClick={() => downloadTemplate(costCenters)}
          className="flex items-center gap-1.5 text-xs text-brand-700 border border-brand-200 bg-brand-50 hover:bg-brand-100 px-3 py-1.5 rounded-item transition-colors font-medium"
        >
          <Download size={13} />
          Descargar plantilla Excel
        </button>
      </div>

      {/* Drop zone */}
      <div
        onClick={() => inputRef.current?.click()}
        onDragOver={e => e.preventDefault()}
        onDrop={e => { e.preventDefault(); const f = e.dataTransfer.files[0]; if (f) handleFile(f) }}
        className="border-2 border-dashed border-slate-200 rounded-card p-8 text-center cursor-pointer hover:border-brand-500 hover:bg-brand-50/30 transition-colors"
      >
        <p className="text-2xl mb-2">📊</p>
        <p className="text-sm font-medium text-slate-700">Sube tu nómina en Excel</p>
        <p className="text-xs text-slate-400 mt-1">Arrastra un .xlsx o haz clic para seleccionar</p>
        <input
          ref={inputRef}
          type="file"
          accept=".xlsx,.xls"
          className="hidden"
          onChange={e => { const f = e.target.files?.[0]; if (f) handleFile(f) }}
        />
      </div>

      {/* Descripción de columnas */}
      <div className="bg-slate-50 rounded-item p-3 text-xs text-slate-500 space-y-1.5">
        <p className="font-medium text-slate-600">Columnas del Excel:</p>
        <div className="flex flex-wrap gap-1.5">
          {['Nombre', 'Email', 'RUT', 'Centro de Costo', 'Cargo', 'Rol'].map(col => (
            <span key={col} className="font-mono bg-white border border-slate-200 px-1.5 py-0.5 rounded text-slate-600">{col}</span>
          ))}
        </div>
        <p className="text-slate-400">
          Roles válidos: <em>empleado</em> (defecto), <em>aprobador</em>, <em>administrador</em>.
          Solo <strong>Nombre</strong> y <strong>Email</strong> son obligatorios.
        </p>
        <p className="text-slate-400">
          Para <strong>Centro de Costo</strong> usa el ID de la hoja de referencia incluida en la plantilla.
        </p>
      </div>

      {parseError && (
        <p className="text-xs text-red-600 bg-red-50 rounded-item p-2">{parseError}</p>
      )}
    </div>
  )
}
