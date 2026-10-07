-- Pruebas de la 039. Correrlas dentro del ensayo (sin este begin/rollback) o
-- después de aplicarla. ok = false es una regla rota.
--
-- El resultado sale en una tabla (el `select` del final), no en avisos:
-- `execute_sql` del MCP no muestra los NOTICE.

begin;

create temp table resultado (prueba text, ok boolean, detalle text) on commit drop;

-- 1. La tabla existe, con el número único por organización
insert into resultado
select '1 proyectos existe', to_regclass('public.proyectos') is not null, null;

insert into resultado
select '1b numero unico por org',
       exists (select 1 from pg_constraint where conname = 'proyectos_numero_por_org'),
       null;

-- 2. Las columnas nuevas están donde deben
insert into resultado
select '2 ' || t || '.' || c,
       exists (select 1 from information_schema.columns
                where table_schema = 'public' and table_name = t and column_name = c),
       null
from (values
  ('users','es_jefe_proyecto'), ('users','umbral_n2_clp'),
  ('organizations','aprobador_defecto_id'), ('organizations','aprobador_n2_defecto_id'),
  ('organizations','umbral_n2_clp'),
  ('expense_reports','proyecto_id'), ('expense_reports','cadena_l1_id'),
  ('expense_reports','cadena_l2_id'), ('expense_reports','cadena_fijada_at'),
  ('petty_cash_funds','proyecto_id'), ('petty_cash_funds','cadena_l1_id'),
  ('petty_cash_funds','liq_cadena_l1_id'), ('petty_cash_funds','liq_cadena_l2_id'),
  ('petty_cash_funds','liq_cadena_fijada_at')
) as x(t, c);

-- 3. Ningún documento abierto quedó sin cadena congelada. Es lo que evita que
--    alguien quede esperando a nadie el día del despliegue.
insert into resultado
select '3 rendiciones abiertas con cadena',
       not exists (select 1 from public.expense_reports
                    where deleted_at is null
                      and status in ('submitted','pending_l2')
                      and cadena_fijada_at is null),
       (select count(*)::text || ' sin cadena' from public.expense_reports
         where deleted_at is null and status in ('submitted','pending_l2')
           and cadena_fijada_at is null);

insert into resultado
select '3b fondos abiertos con cadena',
       not exists (select 1 from public.petty_cash_funds
                    where deleted_at is null
                      and status in ('pending_approval','pending_approval_l2')
                      and cadena_fijada_at is null),
       null;

insert into resultado
select '3c liquidaciones abiertas con cadena',
       not exists (select 1 from public.petty_cash_funds
                    where deleted_at is null
                      and status in ('pending_liquidation_approval','pending_liquidation_l2')
                      and liq_cadena_fijada_at is null),
       null;

-- 4. Las cerradas NO se tocaron: rellenarlas sería ruido
insert into resultado
select '4 cerradas sin cadena',
       not exists (select 1 from public.expense_reports
                    where status in ('reimbursed','rejected') and cadena_fijada_at is not null),
       null;

-- 5. RLS encendida y con las dos políticas
insert into resultado
select '5 proyectos con RLS',
       (select relrowsecurity from pg_class where oid = 'public.proyectos'::regclass),
       null;

insert into resultado
select '5b politicas de proyectos',
       (select count(*) = 2 from pg_policies
         where schemaname = 'public' and tablename = 'proyectos'),
       (select string_agg(policyname, ', ') from pg_policies
         where schemaname = 'public' and tablename = 'proyectos');

-- 6. El default de es_jefe_proyecto es false: nadie se vuelve jefe por la migración
insert into resultado
select '6 nadie quedó como jefe de proyecto',
       not exists (select 1 from public.users where es_jefe_proyecto),
       null;

select * from resultado order by prueba;

rollback;
