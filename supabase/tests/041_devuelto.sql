-- Pruebas de la 041. Correrlas dentro del ensayo (sin este begin/rollback) o
-- después de aplicarla. ok = false es una regla rota.
--
-- El resultado sale en una tabla (el `select` del final), no en avisos:
-- `execute_sql` del MCP no muestra los NOTICE.

begin;

create temp table resultado (prueba text, ok boolean, detalle text) on commit drop;

do $$
declare
  org  uuid;
  usr  uuid;
  err  text;
begin
  select id into org from organizations limit 1;
  select id into usr from users where org_id = org limit 1;

  -- 1 ── El tipo nuevo entra
  begin
    insert into notifications (org_id, user_id, type, read)
    values (org, usr, 'returned', false);
    insert into resultado values ('1 el tipo returned entra', true, null);
  exception when others then
    err := sqlerrm;
    insert into resultado values ('1 el tipo returned entra', false, err);
  end;

  -- 2 ── Los tipos de siempre siguen entrando (la 041 reescribe el CHECK
  --      entero: si se olvidara uno, los avisos de ese tipo dejarían de
  --      guardarse y nadie se enteraría hasta que pasara en producción)
  begin
    insert into notifications (org_id, user_id, type, read)
    select org, usr, t, false
    from unnest(array['submission','approval','rejection','reimbursement',
                      'bank_load','bank_auth','funds_sent','config_missing',
                      'reminder']) as t;
    insert into resultado values ('2 los 9 tipos anteriores siguen entrando', true, null);
  exception when others then
    err := sqlerrm;
    insert into resultado values ('2 los 9 tipos anteriores siguen entrando', false, err);
  end;

  -- 3 ── Un tipo inventado sigue rechazado: el CHECK tiene que seguir
  --      cerrando, no quedar abierto por reescribirlo
  begin
    insert into notifications (org_id, user_id, type, read)
    values (org, usr, 'devuelto', false);
    insert into resultado values ('3 un tipo inventado sigue rechazado', false, 'entró y no debía');
  exception when check_violation then
    insert into resultado values ('3 un tipo inventado sigue rechazado', true, null);
  when others then
    err := sqlerrm;
    insert into resultado values ('3 un tipo inventado sigue rechazado', false, err);
  end;

  -- 4 ── El viejo `reminder_draft`, que nunca existió, sigue afuera
  begin
    insert into notifications (org_id, user_id, type, read)
    values (org, usr, 'reminder_draft', false);
    insert into resultado values ('4 reminder_draft sigue rechazado', false, 'entró y no debía');
  exception when check_violation then
    insert into resultado values ('4 reminder_draft sigue rechazado', true, null);
  when others then
    err := sqlerrm;
    insert into resultado values ('4 reminder_draft sigue rechazado', false, err);
  end;
end $$;

-- 5 ── El CHECK nombra exactamente los diez tipos, y es el espejo de
--      `TEXTOS` en src/lib/notificaciones.ts y de `TIPOS` en su prueba
insert into resultado
select '5 el CHECK nombra los 10 tipos',
       (select count(*) from unnest(array['submission','approval','rejection',
          'reimbursement','bank_load','bank_auth','funds_sent','config_missing',
          'reminder','returned']) as t
         where pg_get_constraintdef(con.oid) like '%''' || t || '''%') = 10,
       pg_get_constraintdef(con.oid)
from pg_constraint con
where con.conrelid = 'public.notifications'::regclass
  and con.conname = 'notifications_type_check';

select * from resultado order by prueba;

rollback;
