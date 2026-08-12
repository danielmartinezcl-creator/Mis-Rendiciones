-- ============================================================
-- Migration 019: Security fixes (2026-08-12)
-- C-3, C-4, I-3, I-4
-- ============================================================

-- C-3: Habilitar RLS en rate_limit_log para que no sea accesible por PostgREST
-- El service role bypasea RLS automáticamente, así que el servidor puede seguir operando.
-- Sin ninguna policy, ningún rol authenticado/anon puede leer ni escribir.
alter table public.rate_limit_log enable row level security;

-- C-4: Eliminar policy de insert que aplica a PUBLIC (anon + authenticated).
-- El service role no necesita una policy de RLS para escribir (bypasea RLS).
-- Sin esta policy, sólo el service role puede insertar en audit_log.
drop policy if exists "service_role_insert_audit_log" on public.audit_log;

-- I-3: Agregar tabla notifications a la publicación de Supabase Realtime
-- Sin esto, el canal postgres_changes no recibe eventos nunca.
alter publication supabase_realtime add table public.notifications;

-- I-4: Reemplazar índice parcial por índice normal para que upsert onConflict funcione
-- El índice parcial (WHERE dedup_key IS NOT NULL) no es inferido por PostgreSQL
-- al resolver onConflict: 'org_id,dedup_key', lo que causa que el upsert falle.
drop index if exists idx_notifications_dedup;
create unique index idx_notifications_dedup on public.notifications(org_id, dedup_key);
