-- Devuelve a la papelera los documentos de ejemplo del manual, apenas terminan
-- las capturas. Mientras están vivos aparecen en los informes, en Fondos por
-- Rendir y en la bandeja de Daniel, así que no se dejan afuera ni un día.
update expense_reports set deleted_at = now()
 where id in ('aaaa0001-0000-4000-8000-000000000001',
              'aaaa0001-0000-4000-8000-000000000002',
              'aaaa0001-0000-4000-8000-000000000004',
              'aaaa0001-0000-4000-8000-000000000005')
   and deleted_at is null;
update petty_cash_funds set deleted_at = now()
 where id = 'bbbb0001-0000-4000-8000-000000000001' and deleted_at is null;

select id, title, status, deleted_at from expense_reports where id::text like 'aaaa0001%'
union all
select id, name, status, deleted_at from petty_cash_funds where id::text like 'bbbb0001%';
