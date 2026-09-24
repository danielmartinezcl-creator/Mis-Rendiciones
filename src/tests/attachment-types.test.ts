import { describe, it, expect } from 'vitest'
import {
  classifyAttachment, ACCEPT_ATTACHMENTS, MAX_ATTACHMENT_BYTES,
  classifyRespaldo, ACCEPT_RESPALDOS,
} from '@/lib/attachment-types'

// «Adjuntos de respaldo» respalda la rendición completa (una planilla de
// gastos, el correo que la autoriza): acepta todo lo de un comprobante + Excel.
describe('classifyRespaldo', () => {
  it('acepta Excel, que un comprobante de ítem no acepta', () => {
    expect(classifyRespaldo('detalle.xlsx')).toBe('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
    expect(classifyRespaldo('viejo.XLS')).toBe('application/vnd.ms-excel')
    expect(classifyAttachment('detalle.xlsx')).toBeNull()
  })

  it('acepta también PDF, fotos y correos', () => {
    expect(classifyRespaldo('transferencia.pdf')).toBe('application/pdf')
    expect(classifyRespaldo('autorizacion.msg')).toBe('application/vnd.ms-outlook')
    expect(classifyRespaldo('foto.jpg')).toBe('image/jpeg')
  })

  it('rechaza lo demás', () => {
    expect(classifyRespaldo('script.exe')).toBeNull()
  })

  it('el selector ofrece Excel', () => {
    expect(ACCEPT_RESPALDOS).toContain('.xlsx')
    expect(ACCEPT_RESPALDOS).toContain('.pdf')
  })
})

describe('classifyAttachment', () => {
  it('acepta fotos y las clasifica como image', () => {
    expect(classifyAttachment('boleta.jpg')).toEqual({ kind: 'image', contentType: 'image/jpeg' })
    expect(classifyAttachment('captura.png')).toEqual({ kind: 'image', contentType: 'image/png' })
  })

  it('acepta PDF (facturas, comprobantes de transferencia)', () => {
    expect(classifyAttachment('transferencia.pdf')).toEqual({ kind: 'pdf', contentType: 'application/pdf' })
  })

  it('acepta correos .eml y .msg como email', () => {
    expect(classifyAttachment('autorizacion.eml')).toEqual({ kind: 'email', contentType: 'message/rfc822' })
    expect(classifyAttachment('autorizacion.msg')).toEqual({ kind: 'email', contentType: 'application/vnd.ms-outlook' })
  })

  // Windows suele entregar los .msg de Outlook sin tipo: sin esto el bucket los rechaza
  it('reconoce por extensión cuando el navegador no informa el tipo', () => {
    expect(classifyAttachment('Aprobación gasto.MSG')).toEqual({ kind: 'email', contentType: 'application/vnd.ms-outlook' })
    expect(classifyAttachment('correo.eml')).toEqual({ kind: 'email', contentType: 'message/rfc822' })
    expect(classifyAttachment('factura.PDF')).toEqual({ kind: 'pdf', contentType: 'application/pdf' })
  })

  it('rechaza lo que no es comprobante', () => {
    expect(classifyAttachment('planilla.xlsx')).toBeNull()
    expect(classifyAttachment('script.exe')).toBeNull()
    expect(classifyAttachment('sin-extension')).toBeNull()
  })
})

describe('ACCEPT_ATTACHMENTS', () => {
  it('incluye imágenes, PDF y correos para el selector de archivos', () => {
    for (const t of ['image/jpeg', 'application/pdf', '.pdf', '.eml', '.msg']) {
      expect(ACCEPT_ATTACHMENTS).toContain(t)
    }
  })
})

describe('MAX_ATTACHMENT_BYTES', () => {
  it('coincide con el límite del bucket (10 MB)', () => {
    expect(MAX_ATTACHMENT_BYTES).toBe(10 * 1024 * 1024)
  })
})
