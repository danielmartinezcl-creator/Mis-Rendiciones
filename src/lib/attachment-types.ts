// Qué archivos sirven como respaldo de un gasto. Una sola fuente para el
// selector del navegador, la validación del servidor y el bucket de Supabase
// (migración 028): si cambian por separado, el archivo pasa una capa y choca
// en la siguiente sin que nadie lo vea.

export type AttachmentKind = 'image' | 'pdf' | 'email'

export const MAX_ATTACHMENT_BYTES = 10 * 1024 * 1024   // = file_size_limit del bucket

const POR_EXTENSION: Record<string, { kind: AttachmentKind; contentType: string }> = {
  jpg:  { kind: 'image', contentType: 'image/jpeg' },
  jpeg: { kind: 'image', contentType: 'image/jpeg' },
  png:  { kind: 'image', contentType: 'image/png' },
  webp: { kind: 'image', contentType: 'image/webp' },
  pdf:  { kind: 'pdf',   contentType: 'application/pdf' },
  eml:  { kind: 'email', contentType: 'message/rfc822' },
  msg:  { kind: 'email', contentType: 'application/vnd.ms-outlook' },
}

// Valor del atributo `accept` de los <input type="file">. Van tipos Y extensiones:
// sin `.msg` explícito, Windows oculta los correos de Outlook en el diálogo.
export const ACCEPT_ATTACHMENTS = [
  'image/jpeg', 'image/png', 'image/webp', 'application/pdf',
  'message/rfc822', 'application/vnd.ms-outlook',
  ...Object.keys(POR_EXTENSION).map(ext => `.${ext}`),
].join(',')

// Decide por la extensión, no por el tipo que informa el navegador: Windows
// entrega los .msg con tipo vacío u octet-stream, y el bucket rechaza eso.
export function classifyAttachment(fileName: string): { kind: AttachmentKind; contentType: string } | null {
  return POR_EXTENSION[extension(fileName)] ?? null
}

// «Adjuntos de respaldo» (rendición o fondo completo, bucket approval-attachments,
// migración 029) acepta además Excel: una planilla respalda el conjunto, no un gasto.
const SOLO_RESPALDO: Record<string, string> = {
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  xls:  'application/vnd.ms-excel',
}

export const ACCEPT_RESPALDOS = [
  ACCEPT_ATTACHMENTS,
  ...Object.values(SOLO_RESPALDO),
  ...Object.keys(SOLO_RESPALDO).map(ext => `.${ext}`),
].join(',')

// Devuelve el contentType con que se sube, o null si no se admite.
export function classifyRespaldo(fileName: string): string | null {
  const ext = extension(fileName)
  return POR_EXTENSION[ext]?.contentType ?? SOLO_RESPALDO[ext] ?? null
}

function extension(fileName: string): string {
  return fileName.includes('.') ? fileName.split('.').pop()!.toLowerCase() : ''
}
