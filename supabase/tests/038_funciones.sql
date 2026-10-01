-- Pruebas de la 038. Correrlas dentro del ensayo (sin este begin/rollback) o
-- después de aplicarla. ok = false es una protección rota.
--
-- A diferencia de las de la 033, la 035 y la 037, estas no abren sesiones ni
-- intentan escrituras: lo que la 038 cambia son los permisos de EXECUTE, y eso
-- se lee directo del catálogo con has_function_privilege(). Por eso alcanza con
-- consultar pg_proc.
--
-- El resultado sale en una tabla (el `select` del final), no en avisos:
-- `execute_sql` no muestra los NOTICE.
--
-- Las pruebas 1 y 2 recorren pg_proc en vez de nombrar las funciones una por
-- una: así una función nueva que alguien agregue mañana con SECURITY DEFINER
-- —o un disparador nuevo— aparece sola como ok = false, sin que haya que
-- acordarse de sumarla acá.
begin;

create temp table resultado (prueba text, ok boolean, detalle text) on commit drop;

-- 1. anon no ejecuta ninguna función SECURITY DEFINER de public
insert into resultado
select '1 anon sin ' || p.proname, not has_function_privilege('anon', p.oid, 'EXECUTE'), null
from pg_proc p
where p.pronamespace = 'public'::regnamespace and p.prosecdef;

-- 2. Nadie con sesión llama directo a un disparador
insert into resultado
select '2 authenticated sin ' || p.proname, not has_function_privilege('authenticated', p.oid, 'EXECUTE'), null
from pg_proc p
where p.pronamespace = 'public'::regnamespace and p.prorettype = 'trigger'::regtype;

-- 3. Control positivo: las cuatro que evalúan las políticas siguen disponibles.
--    Sin esta prueba, un `revoke` de más dejaría la app sin poder leer nada y
--    las pruebas 1 y 2 igual darían verde.
insert into resultado
select '3 authenticated con ' || f, has_function_privilege('authenticated', f, 'EXECUTE'), null
from unnest(array['public.is_admin()', 'public.get_my_org_id()',
                  'public.es_aprobador_de(uuid)', 'public.es_operador_bancario()']) f;

-- 4. set_updated_at con search_path fijo
insert into resultado
select '4 search_path de set_updated_at',
       exists (select 1 from unnest(coalesce(p.proconfig, '{}')) c where c like 'search_path=%'),
       p.proconfig::text
from pg_proc p
where p.oid = 'public.set_updated_at()'::regprocedure;

select * from resultado order by prueba;
rollback;
