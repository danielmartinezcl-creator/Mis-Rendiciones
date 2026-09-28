-- Los respaldos de aprobación solo los escribe el servidor.
--
-- Las reglas viven UNA vez, en src/lib/respaldos.ts (Daniel, 2026-09-25): ve y
-- sube un respaldo quien ve su documento; lo borra solo quien lo subió, y solo
-- mientras nadie haya dado un paso en el documento después de la subida. Las
-- acciones de src/actions/approval-attachments.ts le preguntan y escriben con la
-- llave de servicio. Esta migración no repite la regla de borrado: impide
-- saltarse el servidor. Es el mismo criterio de la 035 para los comprobantes.
--
-- Lo que cierra (nombres leídos de pg_policies el 2026-09-28):
--   · «users can upload approval attachments»: cualquiera de la organización
--     agregaba un respaldo a cualquier rendición o fondo, lo viera o no.
--   · «uploader or admin can delete approval attachments»: quien lo subió o el
--     admin lo borraban en cualquier momento, aunque ya se hubiera aprobado o
--     pagado con ese respaldo a la vista.
--   · «org members can read approval attachments»: toda la organización leía
--     todos los respaldos, con sus rutas. Ahora, quien ve el documento.
--   · Bucket `approval-attachments`: subir, leer y borrar pedían solo tener
--     sesión, de cualquier organización. Cualquiera borraba cualquier archivo
--     conociendo la ruta, y las rutas se leían de la tabla.
--
-- El bucket queda sin ninguna política, ni de lectura. A diferencia del de
-- comprobantes, lo firma un solo lugar (`getApprovalAttachments`), y lo hace con
-- la llave de servicio después de comprobar que la persona ve el documento.
--
-- APLICAR SOLO DESPUÉS de desplegar el código que escribe con la llave de
-- servicio: el código viejo sube, firma y borra con la sesión y fallaría. Sin
-- «if exists», como en la 033 y la 035: si un nombre cambió, la migración se
-- detiene en vez de dejar abierta una puerta que se creía cerrada.
-- Pruebas: supabase/tests/037_respaldos.sql. Al final, «Para revertir».

-- 1 ─ La tabla: la sesión solo lee, y solo lo de los documentos que ve ─────────
drop policy "users can upload approval attachments"             on public.approval_attachments;
drop policy "uploader or admin can delete approval attachments" on public.approval_attachments;

drop policy "org members can read approval attachments" on public.approval_attachments;
-- Los subselect pasan por la RLS de expense_reports y petty_cash_funds con los
-- permisos de quien consulta: quién ve cada documento no se copia acá, se
-- hereda. Si mañana cambia, los respaldos lo siguen solos.
create policy "respaldos_visibles_con_su_documento" on public.approval_attachments
  for select to authenticated
  using (
    org_id = public.get_my_org_id()
    and (
      exists (select 1 from public.expense_reports r
              where r.id = approval_attachments.report_id)
      or exists (select 1 from public.petty_cash_funds f
                 where f.id = approval_attachments.fund_id)
    )
  );

-- 2 ─ El bucket: ninguna sesión lo toca ────────────────────────────────────────
drop policy "approval-attachments insert" on storage.objects;
drop policy "approval-attachments select" on storage.objects;
drop policy "approval-attachments delete" on storage.objects;

-- ─────────────────────────────────────────────────────────────────────────────
-- Para revertir (pegar en el editor SQL):
--
-- drop policy if exists "respaldos_visibles_con_su_documento" on public.approval_attachments;
-- create policy "org members can read approval attachments" on public.approval_attachments
--   for select using (org_id = get_my_org_id());
-- create policy "users can upload approval attachments" on public.approval_attachments
--   for insert with check (uploaded_by = auth.uid() and org_id = get_my_org_id());
-- create policy "uploader or admin can delete approval attachments" on public.approval_attachments
--   for delete using (uploaded_by = auth.uid() or is_admin());
-- create policy "approval-attachments insert" on storage.objects
--   for insert with check (bucket_id = 'approval-attachments' and auth.uid() is not null);
-- create policy "approval-attachments select" on storage.objects
--   for select using (bucket_id = 'approval-attachments' and auth.uid() is not null);
-- create policy "approval-attachments delete" on storage.objects
--   for delete using (bucket_id = 'approval-attachments' and auth.uid() is not null);
