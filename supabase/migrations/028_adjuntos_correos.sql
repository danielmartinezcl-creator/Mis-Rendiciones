-- Los respaldos de un gasto no son solo fotos y PDF: también el correo en que
-- alguien autorizó el gasto. Se aceptan .eml (estándar) y .msg (Outlook).
--
-- La lista vive en tres lados que tienen que coincidir: este bucket, el check
-- de `attachments.file_type` y `src/lib/attachment-types.ts`. Si uno se queda
-- atrás, el archivo pasa la app y choca en Supabase.

update storage.buckets
set allowed_mime_types = array[
  'image/jpeg', 'image/png', 'image/webp',
  'application/pdf',
  'message/rfc822', 'application/vnd.ms-outlook'
]
where id = 'expense-attachments';

alter table public.attachments drop constraint attachments_file_type_check;
alter table public.attachments add constraint attachments_file_type_check
  check (file_type in ('image', 'pdf', 'email'));
