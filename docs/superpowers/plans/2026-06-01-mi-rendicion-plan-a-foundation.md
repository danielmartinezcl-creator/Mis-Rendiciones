# App Rindegastos — Plan A: Fundación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Levantar el proyecto Next.js 15, crear el schema completo en Supabase, configurar autenticación y construir el layout base con el sistema de diseño aprobado.

**Architecture:** Next.js 15 App Router con TypeScript. Supabase como backend (PostgreSQL + Auth + Storage). Tailwind CSS con el design system aprobado (indigo, Plus Jakarta Sans, Manrope). Middleware de Next.js protege las rutas por rol.

**Tech Stack:** Next.js 15, TypeScript, Tailwind CSS, Supabase JS v2 + SSR, Vitest, Playwright

---

## Mapa de archivos — Plan A

| Acción | Ruta |
|--------|------|
| Crear | `package.json` (auto por create-next-app) |
| Crear | `next.config.ts` |
| Crear | `tailwind.config.ts` |
| Crear | `src/app/layout.tsx` |
| Crear | `src/app/(auth)/login/page.tsx` |
| Crear | `src/app/api/auth/callback/route.ts` |
| Crear | `src/app/(app)/layout.tsx` |
| Crear | `src/app/(app)/page.tsx` (placeholder) |
| Crear | `src/middleware.ts` |
| Crear | `src/lib/supabase/client.ts` |
| Crear | `src/lib/supabase/server.ts` |
| Crear | `src/lib/supabase/types.ts` |
| Crear | `src/lib/utils.ts` |
| Crear | `src/lib/constants.ts` |
| Crear | `src/components/ui/Button.tsx` |
| Crear | `src/components/ui/Card.tsx` |
| Crear | `src/components/ui/Badge.tsx` |
| Crear | `src/components/ui/CurrencyAmount.tsx` |
| Crear | `src/components/layout/Sidebar.tsx` |
| Crear | `src/components/layout/MobileNav.tsx` |
| Crear | `supabase/migrations/001_initial_schema.sql` |
| Crear | `supabase/seed.sql` |
| Crear | `.env.local` |
| Crear | `vitest.config.ts` |
| Crear | `tests/utils.test.ts` |

---

## Task 1: Crear proyecto Next.js 15

**Files:**
- Crea: toda la estructura base por `create-next-app`

- [ ] **Step 1: Crear el proyecto**

Ejecutar en `c:\Users\danie\AUTOMATIZACIONES DANIEL\PENTA\App PENTA\App Rindegastos`:

```bash
npx create-next-app@latest . --typescript --tailwind --eslint --app --src-dir --import-alias "@/*" --no-git
```

Cuando pregunte "Would you like to use Turbopack?": seleccionar **No** (Turbopack en Next.js 15 no soporta bien todos los plugins PWA aún).

- [ ] **Step 2: Instalar dependencias adicionales**

```bash
npm install @supabase/supabase-js @supabase/ssr @anthropic-ai/sdk resend xlsx jspdf jspdf-autotable next-pwa
npm install -D vitest @vitejs/plugin-react jsdom @testing-library/react @testing-library/jest-dom @playwright/test
```

- [ ] **Step 3: Verificar que el proyecto arranca**

```bash
npm run dev
```

Esperado: servidor en `http://localhost:3000`, página "Welcome to Next.js" visible. Cerrar con Ctrl+C.

- [ ] **Step 4: Commit inicial**

```bash
git init
git add .
git commit -m "feat: scaffold Next.js 15 project with TypeScript + Tailwind"
```

---

## Task 2: Sistema de diseño — Tailwind + Fuentes

**Files:**
- Modificar: `tailwind.config.ts`
- Modificar: `src/app/layout.tsx`
- Modificar: `src/app/globals.css`

- [ ] **Step 1: Configurar fuentes en layout.tsx**

Reemplazar el contenido de `src/app/layout.tsx`:

```typescript
import type { Metadata, Viewport } from 'next'
import { Plus_Jakarta_Sans, Manrope } from 'next/font/google'
import './globals.css'

const plusJakarta = Plus_Jakarta_Sans({
  subsets: ['latin'],
  weight: ['400', '600', '700', '800'],
  variable: '--font-jakarta',
  display: 'swap',
})

const manrope = Manrope({
  subsets: ['latin'],
  weight: ['700', '800'],
  variable: '--font-manrope',
  display: 'swap',
})

export const metadata: Metadata = {
  title: 'Rindegastos — PENTA',
  description: 'Gestión de rendiciones de gastos empresariales',
  manifest: '/manifest.json',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'black-translucent',
    title: 'Rindegastos',
  },
}

export const viewport: Viewport = {
  themeColor: '#0f172a',
  width: 'device-width',
  initialScale: 1,
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es" className={`${plusJakarta.variable} ${manrope.variable}`}>
      <body className="font-jakarta bg-slate-50 text-slate-900 antialiased">
        {children}
      </body>
    </html>
  )
}
```

- [ ] **Step 2: Configurar Tailwind con el sistema de diseño aprobado**

Reemplazar `tailwind.config.ts`:

```typescript
import type { Config } from 'tailwindcss'

const config: Config = {
  content: [
    './src/pages/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      fontFamily: {
        jakarta: ['var(--font-jakarta)', 'sans-serif'],
        manrope: ['var(--font-manrope)', 'sans-serif'],
      },
      colors: {
        brand: {
          50:  '#eef2ff',
          100: '#e0e7ff',
          500: '#6366f1',
          600: '#4f46e5',  // color primario
          700: '#4338ca',
          900: '#312e81',
        },
        sidebar: '#0f172a',
        'status-approved':   '#34d399',
        'status-pending':    '#fbbf24',
        'status-rejected':   '#f87171',
        'status-reimbursed': '#60a5fa',
      },
      borderRadius: {
        card: '12px',
        item: '8px',
      },
      boxShadow: {
        card: '0 2px 8px rgba(0,0,0,.08)',
      },
      backgroundImage: {
        'card-hero': 'linear-gradient(135deg, #312e81, #4c1d95)',
      },
    },
  },
  plugins: [],
}

export default config
```

- [ ] **Step 3: Actualizar globals.css**

Reemplazar `src/app/globals.css`:

```css
@tailwind base;
@tailwind components;
@tailwind utilities;

@layer base {
  * {
    box-sizing: border-box;
  }
  body {
    font-family: var(--font-jakarta), sans-serif;
  }
}

@layer utilities {
  .font-mono-amount {
    font-family: var(--font-manrope), sans-serif;
    font-weight: 700;
    font-variant-numeric: tabular-nums;
  }
  /* Acento lateral de 3px por estado en ítems */
  .item-accent-approved  { border-left: 3px solid #34d399; }
  .item-accent-pending   { border-left: 3px solid #fbbf24; }
  .item-accent-rejected  { border-left: 3px solid #f87171; }
}
```

- [ ] **Step 4: Verificar que el diseño compila**

```bash
npm run build
```

Esperado: compilación exitosa sin errores. Si hay warnings de TypeScript, corregirlos.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: configure design system — indigo palette, Plus Jakarta Sans, Manrope"
```

---

## Task 3: Constantes y utilidades

**Files:**
- Crear: `src/lib/constants.ts`
- Crear: `src/lib/utils.ts`
- Crear: `tests/utils.test.ts`
- Crear: `vitest.config.ts`

- [ ] **Step 1: Crear vitest.config.ts**

```typescript
// vitest.config.ts
import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import path from 'path'

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/tests/setup.ts'],
    globals: true,
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
})
```

- [ ] **Step 2: Crear setup de tests**

Crear `src/tests/setup.ts`:

```typescript
import '@testing-library/jest-dom'
```

- [ ] **Step 3: Escribir los tests de utils ANTES de implementar**

Crear `src/tests/utils.test.ts`:

```typescript
import { describe, it, expect } from 'vitest'
import { formatCLP, formatDate, getStatusLabel, getStatusColor, formatExchangeRate } from '@/lib/utils'

describe('formatCLP', () => {
  it('formatea número positivo con símbolo y separador de miles', () => {
    expect(formatCLP(1234567)).toBe('$ 1.234.567')
  })
  it('formatea cero como $ 0', () => {
    expect(formatCLP(0)).toBe('$ 0')
  })
  it('formatea negativo con signo', () => {
    expect(formatCLP(-50000)).toBe('-$ 50.000')
  })
})

describe('formatDate', () => {
  it('formatea YYYY-MM-DD a DD/MM/YYYY', () => {
    expect(formatDate('2026-06-01')).toBe('01/06/2026')
  })
})

describe('getStatusLabel', () => {
  it('retorna etiquetas en español', () => {
    expect(getStatusLabel('draft')).toBe('Borrador')
    expect(getStatusLabel('submitted')).toBe('En revisión')
    expect(getStatusLabel('approved')).toBe('Aprobada')
    expect(getStatusLabel('partially_approved')).toBe('Aprobada parcial')
    expect(getStatusLabel('rejected')).toBe('Rechazada')
    expect(getStatusLabel('reimbursed')).toBe('Reembolsada')
  })
})

describe('formatExchangeRate', () => {
  it('formatea el TC con 4 decimales', () => {
    expect(formatExchangeRate(0.5694)).toBe('0,5694')
  })
})
```

- [ ] **Step 4: Ejecutar tests para ver que fallan**

```bash
npx vitest run src/tests/utils.test.ts
```

Esperado: FAIL — "Cannot find module '@/lib/utils'"

- [ ] **Step 5: Implementar constants.ts**

Crear `src/lib/constants.ts`:

```typescript
export const CURRENCIES = ['CLP', 'USD', 'EUR', 'ARS', 'BRL'] as const
export type Currency = typeof CURRENCIES[number]

export const CURRENCY_SYMBOLS: Record<Currency, string> = {
  CLP: '$',
  USD: 'US$',
  EUR: '€',
  ARS: 'AR$',
  BRL: 'R$',
}

export const DOC_TYPES = [
  { value: 'boleta',          label: 'Boleta' },
  { value: 'factura',         label: 'Factura' },
  { value: 'factura_exenta',  label: 'Factura Exenta' },
  { value: 'ticket',          label: 'Ticket' },
  { value: 'otro',            label: 'Otro' },
] as const

export type DocType = typeof DOC_TYPES[number]['value']

export const REPORT_STATUSES = [
  'draft',
  'submitted',
  'pending_l2',
  'approved',
  'partially_approved',
  'rejected',
  'reimbursed',
] as const

export type ReportStatus = typeof REPORT_STATUSES[number]

export const ITEM_STATUSES = ['pending', 'approved', 'rejected'] as const
export type ItemStatus = typeof ITEM_STATUSES[number]

export const STATUS_COLORS: Record<ReportStatus, string> = {
  draft:               'bg-slate-100 text-slate-600',
  submitted:           'bg-amber-100 text-amber-700',
  pending_l2:          'bg-amber-100 text-amber-700',
  approved:            'bg-emerald-100 text-emerald-700',
  partially_approved:  'bg-amber-100 text-amber-700',
  rejected:            'bg-red-100 text-red-600',
  reimbursed:          'bg-blue-100 text-blue-700',
}

export const ITEM_STATUS_ACCENT: Record<ItemStatus, string> = {
  pending:  'item-accent-pending',
  approved: 'item-accent-approved',
  rejected: 'item-accent-rejected',
}
```

- [ ] **Step 6: Implementar utils.ts**

Crear `src/lib/utils.ts`:

```typescript
import { ReportStatus, Currency, CURRENCY_SYMBOLS } from './constants'

export function formatCLP(amount: number): string {
  const abs = Math.abs(Math.round(amount))
  const formatted = abs.toLocaleString('es-CL')
  const sign = amount < 0 ? '-' : ''
  return `${sign}$ ${formatted}`
}

export function formatAmount(amount: number, currency: Currency): string {
  const symbol = CURRENCY_SYMBOLS[currency]
  const abs = Math.abs(amount)
  const formatted = abs.toLocaleString('es-CL', {
    minimumFractionDigits: currency === 'CLP' ? 0 : 2,
    maximumFractionDigits: currency === 'CLP' ? 0 : 2,
  })
  return `${amount < 0 ? '-' : ''}${symbol} ${formatted}`
}

export function formatDate(isoDate: string): string {
  const [y, m, d] = isoDate.split('-')
  return `${d}/${m}/${y}`
}

export function formatExchangeRate(rate: number): string {
  return rate.toLocaleString('es-CL', { minimumFractionDigits: 4, maximumFractionDigits: 4 })
}

export function getStatusLabel(status: ReportStatus): string {
  const labels: Record<ReportStatus, string> = {
    draft:               'Borrador',
    submitted:           'En revisión',
    pending_l2:          'Revisión nivel 2',
    approved:            'Aprobada',
    partially_approved:  'Aprobada parcial',
    rejected:            'Rechazada',
    reimbursed:          'Reembolsada',
  }
  return labels[status] ?? status
}

export function getStatusColor(status: ReportStatus): string {
  const { STATUS_COLORS } = require('./constants')
  return STATUS_COLORS[status] ?? 'bg-slate-100 text-slate-600'
}

export function cn(...classes: (string | undefined | false | null)[]): string {
  return classes.filter(Boolean).join(' ')
}
```

- [ ] **Step 7: Ejecutar tests**

```bash
npx vitest run src/tests/utils.test.ts
```

Esperado: PASS — 6 tests en verde.

- [ ] **Step 8: Agregar script de test a package.json**

Modificar `package.json`, agregar en `"scripts"`:

```json
"test": "vitest run",
"test:watch": "vitest",
"test:e2e": "playwright test"
```

- [ ] **Step 9: Commit**

```bash
git add -A
git commit -m "feat: add constants, utils, vitest config — 6 tests passing"
```

---

## Task 4: Schema de Supabase

**Files:**
- Crear: `supabase/migrations/001_initial_schema.sql`
- Crear: `supabase/seed.sql`

> **Nota:** Para aplicar este schema necesitás acceso al proyecto Supabase (MCP disponible o CLI). Las instrucciones abajo usan el MCP de Supabase si está disponible, o CLI como alternativa.

- [ ] **Step 1: Crear el archivo de migración**

Crear `supabase/migrations/001_initial_schema.sql`:

```sql
-- ============================================================
-- App Rindegastos — Schema inicial v1
-- Aplicar en: proyecto Supabase NUEVO (separado de fintrack)
-- ============================================================

-- Extensiones necesarias
create extension if not exists "uuid-ossp";

-- ============================================================
-- ORGANIZATIONS — una fila por empresa cliente (multi-tenant)
-- ============================================================
create table organizations (
  id         uuid primary key default uuid_generate_v4(),
  name       text not null,
  slug       text unique not null,
  country    text not null default 'CL',
  currency   text not null default 'CLP',
  plan       text not null default 'free' check (plan in ('free','pro','enterprise')),
  logo_url   text,
  created_at timestamptz not null default now()
);

alter table organizations enable row level security;

create policy "org members can read their org"
  on organizations for select
  using (
    id in (select org_id from users where id = auth.uid())
  );

create policy "admin can update org"
  on organizations for update
  using (
    id in (select org_id from users where id = auth.uid() and role = 'admin')
  );

-- ============================================================
-- USERS — extiende auth.users de Supabase
-- ============================================================
create table users (
  id           uuid primary key references auth.users on delete cascade,
  org_id       uuid not null references organizations on delete cascade,
  full_name    text not null,
  role         text not null default 'employee' check (role in ('admin','approver','employee')),
  can_submit   boolean not null default true,
  can_approve  boolean not null default false,
  department   text,
  bank_account text,
  is_active    boolean not null default true,
  created_at   timestamptz not null default now()
);

alter table users enable row level security;

create policy "users can read members of same org"
  on users for select
  using (
    org_id in (select org_id from users where id = auth.uid())
  );

create policy "admin can manage users"
  on users for all
  using (
    org_id in (select org_id from users where id = auth.uid() and role = 'admin')
  );

create policy "users can update their own profile"
  on users for update
  using (id = auth.uid());

-- ============================================================
-- APPROVAL_POLICIES
-- levels: [{level:1, approver_id:"uuid"}, {level:2, approver_id:"uuid"}]
-- ============================================================
create table approval_policies (
  id          uuid primary key default uuid_generate_v4(),
  org_id      uuid not null references organizations on delete cascade,
  name        text not null,
  levels      jsonb not null default '[{"level":1,"approver_id":null}]',
  is_default  boolean not null default false,
  created_at  timestamptz not null default now()
);

alter table approval_policies enable row level security;

create policy "org members can read policies"
  on approval_policies for select
  using (org_id in (select org_id from users where id = auth.uid()));

create policy "admin can manage policies"
  on approval_policies for all
  using (org_id in (select org_id from users where id = auth.uid() and role = 'admin'));

-- ============================================================
-- EMPLOYEE_POLICIES — políticas asignadas a empleados
-- ============================================================
create table employee_policies (
  user_id    uuid primary key references users on delete cascade,
  policy_id  uuid not null references approval_policies on delete cascade
);

alter table employee_policies enable row level security;

create policy "org members can read employee policies"
  on employee_policies for select
  using (
    user_id in (select id from users where org_id = (select org_id from users where id = auth.uid()))
  );

create policy "admin can manage employee policies"
  on employee_policies for all
  using (
    user_id in (
      select id from users
      where org_id = (select org_id from users where id = auth.uid() and role = 'admin')
    )
  );

-- ============================================================
-- EXPENSE_CATEGORIES — globales (org_id null) + por organización
-- ============================================================
create table expense_categories (
  id                 uuid primary key default uuid_generate_v4(),
  org_id             uuid references organizations on delete cascade,
  name               text not null,
  icon               text,
  color              text,
  required_doc_types text[],
  is_active          boolean not null default true
);

alter table expense_categories enable row level security;

create policy "anyone can read global categories"
  on expense_categories for select
  using (org_id is null);

create policy "org members can read their categories"
  on expense_categories for select
  using (org_id in (select org_id from users where id = auth.uid()));

create policy "admin can manage org categories"
  on expense_categories for all
  using (org_id in (select org_id from users where id = auth.uid() and role = 'admin'));

-- Categorías globales predefinidas para Chile
insert into expense_categories (id, org_id, name, icon, color) values
  (uuid_generate_v4(), null, 'Alimentación',         '🍽️', '#f59e0b'),
  (uuid_generate_v4(), null, 'Transporte',            '🚗', '#3b82f6'),
  (uuid_generate_v4(), null, 'Alojamiento',           '🏨', '#8b5cf6'),
  (uuid_generate_v4(), null, 'Materiales/Suministros','📦', '#10b981'),
  (uuid_generate_v4(), null, 'Comunicaciones',        '📱', '#06b6d4'),
  (uuid_generate_v4(), null, 'Entretenimiento',       '🎭', '#ec4899'),
  (uuid_generate_v4(), null, 'Capacitación',          '📚', '#f97316'),
  (uuid_generate_v4(), null, 'Combustible',           '⛽', '#84cc16'),
  (uuid_generate_v4(), null, 'Servicios',             '🔧', '#64748b'),
  (uuid_generate_v4(), null, 'Otro',                  '📎', '#94a3b8');

-- ============================================================
-- EXPENSE_REPORTS — cabecera de rendición
-- ============================================================
create table expense_reports (
  id                uuid primary key default uuid_generate_v4(),
  org_id            uuid not null references organizations on delete cascade,
  submitter_id      uuid not null references users on delete restrict,
  title             text not null,
  description       text,
  status            text not null default 'draft' check (
    status in ('draft','submitted','pending_l2','approved','partially_approved','rejected','reimbursed')
  ),
  current_level     int not null default 1,
  total_amount      numeric not null default 0,
  approved_amount   numeric not null default 0,
  currency          text not null default 'CLP',
  submitted_at      timestamptz,
  approved_at       timestamptz,
  reimbursed_at     timestamptz,
  reimbursed_by     uuid references users,
  payment_reference text,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

alter table expense_reports enable row level security;

-- Rendidores: solo sus propias rendiciones
create policy "submitter can read own reports"
  on expense_reports for select
  using (submitter_id = auth.uid());

-- Rendidores: pueden crear y editar sus borradores
create policy "submitter can insert reports"
  on expense_reports for insert
  with check (submitter_id = auth.uid() and org_id = (select org_id from users where id = auth.uid()));

create policy "submitter can update own drafts"
  on expense_reports for update
  using (submitter_id = auth.uid() and status = 'draft');

-- Aprobadores: ven rendiciones de empleados con política que los incluye
create policy "approver can read assigned reports"
  on expense_reports for select
  using (
    exists (
      select 1 from approval_policies ap
      join employee_policies ep on ep.policy_id = ap.id
      where ep.user_id = expense_reports.submitter_id
        and ap.levels @> jsonb_build_array(jsonb_build_object('approver_id', auth.uid()::text))
    )
  );

create policy "approver can update submitted reports"
  on expense_reports for update
  using (
    status in ('submitted','pending_l2')
    and exists (
      select 1 from approval_policies ap
      join employee_policies ep on ep.policy_id = ap.id
      where ep.user_id = expense_reports.submitter_id
        and ap.levels @> jsonb_build_array(jsonb_build_object('approver_id', auth.uid()::text))
    )
  );

-- Admin: ve todo dentro de su org
create policy "admin can manage all reports in org"
  on expense_reports for all
  using (org_id in (select org_id from users where id = auth.uid() and role = 'admin'));

-- Trigger para actualizar updated_at automáticamente
create or replace function set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create trigger expense_reports_updated_at
  before update on expense_reports
  for each row execute function set_updated_at();

-- ============================================================
-- EXPENSE_ITEMS — ítems de una rendición
-- ============================================================
create table expense_items (
  id                   uuid primary key default uuid_generate_v4(),
  report_id            uuid not null references expense_reports on delete cascade,
  org_id               uuid not null references organizations on delete cascade,
  description          text not null,
  amount               numeric not null,
  currency             text not null default 'CLP',
  exchange_rate        numeric not null default 1,
  exchange_rate_source text not null default 'api' check (exchange_rate_source in ('api','manual')),
  amount_clp           numeric not null,
  date                 date not null,
  category_id          uuid references expense_categories,
  merchant             text,
  doc_type             text check (doc_type in ('boleta','factura','factura_exenta','ticket','otro')),
  doc_number           text,
  notes                text,
  status               text not null default 'pending' check (status in ('pending','approved','rejected')),
  rejection_reason     text,
  ocr_raw              jsonb,
  ocr_confidence       numeric,
  created_at           timestamptz not null default now()
);

alter table expense_items enable row level security;

create policy "report owner can manage items"
  on expense_items for all
  using (
    report_id in (select id from expense_reports where submitter_id = auth.uid())
  );

create policy "approver can read and update items"
  on expense_items for select
  using (
    report_id in (
      select er.id from expense_reports er
      join employee_policies ep on ep.user_id = er.submitter_id
      join approval_policies ap on ap.id = ep.policy_id
      where ap.levels @> jsonb_build_array(jsonb_build_object('approver_id', auth.uid()::text))
    )
  );

create policy "approver can update item status"
  on expense_items for update
  using (
    report_id in (
      select er.id from expense_reports er
      join employee_policies ep on ep.user_id = er.submitter_id
      join approval_policies ap on ap.id = ep.policy_id
      where ap.levels @> jsonb_build_array(jsonb_build_object('approver_id', auth.uid()::text))
    )
  );

create policy "admin can manage all items in org"
  on expense_items for all
  using (org_id in (select org_id from users where id = auth.uid() and role = 'admin'));

-- ============================================================
-- ATTACHMENTS — fotos/PDFs en Supabase Storage
-- ============================================================
create table attachments (
  id             uuid primary key default uuid_generate_v4(),
  item_id        uuid not null references expense_items on delete cascade,
  org_id         uuid not null references organizations on delete cascade,
  storage_path   text not null,
  file_type      text not null check (file_type in ('image','pdf')),
  file_size      int,
  thumbnail_path text,
  created_at     timestamptz not null default now()
);

alter table attachments enable row level security;

create policy "org members can read attachments"
  on attachments for select
  using (org_id in (select org_id from users where id = auth.uid()));

create policy "submitter can insert attachments"
  on attachments for insert
  with check (org_id = (select org_id from users where id = auth.uid()));

create policy "admin can manage attachments"
  on attachments for all
  using (org_id in (select org_id from users where id = auth.uid() and role = 'admin'));

-- ============================================================
-- EXPENSE_REPORT_APPROVALS — log de auditoría APPEND-ONLY
-- ============================================================
create table expense_report_approvals (
  id              uuid primary key default uuid_generate_v4(),
  report_id       uuid not null references expense_reports on delete cascade,
  approver_id     uuid not null references users on delete restrict,
  level           int not null default 1,
  action          text not null check (action in ('approved','rejected','partially_approved','returned_to_draft')),
  items_approved  uuid[],
  items_rejected  uuid[],
  notes           text,
  created_at      timestamptz not null default now()
  -- NUNCA se actualiza: solo INSERT, nunca UPDATE ni DELETE
);

alter table expense_report_approvals enable row level security;

-- Solo lectura para los involucrados
create policy "involved parties can read approvals"
  on expense_report_approvals for select
  using (
    report_id in (
      select id from expense_reports where submitter_id = auth.uid()
    )
    or approver_id = auth.uid()
    or report_id in (
      select id from expense_reports
      where org_id in (select org_id from users where id = auth.uid() and role = 'admin')
    )
  );

-- Solo INSERT (append-only)
create policy "approvers can insert approvals"
  on expense_report_approvals for insert
  with check (approver_id = auth.uid());

-- BLOQUEAR updates y deletes en esta tabla — auditoría inmutable
create rule no_update_approvals as on update to expense_report_approvals do instead nothing;
create rule no_delete_approvals as on delete to expense_report_approvals do instead nothing;

-- ============================================================
-- NOTIFICATIONS — notificaciones in-app
-- ============================================================
create table notifications (
  id         uuid primary key default uuid_generate_v4(),
  org_id     uuid not null references organizations on delete cascade,
  user_id    uuid not null references users on delete cascade,
  type       text not null check (type in ('submission','approval','rejection','reimbursement')),
  report_id  uuid references expense_reports on delete cascade,
  read       boolean not null default false,
  created_at timestamptz not null default now()
);

alter table notifications enable row level security;

create policy "users can read own notifications"
  on notifications for select
  using (user_id = auth.uid());

create policy "users can mark own notifications as read"
  on notifications for update
  using (user_id = auth.uid());

create policy "system can insert notifications"
  on notifications for insert
  with check (org_id in (select org_id from users where id = auth.uid()));

-- ============================================================
-- STORAGE BUCKET — para fotos de boletas
-- ============================================================
-- Ejecutar manualmente en Supabase Dashboard > Storage o via API:
-- Crear bucket 'expense-attachments' con:
--   public: false
--   file size limit: 10MB
--   allowed mime types: image/jpeg, image/png, image/webp, application/pdf

-- ============================================================
-- ÍNDICES para performance
-- ============================================================
create index idx_expense_reports_org_status on expense_reports (org_id, status);
create index idx_expense_reports_submitter on expense_reports (submitter_id, status);
create index idx_expense_items_report on expense_items (report_id);
create index idx_notifications_user_unread on notifications (user_id, read) where read = false;
create index idx_users_org on users (org_id);
```

- [ ] **Step 2: Crear seed.sql con datos de PENTA**

Crear `supabase/seed.sql`:

```sql
-- PENTA y Cía. como primer cliente (beta)
-- Ejecutar después de 001_initial_schema.sql

-- Crear organización PENTA
insert into organizations (id, name, slug, country, currency, plan)
values (
  '00000000-0000-0000-0000-000000000001',
  'PENTA y Cía.',
  'penta',
  'CL',
  'CLP',
  'free'
);

-- NOTA: Los usuarios se crean via Supabase Auth (sign up)
-- Luego se vinculan manualmente a la org en la tabla users.
-- Ver README para el flujo de onboarding del primer admin.
```

- [ ] **Step 3: Aplicar el schema al proyecto Supabase**

Si el MCP de Supabase está disponible, usar `mcp__claude_ai_Supabase__apply_migration` con el contenido del archivo SQL.

Alternativa con CLI (desde el directorio del proyecto):

```bash
supabase db push
```

Alternativa manual: copiar y pegar el SQL en Supabase Dashboard > SQL Editor > New query.

- [ ] **Step 4: Commit**

```bash
git add supabase/
git commit -m "feat: add complete Supabase schema — 8 tables, RLS, audit log"
```

---

## Task 5: Supabase Client + Variables de entorno

**Files:**
- Crear: `.env.local`
- Crear: `src/lib/supabase/client.ts`
- Crear: `src/lib/supabase/server.ts`
- Crear: `src/lib/supabase/types.ts`
- Crear: `src/app/api/auth/callback/route.ts`

- [ ] **Step 1: Crear .env.local**

```bash
# .env.local — NUNCA commitear este archivo
NEXT_PUBLIC_SUPABASE_URL=https://TU-PROYECTO.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=tu_anon_key_aqui
ANTHROPIC_API_KEY=tu_api_key_de_anthropic
RESEND_API_KEY=tu_api_key_de_resend
EXCHANGE_RATE_API_KEY=tu_api_key_de_exchangerate
```

Reemplazar los valores con los datos del proyecto Supabase nuevo.

- [ ] **Step 2: Agregar .env.local a .gitignore**

Verificar que `.gitignore` ya contiene `.env.local` (create-next-app lo hace por defecto). Si no:

```bash
echo ".env.local" >> .gitignore
```

- [ ] **Step 3: Crear cliente browser (para componentes del lado cliente)**

Crear `src/lib/supabase/client.ts`:

```typescript
import { createBrowserClient } from '@supabase/ssr'
import type { Database } from './types'

export function createClient() {
  return createBrowserClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )
}
```

- [ ] **Step 4: Crear cliente server (para Server Actions y Server Components)**

Crear `src/lib/supabase/server.ts`:

```typescript
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import type { Database } from './types'

export async function createClient() {
  const cookieStore = await cookies()

  return createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll()
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            )
          } catch {
            // Server Component — las cookies se ignoran en este contexto
          }
        },
      },
    }
  )
}
```

- [ ] **Step 5: Crear types.ts con los tipos de la DB**

Crear `src/lib/supabase/types.ts`:

```typescript
// Tipos generados del schema de Supabase
// Para regenerar: npx supabase gen types typescript --project-id TU_PROJECT_ID > src/lib/supabase/types.ts

export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[]

export interface Database {
  public: {
    Tables: {
      organizations: {
        Row: {
          id: string
          name: string
          slug: string
          country: string
          currency: string
          plan: 'free' | 'pro' | 'enterprise'
          logo_url: string | null
          created_at: string
        }
        Insert: Omit<Database['public']['Tables']['organizations']['Row'], 'id' | 'created_at'> & { id?: string; created_at?: string }
        Update: Partial<Database['public']['Tables']['organizations']['Insert']>
      }
      users: {
        Row: {
          id: string
          org_id: string
          full_name: string
          role: 'admin' | 'approver' | 'employee'
          can_submit: boolean
          can_approve: boolean
          department: string | null
          bank_account: string | null
          is_active: boolean
          created_at: string
        }
        Insert: Omit<Database['public']['Tables']['users']['Row'], 'created_at'> & { created_at?: string }
        Update: Partial<Database['public']['Tables']['users']['Insert']>
      }
      approval_policies: {
        Row: {
          id: string
          org_id: string
          name: string
          levels: Json
          is_default: boolean
          created_at: string
        }
        Insert: Omit<Database['public']['Tables']['approval_policies']['Row'], 'id' | 'created_at'> & { id?: string; created_at?: string }
        Update: Partial<Database['public']['Tables']['approval_policies']['Insert']>
      }
      employee_policies: {
        Row: { user_id: string; policy_id: string }
        Insert: Database['public']['Tables']['employee_policies']['Row']
        Update: Partial<Database['public']['Tables']['employee_policies']['Insert']>
      }
      expense_categories: {
        Row: {
          id: string
          org_id: string | null
          name: string
          icon: string | null
          color: string | null
          required_doc_types: string[] | null
          is_active: boolean
        }
        Insert: Omit<Database['public']['Tables']['expense_categories']['Row'], 'id'> & { id?: string }
        Update: Partial<Database['public']['Tables']['expense_categories']['Insert']>
      }
      expense_reports: {
        Row: {
          id: string
          org_id: string
          submitter_id: string
          title: string
          description: string | null
          status: 'draft' | 'submitted' | 'pending_l2' | 'approved' | 'partially_approved' | 'rejected' | 'reimbursed'
          current_level: number
          total_amount: number
          approved_amount: number
          currency: string
          submitted_at: string | null
          approved_at: string | null
          reimbursed_at: string | null
          reimbursed_by: string | null
          payment_reference: string | null
          created_at: string
          updated_at: string
        }
        Insert: Omit<Database['public']['Tables']['expense_reports']['Row'], 'id' | 'created_at' | 'updated_at'> & { id?: string; created_at?: string; updated_at?: string }
        Update: Partial<Database['public']['Tables']['expense_reports']['Insert']>
      }
      expense_items: {
        Row: {
          id: string
          report_id: string
          org_id: string
          description: string
          amount: number
          currency: string
          exchange_rate: number
          exchange_rate_source: 'api' | 'manual'
          amount_clp: number
          date: string
          category_id: string | null
          merchant: string | null
          doc_type: 'boleta' | 'factura' | 'factura_exenta' | 'ticket' | 'otro' | null
          doc_number: string | null
          notes: string | null
          status: 'pending' | 'approved' | 'rejected'
          rejection_reason: string | null
          ocr_raw: Json | null
          ocr_confidence: number | null
          created_at: string
        }
        Insert: Omit<Database['public']['Tables']['expense_items']['Row'], 'id' | 'created_at'> & { id?: string; created_at?: string }
        Update: Partial<Database['public']['Tables']['expense_items']['Insert']>
      }
      attachments: {
        Row: {
          id: string
          item_id: string
          org_id: string
          storage_path: string
          file_type: 'image' | 'pdf'
          file_size: number | null
          thumbnail_path: string | null
          created_at: string
        }
        Insert: Omit<Database['public']['Tables']['attachments']['Row'], 'id' | 'created_at'> & { id?: string; created_at?: string }
        Update: Partial<Database['public']['Tables']['attachments']['Insert']>
      }
      expense_report_approvals: {
        Row: {
          id: string
          report_id: string
          approver_id: string
          level: number
          action: 'approved' | 'rejected' | 'partially_approved' | 'returned_to_draft'
          items_approved: string[] | null
          items_rejected: string[] | null
          notes: string | null
          created_at: string
        }
        Insert: Omit<Database['public']['Tables']['expense_report_approvals']['Row'], 'id' | 'created_at'> & { id?: string; created_at?: string }
        Update: never  // append-only
      }
      notifications: {
        Row: {
          id: string
          org_id: string
          user_id: string
          type: 'submission' | 'approval' | 'rejection' | 'reimbursement'
          report_id: string | null
          read: boolean
          created_at: string
        }
        Insert: Omit<Database['public']['Tables']['notifications']['Row'], 'id' | 'created_at'> & { id?: string; created_at?: string }
        Update: Partial<Pick<Database['public']['Tables']['notifications']['Row'], 'read'>>
      }
    }
    Views: {}
    Functions: {}
    Enums: {}
  }
}

// Tipos de conveniencia
export type Organization = Database['public']['Tables']['organizations']['Row']
export type UserProfile = Database['public']['Tables']['users']['Row']
export type ApprovalPolicy = Database['public']['Tables']['approval_policies']['Row']
export type ExpenseReport = Database['public']['Tables']['expense_reports']['Row']
export type ExpenseItem = Database['public']['Tables']['expense_items']['Row']
export type Attachment = Database['public']['Tables']['attachments']['Row']
export type ExpenseCategory = Database['public']['Tables']['expense_categories']['Row']
export type ExpenseReportApproval = Database['public']['Tables']['expense_report_approvals']['Row']
export type Notification = Database['public']['Tables']['notifications']['Row']
```

- [ ] **Step 6: Crear callback route para Supabase Auth**

Crear `src/app/api/auth/callback/route.ts`:

```typescript
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { NextRequest, NextResponse } from 'next/server'
import type { Database } from '@/lib/supabase/types'

export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url)
  const code = searchParams.get('code')
  const next = searchParams.get('next') ?? '/'

  if (!code) {
    return NextResponse.redirect(`${origin}/login?error=missing_code`)
  }

  const cookieStore = await cookies()
  const supabase = createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => cookieStore.getAll(),
        setAll: (cookiesToSet) => {
          cookiesToSet.forEach(({ name, value, options }) =>
            cookieStore.set(name, value, options)
          )
        },
      },
    }
  )

  const { error } = await supabase.auth.exchangeCodeForSession(code)

  if (error) {
    return NextResponse.redirect(`${origin}/login?error=auth_error`)
  }

  return NextResponse.redirect(`${origin}${next}`)
}
```

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "feat: add Supabase client (browser + server), types, auth callback"
```

---

## Task 6: Middleware de protección de rutas

**Files:**
- Crear: `src/middleware.ts`

- [ ] **Step 1: Crear middleware**

Crear `src/middleware.ts`:

```typescript
import { createServerClient } from '@supabase/ssr'
import { NextRequest, NextResponse } from 'next/server'

export async function middleware(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll: (cookiesToSet) => {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          )
          supabaseResponse = NextResponse.next({ request })
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          )
        },
      },
    }
  )

  const { data: { user } } = await supabase.auth.getUser()

  const { pathname } = request.nextUrl

  // Rutas públicas — no requieren auth
  const publicPaths = ['/login', '/register', '/api/auth']
  const isPublic = publicPaths.some(p => pathname.startsWith(p))

  if (!user && !isPublic) {
    const url = request.nextUrl.clone()
    url.pathname = '/login'
    url.searchParams.set('next', pathname)
    return NextResponse.redirect(url)
  }

  if (user && pathname === '/login') {
    return NextResponse.redirect(new URL('/', request.url))
  }

  return supabaseResponse
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|manifest.json|icons).*)',
  ],
}
```

- [ ] **Step 2: Commit**

```bash
git add src/middleware.ts
git commit -m "feat: add middleware — protect routes, redirect unauthenticated users"
```

---

## Task 7: Página de Login

**Files:**
- Crear: `src/app/(auth)/login/page.tsx`
- Crear: `src/app/(auth)/layout.tsx`

- [ ] **Step 1: Layout del grupo auth**

Crear `src/app/(auth)/layout.tsx`:

```typescript
export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-sidebar flex items-center justify-center p-4">
      <div className="w-full max-w-sm">
        {/* Logo / marca */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 bg-brand-600 rounded-2xl mb-4">
            <svg className="w-8 h-8 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
            </svg>
          </div>
          <h1 className="text-2xl font-bold text-white">Rindegastos</h1>
          <p className="text-slate-400 text-sm mt-1">PENTA y Cía.</p>
        </div>
        {children}
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Página de login**

Crear `src/app/(auth)/login/page.tsx`:

```typescript
'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter, useSearchParams } from 'next/navigation'

export default function LoginPage() {
  const [email, setEmail]       = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading]   = useState(false)
  const [error, setError]       = useState<string | null>(null)

  const router       = useRouter()
  const searchParams = useSearchParams()
  const next         = searchParams.get('next') ?? '/'

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError(null)

    const supabase = createClient()
    const { error } = await supabase.auth.signInWithPassword({ email, password })

    if (error) {
      setError('Correo o contraseña incorrectos')
      setLoading(false)
      return
    }

    router.push(next)
    router.refresh()
  }

  return (
    <div className="bg-white rounded-card shadow-card p-6">
      <h2 className="text-lg font-semibold text-slate-800 mb-6">Iniciar sesión</h2>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-item p-3 mb-4">
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label htmlFor="email" className="block text-sm font-medium text-slate-700 mb-1">
            Correo electrónico
          </label>
          <input
            id="email"
            type="email"
            required
            value={email}
            onChange={e => setEmail(e.target.value)}
            className="w-full px-3 py-2.5 border border-slate-200 rounded-item text-sm focus:outline-none focus:ring-2 focus:ring-brand-600 focus:border-transparent"
            placeholder="tu@empresa.cl"
          />
        </div>

        <div>
          <label htmlFor="password" className="block text-sm font-medium text-slate-700 mb-1">
            Contraseña
          </label>
          <input
            id="password"
            type="password"
            required
            value={password}
            onChange={e => setPassword(e.target.value)}
            className="w-full px-3 py-2.5 border border-slate-200 rounded-item text-sm focus:outline-none focus:ring-2 focus:ring-brand-600 focus:border-transparent"
            placeholder="••••••••"
          />
        </div>

        <button
          type="submit"
          disabled={loading}
          className="w-full bg-brand-600 hover:bg-brand-700 disabled:opacity-50 text-white font-semibold py-2.5 px-4 rounded-item transition-colors"
        >
          {loading ? 'Ingresando...' : 'Ingresar'}
        </button>
      </form>
    </div>
  )
}
```

- [ ] **Step 3: Verificar que el login compila y se ve correctamente**

```bash
npm run dev
```

Abrir `http://localhost:3000/login`. Verificar que muestra el formulario con el diseño correcto (fondo oscuro, card blanca, botón indigo).

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "feat: add login page with Supabase auth — dark sidebar background"
```

---

## Task 8: Layout autenticado + Componentes UI base

**Files:**
- Crear: `src/app/(app)/layout.tsx`
- Crear: `src/app/(app)/page.tsx`
- Crear: `src/components/ui/Button.tsx`
- Crear: `src/components/ui/Card.tsx`
- Crear: `src/components/ui/Badge.tsx`
- Crear: `src/components/ui/CurrencyAmount.tsx`
- Crear: `src/components/layout/Sidebar.tsx`
- Crear: `src/components/layout/MobileNav.tsx`

- [ ] **Step 1: Crear componentes UI base**

Crear `src/components/ui/Button.tsx`:

```typescript
import { cn } from '@/lib/utils'
import { ButtonHTMLAttributes, forwardRef } from 'react'

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'danger' | 'ghost'
  size?: 'sm' | 'md' | 'lg'
}

const variants = {
  primary:   'bg-brand-600 hover:bg-brand-700 text-white',
  secondary: 'bg-white hover:bg-slate-50 text-slate-700 border border-slate-200',
  danger:    'bg-red-500 hover:bg-red-600 text-white',
  ghost:     'hover:bg-slate-100 text-slate-600',
}

const sizes = {
  sm: 'text-xs px-3 py-1.5',
  md: 'text-sm px-4 py-2.5',
  lg: 'text-base px-6 py-3',
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = 'primary', size = 'md', children, disabled, ...props }, ref) => (
    <button
      ref={ref}
      disabled={disabled}
      className={cn(
        'inline-flex items-center justify-center font-semibold rounded-item transition-colors',
        'disabled:opacity-50 disabled:cursor-not-allowed',
        variants[variant],
        sizes[size],
        className
      )}
      {...props}
    >
      {children}
    </button>
  )
)
Button.displayName = 'Button'
```

Crear `src/components/ui/Card.tsx`:

```typescript
import { cn } from '@/lib/utils'

interface CardProps {
  children: React.ReactNode
  className?: string
  hero?: boolean  // degradado morado para card principal
}

export function Card({ children, className, hero }: CardProps) {
  return (
    <div
      className={cn(
        'rounded-card shadow-card p-4',
        hero
          ? 'bg-card-hero text-white'
          : 'bg-white border border-slate-100',
        className
      )}
    >
      {children}
    </div>
  )
}
```

Crear `src/components/ui/Badge.tsx`:

```typescript
import { cn } from '@/lib/utils'
import { getStatusLabel } from '@/lib/utils'
import { STATUS_COLORS, ITEM_STATUS_ACCENT } from '@/lib/constants'
import type { ReportStatus, ItemStatus } from '@/lib/constants'

export function ReportStatusBadge({ status }: { status: ReportStatus }) {
  return (
    <span className={cn('inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold', STATUS_COLORS[status])}>
      {getStatusLabel(status)}
    </span>
  )
}

export function ItemStatusAccent({ status, children, className }: {
  status: ItemStatus
  children: React.ReactNode
  className?: string
}) {
  return (
    <div className={cn('pl-3', ITEM_STATUS_ACCENT[status], className)}>
      {children}
    </div>
  )
}
```

Crear `src/components/ui/CurrencyAmount.tsx`:

```typescript
import { cn } from '@/lib/utils'
import { formatAmount } from '@/lib/utils'
import type { Currency } from '@/lib/constants'

interface CurrencyAmountProps {
  amount: number
  currency?: Currency
  size?: 'sm' | 'md' | 'lg' | 'xl'
  className?: string
  muted?: boolean  // color gris en vez de slate-900
}

const sizes = {
  sm: 'text-sm',
  md: 'text-base',
  lg: 'text-xl',
  xl: 'text-3xl',
}

export function CurrencyAmount({
  amount,
  currency = 'CLP',
  size = 'md',
  className,
  muted,
}: CurrencyAmountProps) {
  return (
    <span
      className={cn(
        'font-manrope font-bold tabular-nums',
        sizes[size],
        muted ? 'text-slate-400' : 'text-slate-900',
        className
      )}
    >
      {formatAmount(amount, currency)}
    </span>
  )
}
```

- [ ] **Step 2: Crear Sidebar**

Crear `src/components/layout/Sidebar.tsx`:

```typescript
'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { cn } from '@/lib/utils'
import type { UserProfile } from '@/lib/supabase/types'

interface SidebarProps {
  user: UserProfile
  onLogout: () => void
}

const navItems = [
  { href: '/',               label: 'Inicio',        icon: '🏠', roles: ['admin','approver','employee'] },
  { href: '/expenses/new',   label: 'Nueva rendición', icon: '📷', roles: ['admin','employee'] },
  { href: '/approvals',      label: 'Aprobaciones',  icon: '✅', roles: ['admin','approver'] },
  { href: '/admin',          label: 'Dashboard Admin', icon: '📊', roles: ['admin'] },
  { href: '/admin/reports',  label: 'Rendiciones',   icon: '📋', roles: ['admin'] },
  { href: '/admin/employees',label: 'Empleados',     icon: '👥', roles: ['admin'] },
  { href: '/admin/settings', label: 'Configuración', icon: '⚙️', roles: ['admin'] },
]

export function Sidebar({ user, onLogout }: SidebarProps) {
  const pathname = usePathname()

  const visible = navItems.filter(item =>
    item.roles.includes(user.role) ||
    (item.href === '/approvals' && user.can_approve)
  )

  return (
    <aside className="hidden md:flex flex-col w-64 bg-sidebar min-h-screen">
      {/* Logo */}
      <div className="p-6 border-b border-white/10">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 bg-brand-600 rounded-lg flex items-center justify-center text-white text-sm font-bold">
            R
          </div>
          <span className="text-white font-semibold">Rindegastos</span>
        </div>
      </div>

      {/* Nav */}
      <nav className="flex-1 p-4 space-y-1">
        {visible.map(item => (
          <Link
            key={item.href}
            href={item.href}
            className={cn(
              'flex items-center gap-3 px-3 py-2.5 rounded-item text-sm font-medium transition-colors',
              pathname === item.href
                ? 'bg-brand-600 text-white'
                : 'text-slate-400 hover:text-white hover:bg-white/10'
            )}
          >
            <span>{item.icon}</span>
            {item.label}
          </Link>
        ))}
      </nav>

      {/* User + logout */}
      <div className="p-4 border-t border-white/10">
        <div className="flex items-center gap-3 mb-3">
          <div className="w-8 h-8 bg-brand-600/30 rounded-full flex items-center justify-center text-brand-100 text-sm font-semibold">
            {user.full_name[0].toUpperCase()}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-white text-sm font-medium truncate">{user.full_name}</p>
            <p className="text-slate-400 text-xs capitalize">{user.role}</p>
          </div>
        </div>
        <button
          onClick={onLogout}
          className="w-full text-left text-slate-400 hover:text-white text-xs transition-colors"
        >
          Cerrar sesión
        </button>
      </div>
    </aside>
  )
}
```

Crear `src/components/layout/MobileNav.tsx`:

```typescript
'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { cn } from '@/lib/utils'
import type { UserProfile } from '@/lib/supabase/types'

interface MobileNavProps {
  user: UserProfile
}

const mobileItems = [
  { href: '/',             label: 'Inicio',     icon: '🏠' },
  { href: '/expenses/new', label: 'Rendir',     icon: '📷', requiresSubmit: true },
  { href: '/approvals',    label: 'Aprobar',    icon: '✅', requiresApprove: true },
  { href: '/admin',        label: 'Admin',      icon: '📊', requiresAdmin: true },
]

export function MobileNav({ user }: MobileNavProps) {
  const pathname = usePathname()

  const visible = mobileItems.filter(item => {
    if (item.requiresSubmit && !user.can_submit) return false
    if (item.requiresApprove && !user.can_approve && user.role !== 'admin') return false
    if (item.requiresAdmin && user.role !== 'admin') return false
    return true
  })

  return (
    <nav className="md:hidden fixed bottom-0 inset-x-0 bg-white border-t border-slate-100 z-50">
      <div className="flex">
        {visible.map(item => (
          <Link
            key={item.href}
            href={item.href}
            className={cn(
              'flex-1 flex flex-col items-center py-3 text-xs font-medium transition-colors',
              pathname === item.href
                ? 'text-brand-600'
                : 'text-slate-400'
            )}
          >
            <span className="text-xl mb-1">{item.icon}</span>
            {item.label}
          </Link>
        ))}
      </div>
    </nav>
  )
}
```

- [ ] **Step 3: Crear layout autenticado**

Crear `src/app/(app)/layout.tsx`:

```typescript
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { Sidebar } from '@/components/layout/Sidebar'
import { MobileNav } from '@/components/layout/MobileNav'
import { LogoutButton } from '@/components/layout/LogoutButton'

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('users')
    .select('*')
    .eq('id', user.id)
    .single()

  if (!profile) redirect('/login')

  return (
    <div className="flex min-h-screen">
      <Sidebar user={profile} onLogout={() => {}} />
      <div className="flex-1 flex flex-col min-w-0">
        {/* Header móvil */}
        <header className="md:hidden bg-sidebar px-4 py-3 flex items-center gap-3">
          <div className="w-7 h-7 bg-brand-600 rounded-lg flex items-center justify-center text-white text-xs font-bold">
            R
          </div>
          <span className="text-white font-semibold text-sm">Rindegastos</span>
          <div className="ml-auto">
            <LogoutButton />
          </div>
        </header>
        <main className="flex-1 p-4 md:p-6 pb-20 md:pb-6">
          {children}
        </main>
      </div>
      <MobileNav user={profile} />
    </div>
  )
}
```

Crear `src/components/layout/LogoutButton.tsx`:

```typescript
'use client'

import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'

export function LogoutButton() {
  const router = useRouter()

  async function handleLogout() {
    const supabase = createClient()
    await supabase.auth.signOut()
    router.push('/login')
    router.refresh()
  }

  return (
    <button
      onClick={handleLogout}
      className="text-slate-400 hover:text-white text-sm transition-colors"
    >
      Salir
    </button>
  )
}
```

- [ ] **Step 4: Página placeholder de inicio**

Crear `src/app/(app)/page.tsx`:

```typescript
export default function DashboardPage() {
  return (
    <div className="space-y-4">
      <h1 className="text-xl font-bold text-slate-800">Inicio</h1>
      <p className="text-slate-500">Dashboard en construcción — Plan B</p>
    </div>
  )
}
```

- [ ] **Step 5: Actualizar Sidebar para usar LogoutButton**

Modificar `src/components/layout/Sidebar.tsx` — reemplazar el `<button onClick={onLogout}>` con `<LogoutButton />`:

```typescript
// Agregar import al inicio del archivo
import { LogoutButton } from './LogoutButton'

// Reemplazar el bloque de logout (líneas del botón "Cerrar sesión"):
<LogoutButton />
```

Y eliminar la prop `onLogout` de la interfaz y el componente ya que no se usa.

- [ ] **Step 6: Verificar que todo compila**

```bash
npm run build
```

Corregir cualquier error de TypeScript antes de continuar.

- [ ] **Step 7: Verificar en navegador**

```bash
npm run dev
```

1. Ir a `http://localhost:3000` → debe redirigir a `/login`
2. Iniciar sesión con un usuario de prueba → debe mostrar el dashboard placeholder con sidebar dark

- [ ] **Step 8: Commit final del Plan A**

```bash
git add -A
git commit -m "feat: Plan A complete — layout, auth, UI components, design system"
```

---

## Verificación final del Plan A

Antes de continuar con el Plan B, verificar que:

- [ ] `npm run build` compila sin errores
- [ ] `npm test` pasa (6 tests en verde)
- [ ] La página `/login` se ve con el diseño correcto (fondo oscuro `#0f172a`)
- [ ] Al loguearse, aparece el layout con sidebar dark y MobileNav en móvil
- [ ] El middleware redirige correctamente a `/login` si no hay sesión
- [ ] El schema de Supabase está aplicado (tablas visibles en Dashboard de Supabase)
