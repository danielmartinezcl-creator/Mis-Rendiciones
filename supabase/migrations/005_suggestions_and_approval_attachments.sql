-- ─────────────────────────────────────────────────────────────────────────────
-- Migración 005: Sugerencias + Adjuntos de Aprobación
-- ─────────────────────────────────────────────────────────────────────────────

-- ── Tabla: suggestions ────────────────────────────────────────────────────────

create table if not exists public.suggestions (
  id          uuid        primary key default gen_random_uuid(),
  org_id      uuid        not null references public.organizations(id),
  user_id     uuid        not null references public.users(id),
  content     text        not null check (char_length(content) >= 5 and char_length(content) <= 2000),
  category    text        not null default 'mejora'
                          check (category in ('mejora','error','consulta','otro')),
  status      text        not null default 'pending'
                          check (status in ('pending','reviewing','done','dismissed')),
  admin_notes text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index if not exists idx_suggestions_org_status on public.suggestions(org_id, status);
create index if not exists idx_suggestions_user       on public.suggestions(user_id);

alter table public.suggestions enable row level security;

-- Empleados ven sus propias sugerencias
create policy "users can read own suggestions"
  on public.suggestions for select
  using (user_id = auth.uid());

-- Admins ven todas las de su org
create policy "admins can read org suggestions"
  on public.suggestions for select
  using (is_admin() and org_id = get_my_org_id());

-- Cualquier usuario autenticado puede crear una sugerencia
create policy "authenticated users can submit suggestions"
  on public.suggestions for insert
  with check (user_id = auth.uid() and org_id = get_my_org_id());

-- Solo admin puede actualizar estado/notas
create policy "admins can update suggestions"
  on public.suggestions for update
  using (is_admin() and org_id = get_my_org_id());

create trigger set_suggestions_updated_at
  before update on public.suggestions
  for each row execute function set_updated_at();

-- ── Tabla: approval_attachments ───────────────────────────────────────────────
-- Almacena adjuntos (correos, autorizaciones) vinculados a una rendición o fondo
-- como respaldo de la cadena de aprobación.

create table if not exists public.approval_attachments (
  id            uuid        primary key default gen_random_uuid(),
  org_id        uuid        not null references public.organizations(id),
  report_id     uuid        references public.expense_reports(id) on delete cascade,
  fund_id       uuid        references public.petty_cash_funds(id) on delete cascade,
  uploaded_by   uuid        not null references public.users(id),
  storage_path  text        not null,
  filename      text        not null,
  file_size     integer,
  description   text,
  created_at    timestamptz not null default now(),
  -- Exactamente uno de los targets debe estar presente
  constraint chk_one_target check (
    (report_id is not null)::int + (fund_id is not null)::int = 1
  )
);

create index if not exists idx_approval_attachments_report on public.approval_attachments(report_id);
create index if not exists idx_approval_attachments_fund   on public.approval_attachments(fund_id);

alter table public.approval_attachments enable row level security;

-- Cualquier miembro de la org puede ver adjuntos de aprobaciones
create policy "org members can read approval attachments"
  on public.approval_attachments for select
  using (org_id = get_my_org_id());

-- El uploader puede insertar
create policy "users can upload approval attachments"
  on public.approval_attachments for insert
  with check (uploaded_by = auth.uid() and org_id = get_my_org_id());

-- Solo quien subió el adjunto (o admin) puede eliminarlo
create policy "uploader or admin can delete approval attachments"
  on public.approval_attachments for delete
  using (uploaded_by = auth.uid() or is_admin());

-- ── Storage bucket: approval-attachments ──────────────────────────────────────
-- Ejecutar manualmente en Supabase Dashboard > Storage si no existe:
--
-- insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
-- values (
--   'approval-attachments',
--   'approval-attachments',
--   false,
--   10485760,  -- 10 MB
--   array['image/jpeg','image/png','image/webp','application/pdf','message/rfc822']
-- )
-- on conflict (id) do nothing;
--
-- Políticas de storage:
-- insert: auth.uid() is not null
-- select: auth.uid() is not null
-- delete: auth.uid() is not null
