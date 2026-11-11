-- Pruebas de la 044. Correrlas dentro del ensayo (sin este begin/rollback) o
-- después de aplicarla. ok = false es una regla rota.

begin;

create temp table resultado (prueba text, ok boolean, detalle text) on commit drop;

insert into resultado
select '1 no queda ninguna categoría global',
       (select count(*) from expense_categories where org_id is null) = 0,
       (select count(*) from expense_categories where org_id is null)::text;

insert into resultado
select '2 siguen siendo 19: no se creó ni se perdió ninguna',
       (select count(*) from expense_categories) = 19,
       (select count(*) from expense_categories)::text;

-- Los gastos apuntan por id: ninguno puede haber quedado sin su categoría
insert into resultado
select '3 ningún gasto quedó apuntando a una categoría inexistente',
       not exists (select 1 from expense_items i
                    where i.category_id is not null
                      and not exists (select 1 from expense_categories c where c.id = i.category_id))
   and not exists (select 1 from petty_cash_items i
                    where i.category_id is not null
                      and not exists (select 1 from expense_categories c where c.id = i.category_id)),
       null;

-- Lo que la pantalla no podía hacer: el UPDATE de la acción, con su mismo filtro
insert into resultado
select '4 el filtro de la acción ahora encuentra «Alimentación»',
       (select count(*) from expense_categories
         where id = 'c2795ec4-2074-4728-a85a-0654bd4804b4'
           and org_id = (select id from organizations)) = 1,
       null;

insert into resultado
select '5 los códigos de Defontana siguen donde estaban',
       (select defontana_account_code from expense_categories
         where id = 'c2795ec4-2074-4728-a85a-0654bd4804b4') = '4.5.1030.10.18',
       null;

select * from resultado order by prueba;

rollback;
