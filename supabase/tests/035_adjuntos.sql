-- Pruebas de la 035: los adjuntos de un gasto solo los escribe el servidor.
-- Correrlas DESPUÉS de aplicar la 035 (o dentro de su ensayo con BEGIN/ROLLBACK),
-- con `execute_sql` o en el editor SQL.
--
-- Mismo arnés que supabase/tests/033_proteccion.sql: todo corre en una
-- transacción que se deshace al final, cada prueba en su propia subtransacción
-- que se deshace siempre, y el resultado sale en una tabla (`execute_sql` no
-- muestra los NOTICE).
--   ok = true   la base rechazó; en «filtra», la sesión ve la fila pero no la
--               puede cambiar; en «no_ve», la sesión no ve la fila
--   ok = false  PROTECCIÓN ROTA, o falló con OTRO error (se muestra cuál)
--   ok = null   no concluyente: no hay filas que cumplan el criterio
--
-- Se prueba que NINGUNA sesión escribe, tampoco la del dueño en su borrador:
-- ese caso legítimo lo hace el servidor con la llave de servicio, después de
-- `puedeCambiarAdjuntos`. La llave de servicio no se prueba desde SQL: el
-- control positivo de la escritura es subir un comprobante desde la app.
begin;

create temp table resultado (prueba text, ok boolean, detalle text) on commit drop;

-- probar(): corre `sentencia` como `usuario` y anota el resultado.
--   modo 'rechazo' : tiene que fallar con uno de los textos de `esperado`
--   modo 'filtra'  : como 'rechazo', pero 0 filas afectadas también es
--                    protección SI la sesión ve la fila (`visible` > 0)
--   modo 'no_ve'   : una lectura que tiene que devolver 0 filas
--   modo 'lee'     : control positivo de lectura, tiene que devolver filas
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
  else
    ok := null;  detalle := 'no concluyente: la sentencia no afectó ninguna fila';
  end if;

  insert into resultado values (prueba, ok, detalle);
end;
$f$;

do $$
declare
  rls    constant text := 'row-level security';
  bucket constant text := 'expense-attachments';
  u uuid; d uuid; d2 uuid; org uuid; ruta text;
begin
  -- 1. Nadie agrega un adjunto con su sesión ──────────────────────────────────
  -- 1a. Quien rinde, en un gasto de su propio borrador: el caso legítimo, que
  --     ahora hace el servidor
  select r.submitter_id, i.id, i.org_id into u, d, org
  from expense_items i
  join expense_reports r on r.id = i.report_id
  join users s on s.id = r.submitter_id
  where r.status = 'draft' and i.deleted_at is null and r.deleted_at is null and s.role <> 'admin'
  limit 1;
  perform pg_temp.probar('1a. Rendidor sin admin agrega un adjunto a un gasto de su borrador', u,
    case when d is not null then format(
      'insert into public.attachments (item_id, org_id, storage_path, file_type) values (%L, %L, %L, %L)',
      d, org, org || '/' || d || '/prueba-035.jpg', 'image') end,
    array[rls]);

  -- 1b. Otra persona de la organización, en el gasto de alguien más y de
  --     preferencia ya enviado: lo que dejaba «submitter can insert attachments»
  select s.id, i.id, i.org_id into u, d, org
  from expense_items i
  join expense_reports r on r.id = i.report_id
  join users s on s.org_id = i.org_id and s.id <> r.submitter_id and s.role <> 'admin' and s.is_active
  where i.deleted_at is null and r.deleted_at is null
  order by (r.status <> 'draft') desc
  limit 1;
  perform pg_temp.probar('1b. Usuario sin admin agrega un adjunto al gasto de otra persona', u,
    case when d is not null then format(
      'insert into public.attachments (item_id, org_id, storage_path, file_type) values (%L, %L, %L, %L)',
      d, org, org || '/' || d || '/prueba-035.jpg', 'image') end,
    array[rls]);

  -- 1c. El admin, en un gasto de una rendición viva de otra persona
  select a.id, i.id, i.org_id into u, d, org
  from expense_items i
  join expense_reports r on r.id = i.report_id
  join users a on a.org_id = i.org_id and a.role = 'admin' and a.is_active
  where i.deleted_at is null and r.deleted_at is null
    and not r.is_historical_import and r.submitter_id <> a.id
  limit 1;
  perform pg_temp.probar('1c. Admin agrega un adjunto a un gasto vivo de otra persona', u,
    case when d is not null then format(
      'insert into public.attachments (item_id, org_id, storage_path, file_type) values (%L, %L, %L, %L)',
      d, org, org || '/' || d || '/prueba-035.jpg', 'image') end,
    array[rls]);

  -- 1d. El empleado del fondo, en un gasto de su caja chica
  select f.employee_id, i.id, i.org_id into u, d, org
  from petty_cash_items i
  join petty_cash_funds f on f.id = i.fund_id
  where f.deleted_at is null
  order by (f.status = 'funds_sent') desc
  limit 1;
  perform pg_temp.probar('1d. Empleado agrega un adjunto a un gasto de su fondo', u,
    case when d is not null then format(
      'insert into public.attachments (petty_cash_item_id, org_id, storage_path, file_type) values (%L, %L, %L, %L)',
      d, org, org || '/' || d || '/prueba-035.jpg', 'image') end,
    array[rls]);

  -- 2. Nadie borra ni edita un adjunto con su sesión ─────────────────────────
  -- 2a. El admin (antes: «admin can manage attachments», ALL)
  u := null; d := null; d2 := null;
  select a.id, x.id,
         (select i.id from expense_items i
          where i.org_id = x.org_id and i.id is distinct from x.item_id limit 1)
  into u, d, d2
  from attachments x
  join users a on a.org_id = x.org_id and a.role = 'admin' and a.is_active
  limit 1;
  perform pg_temp.probar('2a. Admin borra un adjunto con su sesión', u,
    case when d is not null then format(
      'delete from public.attachments where id = %L', d) end,
    array[rls], 'filtra',
    format('select count(*) from public.attachments where id = %L', d));

  -- 2b. …ni lo pasa a otro gasto (misma fila)
  perform pg_temp.probar('2b. Admin pasa un adjunto a otro gasto con su sesión', u,
    case when d is not null and d2 is not null then format(
      'update public.attachments set item_id = %L where id = %L', d2, d) end,
    array[rls], 'filtra',
    format('select count(*) from public.attachments where id = %L', d));

  -- 2c. Una persona sin rol admin, un adjunto de su organización
  select s.id, x.id into u, d
  from attachments x
  join users s on s.org_id = x.org_id and s.role <> 'admin' and s.is_active
  limit 1;
  perform pg_temp.probar('2c. Usuario sin admin borra un adjunto de su organización', u,
    case when d is not null then format(
      'delete from public.attachments where id = %L', d) end,
    array[rls], 'filtra',
    format('select count(*) from public.attachments where id = %L', d));

  -- 3. El bucket de comprobantes ───────────────────────────────────────────────
  -- 3a. Subir un archivo con la sesión (antes: cualquiera, a cualquier carpeta)
  select s.id, s.org_id into u, org
  from users s
  where s.role <> 'admin' and s.is_active and s.deleted_at is null and s.blocked_at is null
  limit 1;
  perform pg_temp.probar('3a. Usuario sin admin sube un archivo al bucket de comprobantes', u,
    case when u is not null then format(
      'insert into storage.objects (bucket_id, name) values (%L, %L)',
      bucket, org || '/prueba-035/' || gen_random_uuid() || '.jpg') end,
    array[rls]);

  -- 3b. Borrar un comprobante con la sesión. La base frena todo borrado
  --     directo (storage.protect_delete) salvo que se active
  --     `storage.allow_delete_query`, que es lo que hace la API de Storage: se
  --     activa acá también, para probar la política y no ese freno.
  u := null; ruta := null;
  select s.id, o.name into u, ruta
  from storage.objects o
  join users s on s.org_id::text = split_part(o.name, '/', 1) and s.role <> 'admin' and s.is_active
  where o.bucket_id = bucket
  limit 1;
  perform set_config('storage.allow_delete_query', 'true', true);
  perform pg_temp.probar('3b. Usuario sin admin borra un comprobante del bucket', u,
    case when ruta is not null then format(
      'delete from storage.objects where bucket_id = %L and name = %L', bucket, ruta) end,
    array[rls], 'filtra',
    format('select count(*) from storage.objects where bucket_id = %L and name = %L', bucket, ruta));
  perform set_config('storage.allow_delete_query', 'false', true);

  -- 3c. Leer un archivo guardado en la carpeta de otra organización. Hoy hay
  --     una sola organización: se siembra, sin sesión, una fila en una carpeta
  --     ajena, y el `rollback` la borra. No hay archivo detrás: lo que importa
  --     es la fila, que es la que deja firmar la URL.
  ruta := gen_random_uuid()::text || '/prueba-035/ajeno.jpg';
  begin
    insert into storage.objects (bucket_id, name) values (bucket, ruta);
  exception when others then
    insert into resultado values ('3c. semilla', false, 'no se pudo sembrar el archivo ajeno: ' || sqlerrm);
    ruta := null;
  end;
  select s.id into u
  from users s
  where s.role <> 'admin' and s.is_active and s.deleted_at is null and s.blocked_at is null
  limit 1;
  perform pg_temp.probar('3c. Usuario sin admin lee un comprobante de otra organización', u,
    case when ruta is not null then format(
      'select 1 from storage.objects where bucket_id = %L and name = %L', bucket, ruta) end,
    '{}', 'no_ve');

  -- 3d. CONTROL: sí lee (y puede firmar) los de su organización
  u := null; ruta := null;
  select s.id, o.name into u, ruta
  from storage.objects o
  join users s on s.org_id::text = split_part(o.name, '/', 1) and s.role <> 'admin' and s.is_active
  where o.bucket_id = bucket
  limit 1;
  perform pg_temp.probar('3d. CONTROL: usuario sin admin lee un comprobante de su organización', u,
    case when ruta is not null then format(
      'select 1 from storage.objects where bucket_id = %L and name = %L', bucket, ruta) end,
    '{}', 'lee');

  -- 4. CONTROL: la organización sigue viendo los adjuntos de sus gastos
  u := null; d := null;
  select s.id, x.id into u, d
  from attachments x
  join users s on s.org_id = x.org_id and s.role <> 'admin' and s.is_active
  limit 1;
  perform pg_temp.probar('4. CONTROL: usuario sin admin lee un adjunto de su organización', u,
    case when d is not null then format(
      'select 1 from public.attachments where id = %L', d) end,
    '{}', 'lee');
end $$;

select * from resultado order by prueba;

rollback;
