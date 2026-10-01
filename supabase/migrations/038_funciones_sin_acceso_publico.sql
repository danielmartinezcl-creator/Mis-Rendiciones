-- 038 · Funciones SECURITY DEFINER sin acceso público (avisos 0028, 0029 y 0011
-- de get_advisors, 2026-09-28). Todas eran ejecutables por anon y authenticated
-- vía /rest/v1/rpc.
--   · Disparadores: nadie necesita EXECUTE para que disparen. Postgres lo
--     verifica al CREAR el disparador, no cada vez que corre.
--   · Las cuatro que usan las políticas RLS: las necesita authenticated (una
--     política se evalúa con el rol de quien consulta). anon no: ninguna ruta sin
--     sesión consulta tablas (/login, /set-password y /api/auth usan solo Auth;
--     /api/cron usa la llave de servicio).
-- Efecto para anon: una consulta a una tabla con esas políticas pasa de «0 filas»
-- a «permission denied for function». Es lo buscado.
--
-- Lo que de verdad cierra el acceso es el `revoke ... from public`: anon y
-- authenticated no tienen un grant propio, heredan el EXECUTE que Postgres le da
-- a PUBLIC por omisión en cada función. Se nombran igual por claridad y para que
-- quede explícito si alguien les concede uno directo más adelante.
--
-- Inventario verificado contra pg_proc el 2026-10-01, antes de escribir esto:
-- 12 funciones SECURITY DEFINER (8 de disparador + las 4 de abajo), todas con
-- search_path=public ya fijado, y set_updated_at sin SECURITY DEFINER y sin
-- search_path. Coincide con lo medido el 2026-09-28.

revoke execute on function public.borrar_rendicion_con_aprobaciones() from public, anon, authenticated;
revoke execute on function public.invalidar_analisis_ia()             from public, anon, authenticated;
revoke execute on function public.proteger_aprobaciones()             from public, anon, authenticated;
revoke execute on function public.proteger_documento_item()           from public, anon, authenticated;
revoke execute on function public.proteger_estado_fondo()             from public, anon, authenticated;
revoke execute on function public.proteger_estado_item()              from public, anon, authenticated;
revoke execute on function public.proteger_estado_rendicion()         from public, anon, authenticated;
revoke execute on function public.proteger_historial_fondos()         from public, anon, authenticated;
revoke execute on function public.set_updated_at()                    from public, anon, authenticated;

revoke execute on function public.is_admin()             from public, anon;
revoke execute on function public.get_my_org_id()        from public, anon;
revoke execute on function public.es_aprobador_de(uuid)  from public, anon;
revoke execute on function public.es_operador_bancario() from public, anon;
grant  execute on function public.is_admin()             to authenticated, service_role;
grant  execute on function public.get_my_org_id()        to authenticated, service_role;
grant  execute on function public.es_aprobador_de(uuid)  to authenticated, service_role;
grant  execute on function public.es_operador_bancario() to authenticated, service_role;

-- set_updated_at es la única sin search_path fijo. Su cuerpo es
-- `new.updated_at = now(); return new;`: now() vive en pg_catalog, que está
-- siempre en el camino, así que con '' sigue funcionando. La usan 3 disparadores.
alter function public.set_updated_at() set search_path = '';
