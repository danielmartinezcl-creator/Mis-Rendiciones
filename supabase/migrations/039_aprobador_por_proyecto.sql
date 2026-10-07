-- 039 — El aprobador sale del proyecto, y la cadena se congela en el documento.
--
-- Hasta acá la cadena se calculaba EN VIVO desde `users.approver_l1_id` cada vez
-- que alguien abría un documento. Con aprobadores fijos casi no se notaba; con
-- jefes de proyecto que rotan sería grave: reasignar un jefe movería las
-- aprobaciones que están pendientes, y un documento ya aprobado quedaría con un
-- historial que no coincide con su cadena actual.
--
-- Esta migración es ADITIVA y toda columna nueva es nullable, así que se aplica
-- ANTES del despliegue sin romper nada: ningún código que hoy corre en producción
-- lee estas columnas. Es al revés que la 033, la 035 y la 037, que protegían y
-- tenían que ir después.
--
-- Spec: docs/superpowers/specs/2026-10-07-aprobador-por-proyecto-design.md
-- Plan: docs/superpowers/plans/2026-10-07-aprobador-por-proyecto.md
-- Pruebas: supabase/tests/039_proyectos.sql

-- ── 1. El catálogo de proyectos ──────────────────────────────────────────────
-- Se puebla SOLO con el uso: la primera vez que alguien rinde al 2991 le pone
-- nombre y jefe, y desde ahí los demás lo encuentran escrito igual. No hay alta
-- manual en ninguna pantalla, a propósito: con 150 obras activas y 50 nuevas por
-- año, un catálogo que hay que cargar a mano envejece más rápido de lo que se
-- mantiene.

create table if not exists public.proyectos (
  id         uuid primary key default gen_random_uuid(),
  org_id     uuid not null references public.organizations(id) on delete cascade,
  -- El número es lo que identifica a la obra. El nombre es ayuda para el humano.
  numero     text not null,
  nombre     text,
  -- El N1 que se sugiere. Se guarda el último usado: apartarse de la sugerencia
  -- es la señal de que la obra cambió de manos.
  jefe_id    uuid references public.users(id) on delete set null,
  activo     boolean not null default true,
  creado_por uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint proyectos_numero_por_org unique (org_id, numero)
);

create index if not exists proyectos_org_activo_idx on public.proyectos (org_id, activo);

alter table public.proyectos enable row level security;

-- Ver: cualquiera de la organización. El empleado necesita el autocompletado.
drop policy if exists proyectos_leer on public.proyectos;
create policy proyectos_leer on public.proyectos
  for select using (org_id = public.get_my_org_id());

-- Escribir con sesión: solo el admin, para corregir un nombre o cambiar el jefe.
-- El alta la hace el servidor con la llave de servicio, que no pasa por RLS.
drop policy if exists proyectos_admin on public.proyectos;
create policy proyectos_admin on public.proyectos
  for all using (org_id = public.get_my_org_id() and public.is_admin())
  with check (org_id = public.get_my_org_id() and public.is_admin());

drop trigger if exists proyectos_updated_at on public.proyectos;
create trigger proyectos_updated_at before update on public.proyectos
  for each row execute function public.set_updated_at();

-- ── 2. Personas ──────────────────────────────────────────────────────────────
-- `es_jefe_proyecto` decide quién aparece en la lista que ve el empleado: nunca
-- los 57. `umbral_n2_clp` en null significa «hereda el de la organización».
alter table public.users
  add column if not exists es_jefe_proyecto boolean not null default false,
  add column if not exists umbral_n2_clp    numeric;

-- ── 3. Organización ──────────────────────────────────────────────────────────
-- Lo que cubre a todos sin tocar fichas. Hoy 50 de 57 empleados no tienen N1 y
-- por eso no pueden enviar nada: el aprobador por defecto cierra ese agujero.
alter table public.organizations
  add column if not exists aprobador_defecto_id    uuid references public.users(id) on delete set null,
  add column if not exists aprobador_n2_defecto_id uuid references public.users(id) on delete set null,
  add column if not exists umbral_n2_clp           numeric;

-- ── 4. La cadena congelada, en cada documento ────────────────────────────────
-- Van como columnas y no en una tabla aparte: la relación es 1 a 1 con el
-- documento, y una tabla obligaría a un join en cada lectura de permisos, que es
-- la consulta más caliente del sistema.
alter table public.expense_reports
  add column if not exists proyecto_id      uuid references public.proyectos(id) on delete set null,
  add column if not exists cadena_l1_id     uuid references public.users(id) on delete set null,
  add column if not exists cadena_l2_id     uuid references public.users(id) on delete set null,
  add column if not exists cadena_fijada_at timestamptz;

-- El fondo y su liquidación son DOS documentos —`tipoDeFondo()` ya los trata
-- así— y cada uno congela su propia cadena al enviarse. La de la liquidación se
-- calcula sobre lo GASTADO, que es lo que cierra el agujero de pedir poco para
-- no escalar y después gastar de más.
alter table public.petty_cash_funds
  add column if not exists proyecto_id          uuid references public.proyectos(id) on delete set null,
  add column if not exists cadena_l1_id         uuid references public.users(id) on delete set null,
  add column if not exists cadena_l2_id         uuid references public.users(id) on delete set null,
  add column if not exists cadena_fijada_at     timestamptz,
  add column if not exists liq_cadena_l1_id     uuid references public.users(id) on delete set null,
  add column if not exists liq_cadena_l2_id     uuid references public.users(id) on delete set null,
  add column if not exists liq_cadena_fijada_at timestamptz;

-- ── 5. Relleno ───────────────────────────────────────────────────────────────
-- Los documentos que TODAVÍA ESPERAN DECISIÓN se congelan con la cadena actual
-- de su beneficiario, para que nadie quede esperando a una persona distinta de
-- la que venía esperando ayer. Los cerrados quedan en null: ya no se evalúan, y
-- rellenarlos solo agregaría ruido al historial.

update public.expense_reports r
set cadena_l1_id     = u.approver_l1_id,
    cadena_l2_id     = u.approver_l2_id,
    cadena_fijada_at = coalesce(r.submitted_at, now())
from public.users u
where u.id = r.submitter_id
  and r.deleted_at is null
  and r.status in ('submitted', 'pending_l2')
  and r.cadena_fijada_at is null;

update public.petty_cash_funds f
set cadena_l1_id     = u.approver_l1_id,
    cadena_l2_id     = u.approver_l2_id,
    cadena_fijada_at = now()
from public.users u
where u.id = f.employee_id
  and f.deleted_at is null
  and f.status in ('pending_approval', 'pending_approval_l2')
  and f.cadena_fijada_at is null;

update public.petty_cash_funds f
set liq_cadena_l1_id     = u.approver_l1_id,
    liq_cadena_l2_id     = u.approver_l2_id,
    liq_cadena_fijada_at = now()
from public.users u
where u.id = f.employee_id
  and f.deleted_at is null
  and f.status in ('pending_liquidation_approval', 'pending_liquidation_l2')
  and f.liq_cadena_fijada_at is null;
