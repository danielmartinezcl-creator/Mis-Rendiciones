-- Pruebas de la 033 (y de lo que la 033 quita), con sesiones reales. Correrlas
-- DESPUÉS de aplicar la 033, con `execute_sql` o en el editor SQL.
--
-- Todo corre en una transacción que se deshace al final, y además cada prueba
-- corre en su propia subtransacción que se deshace siempre: ninguna prueba ve
-- lo que hizo otra, y nada queda escrito aunque una protección esté rota.
--
-- El resultado sale en una tabla (el `select` del final), no en avisos:
-- `execute_sql` no muestra los NOTICE.
--   ok = true   la base rechazó con el mensaje esperado (o, en «filtra», la
--               sesión ve la fila pero la RLS no la deja tocar)
--   ok = false  PROTECCIÓN ROTA, o falló con OTRO error (se muestra cuál)
--   ok = null   no concluyente: no hay filas que cumplan el criterio, o la
--               sentencia no afectó ninguna fila sin que se pueda saber por qué
--
-- Las filas se eligen por criterio (rol, estado, cadena), nunca por nombre.
-- Lección de la 030: las fallas de permisos solo aparecen sin superpoderes, así
-- que casi todas las pruebas usan personas SIN rol admin.
begin;

create temp table resultado (prueba text, ok boolean, detalle text) on commit drop;

-- probar(): corre `sentencia` como `usuario` y anota el resultado.
--   modo 'rechazo'   : tiene que fallar con uno de los textos de `esperado`
--   modo 'filtra'    : como 'rechazo', pero 0 filas afectadas también es
--                      protección SI la sesión ve la fila (`visible` > 0): la
--                      RLS deja verla y no deja cambiarla
--   modo 'permitido' : control positivo, tiene que afectar al menos una fila
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
    execute sentencia;
    get diagnostics n = row_count;
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

  if modo = 'permitido' then
    if err is not null then
      ok := false; detalle := 'falló un cambio legítimo: ' || err;
    elsif n > 0 then
      ok := true;  detalle := format('permitido (%s fila/s)', n);
    else
      ok := false; detalle := 'la RLS bloqueó un cambio legítimo sobre una fila propia (0 filas)';
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
  -- Textos de la 033 que cuentan como «rechazado»
  estado_rend  constant text := 'El estado y los montos aprobados solo los cambia la aplicación';
  estado_fondo constant text := 'El estado y el monto aprobado de un fondo solo los cambia la aplicación';
  quien_rend   constant text := 'Quién rinde y de qué organización es una rendición no cambian';
  quien_fondo  constant text := 'El beneficiario, el encargado y la organización de un fondo no cambian';
  alta_rend    constant text := 'Una rendición nueva solo puede crearse en borrador';
  historica    constant text := 'Solo un admin marca una rendición como carga histórica';
  item_nuevo   constant text := 'Un gasto nuevo entra pendiente';
  borrador     constant text := 'Solo se pueden modificar gastos de una rendición en borrador';
  fondo_abierto constant text := 'Solo se pueden modificar gastos de un fondo con los fondos enviados';
  mover        constant text := 'Un gasto no se puede mover a otro documento';
  rls          constant text := 'row-level security';

  u uuid; u2 uuid; d uuid; d2 uuid; org uuid; est text;
begin
  -- 1a. La EFF mueve el estado de un fondo suyo (sin rol admin). Si es
  --     borrador lo frena el disparador; si no, la RLS (solo edita borradores).
  select f.manager_id, f.id into u, d
  from petty_cash_funds f join users m on m.id = f.manager_id
  where f.deleted_at is null and m.role <> 'admin'
  order by (f.status = 'draft') desc limit 1;
  perform pg_temp.probar('1a. EFF sin admin mueve el estado de su fondo', u,
    case when d is not null then format(
      'update public.petty_cash_funds set status = %L where id = %L',
      'pending_bank_load', d) end,
    array[estado_fondo, rls], 'filtra',
    format('select count(*) from public.petty_cash_funds where id = %L', d));

  -- 1b. El admin, con su sesión, mueve el estado de un fondo de su organización
  select a.id, f.id into u, d
  from petty_cash_funds f join users a on a.org_id = f.org_id and a.role = 'admin' and a.is_active
  where f.deleted_at is null and f.status <> 'settled'
  limit 1;
  perform pg_temp.probar('1b. Admin mueve el estado de un fondo con su sesión', u,
    case when d is not null then format(
      'update public.petty_cash_funds set status = %L where id = %L', 'settled', d) end,
    array[estado_fondo]);

  -- 2a. F2 — la EFF se pone como beneficiaria de un fondo ya enviado
  select f.manager_id, f.id, coalesce(
           nullif(f.manager_id, f.employee_id),
           (select x.id from users x where x.org_id = f.org_id and x.id <> f.employee_id limit 1))
  into u, d, u2
  from petty_cash_funds f join users m on m.id = f.manager_id
  where f.deleted_at is null and f.status <> 'draft' and m.role <> 'admin'
  limit 1;
  perform pg_temp.probar('2a. EFF sin admin cambia el beneficiario de un fondo enviado (F2)', u,
    case when d is not null and u2 is not null then format(
      'update public.petty_cash_funds set employee_id = %L where id = %L', u2, d) end,
    array[quien_fondo, rls], 'filtra',
    format('select count(*) from public.petty_cash_funds where id = %L', d));

  -- 2b. F2 — el admin (que sí puede editar fondos por RLS) se pone como beneficiario
  select a.id, f.id into u, d
  from petty_cash_funds f join users a on a.org_id = f.org_id and a.role = 'admin' and a.is_active
  where f.deleted_at is null and f.status <> 'draft' and f.employee_id <> a.id
  limit 1;
  perform pg_temp.probar('2b. Admin se pone como beneficiario de un fondo enviado (F2)', u,
    case when d is not null then format(
      'update public.petty_cash_funds set employee_id = %L where id = %L', u, d) end,
    array[quien_fondo]);

  -- 2c. F2 — el admin se pone como rendidor de una rendición enviada
  select a.id, r.id into u, d
  from expense_reports r join users a on a.org_id = r.org_id and a.role = 'admin' and a.is_active
  where r.deleted_at is null and r.status <> 'draft' and r.submitter_id <> a.id
  limit 1;
  perform pg_temp.probar('2c. Admin se pone como rendidor de una rendición enviada (F2)', u,
    case when d is not null then format(
      'update public.expense_reports set submitter_id = %L where id = %L', u, d) end,
    array[quien_rend]);

  -- 3. El rendidor (sin admin) mueve el estado de su rendición. Si es
  --    borrador lo frena el disparador; si no, la RLS (solo edita borradores).
  select r.submitter_id, r.id into u, d
  from expense_reports r join users s on s.id = r.submitter_id
  where r.deleted_at is null and s.role <> 'admin'
  order by (r.status = 'draft') desc limit 1;
  perform pg_temp.probar('3. Rendidor sin admin mueve el estado de su rendición', u,
    case when d is not null then format(
      'update public.expense_reports set status = %L where id = %L', 'approved', d) end,
    array[estado_rend, rls], 'filtra',
    format('select count(*) from public.expense_reports where id = %L', d));

  -- 4a. Crear una rendición ya aprobada
  select id, org_id into u, org
  from users where role <> 'admin' and is_active and deleted_at is null and blocked_at is null
  limit 1;
  perform pg_temp.probar('4a. Usuario sin admin crea una rendición aprobada', u,
    case when u is not null then format(
      'insert into public.expense_reports (org_id, submitter_id, title, status, total_amount, approved_amount, currency)
       values (%L, %L, %L, %L, 1000, 1000, %L)', org, u, 'prueba 033', 'approved', 'CLP') end,
    array[alta_rend, rls]);

  -- 4b. …o marcarla como carga histórica para que entre aprobada
  perform pg_temp.probar('4b. Usuario sin admin crea una «carga histórica» aprobada', u,
    case when u is not null then format(
      'insert into public.expense_reports (org_id, submitter_id, title, status, total_amount, approved_amount, currency, is_historical_import)
       values (%L, %L, %L, %L, 1000, 1000, %L, true)', org, u, 'prueba 033', 'approved', 'CLP') end,
    array[historica, alta_rend, rls]);

  -- 4c. F4 — ni el admin crea una histórica en un estado que no es final
  select a.id, a.org_id, s.id into u, org, u2
  from users a join users s on s.org_id = a.org_id and s.id <> a.id
  where a.role = 'admin' and a.is_active
  limit 1;
  perform pg_temp.probar('4c. Admin crea una carga histórica «en carga bancaria» (F4)', u,
    case when u is not null then format(
      'insert into public.expense_reports (org_id, submitter_id, title, status, total_amount, approved_amount, currency, is_historical_import)
       values (%L, %L, %L, %L, 1000, 1000, %L, true)', org, u2, 'prueba 033', 'pending_bank_load', 'CLP') end,
    array[alta_rend]);

  -- 5. F5a — el rendidor agrega a su rendición un gasto ya aprobado. Si no
  --    hay borradores y cae en una enviada, lo frena antes la 3b (`borrador`).
  select r.submitter_id, r.id, r.org_id into u, d, org
  from expense_reports r join users s on s.id = r.submitter_id
  where r.deleted_at is null and s.role <> 'admin' and not r.is_historical_import
  order by (r.status = 'draft') desc limit 1;
  perform pg_temp.probar('5. Rendidor sin admin agrega un gasto ya aprobado (F5a)', u,
    case when d is not null then format(
      'insert into public.expense_items (report_id, org_id, description, amount, currency, exchange_rate, amount_clp, date, status)
       values (%L, %L, %L, 1000, %L, 1, 1000, current_date, %L)', d, org, 'prueba 033', 'CLP', 'approved') end,
    array[item_nuevo, borrador, rls]);

  -- 6a. Firmar el historial de un fondo con el nombre de otra persona
  select f.manager_id, f.id, (select x.id from users x where x.org_id = f.org_id and x.id <> f.manager_id limit 1)
  into u, d, u2
  from petty_cash_funds f join users m on m.id = f.manager_id
  where f.deleted_at is null and m.role <> 'admin'
  limit 1;
  perform pg_temp.probar('6a. EFF sin admin firma el historial del fondo como otra persona', u,
    case when d is not null then format(
      'insert into public.petty_cash_approvals (fund_id, actor_id, action) values (%L, %L, %L)',
      d, u2, 'approved') end,
    array[rls]);

  -- 6b. …ni siquiera con su propio nombre: el historial lo escribe solo el servidor
  perform pg_temp.probar('6b. EFF sin admin escribe el historial del fondo con su nombre', u,
    case when d is not null then format(
      'insert into public.petty_cash_approvals (fund_id, actor_id, action) values (%L, %L, %L)',
      d, u, 'bank_load_confirmed') end,
    array[rls]);

  -- 6c. Historial de una rendición, con la sesión del aprobador de esa persona
  select s.approver_l1_id, r.id into u, d
  from expense_reports r
  join users s on s.id = r.submitter_id
  join users a on a.id = s.approver_l1_id
  where r.deleted_at is null and a.role <> 'admin'
  order by (r.status in ('submitted', 'pending_l2')) desc limit 1;
  perform pg_temp.probar('6c. Aprobador sin admin escribe el historial de una rendición', u,
    case when d is not null then format(
      'insert into public.expense_report_approvals (report_id, approver_id, level, action) values (%L, %L, 1, %L)',
      d, u, 'approved') end,
    array[rls]);

  -- 7. El admin, con su sesión, cambia el estado de una rendición
  select a.id, r.id, r.status into u, d, est
  from expense_reports r join users a on a.org_id = r.org_id and a.role = 'admin' and a.is_active
  where r.deleted_at is null
  order by (r.status <> 'draft') desc limit 1;
  perform pg_temp.probar('7. Admin cambia el estado de una rendición con su sesión', u,
    case when d is not null then format(
      'update public.expense_reports set status = %L where id = %L',
      case when est = 'reimbursed' then 'approved' else 'reimbursed' end, d) end,
    array[estado_rend]);

  -- 8a. F5b — el aprobador ya no edita con su sesión la rendición de su gente
  select s.approver_l1_id, r.id into u, d
  from expense_reports r
  join users s on s.id = r.submitter_id
  join users a on a.id = s.approver_l1_id
  where r.deleted_at is null and a.role <> 'admin'
  order by (r.status in ('submitted', 'pending_l2')) desc limit 1;
  perform pg_temp.probar('8a. Aprobador sin admin edita la rendición de su gente (F5b)', u,
    case when d is not null then format(
      'update public.expense_reports set title = title || %L where id = %L', ' (editado)', d) end,
    array[rls], 'filtra',
    format('select count(*) from public.expense_reports where id = %L', d));

  -- 8b. …ni sus ítems (misma persona y rendición que 8a)
  perform pg_temp.probar('8b. Aprobador sin admin edita los ítems de esa rendición (F5b)', u,
    case when d is not null then format(
      'update public.expense_items set amount_clp = amount_clp + 1 where report_id = %L', d) end,
    array[rls], 'filtra',
    format('select count(*) from public.expense_items where report_id = %L', d));

  -- 9. Control positivo: la sesión SÍ edita un campo libre de su propio borrador
  select r.submitter_id, r.id into u, d
  from expense_reports r join users s on s.id = r.submitter_id
  where r.deleted_at is null and r.status = 'draft' and s.role <> 'admin'
  limit 1;
  perform pg_temp.probar('9. CONTROL: rendidor sin admin cambia el título de su borrador', u,
    case when d is not null then format(
      'update public.expense_reports set title = title || %L where id = %L', ' (editado)', d) end,
    '{}', 'permitido');

  -- 10. Los gastos de una rendición se tocan solo en borrador (3b) ─────────────
  -- 10a. El doble pago: el rendidor pasa un gasto ya aprobado (de una carga
  --      histórica suya, por ejemplo) a un borrador suyo, donde llegaría
  --      aprobado. Si no tiene borrador, a otra rendición suya: la regla es la misma.
  select r.submitter_id, i.id,
         (select b.id from expense_reports b
          where b.submitter_id = r.submitter_id and b.id <> r.id and b.deleted_at is null
          order by (b.status = 'draft') desc limit 1)
  into u, d, d2
  from expense_items i
  join expense_reports r on r.id = i.report_id
  join users s on s.id = r.submitter_id
  where i.status = 'approved' and i.deleted_at is null and r.deleted_at is null and s.role <> 'admin'
  order by exists (select 1 from expense_reports b
                   where b.submitter_id = r.submitter_id and b.id <> r.id
                     and b.status = 'draft' and b.deleted_at is null) desc
  limit 1;
  perform pg_temp.probar('10a. Rendidor sin admin pasa un gasto aprobado a su borrador', u,
    case when d is not null and d2 is not null then format(
      'update public.expense_items set report_id = %L where id = %L', d2, d) end,
    array[mover]);

  -- 10b. …cambia el monto de un gasto de una rendición suya ya enviada
  select r.submitter_id, i.id into u, d
  from expense_items i
  join expense_reports r on r.id = i.report_id
  join users s on s.id = r.submitter_id
  where r.status <> 'draft' and i.deleted_at is null and r.deleted_at is null and s.role <> 'admin'
  limit 1;
  perform pg_temp.probar('10b. Rendidor sin admin cambia el monto de un gasto de su rendición enviada', u,
    case when d is not null then format(
      'update public.expense_items set amount_clp = amount_clp + 1 where id = %L', d) end,
    array[borrador]);

  -- 10c. …lo borra de verdad (misma fila que 10b)
  perform pg_temp.probar('10c. Rendidor sin admin borra un gasto de su rendición enviada', u,
    case when d is not null then format(
      'delete from public.expense_items where id = %L', d) end,
    array[borrador]);

  -- 10d. …o lo manda a la papelera: el borrado lógico es un UPDATE (misma fila)
  perform pg_temp.probar('10d. Rendidor sin admin borra (lógico) un gasto de su rendición enviada', u,
    case when d is not null then format(
      'update public.expense_items set deleted_at = now(), deleted_by = %L where id = %L', u, d) end,
    array[borrador]);

  -- 10e. …le agrega un gasto (pendiente) a una rendición suya ya enviada
  select r.submitter_id, r.id, r.org_id into u, d, org
  from expense_reports r join users s on s.id = r.submitter_id
  where r.status <> 'draft' and r.deleted_at is null and s.role <> 'admin'
  limit 1;
  perform pg_temp.probar('10e. Rendidor sin admin agrega un gasto a su rendición enviada', u,
    case when d is not null then format(
      'insert into public.expense_items (report_id, org_id, description, amount, currency, exchange_rate, amount_clp, date, status)
       values (%L, %L, %L, 1000, %L, 1, 1000, current_date, %L)', d, org, 'prueba 033', 'CLP', 'pending') end,
    array[borrador]);

  -- 10f. CONTROL: en su borrador, el rendidor sí edita sus gastos (y el
  --      disparador de la 024, que corre después, no lo estorba)
  select r.submitter_id, i.id into u, d
  from expense_items i
  join expense_reports r on r.id = i.report_id
  join users s on s.id = r.submitter_id
  where r.status = 'draft' and i.deleted_at is null and r.deleted_at is null and s.role <> 'admin'
  limit 1;
  perform pg_temp.probar('10f. CONTROL: rendidor sin admin edita el monto de un gasto de su borrador', u,
    case when d is not null then format(
      'update public.expense_items set amount_clp = amount_clp + 1 where id = %L', d) end,
    '{}', 'permitido');

  -- 10g. CONTROL: …y le agrega gastos
  select r.submitter_id, r.id, r.org_id into u, d, org
  from expense_reports r join users s on s.id = r.submitter_id
  where r.status = 'draft' and r.deleted_at is null and s.role <> 'admin'
  limit 1;
  perform pg_temp.probar('10g. CONTROL: rendidor sin admin agrega un gasto a su borrador', u,
    case when d is not null then format(
      'insert into public.expense_items (report_id, org_id, description, amount, currency, exchange_rate, amount_clp, date, status)
       values (%L, %L, %L, 1000, %L, 1, 1000, current_date, %L)', d, org, 'prueba 033', 'CLP', 'pending') end,
    '{}', 'permitido');

  -- 11. Caja chica: el empleado toca sus gastos solo con los fondos enviados ──
  -- 11a. …edita un gasto de un fondo suyo que no está en «fondos enviados»
  select f.employee_id, i.id into u, d
  from petty_cash_items i
  join petty_cash_funds f on f.id = i.fund_id
  join users e on e.id = f.employee_id
  where f.status <> 'funds_sent' and f.deleted_at is null and e.role <> 'admin'
  limit 1;
  perform pg_temp.probar('11a. Empleado sin admin edita un gasto de su fondo que no está en fondos enviados', u,
    case when d is not null then format(
      'update public.petty_cash_items set amount_clp = amount_clp + 1 where id = %L', d) end,
    array[fondo_abierto]);

  -- 11b. …lo borra (misma fila que 11a)
  perform pg_temp.probar('11b. Empleado sin admin borra un gasto de su fondo que no está en fondos enviados', u,
    case when d is not null then format(
      'delete from public.petty_cash_items where id = %L', d) end,
    array[fondo_abierto]);

  -- 11c. …le agrega un gasto
  select f.employee_id, f.id, f.org_id into u, d, org
  from petty_cash_funds f join users e on e.id = f.employee_id
  where f.status <> 'funds_sent' and f.deleted_at is null and e.role <> 'admin'
  limit 1;
  perform pg_temp.probar('11c. Empleado sin admin agrega un gasto a su fondo que no está en fondos enviados', u,
    case when d is not null then format(
      'insert into public.petty_cash_items (fund_id, org_id, description, amount, currency, exchange_rate, amount_clp, date, status)
       values (%L, %L, %L, 1000, %L, 1, 1000, current_date, %L)', d, org, 'prueba 033', 'CLP', 'pending') end,
    array[fondo_abierto]);

  -- 11d. …pasa un gasto de un fondo suyo a otro fondo suyo (de preferencia,
  --      a uno con los fondos enviados, donde después podría editarlo). Si no
  --      tiene otro, a otro fondo de su organización: el disparador corre antes
  --      que la RLS, así que tiene que responder él (solo vale `mover`).
  select f.employee_id, i.id,
         coalesce(
           (select g.id from petty_cash_funds g
            where g.employee_id = f.employee_id and g.id <> f.id and g.deleted_at is null
            order by (g.status = 'funds_sent') desc limit 1),
           (select g.id from petty_cash_funds g
            where g.org_id = f.org_id and g.id <> f.id and g.deleted_at is null limit 1))
  into u, d, d2
  from petty_cash_items i
  join petty_cash_funds f on f.id = i.fund_id
  join users e on e.id = f.employee_id
  where f.deleted_at is null and e.role <> 'admin'
  order by exists (select 1 from petty_cash_funds g
                   where g.employee_id = f.employee_id and g.id <> f.id and g.deleted_at is null) desc,
           (i.status = 'approved') desc
  limit 1;
  perform pg_temp.probar('11d. Empleado sin admin pasa un gasto a otro fondo suyo', u,
    case when d is not null and d2 is not null then format(
      'update public.petty_cash_items set fund_id = %L where id = %L', d2, d) end,
    array[mover]);

  -- 11e. CONTROL: con los fondos enviados, el empleado sí edita sus gastos
  select f.employee_id, i.id into u, d
  from petty_cash_items i
  join petty_cash_funds f on f.id = i.fund_id
  join users e on e.id = f.employee_id
  where f.status = 'funds_sent' and f.deleted_at is null and e.role <> 'admin'
  limit 1;
  perform pg_temp.probar('11e. CONTROL: empleado sin admin edita un gasto de su fondo con los fondos enviados', u,
    case when d is not null then format(
      'update public.petty_cash_items set amount_clp = amount_clp + 1 where id = %L', d) end,
    '{}', 'permitido');

  -- 12. El admin corrige gastos de documentos cerrados, pero no los mueve ─────
  -- 12a. …pasa un gasto de una rendición a otra con su sesión
  select a.id, i.id,
         (select b.id from expense_reports b
          where b.org_id = i.org_id and b.id <> i.report_id and b.deleted_at is null limit 1)
  into u, d, d2
  from expense_items i
  join expense_reports r on r.id = i.report_id
  join users a on a.org_id = i.org_id and a.role = 'admin' and a.is_active
  where i.deleted_at is null and r.deleted_at is null
  limit 1;
  perform pg_temp.probar('12a. Admin pasa un gasto a otra rendición con su sesión', u,
    case when d is not null and d2 is not null then format(
      'update public.expense_items set report_id = %L where id = %L', d2, d) end,
    array[mover]);

  -- 12b. CONTROL: el admin sí reasigna el centro de costo de un gasto de una
  --      rendición ya enviada (lo que hacen /admin/reports y la carga histórica)
  select a.id, i.id into u, d
  from expense_items i
  join expense_reports r on r.id = i.report_id
  join users a on a.org_id = i.org_id and a.role = 'admin' and a.is_active
  where i.deleted_at is null and r.deleted_at is null and r.status <> 'draft'
  limit 1;
  perform pg_temp.probar('12b. CONTROL: admin reasigna el centro de costo de un gasto de una rendición enviada', u,
    case when d is not null then format(
      'update public.expense_items set cost_center_id = cost_center_id where id = %L', d) end,
    '{}', 'permitido');
end $$;

-- Orden numérico: «10a» va después de «9», no antes de «1a»
select * from resultado order by substring(prueba from '^[0-9]+')::int, prueba;

rollback;
