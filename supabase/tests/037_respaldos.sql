-- Pruebas de la 037: los respaldos de aprobación solo los escribe el servidor, y
-- los ve quien ve su documento. Correrlas DESPUÉS de aplicar la 037 (o dentro de
-- su ensayo con BEGIN/ROLLBACK), con `execute_sql` o en el editor SQL.
--
-- Mismo arnés que supabase/tests/035_adjuntos.sql:
--   ok = true   la base rechazó; en «filtra», la sesión ve la fila pero no la
--               puede cambiar; en «no_ve», la sesión no ve la fila; en
--               «sembrada», ver más abajo
--   ok = false  PROTECCIÓN ROTA, o falló con OTRO error (se muestra cuál)
--   ok = null   no concluyente: no hay filas que cumplan el criterio
--
-- La tabla y el bucket estaban vacíos al escribirlas (2026-09-28), así que las
-- pruebas siembran sin sesión un respaldo en una rendición y otro en un fondo,
-- más un archivo, y el `rollback` del final los borra. De ahí el modo nuevo,
-- «sembrada»: una escritura sobre una fila sembrada acá que afecta 0 filas es
-- protección aunque la sesión no la vea. En el bucket, desde la 037, ninguna
-- sesión ve nada, y «filtra» quedaría siempre «no concluyente».
--
-- Sin la 037, las pruebas 1a–1d, 2a, 2b, 3a, 3b y 4a–4d salen rotas: son los
-- agujeros que cierra. La llave de servicio no se prueba desde SQL: el control
-- positivo de la escritura es subir y borrar un respaldo desde la app.
begin;

create temp table resultado (prueba text, ok boolean, detalle text) on commit drop;

-- probar(): corre `sentencia` como `usuario` y anota el resultado.
--   modo 'rechazo'  : tiene que fallar con uno de los textos de `esperado`
--   modo 'filtra'   : como 'rechazo', pero 0 filas afectadas también es
--                     protección SI la sesión ve la fila (`visible` > 0)
--   modo 'sembrada' : como 'rechazo', pero 0 filas afectadas también es
--                     protección: la fila existe porque la sembró esta prueba
--   modo 'no_ve'    : una lectura que tiene que devolver 0 filas
--   modo 'lee'      : control positivo de lectura, tiene que devolver filas
create function pg_temp.probar(
  prueba    text,
  usuario   uuid,
  sentencia text,
  esperado  text[] default '{}',
  modo      text   default 'rechazo',
  visible   text   default null
) returns void
language plpgsql
as $f$
declare
  n       int;
  vis     int;
  err     text;
  ok      boolean;
  detalle text;
begin
  if usuario is null or sentencia is null then
    insert into resultado values (prueba, null, 'no concluyente: no hay filas que cumplan el criterio');
    return;
  end if;

  perform set_config('request.jwt.claims',
    json_build_object('sub', usuario, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';

  begin
    if visible is not null then execute visible into vis; end if;
    if modo in ('no_ve', 'lee') then
      execute format('select count(*) from (%s) s', sentencia) into n;
    else
      execute sentencia;
      get diagnostics n = row_count;
    end if;
    -- Siempre se deshace: la prueba no deja rastro para la siguiente
    raise exception using message = '__sin_error__', detail = n::text;
  exception when others then
    if sqlerrm = '__sin_error__' then
      err := null;
    else
      err := sqlerrm;
    end if;
  end;

  execute 'reset role';
  perform set_config('request.jwt.claims', '{}', true);

  if modo in ('no_ve', 'lee') then
    if err is not null then
      ok := false; detalle := 'OTRO error: ' || err;
    elsif modo = 'no_ve' then
      ok := n = 0;
      detalle := case when ok then 'la sesión no ve la fila'
                      else format('PROTECCIÓN ROTA: la sesión ve %s fila/s', n) end;
    else
      ok := n > 0;
      detalle := case when ok then format('permitido (%s fila/s)', n)
                      else 'la RLS esconde algo que la sesión tiene que ver (0 filas)' end;
    end if;
  elsif err is not null then
    ok := exists (select 1 from unnest(esperado) e where position(e in err) > 0);
    detalle := case when ok then 'rechazado: ' else 'OTRO error: ' end || err;
  elsif n > 0 then
    ok := false; detalle := format('PROTECCIÓN ROTA: la sesión cambió %s fila/s', n);
  elsif modo = 'filtra' and coalesce(vis, 0) > 0 then
    ok := true;  detalle := 'la sesión ve la fila pero la RLS no la deja cambiar (0 filas)';
  elsif modo = 'sembrada' then
    ok := true;  detalle := 'la sesión no la ve ni la puede cambiar (0 filas; la fila se sembró en esta prueba)';
  else
    ok := null;  detalle := 'no concluyente: la sentencia no afectó ninguna fila';
  end if;

  insert into resultado values (prueba, ok, detalle);
end;
$f$;

do $$
declare
  rls    constant text := 'row-level security';
  bucket constant text := 'approval-attachments';
  org uuid; rep uuid; rendidor uuid; aprobador uuid; ajeno uuid; adm uuid;
  fondo uuid; empleado uuid; ajeno_fondo uuid;
  resp_rep uuid; resp_fondo uuid; ruta text;
begin
  -- 0. Semilla ───────────────────────────────────────────────────────────────
  -- Una rendición viva de alguien sin rol admin; de preferencia, con N1
  select r.id, r.org_id, r.submitter_id, s.approver_l1_id into rep, org, rendidor, aprobador
  from expense_reports r
  join users s on s.id = r.submitter_id
  where r.deleted_at is null and s.role <> 'admin' and s.is_active
  order by (s.approver_l1_id is not null) desc, r.created_at desc
  limit 1;

  -- Alguien de la misma organización que NO ve esa rendición: ni la rinde, ni
  -- está en la cadena de quien rinde, ni es admin. Es la lógica de la RLS de
  -- expense_reports, con el suplente excluido aunque no esté vigente.
  select u.id into ajeno
  from users u
  join users s on s.id = rendidor
  where u.org_id = org and u.role <> 'admin' and u.is_active and u.id <> rendidor
    and u.id is distinct from s.approver_l1_id
    and u.id is distinct from s.approver_l2_id
    and u.id is distinct from s.approver_l1_backup_id
    and not exists (
      select 1 from approval_policies ap join employee_policies ep on ep.policy_id = ap.id
      where ep.user_id = rendidor
        and ap.levels @> jsonb_build_array(jsonb_build_object('approver_id', u.id::text)))
  limit 1;

  select id into adm from users where org_id = org and role = 'admin' and is_active limit 1;

  -- Un fondo vivo de alguien sin rol admin, y alguien que no lo ve: ni es su
  -- empleado, ni lo gestiona, ni está en la cadena del empleado, ni opera el
  -- banco (los operadores ven los fondos en banco), ni es admin
  select f.id, f.employee_id into fondo, empleado
  from petty_cash_funds f
  join users e on e.id = f.employee_id
  where f.deleted_at is null and f.org_id = org and e.role <> 'admin'
  limit 1;

  select u.id into ajeno_fondo
  from users u
  join petty_cash_funds f on f.id = fondo
  join users e on e.id = f.employee_id
  where u.org_id = org and u.role <> 'admin' and u.is_active
    and u.id is distinct from f.employee_id
    and u.id is distinct from f.manager_id
    and u.id is distinct from e.approver_l1_id
    and u.id is distinct from e.approver_l2_id
    and u.id is distinct from e.approver_l1_backup_id
    and not (coalesce(u.can_load_bank_transfer, false) or coalesce(u.can_authorize_bank_transfer, false))
    and not exists (
      select 1 from approval_policies ap join employee_policies ep on ep.policy_id = ap.id
      where ep.user_id = f.employee_id
        and ap.levels @> jsonb_build_array(jsonb_build_object('approver_id', u.id::text)))
  limit 1;

  -- Los respaldos y el archivo, como los deja el servidor
  if rep is not null then
    insert into approval_attachments (org_id, report_id, uploaded_by, storage_path, filename)
    values (org, rep, rendidor, org || '/' || rep || '/prueba-037.pdf', 'prueba-037.pdf')
    returning id into resp_rep;
  end if;
  if fondo is not null then
    insert into approval_attachments (org_id, fund_id, uploaded_by, storage_path, filename)
    values (org, fondo, empleado, org || '/' || fondo || '/prueba-037.pdf', 'prueba-037.pdf')
    returning id into resp_fondo;
  end if;
  if rep is not null then
    ruta := org || '/' || rep || '/prueba-037.pdf';
    begin
      insert into storage.objects (bucket_id, name) values (bucket, ruta);
    exception when others then
      insert into resultado values ('0. semilla', false, 'no se pudo sembrar el archivo: ' || sqlerrm);
      ruta := null;
    end;
  end if;

  -- 1. Nadie agrega un respaldo con su sesión ─────────────────────────────────
  -- 1a. Quien rinde, a su propia rendición: el caso legítimo, que ahora hace
  --     el servidor
  perform pg_temp.probar('1a. Rendidor sin admin agrega un respaldo a su rendición', rendidor,
    case when rep is not null then format(
      'insert into public.approval_attachments (org_id, report_id, uploaded_by, storage_path, filename) values (%L, %L, %L, %L, %L)',
      org, rep, rendidor, org || '/' || rep || '/sesion-037.pdf', 'sesion-037.pdf') end,
    array[rls]);

  -- 1b. Alguien que ni siquiera ve la rendición. Antes podía: la política solo
  --     pedía ser uno mismo y de la organización
  perform pg_temp.probar('1b. Usuario sin admin agrega un respaldo a una rendición que no ve', ajeno,
    case when rep is not null then format(
      'insert into public.approval_attachments (org_id, report_id, uploaded_by, storage_path, filename) values (%L, %L, %L, %L, %L)',
      org, rep, ajeno, org || '/' || rep || '/sesion-037.pdf', 'sesion-037.pdf') end,
    array[rls]);

  -- 1c. El admin
  perform pg_temp.probar('1c. Admin agrega un respaldo con su sesión', adm,
    case when rep is not null then format(
      'insert into public.approval_attachments (org_id, report_id, uploaded_by, storage_path, filename) values (%L, %L, %L, %L, %L)',
      org, rep, adm, org || '/' || rep || '/sesion-037.pdf', 'sesion-037.pdf') end,
    array[rls]);

  -- 1d. El empleado, a su fondo
  perform pg_temp.probar('1d. Empleado agrega un respaldo a su fondo', empleado,
    case when fondo is not null then format(
      'insert into public.approval_attachments (org_id, fund_id, uploaded_by, storage_path, filename) values (%L, %L, %L, %L, %L)',
      org, fondo, empleado, org || '/' || fondo || '/sesion-037.pdf', 'sesion-037.pdf') end,
    array[rls]);

  -- 2. Nadie borra ni edita un respaldo con su sesión ─────────────────────────
  -- 2a. Quien lo subió. Antes: en cualquier momento. Ahora lo hace el servidor,
  --     y solo si nadie dio un paso en el documento después de la subida
  perform pg_temp.probar('2a. Quien lo subió lo borra con su sesión', rendidor,
    case when resp_rep is not null then format(
      'delete from public.approval_attachments where id = %L', resp_rep) end,
    array[rls], 'filtra',
    format('select count(*) from public.approval_attachments where id = %L', resp_rep));

  -- 2b. El admin, un respaldo ajeno. Antes: siempre
  perform pg_temp.probar('2b. Admin borra un respaldo ajeno con su sesión', adm,
    case when resp_rep is not null then format(
      'delete from public.approval_attachments where id = %L', resp_rep) end,
    array[rls], 'filtra',
    format('select count(*) from public.approval_attachments where id = %L', resp_rep));

  -- 2c. Nadie edita: nunca hubo política de UPDATE, y queda fijado
  perform pg_temp.probar('2c. Quien lo subió cambia la descripción con su sesión', rendidor,
    case when resp_rep is not null then format(
      'update public.approval_attachments set description = %L where id = %L', 'cambiada', resp_rep) end,
    array[rls], 'filtra',
    format('select count(*) from public.approval_attachments where id = %L', resp_rep));

  -- 3. Ve el respaldo quien ve su documento ──────────────────────────────────
  -- 3a. Alguien de la organización que no ve la rendición. Antes: toda la
  --     organización leía todos los respaldos
  perform pg_temp.probar('3a. Usuario sin admin lee un respaldo de una rendición que no ve', ajeno,
    case when resp_rep is not null then format(
      'select 1 from public.approval_attachments where id = %L', resp_rep) end,
    '{}', 'no_ve');

  -- 3b. …ni el de un fondo que no ve
  perform pg_temp.probar('3b. Usuario sin admin lee un respaldo de un fondo que no ve', ajeno_fondo,
    case when resp_fondo is not null then format(
      'select 1 from public.approval_attachments where id = %L', resp_fondo) end,
    '{}', 'no_ve');

  -- 3c–3f. CONTROL: sí lo ven quien rinde, su N1, el empleado del fondo y el admin
  perform pg_temp.probar('3c. CONTROL: quien rinde lee el respaldo de su rendición', rendidor,
    case when resp_rep is not null then format(
      'select 1 from public.approval_attachments where id = %L', resp_rep) end,
    '{}', 'lee');

  perform pg_temp.probar('3d. CONTROL: el N1 de quien rinde lee el respaldo', aprobador,
    case when resp_rep is not null then format(
      'select 1 from public.approval_attachments where id = %L', resp_rep) end,
    '{}', 'lee');

  perform pg_temp.probar('3e. CONTROL: el empleado lee el respaldo de su fondo', empleado,
    case when resp_fondo is not null then format(
      'select 1 from public.approval_attachments where id = %L', resp_fondo) end,
    '{}', 'lee');

  perform pg_temp.probar('3f. CONTROL: el admin lee el respaldo de una rendición de su organización', adm,
    case when resp_rep is not null then format(
      'select 1 from public.approval_attachments where id = %L', resp_rep) end,
    '{}', 'lee');

  -- 4. El bucket: ninguna sesión lo toca ──────────────────────────────────────
  -- 4a. Subir. Antes: cualquiera, a cualquier carpeta
  perform pg_temp.probar('4a. Rendidor sin admin sube un archivo al bucket de respaldos', rendidor,
    case when rep is not null then format(
      'insert into storage.objects (bucket_id, name) values (%L, %L)',
      bucket, org || '/' || rep || '/' || gen_random_uuid() || '.pdf') end,
    array[rls]);

  -- 4b. El admin tampoco
  perform pg_temp.probar('4b. Admin sube un archivo al bucket de respaldos', adm,
    case when rep is not null then format(
      'insert into storage.objects (bucket_id, name) values (%L, %L)',
      bucket, org || '/' || rep || '/' || gen_random_uuid() || '.pdf') end,
    array[rls]);

  -- 4c. Leer, aunque sea el archivo de su propio respaldo: firma el servidor
  perform pg_temp.probar('4c. Quien lo subió lee el archivo desde la sesión', rendidor,
    case when ruta is not null then format(
      'select 1 from storage.objects where bucket_id = %L and name = %L', bucket, ruta) end,
    '{}', 'no_ve');

  -- 4d. Borrar. La base frena todo borrado directo (storage.protect_delete)
  --     salvo que se active `storage.allow_delete_query`, que es lo que hace la
  --     API de Storage: se activa acá también, para probar la política y no ese
  --     freno.
  perform set_config('storage.allow_delete_query', 'true', true);
  perform pg_temp.probar('4d. Quien lo subió borra el archivo desde la sesión', rendidor,
    case when ruta is not null then format(
      'delete from storage.objects where bucket_id = %L and name = %L', bucket, ruta) end,
    array[rls], 'sembrada');
  perform set_config('storage.allow_delete_query', 'false', true);
end $$;

select * from resultado order by prueba;

rollback;
