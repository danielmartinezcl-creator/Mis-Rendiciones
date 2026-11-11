-- 044 — Las categorías globales pasan a ser de la organización.
--
-- Las 10 categorías de fábrica (Alimentación, Alojamiento, Combustible…) tienen
-- `org_id` null: son de TODAS las organizaciones. Ni la RLS ni las acciones del
-- servidor dejan que un admin las cambie —sería cambiárselas a todos los
-- clientes—, así que renombrar «Alimentación» respondía éxito y no guardaba nada
-- (2026-11-10, tres intentos de Daniel en la auditoría).
--
-- Con una sola organización, «global» no le sirve a nadie: las 10 pasan a ser de
-- PENTA y se editan como las otras 9. Los gastos no se tocan, porque apuntan a la
-- categoría por su id y el id no cambia.
--
-- Si un día hay un segundo cliente, sus categorías se le copian al darlo de alta.
-- Por eso la migración se niega a correr con más de una organización: ahí no
-- habría a quién dárselas sin quitárselas a los demás.
--
-- Pruebas: supabase/tests/044_categorias.sql

do $$
declare n int;
begin
  select count(*) into n from organizations;
  if n <> 1 then
    raise exception '044: hay % organizaciones; las categorías globales no se pueden asignar a una sola', n;
  end if;
end $$;

update expense_categories
   set org_id = (select id from organizations)
 where org_id is null;
