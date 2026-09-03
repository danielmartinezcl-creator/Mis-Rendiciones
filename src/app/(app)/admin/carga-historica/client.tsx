'use client'

import React, { useState, useRef } from 'react'
import { Upload, Plus, Trash2, CheckCircle2, AlertTriangle, History, X, ArrowDownToLine, ArrowUpFromLine, Receipt, ClipboardList, FileSpreadsheet } from 'lucide-react'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { CurrencyAmount } from '@/components/ui/CurrencyAmount'
import { DefontanaTypePanel } from '@/components/admin/DefontanaTypePanel'
import { getHistoricalRendicionImports } from '@/actions/admin'
import {
  categorizeItems,
  commitHistoricalImport,
  type HistoricalGridRow,
} from '@/actions/historical-import'
import { parseExcelBuffer } from '@/lib/historical-import/parser'
import type { ParsedHistoricalImport } from '@/lib/historical-import/parser'
import type { CategorySuggestion } from '@/lib/historical-import/categorizer'
import type { ExpenseCategory, UserProfile, CostCenter } from '@/lib/supabase/types'

type HistoricalImport = {
  id: string
  title: string
  status: string
  total_amount: number
  approved_amount: number
  reimbursed_amount: number | null
  reimbursed_at: string | null
  fund_number: string | null
  created_at: string
  defontana_exported_at: string | null
  submitter_name: string
}

const DEFAULT_COST_CENTER = 'EMPGESINGING'
const DOC_TYPES = [
  { value: 'boleta',         label: 'Boleta' },
  { value: 'factura',        label: 'Factura' },
  { value: 'factura_exenta', label: 'Factura Exenta' },
  { value: 'ticket',         label: 'Ticket' },
  { value: 'otro',           label: 'Otro' },
] as const

const ITEM_TYPES = [
  { value: 'expense', label: 'Gasto',      icon: Receipt,          chipCls: 'bg-ink-100 text-ink-600' },
  { value: 'advance', label: 'Adelanto',   icon: ArrowDownToLine,  chipCls: 'bg-info-100 text-info-700' },
  { value: 'return',  label: 'Devolución', icon: ArrowUpFromLine,  chipCls: 'bg-success-100 text-success-700' },
] as const

type ItemType = 'expense' | 'advance' | 'return'

interface Props {
  categories:        ExpenseCategory[]
  employees:         UserProfile[]
  costCenters:       CostCenter[]
  historicalImports: HistoricalImport[]
}

interface GridRow extends HistoricalGridRow {
  _key: string
}

function emptyRow(emp?: { id: string; full_name: string; cost_center_id?: string | null } | null): GridRow {
  return {
    _key:         crypto.randomUUID(),
    itemType:     'expense',
    employeeId:   emp?.id ?? null,
    employeeName: emp?.full_name ?? '',
    description:  '',
    date:         new Date().toISOString().split('T')[0],
    amountCLP:    0,
    categoryId:   null,
    costCenterId: emp?.cost_center_id ?? DEFAULT_COST_CENTER,
    docType:      'boleta',
    docNumber:    null,
    supplierRut:  null,
  }
}

function fmtCLP(n: number) {
  return '$ ' + Math.round(Math.abs(n)).toLocaleString('es-CL')
}

function formatCLP(n: number) {
  return new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP', maximumFractionDigits: 0 }).format(n)
}

function formatDate(s: string) {
  return new Date(s).toLocaleDateString('es-CL', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

function CuadreBadge({ approvedAmount, reimbursedAmount }: { approvedAmount: number; reimbursedAmount: number | null }) {
  if (reimbursedAmount == null) return (
    <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-ink-100 text-ink-500 border border-ink-200" title="No se registró el monto pagado">
      — Sin registro
    </span>
  )
  const diff = reimbursedAmount - approvedAmount
  const absDiff = Math.abs(diff)
  if (absDiff < 1) {
    return (
      <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-success-50 text-success-700 border border-success-200">
        ✓ Cuadrado
      </span>
    )
  }
  if (diff > 0) {
    return (
      <span
        className="text-xs font-medium px-2 py-0.5 rounded-full bg-warning-50 text-warning-700 border border-warning-200"
        title={`Aprobado neto: ${formatCLP(approvedAmount)} · Reembolsado: ${formatCLP(reimbursedAmount)}`}
      >
        ↑ Exceso de reembolso {formatCLP(absDiff)}
      </span>
    )
  }
  return (
    <span
      className="text-xs font-medium px-2 py-0.5 rounded-full bg-danger-50 text-danger-700 border border-danger-200"
      title={`Aprobado neto: ${formatCLP(approvedAmount)} · Reembolsado: ${formatCLP(reimbursedAmount)}`}
    >
      ↓ Pendiente por reembolsar {formatCLP(absDiff)}
    </span>
  )
}

export function HistoricalImportClient({ categories, employees, costCenters, historicalImports }: Props) {
  const [tab, setTab] = useState<'excel' | 'manual' | 'historial'>('excel')
  const [parsed, setParsed] = useState<ParsedHistoricalImport | null>(null)
  const [rows, setRows] = useState<GridRow[]>([emptyRow(employees[0])])
  const [docType, setDocType] = useState<'rendicion' | 'caja_chica'>('rendicion')
  const [fundNumber, setFundNumber] = useState('')
  const [title, setTitle] = useState('')
  const [responsibleId, setResponsibleId] = useState(employees[0]?.id ?? '')
  const [approvedDate, setApprovedDate] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [isCategorizing, setIsCategorizing] = useState(false)
  const [isCommitting, setIsCommitting] = useState(false)
  const [successId, setSuccessId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  // Historial + panel Defontana por tipo
  const [imports,    setImports]    = useState<HistoricalImport[]>(historicalImports)
  const [defPanelId, setDefPanelId] = useState<string | null>(null)

  /** Relee el historial tras confirmar o revertir en el panel Defontana. */
  async function refreshImport() {
    try {
      setImports(await getHistoricalRendicionImports())
    } catch {
      // Si falla la relectura el panel ya muestra su propio estado actualizado
    }
  }

  // ── KPIs de balance ──────────────────────────────────────────────────────────
  const advanceTotal  = rows.filter(r => r.itemType === 'advance').reduce((s, r) => s + (Number(r.amountCLP) || 0), 0)
  const expenseTotal  = rows.filter(r => r.itemType === 'expense').reduce((s, r) => s + (Number(r.amountCLP) || 0), 0)
  const returnTotal   = rows.filter(r => r.itemType === 'return').reduce((s, r)  => s + (Number(r.amountCLP) || 0), 0)
  const balanceDiff   = advanceTotal - expenseTotal - returnTotal
  const warnings      = rows.filter(r => r.itemType === 'expense' && !r.categoryId).length

  function updateRow(key: string, patch: Partial<GridRow>) {
    setRows(prev => prev.map(r => r._key === key ? { ...r, ...patch } : r))
  }

  function addRow(type: ItemType = 'expense') {
    const emp = employees.find(e => e.id === responsibleId)
    const base = { ...emptyRow(emp), itemType: type }
    if (type === 'advance') {
      base.date        = approvedDate || base.date
      base.description = 'Adelanto Caja Chica'
    }
    setRows(prev => [...prev, base])
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
      const buffer = await file.arrayBuffer()
      const result = parseExcelBuffer(buffer)
      setParsed(result)

      setDocType(result.importType)
      setFundNumber(result.fundNumber)

      const prefix = result.importType === 'caja_chica' ? 'Caja Chica' : 'Rendición'
      setTitle(`${prefix} N°${result.fundNumber} — ${result.officeName}`)
      setApprovedDate(result.rendicionDate)

      // Match por nombre con algoritmo de token-intersection.
      // Los Excel exportan nombres en mayúsculas sin acentos y con orden distinto
      // ("RODRIGO BASCUÑAN") mientras el sistema tiene "Bascuñán Moreno Rodrigo".
      // La intersección de tokens (ignorando caso y acentos) resuelve ambos casos.
      function normalize(s: string) {
        return s.toLowerCase().trim().normalize('NFD').replace(/[̀-ͯ]/g, '')
      }
      function tokenize(s: string): string[] {
        return normalize(s).split(/\s+/).filter(t => t.length > 1)
      }
      function findEmployee(name: string) {
        if (!name) return null
        // Intentar match exacto primero (más rápido)
        const n = normalize(name)
        const exact = employees.find(e => normalize(e.full_name) === n)
        if (exact) return exact
        // Token-intersection: todos los tokens del Excel deben aparecer en el nombre del sistema
        const excelTokens = tokenize(name)
        if (!excelTokens.length) return null
        return employees.find(e => {
          const sysTokens = new Set(tokenize(e.full_name))
          return excelTokens.every(t => sysTokens.has(t))
        }) ?? null
      }

      const responsible = employees.find(e => e.id === responsibleId) ?? null
      const newRows: GridRow[] = result.items.map(item => {
        const matched = findEmployee(item.employeeName)
        const eff = matched ?? responsible
        return {
          _key:         crypto.randomUUID(),
          itemType:     'expense' as const,
          employeeId:   eff?.id ?? null,
          employeeName: eff?.full_name ?? item.employeeName,
          description:  item.description,
          date:         item.date,
          amountCLP:    item.amountCLP,
          categoryId:   null,
          costCenterId: eff?.cost_center_id ?? DEFAULT_COST_CENTER,
          docType:      'boleta' as const,
          docNumber:    null,
          supplierRut:  null,
        }
      })
      setRows(newRows)

      setIsCategorizing(true)
      const suggestions: CategorySuggestion[] = await categorizeItems(
        result.items.map(i => ({ description: i.description }))
      )
      setRows(prev =>
        prev.map((row, idx) => {
          const sug = suggestions.find(s => s.index === idx)
          if (sug && sug.categoryId && sug.confidence >= 0.7) {
            if (categories.some(c => c.id === sug.categoryId)) {
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
        docType,
        fundNumber: fundNumber || undefined,
      })
      setSuccessId(result.reportId)
    } catch (err) {
      setError(String(err))
    } finally {
      setIsCommitting(false)
    }
  }

  // ── Pantalla de éxito ────────────────────────────────────────────────────────
  if (successId) {
    const isCajaChica = docType === 'caja_chica'
    return (
      <div className="max-w-lg mx-auto py-16 text-center space-y-4">
        <CheckCircle2 size={48} className="mx-auto text-brand-500" />
        <h2 className="font-display font-extrabold text-2xl text-ink-900">
          Importación completada
        </h2>
        <p className="text-ink-500">
          {isCajaChica
            ? <>La caja chica histórica fue creada en estado <strong>Aprobada</strong> y ya aparece en el módulo de <strong>Caja Chica</strong>.</>
            : <>La rendición histórica fue creada en estado <strong>Aprobada</strong> y ya aparece en el panel de admin y en el exportador a Defontana.</>
          }
        </p>
        <div className="flex gap-3 justify-center pt-2">
          <Button
            variant="ghost"
            onClick={() => {
              setSuccessId(null)
              setRows([emptyRow()])
              setParsed(null)
              setDocType('rendicion')
              setFundNumber('')
              setTitle('')
              setApprovedDate('')
            }}
          >
            Importar otra
          </Button>
          <a href={isCajaChica ? '/petty-cash' : '/admin/reports'}>
            <Button>{isCajaChica ? 'Ver en Caja Chica' : 'Ver en reportes'}</Button>
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
          <h1 className="font-display font-extrabold text-2xl tracking-tight tor-on-gradient">
            Carga Histórica
          </h1>
        </div>
        <p className="text-sm tor-on-gradient-soft">
          Importá rendiciones y cajas chicas de períodos anteriores para exportarlas a Defontana.
        </p>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-ink-100 p-1 rounded-item w-fit">
        {([
          ['excel',    'Subir Excel'],
          ['manual',   'Ingreso Manual'],
          ['historial', `Historial (${imports.length})`],
        ] as const).map(([key, label]) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={`px-4 py-1.5 rounded-[10px] text-sm font-medium transition-colors ${
              tab === key ? 'bg-white text-ink-900 shadow-sm' : 'text-ink-500 hover:text-ink-700'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Vista historial */}
      {tab === 'historial' && (
        <Card>
          <div className="flex items-center gap-2 mb-4">
            <ClipboardList size={18} className="text-brand-600" />
            <h2 className="font-semibold text-ink-800">Rendiciones históricas importadas</h2>
          </div>
          {imports.length === 0 ? (
            <p className="text-sm text-ink-400 text-center py-8">
              Aún no hay rendiciones históricas importadas.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-ink-100">
                    <th className="text-left text-xs font-medium text-ink-500 pb-2 pr-4">Título</th>
                    <th className="text-left text-xs font-medium text-ink-500 pb-2 pr-4">Responsable</th>
                    <th className="text-left text-xs font-medium text-ink-500 pb-2 pr-4">Fecha importación</th>
                    <th className="text-right text-xs font-medium text-ink-500 pb-2 pr-4">Monto aprobado</th>
                    <th className="text-left text-xs font-medium text-ink-500 pb-2">Estado de pago</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-ink-50">
                  {imports.map(r => (
                    <React.Fragment key={r.id}>
                    <tr className="hover:bg-ink-50/50">
                      <td className="py-2.5 pr-4">
                        <div className="font-medium text-ink-800 text-sm">{r.title}</div>
                        {r.fund_number && (
                          <div className="text-xs text-ink-400">N° {r.fund_number}</div>
                        )}
                        <div className="flex items-center gap-1.5 mt-0.5">
                          {r.defontana_exported_at && (
                            <span className="text-xs text-accent-600">
                              ✓ Defontana {formatDate(r.defontana_exported_at.split('T')[0])}
                            </span>
                          )}
                          <button
                            onClick={() => setDefPanelId(prev => prev === r.id ? null : r.id)}
                            title="Defontana por tipo: exportar, confirmar o revertir gastos y adelantos por separado"
                            className={`p-0.5 rounded-item transition-colors ${defPanelId === r.id ? 'text-accent-700 bg-accent-100' : 'text-accent-500 hover:text-accent-700 hover:bg-accent-50'}`}
                          >
                            <FileSpreadsheet size={12} />
                          </button>
                        </div>
                      </td>
                      <td className="py-2.5 pr-4 text-sm text-ink-600">{r.submitter_name}</td>
                      <td className="py-2.5 pr-4 text-sm text-ink-500">{formatDate(r.created_at.split('T')[0])}</td>
                      <td className="py-2.5 pr-4 text-right font-mono-amount text-sm text-ink-800">
                        {formatCLP(r.approved_amount)}
                      </td>
                      <td className="py-2.5">
                        {r.status === 'reimbursed' ? (
                          <div className="flex flex-col gap-1">
                            <span className="text-xs text-ink-500">
                              Reembolsado {r.reimbursed_at ? formatDate(r.reimbursed_at.split('T')[0]) : ''}
                            </span>
                            <CuadreBadge
                              approvedAmount={r.approved_amount}
                              reimbursedAmount={r.reimbursed_amount}
                            />
                          </div>
                        ) : (
                          <span className="text-xs text-ink-400 italic">Sin reembolso</span>
                        )}
                      </td>
                    </tr>
                    {defPanelId === r.id && (
                      <tr>
                        <td colSpan={5} className="p-0">
                          <DefontanaTypePanel
                            reportId={r.id}
                            onClose={() => setDefPanelId(null)}
                            onChanged={refreshImport}
                          />
                        </td>
                      </tr>
                    )}
                    </React.Fragment>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      )}

      {/* Upload zone */}
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
            <input ref={fileRef} type="file" accept=".xlsx,.xls" className="hidden" onChange={handleExcelUpload} />
          </div>
          {isCategorizing && (
            <p className="text-xs text-brand-600 mt-3 text-center animate-pulse">
              ✦ Claude está sugiriendo categorías…
            </p>
          )}
          {parsed && (
            <div className="mt-3 text-xs text-ink-500 flex gap-4 flex-wrap">
              <span>✓ Detectado: <strong>{parsed.importType === 'caja_chica' ? 'Caja Chica' : 'Rendición'} N°{parsed.fundNumber}</strong></span>
              <span>· {parsed.items.length} ítems</span>
              <span>· <CurrencyAmount amount={parsed.totalAmount} currency="CLP" size="sm" /></span>
            </div>
          )}
        </Card>
      )}

      {/* Formulario de importación (oculto en tab historial) */}
      {tab !== 'historial' && (<>

      {/* Datos del documento */}
      <Card>
        <h2 className="font-semibold text-ink-800 mb-4">Datos del documento</h2>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">

          <div className="sm:col-span-2">
            <label className="block text-xs font-medium text-ink-600 mb-2">Tipo de documento</label>
            <div className="flex gap-3">
              {([
                { value: 'rendicion',  label: 'Rendición de gastos' },
                { value: 'caja_chica', label: 'Caja Chica' },
              ] as const).map(opt => (
                <label key={opt.value} className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="radio" name="docType" value={opt.value}
                    checked={docType === opt.value}
                    onChange={() => setDocType(opt.value)}
                    className="accent-brand-600"
                  />
                  <span className="text-sm font-medium text-ink-700">{opt.label}</span>
                </label>
              ))}
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-ink-600 mb-1">
              N° de fondo / referencia
              <span className="ml-1 text-ink-400 font-normal">(para vincular documentos)</span>
            </label>
            <input
              type="text" value={fundNumber} onChange={e => setFundNumber(e.target.value)}
              placeholder="ej: 173"
              className="campo w-full"
            />
          </div>

          <div className="sm:col-span-3">
            <label className="block text-xs font-medium text-ink-600 mb-1">Título</label>
            <input
              type="text" value={title} onChange={e => setTitle(e.target.value)}
              placeholder="ej: Caja Chica N°173 — OFICINA DE INGENIERÍA"
              className="campo w-full"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-ink-600 mb-1">Responsable</label>
            <select
              value={responsibleId} onChange={e => setResponsibleId(e.target.value)}
              className="campo w-full"
            >
              {employees.map(emp => (
                <option key={emp.id} value={emp.id}>{emp.full_name}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-medium text-ink-600 mb-1">Fecha de rendición</label>
            <input
              type="date" value={approvedDate} onChange={e => setApprovedDate(e.target.value)}
              className="campo w-full"
            />
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
            <span className="flex items-center gap-1 text-xs text-warning-600 bg-warning-50 px-2 py-1 rounded-full">
              <AlertTriangle size={12} />
              {warnings} sin categoría
            </span>
          )}
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-ink-100">
                <th className="text-left text-xs font-medium text-ink-500 pb-2 pr-2 whitespace-nowrap">Tipo</th>
                <th className="text-left text-xs font-medium text-ink-500 pb-2 pr-2 whitespace-nowrap">Empleado</th>
                <th className="text-left text-xs font-medium text-ink-500 pb-2 pr-2 whitespace-nowrap">Descripción</th>
                <th className="text-left text-xs font-medium text-ink-500 pb-2 pr-2 whitespace-nowrap">Fecha</th>
                <th className="text-left text-xs font-medium text-ink-500 pb-2 pr-2 whitespace-nowrap">Monto CLP</th>
                <th className="text-left text-xs font-medium text-ink-500 pb-2 pr-2 whitespace-nowrap">Categoría</th>
                <th className="text-left text-xs font-medium text-ink-500 pb-2 pr-2 whitespace-nowrap">Centro</th>
                <th className="text-left text-xs font-medium text-ink-500 pb-2 pr-2 whitespace-nowrap">Doc</th>
                <th className="pb-2"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-ink-50">
              {rows.map(row => (
                <GridRowEditor
                  key={row._key}
                  row={row}
                  categories={categories}
                  costCenters={costCenters}
                  employees={employees}
                  advanceDefaults={{
                    employeeId:   responsibleId || null,
                    employeeName: employees.find(e => e.id === responsibleId)?.full_name ?? '',
                    date:         approvedDate || new Date().toISOString().split('T')[0],
                  }}
                  onChange={patch => updateRow(row._key, patch)}
                  onRemove={() => removeRow(row._key)}
                />
              ))}
            </tbody>
          </table>
        </div>

        {/* Botones agregar ítem */}
        <div className="mt-3 flex items-center gap-3 flex-wrap">
          <button
            onClick={() => addRow('expense')}
            className="flex items-center gap-1 text-sm text-ink-600 hover:text-ink-800 font-medium"
          >
            <Plus size={14} /> Agregar gasto
          </button>
          <span className="text-ink-200">|</span>
          <button
            onClick={() => addRow('advance')}
            className="flex items-center gap-1 text-sm text-info-600 hover:text-info-800 font-medium"
          >
            <ArrowDownToLine size={14} /> Agregar adelanto
          </button>
          <span className="text-ink-200">|</span>
          <button
            onClick={() => addRow('return')}
            className="flex items-center gap-1 text-sm text-success-600 hover:text-success-800 font-medium"
          >
            <ArrowUpFromLine size={14} /> Agregar devolución
          </button>
        </div>

        {/* Balance */}
        {(advanceTotal > 0 || returnTotal > 0) && (
          <div className="mt-5 pt-4 border-t border-ink-100">
            <p className="card-label font-semibold text-ink-500 mb-2">Balance de la rendición</p>
            <div className="space-y-1 text-sm">
              <div className="flex justify-between">
                <span className="flex items-center gap-1.5 text-info-700">
                  <ArrowDownToLine size={13} /> Adelantado por empresa
                </span>
                <span className="font-mono-amount font-semibold text-info-700">{fmtCLP(advanceTotal)}</span>
              </div>
              <div className="flex justify-between">
                <span className="flex items-center gap-1.5 text-ink-600">
                  <Receipt size={13} /> Gastos rendidos
                </span>
                <span className="font-mono-amount font-semibold text-ink-700">({fmtCLP(expenseTotal)})</span>
              </div>
              {returnTotal > 0 && (
                <div className="flex justify-between">
                  <span className="flex items-center gap-1.5 text-success-700">
                    <ArrowUpFromLine size={13} /> Devuelto por empleado
                  </span>
                  <span className="font-mono-amount font-semibold text-success-700">({fmtCLP(returnTotal)})</span>
                </div>
              )}
              <div className={`flex justify-between pt-1 border-t font-bold ${
                Math.abs(balanceDiff) < 1 ? 'text-success-700' : 'text-warning-600'
              }`}>
                <span>Diferencia</span>
                <span className="font-mono-amount">
                  {Math.abs(balanceDiff) < 1
                    ? '✓ Cuadra'
                    : balanceDiff > 0
                      ? `${fmtCLP(balanceDiff)} pendiente de rendir/devolver`
                      : `${fmtCLP(Math.abs(balanceDiff))} a favor del empleado`
                  }
                </span>
              </div>
            </div>
          </div>
        )}
      </Card>

      {/* Error */}
      {error && (
        <div className="flex items-start gap-2 bg-danger-50 border border-danger-200 rounded-item p-3 text-sm text-danger-700">
          <X size={16} className="shrink-0 mt-0.5" />
          {error}
        </div>
      )}

      {/* Confirmar */}
      <div className="flex justify-end">
        <Button
          onClick={handleCommit}
          disabled={isCommitting || rows.length === 0}
          className="min-w-[200px]"
        >
          {isCommitting ? 'Importando…' : `Confirmar importación (${rows.length} ítems)`}
        </Button>
      </div>

      </>)}
    </div>
  )
}

// ── Sub-componente por fila ────────────────────────────────────────────────────

interface AdvanceDefaults {
  employeeId:   string | null
  employeeName: string
  date:         string
}

interface GridRowEditorProps {
  row:             GridRow
  categories:      ExpenseCategory[]
  costCenters:     CostCenter[]
  employees:       UserProfile[]
  advanceDefaults: AdvanceDefaults
  onChange:        (patch: Partial<GridRow>) => void
  onRemove:        () => void
}

const ITEM_TYPE_STYLES: Record<string, string> = {
  expense: 'border-ink-200 bg-white',
  advance: 'border-info-200 bg-info-50/40',
  return:  'border-success-200 bg-success-50/40',
}

function GridRowEditor({ row, categories, costCenters, employees, advanceDefaults, onChange, onRemove }: GridRowEditorProps) {
  const isExpense = row.itemType === 'expense'
  const isFactura = isExpense && (row.docType === 'factura' || row.docType === 'factura_exenta')
  const rowBg = row.itemType === 'advance' ? 'bg-info-50/30' : row.itemType === 'return' ? 'bg-success-50/30' : ''

  function handleEmployeeSelect(value: string) {
    if (value === '' || value === '__ext__') {
      onChange({ employeeId: null })
      return
    }
    const emp = employees.find(e => e.id === value)
    onChange({ employeeId: value, employeeName: emp?.full_name ?? '' })
  }

  function handleTypeChange(newType: 'expense' | 'advance' | 'return') {
    const patch: Partial<GridRow> = {
      itemType:    newType,
      categoryId:  null,
      docNumber:   null,
      supplierRut: null,
    }
    if (newType === 'advance') {
      patch.employeeId   = advanceDefaults.employeeId
      patch.employeeName = advanceDefaults.employeeName
      patch.date         = advanceDefaults.date || row.date
      if (!row.description) patch.description = 'Adelanto Caja Chica'
    }
    onChange(patch)
  }

  return (
    <tr className={`group hover:brightness-95 transition-all ${rowBg}`}>
      {/* Tipo */}
      <td className="py-1.5 pr-2">
        <select
          value={row.itemType}
          onChange={e => handleTypeChange(e.target.value as ItemType)}
          className={`w-28 border rounded-[8px] px-2 py-1 text-xs font-medium focus:outline-none focus:ring-1 focus:ring-brand-400 ${ITEM_TYPE_STYLES[row.itemType]}`}
        >
          <option value="expense">Gasto</option>
          <option value="advance">Adelanto</option>
          <option value="return">Devolución</option>
        </select>
      </td>

      {/* Empleado (dropdown) */}
      <td className="py-1.5 pr-2">
        <select
          value={row.employeeId ?? (row.employeeName ? '__ext__' : '')}
          onChange={e => handleEmployeeSelect(e.target.value)}
          className="campo-compacto w-36"
        >
          <option value="">— Seleccionar —</option>
          {employees.map(emp => (
            <option key={emp.id} value={emp.id}>{emp.full_name}</option>
          ))}
          {/* Nombre externo de Excel sin match en empleados registrados */}
          {row.employeeId === null && row.employeeName && (
            <option value="__ext__">{row.employeeName} (externo)</option>
          )}
        </select>
      </td>

      {/* Descripción */}
      <td className="py-1.5 pr-2">
        <input
          type="text"
          value={row.description}
          onChange={e => onChange({ description: e.target.value })}
          placeholder={
            row.itemType === 'advance' ? 'ej: Adelanto Caja Chica' :
            row.itemType === 'return'  ? 'ej: Devolución saldo' :
            'Descripción'
          }
          className="campo-compacto w-44"
        />
      </td>

      {/* Fecha */}
      <td className="py-1.5 pr-2">
        <input
          type="date"
          value={row.date}
          onChange={e => onChange({ date: e.target.value })}
          className="campo-compacto"
        />
      </td>

      {/* Monto */}
      <td className="py-1.5 pr-2">
        <input
          type="number"
          value={row.amountCLP || ''}
          onChange={e => onChange({ amountCLP: Number(e.target.value) || 0 })}
          placeholder="0"
          className={`w-24 border rounded-[8px] px-2 py-1 text-xs font-mono-amount text-right focus:outline-none focus:ring-1 focus:ring-brand-400 ${
            row.itemType === 'advance' ? 'border-info-300 bg-info-50' :
            row.itemType === 'return'  ? 'border-success-300 bg-success-50' :
            'border-ink-200'
          }`}
        />
      </td>

      {/* Categoría — solo para gastos */}
      <td className="py-1.5 pr-2">
        {isExpense ? (
          <select
            value={row.categoryId ?? ''}
            onChange={e => onChange({ categoryId: e.target.value || null })}
            className={`w-36 border rounded-[8px] px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-brand-400 ${
              !row.categoryId ? 'border-warning-300 bg-warning-50' : 'border-ink-200'
            }`}
          >
            <option value="">— Sin asignar —</option>
            {categories.map(c => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
        ) : (
          <span className="w-36 inline-block text-xs text-ink-300 italic px-2">N/A</span>
        )}
      </td>

      {/* Centro de costo — solo para gastos */}
      <td className="py-1.5 pr-2">
        {isExpense ? (
          <select
            value={row.costCenterId}
            onChange={e => onChange({ costCenterId: e.target.value })}
            className="campo-compacto w-36"
          >
            {costCenters.filter(c => c.imputable).map(c => (
              <option key={c.id} value={c.id}>{c.id} — {c.descripcion}</option>
            ))}
          </select>
        ) : (
          <span className="w-36 inline-block text-xs text-ink-300 italic px-2">N/A</span>
        )}
      </td>

      {/* Doc — solo para gastos */}
      <td className="py-1.5 pr-2">
        {isExpense ? (
          <div className="flex flex-col gap-1">
            <select
              value={row.docType}
              onChange={e => onChange({ docType: e.target.value as GridRow['docType'] })}
              className="campo-compacto w-28"
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
                  className="campo-compacto w-28"
                />
                <input
                  type="text"
                  value={row.supplierRut ?? ''}
                  onChange={e => onChange({ supplierRut: e.target.value || null })}
                  placeholder="RUT proveedor"
                  className={`w-28 border rounded-[8px] px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-brand-400 ${
                    !row.supplierRut ? 'border-danger-300' : 'border-ink-200'
                  }`}
                />
              </>
            )}
          </div>
        ) : (
          <span className="w-28 inline-block text-xs text-ink-300 italic px-2">N/A</span>
        )}
      </td>

      {/* Eliminar */}
      <td className="py-1.5">
        <button
          onClick={onRemove}
          className="opacity-0 group-hover:opacity-100 p-1 text-ink-300 hover:text-danger-500 transition-opacity"
        >
          <Trash2 size={14} />
        </button>
      </td>
    </tr>
  )
}
