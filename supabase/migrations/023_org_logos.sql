-- ─────────────────────────────────────────────────────────────────────────────
-- 023 · Bucket para los logos de organización (white-label)
-- ─────────────────────────────────────────────────────────────────────────────
--
-- NO ALTERA NINGUNA TABLA NI BORRA NADA. Crea un bucket de Storage y sus
-- políticas. Las columnas que usa el white-label —`organizations.name` y
-- `organizations.logo_url`— existen desde `001_initial_schema.sql` y nunca se
-- habían usado, así que no hizo falta tocar el schema.
--
-- Por qué el bucket es PÚBLICO, a diferencia de `expense-attachments`:
-- el logo se muestra en el riel de cada pantalla, incluso antes de que termine
-- de resolverse la sesión. Firmar una URL por cada pintado sería una vuelta a la
-- base para mostrar una imagen que, por definición, es la cara pública de la
-- empresa. Los comprobantes son lo contrario y por eso aquel bucket es privado.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'org-logos',
  'org-logos',
  true,
  524288,                                    -- 512 KB: es un logo, no una foto
  array['image/png','image/jpeg','image/webp','image/svg+xml']
)
on conflict (id) do nothing;                 -- reaplicable sin efectos

-- Lectura: cualquiera. Es el logo que se muestra en la interfaz.
drop policy if exists "org_logos_lectura_publica" on storage.objects;
create policy "org_logos_lectura_publica"
  on storage.objects for select
  using (bucket_id = 'org-logos');

-- Escritura: solo un admin, y solo dentro de la carpeta de SU organización.
-- La ruta es `{org_id}/logo.{ext}`, así que el primer segmento es el org_id:
-- sin este chequeo, el admin de una empresa podría pisar el logo de otra.
drop policy if exists "org_logos_escritura_admin" on storage.objects;
create policy "org_logos_escritura_admin"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'org-logos'
    and is_admin()
    and (storage.foldername(name))[1] = get_my_org_id()::text
  );

drop policy if exists "org_logos_actualizacion_admin" on storage.objects;
create policy "org_logos_actualizacion_admin"
  on storage.objects for update to authenticated
  using (
    bucket_id = 'org-logos'
    and is_admin()
    and (storage.foldername(name))[1] = get_my_org_id()::text
  );

drop policy if exists "org_logos_borrado_admin" on storage.objects;
create policy "org_logos_borrado_admin"
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'org-logos'
    and is_admin()
    and (storage.foldername(name))[1] = get_my_org_id()::text
  );
