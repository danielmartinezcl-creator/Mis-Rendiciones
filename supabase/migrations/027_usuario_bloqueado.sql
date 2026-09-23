-- Un empleado «eliminado definitivamente» queda bloqueado, no borrado.
--
-- Borrar la cuenta de verdad no era posible: `audit_log.actor_id` apunta a
-- `users` con ON DELETE SET NULL, y `audit_log` tiene la regla
-- `no_update_audit_log` (DO INSTEAD NOTHING). El SET NULL de la cascada choca
-- contra esa regla y Postgres aborta con «referential integrity query ... gave
-- unexpected result». Cualquier usuario que alguna vez hizo algo es imborrable
-- — y está bien que lo sea: su historial es evidencia.
--
-- Entonces «eliminar definitivamente» desde la papelera marca `blocked_at`:
-- sale de la papelera, la cuenta de auth sigue baneada, el historial queda
-- intacto y solo un admin puede habilitarlo desde la nómina. Se distingue de
-- `is_active = false` (inactivo), que es una pausa sin bloqueo de acceso.

alter table public.users add column blocked_at timestamptz;
