-- Los adjuntos de un gasto solo los escribe el servidor.
--
-- La regla vive UNA vez, en `puedeCambiarAdjuntos` (src/lib/expense-helpers.ts):
-- un comprobante se sube o se borra solo si se puede cambiar su gasto — quien
-- rinde, con la rendición en borrador; el empleado del fondo, con los fondos
-- enviados; el admin, en cargas históricas (la regla de la 033, sección 3b).
-- Las acciones de src/actions/expenses.ts le preguntan y escriben con la llave
-- de servicio. Esta migración no repite la regla: impide saltarse el servidor.
--
-- Lo que cierra (nombres leídos de pg_policies el 2026-09-25):
--   · «submitter can insert attachments»: cualquier persona de la organización
--     agregaba un comprobante al gasto de otra, en cualquier estado.
--   · «admin can manage attachments» (ALL): el admin agregaba, borraba y editaba
--     adjuntos de documentos vivos ajenos, e incluso los pasaba a otro gasto.
--   · Bucket `expense-attachments`: subir y borrar pedían solo tener sesión.
--     Cualquiera borraba cualquier comprobante conociendo la ruta, y las rutas
--     se leen de `attachments`.
--   · Leer también pedía solo tener sesión: se acota a la carpeta de la propia
--     organización. Toda ruta empieza con el org_id (verificado el 2026-09-25:
--     ninguna fila ni archivo fuera de su carpeta).
--
-- Por qué no un disparador, como la 3b para los gastos: el archivo no vive en
-- `attachments` sino en `storage.objects`, que tiene su propia RLS. Un
-- disparador en la tabla dejaba el bucket abierto, y cerrarlo con políticas
-- que interpretaran la ruta era copiar la regla dos veces más en SQL.
--
-- APLICAR SOLO DESPUÉS de desplegar el código que escribe con la llave de
-- servicio: el código viejo sube y borra con la sesión y fallaría. Sin
-- «if exists», como en la 033: si un nombre cambió, la migración se detiene en
-- vez de dejar abierta una puerta que se creía cerrada.
-- Pruebas: supabase/tests/035_adjuntos.sql. Al final, «Para revertir».

-- 1 ─ La tabla: la sesión solo lee ────────────────────────────────────────────
drop policy "submitter can insert attachments" on public.attachments;
drop policy "admin can manage attachments"     on public.attachments;
-- Queda «org members can read attachments»: la organización ve los
-- comprobantes de sus gastos (quien rinde, el aprobador, el admin).

-- 2 ─ El bucket: escribe el servidor, cada organización lee lo suyo ──────────
drop policy "org members can upload attachments"     on storage.objects;
drop policy "org members can delete own attachments" on storage.objects;

drop policy "org members can read own attachments" on storage.objects;
-- Mismo patrón que org-logos (023). Firmar una URL también es leer.
create policy "expense_attachments_lectura_propia_org" on storage.objects
  for select to authenticated
  using (
    bucket_id = 'expense-attachments'
    and (storage.foldername(name))[1] = public.get_my_org_id()::text
  );

-- ─────────────────────────────────────────────────────────────────────────────
-- Para revertir (pegar en el editor SQL):
--
-- drop policy if exists "expense_attachments_lectura_propia_org" on storage.objects;
-- create policy "org members can read own attachments" on storage.objects
--   for select using (bucket_id = 'expense-attachments' and auth.uid() is not null);
-- create policy "org members can upload attachments" on storage.objects
--   for insert with check (bucket_id = 'expense-attachments' and auth.uid() is not null);
-- create policy "org members can delete own attachments" on storage.objects
--   for delete using (bucket_id = 'expense-attachments' and auth.uid() is not null);
-- create policy "admin can manage attachments" on public.attachments
--   for all using (org_id = public.get_my_org_id() and public.is_admin());
-- create policy "submitter can insert attachments" on public.attachments
--   for insert with check (org_id = (select users.org_id from public.users where users.id = auth.uid()));
