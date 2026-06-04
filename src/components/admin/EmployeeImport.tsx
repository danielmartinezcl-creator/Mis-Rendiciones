'use client'

import { useRef, useState } from 'react'
import { importEmployees } from '@/actions/employees'
import type { ImportEmployeeRow, ImportResult } from '@/actions/employees'

type PreviewRow = ImportEmployeeRow & { _key: number }

const ROLE_OPTIONS = [
  { value: 'employee',  label: 'Empleado' },
  { value: 'approver',  label: 'Aprobador' },
  { value: 'admin',     label: 'Administrador' },
]

// Mapea nombres de columna del Excel a los campos esperados
function mapHeader(h: string): keyof ImportEmployeeRow | null {
  const s = h.toLowerCase().trim()
  if (['nombre', 'name', 'full_name', 'nombre completo'].includes(s)) return 'full_name'
  if (['email', 'correo', 'e-mail', 'correo electrónico'].includes(s)) return 'email'
  if (['rol', 'role', 'perfil', 'cargo'].includes(s)) return 'role'
  if (['departamento', 'department', 'área', 'area'].includes(s)) return 'department'
  return null
}

function normalizeRole(val: string): 'admin' | 'approver' | 'employee' {
  const v = val.toLowerCase().trim()
  if (['admin', 'administrador', 'administradora'].includes(v)) return 'admin'
  if (['approver', 'aprobador', 'aprobadora'].includes(v)) return 'approver'
  return 'employee'
}

export function EmployeeImport({ onDone }: { onDone: () => void }) {
  const inputRef                      = useRef<HTMLInputElement>(null)
  const [preview,  setPreview]        = useState<PreviewRow[] | null>(null)
  const [importing, setImporting]     = useState(false)
  const [results,  setResults]        = useState<ImportResult[] | null>(null)
  const [parseError, setParseError]   = useState<string | null>(null)

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
          if (field === 'role') mapped.role = normalizeRole(String(val))
          else if (field) (mapped as Record<string, string>)[field] = String(val).trim()
        }
        return {
          _key: i,
          full_name: mapped.full_name ?? '',
          email:     mapped.email     ?? '',
          role:      mapped.role      ?? 'employee',
          department: mapped.department ?? '',
        }
      })

      setPreview(rows)
    } catch {
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
    const invalid = preview.filter(r => !r.email.includes('@') || !r.full_name)
    if (invalid.length > 0) {
      setParseError(`${invalid.length} fila(s) con nombre o email inválido.`)
      return
    }

    setImporting(true)
    setParseError(null)
    try {
      const rows: ImportEmployeeRow[] = preview.map(({ full_name, email, role, department }) => ({
        full_name, email, role, department: department || undefined
      }))
      const res = await importEmployees(rows)
      setResults(res)
      setPreview(null)
      onDone()
    } catch (err) {
      setParseError(err instanceof Error ? err.message : 'Error al importar')
    } finally {
      setImporting(false)
    }
  }

  // ── Pantalla de resultados ──────────────────────────────────────────────────
  if (results) {
    const ok  = results.filter(r => r.success)
    const err = results.filter(r => !r.success)
    return (
      <div className="space-y-4">
        <div className="bg-emerald-50 border border-emerald-200 rounded-card p-4">
          <p className="font-semibold text-emerald-700">{ok.length} empleado{ok.length !== 1 ? 's' : ''} importado{ok.length !== 1 ? 's' : ''} correctamente</p>
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
        <button
          onClick={() => { setResults(null); setPreview(null) }}
          className="text-sm text-brand-600 hover:underline"
        >
          Importar más empleados
        </button>
      </div>
    )
  }

  // ── Preview de filas ────────────────────────────────────────────────────────
  if (preview) {
    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <p className="text-sm font-medium text-slate-700">{preview.length} fila{preview.length !== 1 ? 's' : ''} detectada{preview.length !== 1 ? 's' : ''}</p>
          <button onClick={() => setPreview(null)} className="text-xs text-slate-400 hover:text-slate-600">
            Cancelar
          </button>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-xs border-collapse">
            <thead>
              <tr className="text-left text-slate-500">
                <th className="pb-2 pr-2 font-medium">Nombre</th>
                <th className="pb-2 pr-2 font-medium">Email</th>
                <th className="pb-2 pr-2 font-medium">Rol</th>
                <th className="pb-2 pr-2 font-medium">Depto.</th>
                <th className="pb-2 font-medium"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {preview.map(row => (
                <tr key={row._key}>
                  <td className="py-1.5 pr-2">
                    <input
                      value={row.full_name}
                      onChange={e => updateRow(row._key, 'full_name', e.target.value)}
                      className="w-full border border-slate-200 rounded px-1.5 py-1 focus:outline-none focus:ring-1 focus:ring-brand-600"
                    />
                  </td>
                  <td className="py-1.5 pr-2">
                    <input
                      value={row.email}
                      onChange={e => updateRow(row._key, 'email', e.target.value)}
                      className="w-full border border-slate-200 rounded px-1.5 py-1 focus:outline-none focus:ring-1 focus:ring-brand-600"
                    />
                  </td>
                  <td className="py-1.5 pr-2">
                    <select
                      value={row.role}
                      onChange={e => updateRow(row._key, 'role', e.target.value)}
                      className="border border-slate-200 rounded px-1.5 py-1 bg-white focus:outline-none focus:ring-1 focus:ring-brand-600"
                    >
                      {ROLE_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                    </select>
                  </td>
                  <td className="py-1.5 pr-2">
                    <input
                      value={row.department ?? ''}
                      onChange={e => updateRow(row._key, 'department', e.target.value)}
                      className="w-full border border-slate-200 rounded px-1.5 py-1 focus:outline-none focus:ring-1 focus:ring-brand-600"
                      placeholder="Opcional"
                    />
                  </td>
                  <td className="py-1.5">
                    <button
                      onClick={() => removeRow(row._key)}
                      className="text-red-400 hover:text-red-600 text-xs px-1"
                      title="Eliminar fila"
                    >
                      ✕
                    </button>
                  </td>
                </tr>
              ))}
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

      <div className="bg-slate-50 rounded-item p-3 text-xs text-slate-500 space-y-1">
        <p className="font-medium text-slate-600">Columnas esperadas en el Excel:</p>
        <p><span className="font-mono bg-white border border-slate-200 px-1 rounded">Nombre</span> <span className="font-mono bg-white border border-slate-200 px-1 rounded">Email</span> <span className="font-mono bg-white border border-slate-200 px-1 rounded">Rol</span> <span className="font-mono bg-white border border-slate-200 px-1 rounded">Departamento</span></p>
        <p>Roles válidos: <em>empleado</em>, <em>aprobador</em>, <em>administrador</em></p>
      </div>

      {parseError && (
        <p className="text-xs text-red-600 bg-red-50 rounded-item p-2">{parseError}</p>
      )}
    </div>
  )
}
