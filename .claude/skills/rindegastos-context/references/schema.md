# Schema Supabase — Rindegastos

> Referencia exacta del schema aplicado en `jqtbtgduqzxkgubmzukg`.
> Última actualización: 2026-07-23
> Migraciones aplicadas: 001, 004, 005, 007, 008, 009, 010

## Multi-tenancy

Todas las tablas tienen `org_id uuid references organizations(id)` como barrera de aislamiento RLS.
Excepción: `expense_categories` con `org_id IS NULL` = categoría global visible por todos.

## Reglas de RLS

Orden obligatorio al aplicar migrations:
1. Crear todas las tablas
2. `ALTER TABLE ... ENABLE ROW LEVEL SECURITY`
3. Crear políticas

Las políticas que hacen `SELECT` en otras tablas fallan con "relation does not exist" si la tabla aún no fue creada.

**Funciones security definer** (ya existen en el proyecto):
```sql
get_my_org_id()  -- retorna org_id del usuario actual sin pasar por RLS
is_admin()       -- retorna true si role = 'admin', sin pasar por RLS
```
Usar SIEMPRE en políticas. Nunca `org_id IN (SELECT org_id FROM users WHERE id = auth.uid())` — causa recursión infinita.

---

## Tablas (columnas exactas)

### organizations
```sql
id                        uuid primary key default uuid_generate_v4()
name                      text not null
slug                      text unique not null
country                   text not null default 'CL'
currency                  text not null default 'CLP'
plan                      text not null default 'free'   -- 'free' | 'pro' | 'enterprise'
logo_url                  text
-- Defontana integration (plan futuro, no implementado aún en UI completa)
defontana_contra_account  text   -- cuenta contrapartida para asientos
defontana_voucher_type    text   -- tipo de comprobante Defontana
defontana_cost_center     text   -- centro de costo por defecto
created_at                timestamptz not null default now()
```

### users (extiende auth.users)
```sql
id              uuid primary key references auth.users on delete cascade
org_id          uuid not null references organizations on delete cascade
full_name       text not null
role            text not null default 'employee'   -- 'admin' | 'approver' | 'employee'
can_submit      boolean not null default true
can_approve     boolean not null default false
can_manage_petty_cash boolean not null default false   -- encargado de fondo fijo (migración 004)
department      text
bank_account    text
is_active       boolean not null default true
-- Perfil bancario (migración post-Plan C)
rut             text
bank_name       text
bank_account_type text
-- Cadena de aprobación (migración post-Plan C)
approver_l1_id  uuid references users(id)
approver_l2_id  uuid references users(id)
created_at      timestamptz not null default now()
```
**Nota:** `public.users` NO tiene columna `email` — el email está en `auth.users`. Para leerlo: `supabase.auth.getUser()`.

### approval_policies
```sql
id          uuid primary key default uuid_generate_v4()
org_id      uuid not null references organizations on delete cascade
name        text not null
levels      jsonb not null default '[{"level":1,"approver_id":null}]'
is_default  boolean not null default false
created_at  timestamptz not null default now()
```

### employee_policies
```sql
user_id    uuid primary key references users on delete cascade
policy_id  uuid not null references approval_policies on delete cascade
```

### expense_categories
```sql
id                 uuid primary key default uuid_generate_v4()
org_id             uuid references organizations on delete cascade   -- NULL = global
name               text not null
icon               text
color              text
required_doc_types text[]
is_active          boolean not null default true
-- Defontana (settings tab)
defontana_account_code text
```
10 categorías globales precargadas.

### expense_reports
```sql
id                   uuid primary key default uuid_generate_v4()
org_id               uuid not null references organizations on delete cascade
submitter_id         uuid not null references users on delete restrict
title                text not null
description          text
status               text not null default 'draft'
  -- 'draft' | 'submitted' | 'pending_l2' | 'approved' | 'partially_approved' | 'rejected' | 'reimbursed'
current_level        int not null default 1
total_amount         numeric not null default 0
approved_amount      numeric not null default 0
currency             text not null default 'CLP'
submitted_at         timestamptz
approved_at          timestamptz
reimbursed_at        timestamptz
reimbursed_by        uuid references users
payment_reference    text
-- Importador histórico (migraciones 007/008)
is_historical_import boolean not null default false
historical_type      text   -- 'rendicion' | 'caja_chica' (solo si is_historical_import = true)
fund_number          text   -- número del fondo, para vinculación con petty_cash_funds
-- Soft delete
deleted_at           timestamptz   -- null = activo, no-null = en papelera
created_at           timestamptz not null default now()
updated_at           timestamptz not null default now()   -- trigger set_updated_at()
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
exchange_rate_source text not null default 'api'   -- 'api' | 'manual'
amount_clp           numeric not null    -- INMUTABLE post-aprobación
date                 date not null
category_id          uuid references expense_categories
merchant             text
doc_type             text   -- 'boleta' | 'factura' | 'factura_exenta' | 'ticket' | 'otro'
doc_number           text
notes                text
status               text not null default 'pending'   -- 'pending' | 'approved' | 'rejected'
rejection_reason     text
ocr_raw              jsonb
ocr_confidence       numeric
-- Tipo de ítem (migración 009)
item_type            text not null default 'expense'
  -- 'expense' | 'advance' | 'return' | 'transfer'
-- Traspaso vinculado (migración 010)
transfer_id          uuid references fund_transfers(id)
created_at           timestamptz not null default now()
```
**`item_type`**: expense = gasto normal, advance = adelanto empresa→empleado, return = devolución, transfer = traspaso entre cajas.

### attachments
```sql
id             uuid primary key default uuid_generate_v4()
item_id        uuid not null references expense_items on delete cascade
org_id         uuid not null references organizations on delete cascade
storage_path   text not null     -- path en bucket 'expense-attachments'
file_type      text not null   -- 'image' | 'pdf'
file_size      int
thumbnail_path text
created_at     timestamptz not null default now()
```
**Bucket `expense-attachments`**: ya creado en `jqtbtgduqzxkgubmzukg` via SQL.
`public: false`, 10MB max, tipos: `image/jpeg`, `image/png`, `image/webp`, `application/pdf`.

### expense_report_approvals — APPEND ONLY
```sql
id              uuid primary key default uuid_generate_v4()
report_id       uuid not null references expense_reports on delete cascade
approver_id     uuid not null references users on delete restrict
  -- ⚠️ FK a auth.users NO a public.users — NO hacer join directo
level           int not null default 1
action          text not null   -- 'approved' | 'rejected' | 'partially_approved' | 'returned_to_draft'
items_approved  uuid[]
items_rejected  uuid[]
notes           text
created_at      timestamptz not null default now()
```
Bloqueado a nivel PostgreSQL (más fuerte que RLS):
```sql
create rule no_update_approvals as on update to expense_report_approvals do instead nothing;
create rule no_delete_approvals as on delete to expense_report_approvals do instead nothing;
```
**Para leer nombres de aprobadores**: query separada a `public.users` usando los mismos UUIDs de `approver_id`.

### notifications
```sql
id         uuid primary key default uuid_generate_v4()
org_id     uuid not null references organizations on delete cascade
user_id    uuid not null references users on delete cascade
type       text not null   -- 'submission' | 'approval' | 'rejection' | 'reimbursement'
report_id  uuid references expense_reports on delete cascade
read       boolean not null default false
created_at timestamptz not null default now()
```

### suggestions (migración 005)
```sql
id          uuid primary key default gen_random_uuid()
org_id      uuid not null references organizations(id)
user_id     uuid not null references users(id)
content     text not null   -- 5-2000 chars
category    text not null default 'mejora'   -- 'mejora' | 'error' | 'consulta' | 'otro'
status      text not null default 'pending'   -- 'pending' | 'reviewing' | 'done' | 'dismissed'
admin_notes text
created_at  timestamptz not null default now()
updated_at  timestamptz not null default now()
```

### approval_attachments (migración 005)
```sql
id            uuid primary key default gen_random_uuid()
org_id        uuid not null references organizations(id)
report_id     uuid references expense_reports(id) on delete cascade   -- exactamente uno de los dos
fund_id       uuid references petty_cash_funds(id) on delete cascade
uploaded_by   uuid not null references users(id)
storage_path  text not null
filename      text not null
file_size     integer
description   text
created_at    timestamptz not null default now()
```
**Bucket `approval-attachments`**: crear manualmente si no existe. `public: false`, 10MB, tipos: jpeg/png/webp/pdf/rfc822.

---

## Módulo Caja Chica (migración 004)

### petty_cash_funds
```sql
id               uuid primary key default gen_random_uuid()
org_id           uuid not null references organizations(id) on delete cascade
name             text not null
employee_id      uuid not null references users(id)   -- quien maneja el fondo
manager_id       uuid not null references users(id)   -- quien supervisa
amount_requested numeric(12,2) not null check (amount_requested > 0)
amount_approved  numeric(12,2)
currency         text not null default 'CLP'
period_start     date not null
period_end       date not null
description      text
status           text not null default 'draft'
  -- 'draft' | 'pending_approval' | 'approved' | 'funds_sent'
  -- | 'submitted' | 'pending_liquidation_approval' | 'settled' | 'rejected'
settled_at       timestamptz
is_historical_import boolean not null default false   -- migración 007
created_at       timestamptz not null default now()
updated_at       timestamptz not null default now()   -- trigger
```

### petty_cash_items
```sql
id               uuid primary key default gen_random_uuid()
fund_id          uuid not null references petty_cash_funds(id) on delete cascade
org_id           uuid not null references organizations(id)
description      text not null
amount           numeric(12,2) not null check (amount > 0)
currency         text not null default 'CLP'
exchange_rate    numeric(12,6) not null default 1
amount_clp       numeric(12,2) not null
date             date not null
category_id      uuid references expense_categories(id)
merchant         text
doc_type         text   -- 'boleta' | 'factura' | 'factura_exenta' | 'ticket' | 'otro'
doc_number       text
notes            text
status           text not null default 'pending'   -- 'pending' | 'approved' | 'rejected'
rejection_reason text
transfer_id      uuid references fund_transfers(id)   -- migración 010
created_at       timestamptz not null default now()
```

### petty_cash_approvals — APPEND ONLY
```sql
id         uuid primary key default gen_random_uuid()
fund_id    uuid not null references petty_cash_funds(id) on delete cascade
actor_id   uuid not null references users(id)
action     text not null
  -- 'created' | 'submitted_for_approval' | 'approved' | 'rejected' | 'funds_sent'
  -- | 'liquidation_submitted' | 'liquidation_elevated' | 'liquidation_approved' | 'settled'
notes      text
amount     numeric(12,2)
created_at timestamptz not null default now()
```

### petty_cash_transfers
```sql
id             uuid primary key default gen_random_uuid()
fund_id        uuid not null references petty_cash_funds(id) on delete cascade
type           text not null   -- 'disbursement' | 'refund_to_employee' | 'reimbursement_from_employee'
amount         numeric(12,2) not null
reference      text
transferred_at date not null
registered_by  uuid not null references users(id)
notes          text
created_at     timestamptz not null default now()
```

---

## Traspasos entre empleados (migración 010)

### fund_transfers
```sql
id                   uuid primary key default gen_random_uuid()
org_id               uuid not null references organizations(id) on delete cascade
date                 date not null
amount               numeric not null check (amount > 0)
description          text
payer_employee_id    uuid not null references users(id)
payer_fund_id        uuid references petty_cash_funds(id)    -- null si paga desde carga histórica
payer_report_id      uuid references expense_reports(id)     -- null si paga desde fondo activo
receiver_employee_id uuid not null references users(id)
receiver_fund_id     uuid references petty_cash_funds(id)    -- null hasta que se vincule
receiver_report_id   uuid references expense_reports(id)     -- null hasta que se vincule
matched              boolean not null default false           -- false = saldo flotante
matched_at           timestamptz
created_by           uuid not null references users(id)
created_at           timestamptz not null default now()
CONSTRAINT chk_payer_source CHECK (payer_fund_id IS NOT NULL OR payer_report_id IS NOT NULL)
```
**Flujo**: Fase 1 = crear traspaso (receiver_fund/report null, matched=false) → Fase 2 = admin vincula → matched=true.

---

## Índices

```sql
-- Core
create index idx_expense_reports_org_status  on expense_reports (org_id, status);
create index idx_expense_reports_submitter   on expense_reports (submitter_id, status);
create index idx_expense_reports_fund_number on expense_reports (fund_number) where fund_number is not null;
create index idx_expense_items_report        on expense_items (report_id);
create index idx_notifications_user_unread   on notifications (user_id, read) where read = false;
create index idx_users_org                   on users (org_id);
-- Suggestions
create index idx_suggestions_org_status on suggestions(org_id, status);
create index idx_suggestions_user       on suggestions(user_id);
-- Approval attachments
create index idx_approval_attachments_report on approval_attachments(report_id);
create index idx_approval_attachments_fund   on approval_attachments(fund_id);
-- Petty cash
create index idx_petty_cash_funds_employee on petty_cash_funds(employee_id, status);
create index idx_petty_cash_funds_manager  on petty_cash_funds(manager_id, status);
create index idx_petty_cash_funds_org      on petty_cash_funds(org_id, status);
create index idx_petty_cash_items_fund     on petty_cash_items(fund_id);
create index idx_petty_cash_approvals_fund on petty_cash_approvals(fund_id, created_at);
create index idx_petty_cash_transfers_fund on petty_cash_transfers(fund_id);
-- Fund transfers
create index idx_fund_transfers_org      on fund_transfers (org_id);
create index idx_fund_transfers_receiver on fund_transfers (receiver_employee_id, matched);
create index idx_fund_transfers_payer    on fund_transfers (payer_employee_id);
```

---

## Tipos TypeScript (`src/lib/supabase/types.ts`)

Exportados al final del archivo:
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
FundTransfer           // fund_transfers.Row
```

**Reglas críticas de tipado** (evitar errores de build):
- Cada tabla DEBE tener `Relationships: []` o sus FK reales — sin ello `Schema = never` y `.insert()` acepta `never[]`
- Tablas append-only: usar `Update: Record<string, never>` NO `Update: never`
- Selects anidados Supabase tipan como `never[]` → castear explícitamente: `(data ?? []) as TipoExplicito[]`
- Exportar tipos desde archivos `'use server'` causa "X is not defined" runtime — importar tipos desde `@/lib/` directamente

Para regenerar desde Supabase (referencia, no hacer en producción sin revisar):
```bash
npx supabase gen types typescript --project-id jqtbtgduqzxkgubmzukg > src/lib/supabase/types.ts
```

---

## Setup inicial (ya realizado en jqtbtgduqzxkgubmzukg)

- Org PENTA: `id = '00000000-0000-0000-0000-000000000001'`
- Admin: `danielmartinez.cl@gmail.com`
- Buckets creados: `expense-attachments`, `approval-attachments`
- Funciones security definer: `get_my_org_id()`, `is_admin()`
