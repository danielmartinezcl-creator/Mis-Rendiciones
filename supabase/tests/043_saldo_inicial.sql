-- Pruebas de la 043. Correrlas dentro del ensayo (sin este begin/rollback) o
-- después de aplicarla. ok = false es una regla rota.

begin;

create temp table resultado (prueba text, ok boolean, detalle text) on commit drop;

insert into resultado
select '1 users.saldo_inicial_fxr_clp existe y es nullable',
       (select is_nullable = 'YES' from information_schema.columns
         where table_schema='public' and table_name='users' and column_name='saldo_inicial_fxr_clp'), null;

insert into resultado
select '2 organizations.fxr_fecha_corte existe y es nullable',
       (select is_nullable = 'YES' from information_schema.columns
         where table_schema='public' and table_name='organizations' and column_name='fxr_fecha_corte'), null;

-- Nadie puede quedar con un saldo inventado: hasta que la contabilidad los
-- pase, la columna tiene que estar vacía para todos.
insert into resultado
select '3 arrancan en NULL para todos',
       (select count(*) from users where saldo_inicial_fxr_clp is not null) = 0, null;

do $$
declare org uuid; usr uuid; err text; v numeric;
begin
  select id, org_id into usr, org from users where blocked_at is null limit 1;

  -- Un saldo ACREEDOR es Fondos por Rendir igual que uno deudor: la cuenta se
  -- define por el origen de la transacción, no por el signo (Daniel).
  begin
    update users set saldo_inicial_fxr_clp = -171701 where id = usr;
    select saldo_inicial_fxr_clp into v from users where id = usr;
    insert into resultado values ('4 acepta un saldo ACREEDOR (negativo)', v = -171701, 'quedó ' || v);
  exception when others then
    err := sqlerrm; insert into resultado values ('4 acepta un saldo ACREEDOR (negativo)', false, err);
  end;

  begin
    update users set saldo_inicial_fxr_clp = 1234567.89 where id = usr;
    select saldo_inicial_fxr_clp into v from users where id = usr;
    insert into resultado values ('5 conserva los decimales', v = 1234567.89, 'quedó ' || v);
  exception when others then
    err := sqlerrm; insert into resultado values ('5 conserva los decimales', false, err);
  end;

  begin
    update organizations set fxr_fecha_corte = date '2025-11-30' where id = org;
    insert into resultado values ('6 la fecha de corte entra', true, null);
  exception when others then
    err := sqlerrm; insert into resultado values ('6 la fecha de corte entra', false, err);
  end;

  begin
    update users set saldo_inicial_fxr_clp = null where id = usr;
    select saldo_inicial_fxr_clp into v from users where id = usr;
    insert into resultado values ('7 se puede dejar sin cargar otra vez', v is null, null);
  exception when others then
    err := sqlerrm; insert into resultado values ('7 se puede dejar sin cargar otra vez', false, err);
  end;
end $$;

select * from resultado order by prueba;

rollback;
