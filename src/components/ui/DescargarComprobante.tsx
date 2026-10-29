'use client'

import { useState } from 'react'
import { FileSpreadsheet, FileText, Loader2 } from 'lucide-react'
import { getComprobante } from '@/actions/comprobante'
import { nombreDeArchivo } from '@/lib/comprobante-cierre'
import { useDialogos } from '@/components/ui/Dialogos'

/**
 * Los dos botones del comprobante, iguales en una rendición y en un fondo.
 *
 * Los datos los arma el servidor (`getComprobante`) y el archivo se dibuja acá:
 * jsPDF y SheetJS pesan, así que se importan recién al apretar, como el resto de
 * las exportaciones de la app.
 */
export function DescargarComprobante({ tipo, id }: { tipo: 'rendicion' | 'caja_chica'; id: string }) {
  const { avisar } = useDialogos()
  const [enCurso, setEnCurso] = useState<'pdf' | 'xlsx' | null>(null)

  async function bajar(formato: 'pdf' | 'xlsx') {
    setEnCurso(formato)
    try {
      const r = await getComprobante(tipo, id)
      if ('error' in r) { avisar(r.error, 'error'); return }
      const bytes = formato === 'pdf'
        ? (await import('@/lib/export/comprobante-pdf')).comprobanteAPdf(r.comprobante, r.huella)
        : await (await import('@/lib/export/comprobante-excel')).comprobanteAExcel(r.comprobante, r.huella)
      const tipoMime = formato === 'pdf'
        ? 'application/pdf'
        : 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
      const url = URL.createObjectURL(new Blob([bytes as BlobPart], { type: tipoMime }))
      const a = document.createElement('a')
      a.href = url
      a.download = nombreDeArchivo(r.comprobante, formato)
      a.click()
      setTimeout(() => URL.revokeObjectURL(url), 1000)
    } catch {
      avisar('No se pudo generar el archivo. Probá de nuevo.', 'error')
    } finally {
      setEnCurso(null)
    }
  }

  const boton = (formato: 'pdf' | 'xlsx', Icono: typeof FileText, rotulo: string) => (
    <button
      type="button"
      onClick={() => bajar(formato)}
      disabled={enCurso !== null}
      className="btn-secundario inline-flex items-center gap-2 px-3 py-2 card-label bg-white"
    >
      {enCurso === formato ? <Loader2 size={16} className="animate-spin" /> : <Icono size={16} />}
      {rotulo}
    </button>
  )

  return (
    <div className="flex flex-wrap items-center gap-2">
      {boton('pdf', FileText, 'Comprobante PDF')}
      {boton('xlsx', FileSpreadsheet, 'Excel')}
    </div>
  )
}
