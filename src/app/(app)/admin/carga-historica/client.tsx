'use client'

import { useState, useRef } from 'react'
import { Upload, Plus, Trash2, CheckCircle2, AlertTriangle, History, X } from 'lucide-react'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { CurrencyAmount } from '@/components/ui/CurrencyAmount'
import {
  categorizeItems,
  commitHistoricalImport,
  type HistoricalGridRow,
} from '@/actions/historical-import'
import { parseExcelBuffer } from '@/lib/historical-import/parser'
import type { ParsedHistoricalImport } from '@/lib/historical-import/parser'
import type { CategorySuggestion } from '@/lib/historical-import/categorizer'
import type { ExpenseCategory, UserProfile, CostCenter } from '@/lib/supabase/types'

const DEFAULT_COST_CENTER = 'EMPGESINGING'
const DOC_TYPES = [
  { value: 'boleta',          label: 'Boleta' },
  { value: 'factura',         label: 'Factura' },
  { value: 'factura_exenta',  label: 'Factura Exenta' },
  { value: 'ticket',          label: 'Ticket' },
  { value: 'otro',            label: 'Otro' },
] as const

interface Props {
  categories:  ExpenseCategory[]
  employees:   UserProfile[]
  costCenters: CostCenter[]
}

interface GridRow extends HistoricalGridRow {
  _key: string  // key local para React
}

function emptyRow(): GridRow {
  return {
    _key:         crypto.randomUUID(),
    employeeName: '',
    description:  '',
    date:         new Date().toISOString().split('T')[0],
    amountCLP:    0,
    categoryId:   null,
    costCenterId: DEFAULT_COST_CENTER,
    docType:      'boleta',
    docNumber:    null,
    supplierRut:  null,
  }
}

export function HistoricalImportClient({ categories, employees, costCenters }: Props) {
  const [tab, setTab] = useState<'excel' | 'manual'>('excel')
  const [parsed, setParsed] = useState<ParsedHistoricalImport | null>(null)
  const [rows, setRows] = useState<GridRow[]>([emptyRow()])
  const [title, setTitle] = useState('')
  const [responsibleId, setResponsibleId] = useState(employees[0]?.id ?? '')
  const [approvedDate, setApprovedDate] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [isCategorizing, setIsCategorizing] = useState(false)
  const [isCommitting, setIsCommitting] = useState(false)
  const [successId, setSuccessId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  const totalAmount = rows.reduce((s, r) => s + (Number(r.amountCLP) || 0), 0)
  const warnings = rows.filter(r => !r.categoryId).length

  function updateRow(key: string, patch: Partial<GridRow>) {
    setRows(prev => prev.map(r => r._key === key ? { ...r, ...patch } : r))
  }

  function addRow() {
    setRows(prev => [...prev, emptyRow()])
  }

  function removeRow(key: string) {
    setRows(prev => prev.filter(r => r._key !== key))
  }

  async function handleExcelUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setIsLoading(true)
    setError(null)
    try {
      // Parsear el Excel en el browser (SheetJS funciona client-side)
      const buffer = await file.arrayBuffer()
      const result = parseExcelBuffer(buffer)
      setParsed(result)

      // Pre-llenar header
      const prefix = result.importType === 'caja_chica' ? 'Caja Chica' : 'Rendición'
      setTitle(`${prefix} N°${result.fundNumber} — ${result.officeName}`)
      setApprovedDate(result.rendicionDate)

      // Pre-llenar filas
      const newRows: GridRow[] = result.items.map(item => ({
        _key:         crypto.randomUUID(),
        employeeName: item.employeeName,
        description:  item.description,
        date:         item.date,
        amountCLP:    item.amountCLP,
        categoryId:   null,
        costCenterId: DEFAULT_COST_CENTER,
        docType:      'boleta',
        docNumber:    null,
        supplierRut:  null,
      }))
      setRows(newRows)

      // Categorizar con IA
      setIsCategorizing(true)
      const suggestions: CategorySuggestion[] = await categorizeItems(
        result.items.map(i => ({ description: i.description }))
      )
      setRows(prev =>
        prev.map((row, idx) => {
          const sug = suggestions.find(s => s.index === idx)
          if (sug && sug.categoryId && sug.confidence >= 0.7) {
            const catExists = categories.some(c => c.id === sug.categoryId)
            if (catExists) {
              return { ...row, categoryId: sug.categoryId }
            }
          }
          return row
        })
      )
    } catch (err) {
      setError(String(err))
    } finally {
      setIsLoading(false)
      setIsCategorizing(false)
    }
  }

  async function handleCommit() {
    if (!title.trim()) { setError('El título es obligatorio'); return }
    if (!approvedDate) { setError('La fecha de rendición es obligatoria'); return }
    if (!responsibleId) { setError('El responsable es obligatorio'); return }
    if (rows.length === 0) { setError('Agregá al menos un ítem'); return }

    setIsCommitting(true)
    setError(null)
    try {
      const result = await commitHistoricalImport({
        title,
        responsibleUserId: responsibleId,
        approvedDate,
        rows: rows.map(({ _key, ...rest }) => rest),
      })
      setSuccessId(result.reportId)
    } catch (err) {
      setError(String(err))
    } finally {
      setIsCommitting(false)
    }
  }

  // ── Pantalla de éxito ──────────────────────────────────────────────────────
  if (successId) {
    return (
      <div className="max-w-lg mx-auto py-16 text-center space-y-4">
        <CheckCircle2 size={48} className="mx-auto text-brand-500" />
        <h2 className="font-display font-extrabold text-2xl text-ink-900">
          Importación completada
        </h2>
        <p className="text-ink-500">
          La rendición histórica fue creada en estado <strong>Aprobada</strong> y ya
          aparece en el panel de admin y en el exportador a Defontana.
        </p>
        <div className="flex gap-3 justify-center pt-2">
          <Button
            variant="ghost"
            onClick={() => {
              setSuccessId(null)
              setRows([emptyRow()])
              setParsed(null)
              setTitle('')
              setApprovedDate('')
            }}
          >
            Importar otra
          </Button>
          <a href="/admin/reports">
            <Button>Ver en reportes</Button>
          </a>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6 max-w-5xl mx-auto">
      {/* Header */}
      <div>
        <div className="flex items-center gap-2 mb-1">
          <History size={20} className="text-brand-600" />
          <h1 className="font-display font-extrabold text-2xl tracking-tight text-ink-900">
            Carga Histórica
          </h1>
        </div>
        <p className="text-sm text-ink-500">
          Importá rendiciones y cajas chicas de períodos anteriores para exportarlas a Defontana.
        </p>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-ink-100 p-1 rounded-item w-fit">
        {([['excel', 'Subir Excel'], ['manual', 'Ingreso Manual']] as const).map(([key, label]) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={`px-4 py-1.5 rounded-[10px] text-sm font-medium transition-colors ${
              tab === key
                ? 'bg-white text-ink-900 shadow-sm'
                : 'text-ink-500 hover:text-ink-700'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Upload zone (solo en tab excel) */}
      {tab === 'excel' && (
        <Card>
          <div
            className="border-2 border-dashed border-ink-200 rounded-item p-10 text-center cursor-pointer hover:border-brand-400 hover:bg-brand-50/30 transition-colors"
            onClick={() => fileRef.current?.click()}
          >
            <Upload size={32} className="mx-auto mb-3 text-ink-300" />
            <p className="font-medium text-ink-700">
              {isLoading ? 'Procesando…' : 'Hacé clic o arrastrá el archivo Excel aquí'}
            </p>
            <p className="text-xs text-ink-400 mt-1">Formato .xlsx — Caja Chica o Rendición</p>
            <input
              ref={fileRef}
              type="file"
              accept=".xlsx,.xls"
              className="hidden"
              onChange={handleExcelUpload}
            />
          </div>
          {isCategorizing && (
            <p className="text-xs text-brand-600 mt-3 text-center animate-pulse">
              ✦ Claude está sugiriendo categorías…
            </p>
          )}
          {parsed && (
            <div className="mt-3 text-xs text-ink-500 flex gap-4">
              <span>✓ Detectado: <strong>{parsed.importType === 'caja_chica' ? 'Caja Chica' : 'Rendición'} N°{parsed.fundNumber}</strong></span>
              <span>· {parsed.items.length} ítems</span>
              <span>· <CurrencyAmount amount={parsed.totalAmount} currency="CLP" size="sm" /></span>
            </div>
          )}
        </Card>
      )}

      {/* Sección de header del reporte */}
      <Card>
        <h2 className="font-semibold text-ink-800 mb-4">Datos del documento</h2>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="sm:col-span-3">
            <label className="block text-xs font-medium text-ink-600 mb-1">Título</label>
            <input
              type="text"
              value={title}
              onChange={e => setTitle(e.target.value)}
              placeholder="ej: Caja Chica N°173 — OFICINA DE INGENIERÍA"
              className="w-full border border-ink-200 rounded-item px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-ink-600 mb-1">Responsable</label>
            <select
              value={responsibleId}
              onChange={e => setResponsibleId(e.target.value)}
              className="w-full border border-ink-200 rounded-item px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
            >
              {employees.map(emp => (
                <option key={emp.id} value={emp.id}>{emp.full_name}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-ink-600 mb-1">Fecha de rendición</label>
            <input
              type="date"
              value={approvedDate}
              onChange={e => setApprovedDate(e.target.value)}
              className="w-full border border-ink-200 rounded-item px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
            />
          </div>
          <div className="flex items-end">
            <div className="text-xs text-ink-500">
              Total:{' '}
              <span className="font-mono-amount font-bold text-ink-900">
                ${totalAmount.toLocaleString('es-CL')}
              </span>
            </div>
          </div>
        </div>
      </Card>

      {/* Grilla de ítems */}
      <Card>
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-semibold text-ink-800">
            Ítems <span className="text-ink-400 font-normal text-sm">({rows.length})</span>
          </h2>
          {warnings > 0 && (
            <span className="flex items-center gap-1 text-xs text-amber-600 bg-amber-50 px-2 py-1 rounded-full">
              <AlertTriangle size={12} />
              {warnings} sin categoría
            </span>
          )}
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-ink-100">
                {['Empleado', 'Descripción', 'Fecha', 'Monto CLP', 'Categoría', 'Centro', 'Doc', ''].map(h => (
                  <th key={h} className="text-left text-xs font-medium text-ink-500 pb-2 pr-2 whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-ink-50">
              {rows.map(row => (
                <GridRowEditor
                  key={row._key}
                  row={row}
                  categories={categories}
                  costCenters={costCenters}
                  onChange={patch => updateRow(row._key, patch)}
                  onRemove={() => removeRow(row._key)}
                />
              ))}
            </tbody>
          </table>
        </div>

        <button
          onClick={addRow}
          className="mt-3 flex items-center gap-1 text-sm text-brand-600 hover:text-brand-700 font-medium"
        >
          <Plus size={14} /> Agregar ítem
        </button>
      </Card>

      {/* Error */}
      {error && (
        <div className="flex items-start gap-2 bg-red-50 border border-red-200 rounded-item p-3 text-sm text-red-700">
          <X size={16} className="shrink-0 mt-0.5" />
          {error}
        </div>
      )}

      {/* Confirmar */}
      <div className="flex justify-end">
        <Button
          onClick={handleCommit}
          disabled={isCommitting || rows.length === 0}
          className="min-w-[180px]"
        >
          {isCommitting ? 'Importando…' : `Confirmar importación (${rows.length} ítems)`}
        </Button>
      </div>
    </div>
  )
}

// ── Sub-componente por fila ────────────────────────────────────────────────────

interface GridRowEditorProps {
  row:         GridRow
  categories:  ExpenseCategory[]
  costCenters: CostCenter[]
  onChange:    (patch: Partial<GridRow>) => void
  onRemove:    () => void
}

function GridRowEditor({ row, categories, costCenters, onChange, onRemove }: GridRowEditorProps) {
  const isFactura = row.docType === 'factura' || row.docType === 'factura_exenta'

  return (
    <tr className="group hover:bg-ink-50/50">
      <td className="py-1.5 pr-2">
        <input
          type="text"
          value={row.employeeName}
          onChange={e => onChange({ employeeName: e.target.value })}
          placeholder="Nombre"
          className="w-28 border border-ink-200 rounded-[8px] px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-brand-400"
        />
      </td>
      <td className="py-1.5 pr-2">
        <input
          type="text"
          value={row.description}
          onChange={e => onChange({ description: e.target.value })}
          placeholder="Descripción"
          className="w-44 border border-ink-200 rounded-[8px] px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-brand-400"
        />
      </td>
      <td className="py-1.5 pr-2">
        <input
          type="date"
          value={row.date}
          onChange={e => onChange({ date: e.target.value })}
          className="border border-ink-200 rounded-[8px] px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-brand-400"
        />
      </td>
      <td className="py-1.5 pr-2">
        <input
          type="number"
          value={row.amountCLP || ''}
          onChange={e => onChange({ amountCLP: Number(e.target.value) || 0 })}
          placeholder="0"
          className="w-24 border border-ink-200 rounded-[8px] px-2 py-1 text-xs font-mono-amount text-right focus:outline-none focus:ring-1 focus:ring-brand-400"
        />
      </td>
      <td className="py-1.5 pr-2">
        <select
          value={row.categoryId ?? ''}
          onChange={e => onChange({ categoryId: e.target.value || null })}
          className={`w-36 border rounded-[8px] px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-brand-400 ${
            !row.categoryId ? 'border-amber-300 bg-amber-50' : 'border-ink-200'
          }`}
        >
          <option value="">— Sin asignar —</option>
          {categories.map(c => (
            <option key={c.id} value={c.id}>{c.name}</option>
          ))}
        </select>
      </td>
      <td className="py-1.5 pr-2">
        <select
          value={row.costCenterId}
          onChange={e => onChange({ costCenterId: e.target.value })}
          className="w-36 border border-ink-200 rounded-[8px] px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-brand-400"
        >
          {costCenters.filter(c => c.imputable).map(c => (
            <option key={c.id} value={c.id}>{c.id} — {c.descripcion}</option>
          ))}
        </select>
      </td>
      <td className="py-1.5 pr-2">
        <div className="flex flex-col gap-1">
          <select
            value={row.docType}
            onChange={e => onChange({ docType: e.target.value as GridRow['docType'] })}
            className="w-28 border border-ink-200 rounded-[8px] px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-brand-400"
          >
            {DOC_TYPES.map(d => (
              <option key={d.value} value={d.value}>{d.label}</option>
            ))}
          </select>
          {isFactura && (
            <>
              <input
                type="text"
                value={row.docNumber ?? ''}
                onChange={e => onChange({ docNumber: e.target.value || null })}
                placeholder="Nro. doc"
                className="w-28 border border-ink-200 rounded-[8px] px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-brand-400"
              />
              <input
                type="text"
                value={row.supplierRut ?? ''}
                onChange={e => onChange({ supplierRut: e.target.value || null })}
                placeholder="RUT proveedor"
                className={`w-28 border rounded-[8px] px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-brand-400 ${
                  !row.supplierRut ? 'border-red-300' : 'border-ink-200'
                }`}
              />
            </>
          )}
        </div>
      </td>
      <td className="py-1.5">
        <button
          onClick={onRemove}
          className="opacity-0 group-hover:opacity-100 p-1 text-ink-300 hover:text-red-500 transition-opacity"
        >
          <Trash2 size={14} />
        </button>
      </td>
    </tr>
  )
}
