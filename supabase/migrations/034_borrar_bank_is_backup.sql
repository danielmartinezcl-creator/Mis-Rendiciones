-- Borra la suplencia bancaria vieja (un solo interruptor por persona).
-- La 032 la reemplazó por bank_load_backup / bank_auth_backup y copió los valores.
--
-- APLICAR SOLO CUANDO EL CÓDIGO NUEVO LLEVE UN TIEMPO ESTABLE EN PRODUCCIÓN, y
-- nunca junto con la 033. El código anterior a los permisos por asignación lee
-- esta columna: si hubiera que volver atrás con un rollback instantáneo de
-- Vercel, ese código fallaría en cada consulta de usuarios. Mientras la columna
-- exista, el rollback es seguro. Una vez aplicada, volver al código viejo exige
-- recrearla (alter table public.users add column bank_is_backup boolean not null
-- default false) y copiarla desde bank_load_backup.
--
-- Antes de aplicarla: `git grep bank_is_backup -- src` no debe devolver nada.

alter table public.users drop column bank_is_backup;
