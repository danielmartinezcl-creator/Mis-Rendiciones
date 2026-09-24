-- El bucket de «Adjuntos de respaldo» nunca existió.
--
-- La tabla `approval_attachments` (migración 005) y las políticas de storage
-- para `approval-attachments` sí estaban, pero el bucket no: toda subida desde
-- la sección «Adjuntos de respaldo» de una rendición o un fondo fallaba con
-- «Bucket not found», fuera PDF, foto o lo que fuera. Detectado el 2026-09-24.
--
-- Acepta lo mismo que un comprobante de ítem (028) más Excel. La lista es
-- espejo de `classifyRespaldo` en src/lib/attachment-types.ts.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'approval-attachments', 'approval-attachments', false, 10485760,
  array[
    'image/jpeg', 'image/png', 'image/webp',
    'application/pdf',
    'message/rfc822', 'application/vnd.ms-outlook',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/vnd.ms-excel'
  ]
)
on conflict (id) do update
  set file_size_limit    = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;
