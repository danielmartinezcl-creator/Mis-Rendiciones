'use client'

import { useState } from 'react'

interface ExportButtonProps {
  type:     'excel' | 'pdf'
  getData:  () => object
  filename?: string
  label?:   string
  className?: string
}

export function ExportButton({ type, getData, filename = 'export', label, className }: ExportButtonProps) {
  const [loading, setLoading] = useState(false)

  async function handleExport() {
    setLoading(true)
    try {
      const data = getData()
      if (type === 'excel') {
        const { exportReportToExcel } = await import('@/lib/export/excel')
        exportReportToExcel(data as any)
      } else {
        const { exportReportToPDF } = await import('@/lib/export/pdf')
        exportReportToPDF(data as any)
      }
    } finally {
      setLoading(false)
    }
  }

  const defaultLabel = type === 'excel' ? 'Excel' : 'PDF'

  return (
    <button
      onClick={handleExport}
      disabled={loading}
      className={
        className ??
        'px-3 py-1.5 bg-white border border-slate-200 rounded-[8px] text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50 transition-colors flex items-center gap-1.5'
      }
    >
      {loading ? (
        <span className="w-3 h-3 border border-current border-t-transparent rounded-full animate-spin" />
      ) : (
        <span>{type === 'excel' ? '📊' : '📄'}</span>
      )}
      {loading ? 'Exportando...' : (label ?? `Exportar ${defaultLabel}`)}
    </button>
  )
}
