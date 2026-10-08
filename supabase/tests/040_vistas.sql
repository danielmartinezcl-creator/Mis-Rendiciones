-- Pruebas de la 040. Correrlas dentro del ensayo (sin este begin/rollback) o
-- después de aplicarla. ok = false es una regla rota.
--
-- El resultado sale en una tabla (el `select` del final), no en avisos:
-- `execute_sql` del MCP no muestra los NOTICE.

begin;

create temp table resultado (prueba text, ok boolean, detalle text) on commit drop;

-- ── Forma de la tabla ───────────────────────────────────────────────────────

insert into resultado
select '1 vistas_filtro existe', to_regclass('public.vistas_filtro') is not null, null;

insert into resultado
select '1b columna ' || c,
       exists (select 1 from information_schema.columns
                where table_schema = 'public' and table_name = 'vistas_filtro' and column_name = c),
       null
from unnest(array['id','org_id','pantalla','nombre','filtro','orden','de_fabrica',
                  'creada_por','created_at','updated_at']) as c;

insert into resultado
select '1c RLS encendida',
       (select relrowsecurity from pg_class where oid = 'public.vistas_filtro'::regclass),
       null;

insert into resultado
select '1d nombre único por pantalla y organización',
       exists (select 1 from pg_constraint
                where conrelid = 'public.vistas_filtro'::regclass and contype = 'u'),
       null;

-- ── Las reglas que impone la base ───────────────────────────────────────────

do $$
declare
  org uuid;
  err text;
begin
  select id into org from public.organizations limit 1;

  -- 2. Una pantalla fuera de las cuatro se rechaza
  begin
    insert into public.vistas_filtro (org_id, pantalla, nombre, filtro)
    values (org, 'inventada', 'x', '{}'::jsonb);
    insert into resultado values ('2 pantalla inventada rechazada', false, 'entró igual');
  exception when check_violation then
    insert into resultado values ('2 pantalla inventada rechazada', true, null);
  when others then
    insert into resultado values ('2 pantalla inventada rechazada', false, sqlerrm);
  end;

  -- 3. Dos vistas con el mismo nombre en la misma pantalla chocan
  insert into public.vistas_filtro (org_id, pantalla, nombre, filtro)
  values (org, 'rendiciones', 'Prueba 040', '{}'::jsonb);
  begin
    insert into public.vistas_filtro (org_id, pantalla, nombre, filtro)
    values (org, 'rendiciones', 'Prueba 040', '{}'::jsonb);
    insert into resultado values ('3 nombre repetido rechazado', false, 'entró igual');
  exception when unique_violation then
    insert into resultado values ('3 nombre repetido rechazado', true, null);
  end;

  -- 3b. El mismo nombre en OTRA pantalla sí entra: son listas distintas
  begin
    insert into public.vistas_filtro (org_id, pantalla, nombre, filtro)
    values (org, 'informes', 'Prueba 040', '{}'::jsonb);
    insert into resultado values ('3b mismo nombre en otra pantalla entra', true, null);
  exception when others then
    insert into resultado values ('3b mismo nombre en otra pantalla entra', false, sqlerrm);
  end;

  /* 4. `updated_at` se mueve solo al actualizar.

     NO se compara contra `created_at`: dentro de una transacción `now()`
     devuelve siempre la hora en que la transacción empezó, así que insertar y
     actualizar dan la MISMA marca y la prueba saldría roja con el disparador
     funcionando (pasó el 2026-10-08). Se siembra una fecha vieja a mano y se
     comprueba que el disparador la pisa. */
  insert into public.vistas_filtro (org_id, pantalla, nombre, filtro, updated_at)
  values (org, 'empleados', 'Prueba 040 marca', '{}'::jsonb, '2000-01-01T00:00:00Z');

  update public.vistas_filtro set nombre = 'Prueba 040 marca, renombrada'
   where org_id = org and pantalla = 'empleados' and nombre = 'Prueba 040 marca';

  insert into resultado
  select '4 updated_at lo pone el disparador',
         updated_at > '2001-01-01T00:00:00Z'::timestamptz,
         updated_at::text
    from public.vistas_filtro
   where org_id = org and pantalla = 'empleados' and nombre = 'Prueba 040 marca, renombrada';

  update public.vistas_filtro set nombre = 'Prueba 040 renombrada'
   where org_id = org and pantalla = 'rendiciones' and nombre = 'Prueba 040';

  -- 5. La migración NO sembró vistas: las siembra cada pantalla en su tarea
  insert into resultado
  select '5 la migración no siembra',
         not exists (select 1 from public.vistas_filtro where de_fabrica),
         (select count(*)::text || ' de fábrica' from public.vistas_filtro where de_fabrica);

  err := null;
end $$;

-- ── RLS: quién puede qué ────────────────────────────────────────────────────
--
-- Se prueba con personas REALES de la base: un admin y alguien que no lo es,
-- de la misma organización. Sin una de las dos, la prueba sale «no concluyente»
-- en vez de verde — una prueba que no se ejercitó no es una prueba que pasó.

-- Todo lo que se mide con otro rol puesto se guarda en variables y se escribe
-- en `resultado` DESPUÉS de soltarlo: `authenticated` no puede escribir en una
-- tabla temporal que creó el dueño de la sesión, y el intento aborta la
-- transacción entera (visto el 2026-10-08).

do $$
declare
  org        uuid;
  un_admin   uuid;
  no_admin   uuid;
  otra_org   uuid;
  n          int;
  vista_id   uuid;
  n_lee      int;
  n_upd      int;
  n_del      int;
  ins_bloqueado boolean;
  n_admin_upd int;
  cruce_bloqueado boolean;
begin
  select id into org from public.organizations limit 1;

  select id into un_admin from public.users
   where org_id = org and role = 'admin' and deleted_at is null and blocked_at is null limit 1;
  select id into no_admin from public.users
   where org_id = org and role <> 'admin' and deleted_at is null and blocked_at is null limit 1;
  select id into otra_org from public.organizations where id <> org limit 1;

  insert into public.vistas_filtro (org_id, pantalla, nombre, filtro)
  values (org, 'auditoria', 'Prueba RLS 040', '{}'::jsonb)
  returning id into vista_id;

  if no_admin is null then
    insert into resultado values ('6 no-admin lee', null, 'no concluyente: no hay no-admin en la org');
    insert into resultado values ('7 no-admin no escribe', null, 'no concluyente: no hay no-admin en la org');
  else
    perform set_config('request.jwt.claims',
      json_build_object('sub', no_admin, 'role', 'authenticated')::text, true);
    execute 'set local role authenticated';

    -- 6. El no-admin LEE las vistas de su organización
    select count(*) into n_lee from public.vistas_filtro where id = vista_id;

    -- 7. El no-admin NO escribe. Sin política de escritura, Postgres no da
    --    error: afecta 0 filas y el cliente ve «éxito». Por eso se cuenta.
    update public.vistas_filtro set nombre = 'secuestrada' where id = vista_id;
    get diagnostics n_upd = row_count;

    delete from public.vistas_filtro where id = vista_id;
    get diagnostics n_del = row_count;

    begin
      insert into public.vistas_filtro (org_id, pantalla, nombre, filtro)
      values (org, 'auditoria', 'Creada por un no-admin', '{}'::jsonb);
      ins_bloqueado := false;
    exception when others then
      ins_bloqueado := true;
    end;

    execute 'reset role';
    perform set_config('request.jwt.claims', '{}', true);

    insert into resultado values ('6 no-admin lee', n_lee = 1, n_lee::text || ' filas visibles');
    insert into resultado values ('7a no-admin no actualiza', n_upd = 0, n_upd::text || ' filas tocadas');
    insert into resultado values ('7b no-admin no borra', n_del = 0, n_del::text || ' filas borradas');
    insert into resultado values ('7c no-admin no inserta', ins_bloqueado, null);
  end if;

  -- 8. El admin SÍ escribe en su organización
  if un_admin is null then
    insert into resultado values ('8 admin escribe', null, 'no concluyente: no hay admin en la org');
  else
    perform set_config('request.jwt.claims',
      json_build_object('sub', un_admin, 'role', 'authenticated')::text, true);
    execute 'set local role authenticated';

    update public.vistas_filtro set orden = 7 where id = vista_id;
    get diagnostics n_admin_upd = row_count;

    -- 9. Y NO en la de otra organización: el org_id viene del navegador
    if otra_org is not null then
      begin
        insert into public.vistas_filtro (org_id, pantalla, nombre, filtro)
        values (otra_org, 'auditoria', 'Cruzada', '{}'::jsonb);
        cruce_bloqueado := false;
      exception when others then
        cruce_bloqueado := true;
      end;
    end if;

    execute 'reset role';
    perform set_config('request.jwt.claims', '{}', true);

    insert into resultado values ('8 admin actualiza la suya', n_admin_upd = 1,
                                  n_admin_upd::text || ' filas tocadas');
    if otra_org is null then
      insert into resultado values ('9 admin no cruza de organización', null,
                                    'no concluyente: hay una sola organización');
    else
      insert into resultado values ('9 admin no cruza de organización', cruce_bloqueado, null);
    end if;
  end if;

  n := null;
end $$;

select prueba,
       case when ok is null then 'no concluyente' when ok then 'ok' else 'ROTA' end as resultado,
       detalle
  from resultado
 order by prueba;

rollback;
