-- Pruebas de la 042. Correrlas dentro del ensayo (sin este begin/rollback) o
-- después de aplicarla. ok = false es una regla rota.
--
-- Lo que hay que comprobar no es que la columna exista, sino que el respaldo
-- SIGA SIENDO VISIBLE: la única política que quedó tras la 037 se apoya en
-- `fund_id`, así que un comprobante colgado solo de `transfer_id` sería
-- invisible para todo el mundo y nadie se enteraría hasta producción.

begin;

create temp table resultado (prueba text, ok boolean, detalle text) on commit drop;

insert into resultado
select '1 la columna transfer_id existe y es nullable',
       (select is_nullable = 'YES' from information_schema.columns
         where table_schema = 'public' and table_name = 'approval_attachments'
           and column_name = 'transfer_id'),
       null;

insert into resultado
select '2 apunta a petty_cash_transfers y cae con ella',
       exists (
         select 1
         from pg_constraint c
         join pg_class  t on t.oid = c.confrelid
         where c.conrelid = 'public.approval_attachments'::regclass
           and c.contype = 'f'
           and t.relname = 'petty_cash_transfers'
           and c.confdeltype = 'c'   -- cascade
       ),
       null;

insert into resultado
select '3 el CHECK de un solo documento no cambió',
       pg_get_constraintdef(oid) like '%report_id%' and pg_get_constraintdef(oid) like '%fund_id%',
       pg_get_constraintdef(oid)
from pg_constraint
where conrelid = 'public.approval_attachments'::regclass and conname = 'chk_one_target';

do $$
declare
  org   uuid;
  usr   uuid;
  fondo uuid;
  tr    uuid;
  att   uuid;
  err   text;
  n     int;
begin
  select id, org_id into usr, org from users where blocked_at is null limit 1;

  -- period_start / period_end son NOT NULL
  insert into petty_cash_funds (org_id, name, employee_id, manager_id, amount_requested,
                                period_start, period_end, status)
  values (org, 'FONDO DE PRUEBA 042', usr, usr, 1000,
          current_date, current_date, 'settled')
  returning id into fondo;

  insert into petty_cash_transfers (fund_id, type, amount, transferred_at, registered_by)
  values (fondo, 'reimbursement_from_employee', 1000, current_date, usr)
  returning id into tr;

  -- 4 ── Un comprobante con las dos: fund_id (la RLS) y transfer_id (el vínculo)
  begin
    insert into approval_attachments (org_id, fund_id, transfer_id, uploaded_by, storage_path, filename)
    values (org, fondo, tr, usr, org || '/' || fondo || '/prueba.png', 'prueba.png')
    returning id into att;
    insert into resultado values ('4 entra con fund_id y transfer_id juntos', true, null);
  exception when others then
    err := sqlerrm;
    insert into resultado values ('4 entra con fund_id y transfer_id juntos', false, err);
  end;

  -- 5 ── Sin fund_id NO entra: el CHECK de un solo documento sigue mandando, y
  --      es lo que impide dejar un respaldo invisible para la RLS
  begin
    insert into approval_attachments (org_id, transfer_id, uploaded_by, storage_path, filename)
    values (org, tr, usr, org || '/x/suelto.png', 'suelto.png');
    insert into resultado values ('5 sin fund_id sigue sin entrar', false, 'entro y no debia');
  exception when check_violation then
    insert into resultado values ('5 sin fund_id sigue sin entrar', true, null);
  when others then
    err := sqlerrm;
    insert into resultado values ('5 sin fund_id sigue sin entrar', false, err);
  end;

  -- 6 ── Un respaldo SIN transferencia sigue entrando igual que siempre
  begin
    insert into approval_attachments (org_id, fund_id, uploaded_by, storage_path, filename)
    values (org, fondo, usr, org || '/' || fondo || '/respaldo.pdf', 'respaldo.pdf');
    insert into resultado values ('6 un respaldo sin transferencia no cambió', true, null);
  exception when others then
    err := sqlerrm;
    insert into resultado values ('6 un respaldo sin transferencia no cambió', false, err);
  end;

  -- 7 ── Borrar la transferencia se lleva su comprobante (cascade), y no el
  --      respaldo general del fondo
  delete from petty_cash_transfers where id = tr;
  select count(*) into n from approval_attachments where fund_id = fondo;
  insert into resultado
  select '7 al borrar la transferencia cae solo su comprobante', n = 1, 'quedan ' || n;

  -- 8 ── Borrar el fondo se lleva todo lo suyo
  delete from petty_cash_funds where id = fondo;
  select count(*) into n from approval_attachments where fund_id = fondo;
  insert into resultado
  select '8 al borrar el fondo caen sus respaldos', n = 0, 'quedan ' || n;
end $$;

select * from resultado order by prueba;

rollback;
