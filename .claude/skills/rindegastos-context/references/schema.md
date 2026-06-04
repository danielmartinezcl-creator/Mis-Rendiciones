# Schema Supabase — Rindegastos

> Referencia exacta del schema aplicado en `jqtbtgduqzxkgubmzukg`.
> Migración: `supabase/migrations/001_initial_schema.sql`
> Leer cuando se necesite escribir migrations, queries o tipos TypeScript.

## Multi-tenancy

Todas las tablas tienen `org_id uuid references organizations(id)` como barrera de aislamiento RLS.
Excepción: `expense_categories` con `org_id IS NULL` = categoría global visible por todos.

## Reglas de RLS

Orden obligatorio al aplicar migrations:
1. Crear todas las tablas
2. `ALTER TABLE ... ENABLE ROW LEVEL SECURITY`
3. Crear políticas

Las políticas que hacen `SELECT` en otras tablas fallan con "relation does not exist" si la tabla aún no fue creada.

---

## Tablas (columnas exactas)

### organizations
```sql
id         uuid primary key default uuid_generate_v4()
name       text not null
slug       text unique not null
country    text not null default 'CL'
currency   text not null default 'CLP'
plan       text not null default 'free'  -- check: 'free' | 'pro' | 'enterprise'
logo_url   text
created_at timestamptz not null default now()
```

### users (extiende auth.users)
```sql
id           uuid primary key references auth.users on delete cascade
org_id       uuid not null references organizations on delete cascade
full_name    text not null
role         text not null default 'employee'  -- check: 'admin' | 'approver' | 'employee'
can_submit   boolean not null default true
can_approve  boolean not null default false
department   text
bank_account text
is_active    boolean not null default true
created_at   timestamptz not null default now()
```

### approval_policies
```sql
id          uuid primary key default uuid_generate_v4()
org_id      uuid not null references organizations on delete cascade
name        text not null
levels      jsonb not null default '[{"level":1,"approver_id":null}]'
is_default  boolean not null default false
created_at  timestamptz not null default now()
```
`levels` = `[{"level": 1, "approver_id": "<uuid>"}]`. Soporta N niveles sin migración.

### employee_policies
```sql
user_id    uuid primary key references users on delete cascade
policy_id  uuid not null references approval_policies on delete cascade
```
Join simple: qué política de aprobación aplica a cada empleado.

### expense_categories
```sql
id                 uuid primary key default uuid_generate_v4()
org_id             uuid references organizations on delete cascade  -- NULL = global
name               text not null
icon               text
color              text
required_doc_types text[]
is_active          boolean not null default true
```
10 categorías globales precargadas (Alimentación, Transporte, Alojamiento, etc.).

### expense_reports
```sql
id                uuid primary key default uuid_generate_v4()
org_id            uuid not null references organizations on delete cascade
submitter_id      uuid not null references users on delete restrict
title             text not null
description       text
status            text not null default 'draft'
  -- check: 'draft' | 'submitted' | 'pending_l2' | 'approved' | 'partially_approved' | 'rejected' | 'reimbursed'
current_level     int not null default 1
total_amount      numeric not null default 0
approved_amount   numeric not null default 0
currency          text not null default 'CLP'
submitted_at      timestamptz
approved_at       timestamptz
reimbursed_at     timestamptz
reimbursed_by     uuid references users
payment_reference text
created_at        timestamptz not null default now()
updated_at        timestamptz not null default now()  -- trigger set_updated_at()
```

### expense_items
```sql
id                   uuid primary key default uuid_generate_v4()
report_id            uuid not null references expense_reports on delete cascade
org_id               uuid not null references organizations on delete cascade
description          text not null
amount               numeric not null
currency             text not null default 'CLP'
exchange_rate        numeric not null default 1
exchange_rate_source text not null default 'api'  -- check: 'api' | 'manual'
amount_clp           numeric not null    -- INMUTABLE post-aprobación
date                 date not null
category_id          uuid references expense_categories
merchant             text
doc_type             text  -- check: 'boleta' | 'factura' | 'factura_exenta' | 'ticket' | 'otro'
doc_number           text
notes                text
status               text not null default 'pending'  -- check: 'pending' | 'approved' | 'rejected'
rejection_reason     text
ocr_raw              jsonb
ocr_confidence       numeric
created_at           timestamptz not null default now()
```

### attachments
```sql
id             uuid primary key default uuid_generate_v4()
item_id        uuid not null references expense_items on delete cascade
org_id         uuid not null references organizations on delete cascade
storage_path   text not null     -- path en bucket 'expense-attachments'
file_type      text not null  -- check: 'image' | 'pdf'
file_size      int
thumbnail_path text
created_at     timestamptz not null default now()
```
**Bucket `expense-attachments`**: crear manualmente en Dashboard de Supabase.
`public: false`, 10MB max, tipos: `image/jpeg`, `image/png`, `image/webp`, `application/pdf`.

### expense_report_approvals — APPEND ONLY
```sql
id              uuid primary key default uuid_generate_v4()
report_id       uuid not null references expense_reports on delete cascade
approver_id     uuid not null references users on delete restrict
level           int not null default 1
action          text not null
  -- check: 'approved' | 'rejected' | 'partially_approved' | 'returned_to_draft'
items_approved  uuid[]   -- IDs de expense_items aprobados
items_rejected  uuid[]   -- IDs de expense_items rechazados
notes           text
created_at      timestamptz not null default now()
```
Bloqueado a nivel parser PostgreSQL (más fuerte que RLS):
```sql
create rule no_update_approvals as on update to expense_report_approvals do instead nothing;
create rule no_delete_approvals as on delete to expense_report_approvals do instead nothing;
```

### notifications
```sql
id         uuid primary key default uuid_generate_v4()
org_id     uuid not null references organizations on delete cascade
user_id    uuid not null references users on delete cascade
type       text not null  -- check: 'submission' | 'approval' | 'rejection' | 'reimbursement'
report_id  uuid references expense_reports on delete cascade
read       boolean not null default false
created_at timestamptz not null default now()
```

---

## Índices

```sql
create index idx_expense_reports_org_status on expense_reports (org_id, status);
create index idx_expense_reports_submitter  on expense_reports (submitter_id, status);
create index idx_expense_items_report       on expense_items (report_id);
create index idx_notifications_user_unread  on notifications (user_id, read) where read = false;
create index idx_users_org                  on users (org_id);
```

---

## Tipos TypeScript (`src/lib/supabase/types.ts`)

Los tipos de conveniencia disponibles:
```typescript
Organization           // organizations.Row
UserProfile            // users.Row
ApprovalPolicy         // approval_policies.Row
ExpenseReport          // expense_reports.Row
ExpenseItem            // expense_items.Row
Attachment             // attachments.Row
ExpenseCategory        // expense_categories.Row
ExpenseReportApproval  // expense_report_approvals.Row
Notification           // notifications.Row
```

Para regenerar desde Supabase:
```bash
npx supabase gen types typescript --project-id jqtbtgduqzxkgubmzukg > src/lib/supabase/types.ts
```
