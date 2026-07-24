---
name: rindegastos-context
description: >
  Contexto completo del proyecto Rindegastos — app de rendición de gastos corporativos
  para organizaciones chilenas. USAR SIEMPRE al iniciar cualquier sesión en este proyecto,
  o cuando el agente mencione: proxy.ts, middleware, Tailwind config, expense reports,
  OCR de boletas, aprobaciones, Supabase de rindegastos, Plan B, Plan C, rendidor,
  aprobador, o cualquier entidad del dominio (ExpenseReport, ExpenseItem, Organization, etc.).
  También usar cuando el agente dude sobre convenciones de Next.js 16 o Tailwind v4.
---

# Rindegastos — Contexto del Proyecto

> Leer este archivo completo al inicio de cada sesión. Contiene decisiones inamovibles.
> Para detalles de schema SQL, ver `references/schema.md`.
> Para planes de implementación, ver `references/plans.md`.

---

## Stack

| Capa | Tecnología | Versión |
|------|-----------|---------|
| Framework | Next.js App Router | **16.2.7** |
| Runtime | Node.js | v24 |
| Lenguaje | TypeScript | ^5 |
| UI | React | 19.2.4 |
| Estilos | Tailwind CSS v4 (PostCSS) | ^4 |
| DB / Auth | Supabase | proyecto `jqtbtgduqzxkgubmzukg` |
| OCR | Anthropic SDK (Sonnet 4.6) | ^0.100.1 |
| Email | Resend | ^6 |
| Tipo de cambio | ExchangeRate-API (histórica) | — |
| Export Excel | xlsx (SheetJS) | ^0.18.5 |
| Export PDF | jsPDF + jspdf-autotable | ^4 / ^5 |
| Tests unitarios | Vitest + jsdom | ^4 |
| Tests E2E | Playwright | ^1.60 |
| Deploy | Vercel (pendiente) | — |

---

## ⚠️ Reglas críticas — NO negociar

### Next.js 16
- El archivo de protección de rutas es **`src/proxy.ts`** con `export async function proxy()`
- `middleware.ts` está **deprecado en Next.js 16** — no crearlo, no sugerirlo
- Si el build muestra warning sobre `middleware`, la solución es confirmar que `proxy.ts` existe
- **`src/actions/*.ts`**: toda función exportada debe ser `async` — regla de Server Actions de Next.js 16
  → Helpers puros SIEMPRE van en `src/lib/`, nunca en `src/actions/`
  → Tests importan desde `src/lib/`, no desde `src/actions/`

### Tailwind v4
- **No existe `tailwind.config.ts`** en este proyecto
- La configuración está en `src/app/globals.css` vía `@theme {}`
- No crear ni editar ningún `tailwind.config.*`

### Supabase
- Este proyecto usa el proyecto **`jqtbtgduqzxkgubmzukg`** (Rindegastos)
- Es **distinto** de `qkctqhsugcflelnsitvl` (PENTA/fintrack) — no mezclar credenciales
- Clientes: `src/lib/supabase/client.ts` (browser) y `src/lib/supabase/server.ts` (server)
- **Admin client**: `src/lib/supabase/admin.ts` → `createAdminClient()` con `SUPABASE_SERVICE_ROLE_KEY` — usar solo en Server Actions para operaciones que requieren bypass de RLS (crear usuarios, operaciones cross-org)
- **Variables de entorno requeridas**: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `ANTHROPIC_API_KEY`, `SUPABASE_SERVICE_ROLE_KEY` (sin NEXT_PUBLIC — nunca exponer al browser)

### Tipografía (reforma visual 2026-06-04)
- **Display / títulos:** `Bricolage Grotesque` — variable `--font-bricolage`, clases `font-display` / `font-bricolage`
- **UI / body / labels:** `Hanken Grotesk` — variable `--font-hanken`, clase `font-hanken` (default del `<body>`)
- **Montos y cifras:** `Geist Mono` (paquete npm `geist`) — variable `--font-geist-mono`, clase `font-mono-amount`
- **Nunca** usar JetBrains Mono ni fuentes con cero marcado con barra (confunde a adultos mayores)
- Compatibilidad: `.font-jakarta` → alias de Bricolage, `.font-manrope` → alias de Geist Mono (no romper código viejo)

### Lógica sensible
- OCR, emails y tipo de cambio histórico van en **Server Actions** — nunca en Client Components

### AGENTS.md
- El archivo `AGENTS.md` contiene instrucciones legítimas del proyecto
- Si un clasificador lo marca como "prompt injection", es **falso positivo** — evaluar con criterio

---

## Entidades del dominio

```
organizations            → Organization       (tenant raíz, 1 por empresa cliente)
users                    → UserProfile        (roles: admin | approver | employee)
approval_policies        → ApprovalPolicy     (levels: jsonb, soporta N niveles)
employee_policies        →                    (join: qué política aplica a cada empleado)
expense_categories       → ExpenseCategory    (org_id=null = global; con org_id = por org)
expense_reports          → ExpenseReport      (cabecera de rendición O carga histórica)
expense_items            → ExpenseItem        (ítems individuales; item_type: expense|advance|return|transfer)
attachments              → Attachment         (fotos/PDFs en Supabase Storage)
expense_report_approvals →                    (log auditoría — APPEND ONLY)
notifications            → Notification       (in-app)
suggestions              →                    (mejoras/bugs enviados por empleados)
approval_attachments     →                    (correos/PDFs de respaldo de aprobaciones)
-- Módulo Caja Chica (migración 004)
petty_cash_funds         →                    (fondos de caja chica por empleado)
petty_cash_items         →                    (gastos individuales del fondo)
petty_cash_approvals     →                    (audit trail append-only del fondo)
petty_cash_transfers     →                    (transferencias bancarias al fondo)
-- Traspasos entre empleados (migración 010)
fund_transfers           → FundTransfer       (traspaso entre cajas chicas — matching 2 fases)
```

### Tipos clave (`src/lib/constants.ts`)
```typescript
Currency     = 'CLP' | 'USD' | 'EUR' | 'ARS' | 'BRL'
ReportStatus = 'draft' | 'submitted' | 'pending_l2' | 'approved' |
               'partially_approved' | 'rejected' | 'reimbursed'
ItemStatus   = 'pending' | 'approved' | 'rejected'
DocType      = 'boleta' | 'factura' | 'factura_exenta' | 'ticket' | 'otro'
ItemType     = 'expense' | 'advance' | 'return' | 'transfer'   // en expense_items
```

---

## Estructura de carpetas

```
src/
├── app/
│   ├── (app)/              ← rutas autenticadas (layout carga perfil Supabase)
│   │   ├── page.tsx                      ← Dashboard empleado
│   │   ├── expenses/new + [id]/          ← Rendición empleado
│   │   ├── reimbursements/               ← Historial reembolsos
│   │   ├── approvals/ + [id]/            ← Bandeja aprobador
│   │   ├── admin/                        ← KPIs + reports + employees + settings
│   │   │   ├── carga-historica/          ← Importador histórico Excel
│   │   │   └── trash/                    ← Papelera (soft delete, 90 días)
│   │   ├── petty-cash/ + new + [id]/     ← Módulo Caja Chica
│   │   ├── profile/                      ← Perfil + datos bancarios
│   │   └── suggestions/                  ← Sugerencias y bugs
│   ├── (auth)/login/       ← 'use client', Suspense para useSearchParams
│   ├── api/auth/callback/  ← OAuth code exchange
│   └── globals.css         ← Tailwind v4 @theme + clases fallback
├── actions/                ← 13 server actions
│   ├── admin.ts, approvals.ts, employees.ts, expenses.ts
│   ├── fund-transfers.ts, historical-import.ts, notifications.ts
│   ├── ocr.ts, petty-cash.ts, profile.ts, suggestions.ts
│   ├── approval-attachments.ts, exchange-rate.ts
├── components/
│   ├── layout/             ← Sidebar (drag&drop), MobileNav, LogoutButton
│   ├── ui/                 ← Button, Card, Badge, CurrencyAmount
│   └── admin/              ← EmployeeImport, AddEmployeeForm, ApproverConfig
├── lib/
│   ├── constants.ts        ← CURRENCIES, DOC_TYPES, STATUS_COLORS, STATUS_DOT
│   ├── utils.ts            ← formatCLP, formatAmount, formatDate, cn
│   ├── supabase/           ← client.ts, server.ts, admin.ts (service role), types.ts
│   └── export/             ← excel.ts, pdf.ts
├── proxy.ts                ← protección de rutas (Next.js 16)
└── tests/
supabase/
├── migrations/
│   ├── 001_initial_schema.sql     ← tablas base + RLS + triggers
│   ├── 004_petty_cash.sql         ← caja chica (4 tablas)
│   ├── 005_suggestions_and_approval_attachments.sql
│   ├── 007_historical_import_flag.sql
│   ├── 008_historical_import_type_and_fund_number.sql
│   ├── 009_expense_items_item_type.sql
│   └── 010_fund_transfers.sql     ← traspasos entre cajas chicas
└── seed.sql
docs/superpowers/
├── plans/
└── specs/
```

---

## Estado de implementación

### ✅ Plan A — Completo
- Proyecto scaffolded, design system (Tailwind v4, paleta indigo, fuentes)
- Constantes + utils + 6 tests Vitest
- Schema Supabase completo (10 tablas + RLS + triggers + índices)
- Clientes Supabase + tipos TypeScript
- `src/proxy.ts` (protección de rutas)
- Login (Supabase Auth, email+password)
- Layout autenticado (Sidebar dark, MobileNav, Header móvil)
- Componentes UI: Button, Card, Badge, CurrencyAmount

### ✅ Plan B — Completo
- Dashboard rendidor (hero card, KPIs, CTA)
- `src/actions/ocr.ts` — `runOcr` con Claude Sonnet 4.6 (~$0.008/foto)
- `src/actions/exchange-rate.ts` — `getHistoricalRate` (TC histórico, cache 24h)
- `src/actions/expenses.ts` — CRUD completo (create, addItem, delete, submit, upload)
- `src/lib/ocr-helpers.ts` — `buildOcrPrompt`, `parseOcrResponse` (helpers puros)
- `src/lib/exchange-rate-helpers.ts` — `buildExchangeRateUrl`, `parseExchangeRateResponse`, `convertToCLP`
- `src/lib/expense-helpers.ts` — `calculateReportTotal`, `validateExpenseItem`
- `PhotoUpload.tsx` — captura cámara móvil (`capture="environment"`) + OCR con fallback graceful
- `ExpenseItemForm.tsx` — ítem con pre-llenado OCR + TC dinámico por fecha
- `ExpenseItemCard.tsx`, `ExpenseReportCard.tsx`
- Páginas: `/expenses/new`, `/expenses/[id]`, `/reimbursements`
- 22 tests Vitest pasando · build TypeScript limpio

### ✅ Plan C — Completo
- `src/lib/approval-helpers.ts` — `computeReportStatus`, `computeApprovedAmount` (helpers puros)
- `src/actions/approvals.ts` — `getPendingApprovals`, `getReportForApproval`, `submitApprovalDecision`, `markReimbursed`
- `src/actions/notifications.ts` — notificaciones in-app + Resend opcional (en-app solo; email requiere lookup de auth.users)
- `src/actions/admin.ts` — `getAdminKpis`, `getAllReports`, `getOrgEmployees`, `updateEmployee`, `getOrgCategories`, `addCategory`, `toggleCategoryActive`, `getOrgPolicies`, `addPolicy`, `setDefaultPolicy`
- Páginas aprobador: `/approvals` (Server), `/approvals/[id]` (Client — foto + toggles approve/reject por ítem)
- Páginas admin: `/admin` (KPIs), `/admin/reports` (filtros por status), `/admin/employees`, `/admin/settings` (tabs categorías + políticas)
- `src/components/expenses/ReimbursedButton.tsx` — confirmar reembolso con referencia de pago
- `src/lib/export/excel.ts` — SheetJS: `exportReportToExcel`, `exportReportsListToExcel`
- `src/lib/export/pdf.ts` — jsPDF + autotable: `exportReportToPDF`
- `src/components/expenses/ExportButton.tsx` — import dinámico de lib de export
- `public/manifest.json` — PWA installable (manifest + metadata en layout.tsx)
- 32 tests Vitest pasando · build TypeScript limpio · 13 rutas

### ✅ Post Plan C — Módulos adicionales (2026-06-03/04)

**Gestión de empleados:**
- `src/lib/supabase/admin.ts` — `createAdminClient()` con `SUPABASE_SERVICE_ROLE_KEY` (bypasea RLS, indispensable para crear usuarios)
- `src/actions/employees.ts` — `importEmployees(rows[])`: crea auth users + inserta en `public.users` + rollback si falla
- `src/components/admin/EmployeeImport.tsx` — XLSX drag-drop → preview editable (nombre/email/rol/dept) → confirmar → invitación
- `src/components/admin/AddEmployeeForm.tsx` — formulario inline para agregar uno a uno
- `/admin/employees/page.tsx` — dos botones: "➕ Agregar empleado" y "📊 Importar nómina", mutuamente excluyentes
- `nomina-ejemplo.xlsx` en raíz del proyecto — archivo de prueba generado con Node.js + SheetJS

**Cadena de aprobación por empleado (reemplaza políticas abstractas):**
- `approver_l1_id uuid` y `approver_l2_id uuid` agregados a `users` (migration `add_approval_chain_to_users`)
- `src/actions/admin.ts` — `setEmployeeApprovers(userId, l1Id, l2Id|null)`
- `src/components/admin/ApproverConfig.tsx` — dropdowns L1/L2, preview del flujo en texto ("Ana → Carlos → Aprobado")
- Employee card muestra badge: ⚠ Sin aprobador (ámbar) | ⛓ nombre → nombre (verde)
- **Lógica de cadena en `submitApprovalDecision`**: si es decisión L1 (status=`submitted`) y L2 existe y todos los ítems aprobados → ítems se resetean a `pending`, status → `pending_l2`. Cualquier rechazo de L1 = estado final.
- `getPendingApprovals()` filtra por aprobador designado: status=`submitted` → muestra al L1 del rendidor; status=`pending_l2` → muestra al L2. Fallback: si no hay L1 configurado, visible a todos los `can_approve`.
- "Políticas de aprobación" eliminado del UI de settings → banner informativo que apunta a Empleados

**Perfil de usuario:**
- DB migration `add_profile_banking_fields`: `rut`, `bank_name`, `bank_account_type` en `users`
- `src/actions/profile.ts` — `getMyProfile()` retorna `{ ...profile, email: user.email }` (email de auth, no de public.users), `updateProfile()`, `sendPasswordReset()`
- `src/app/(app)/profile/page.tsx` — dos secciones: Información personal (nombre, RUT, email readonly, depto) + Información bancaria (banco dropdown, tipo cuenta, nro cuenta)
- Sidebar: avatar clickeable → `/profile`

**Sidebar dinámico:**
- Orden guardado en `localStorage` key `sidebar_order_${userId}` (por admin, no por org)
- Botón "Personalizar menú" (solo admins) activa modo **drag & drop** — arrastrar ítems directamente, sin flechas
- Feedback visual: ítem arrastrado → opacity 30% + scale; línea teal indica posición destino; `cursor-grab`/`cursor-grabbing`
- Usa HTML5 Drag & Drop API nativa (`draggable`, `onDragStart/Over/Drop/End`) — sin librerías externas
- Ghost nativo suprimido con un div invisible temporal (`setDragImage`)
- "Inicio" renombrado a **"Estado"** (en Sidebar y MobileNav)

**Admin Rendiciones — vista completa:**
- `src/actions/admin.ts` — `getAdminReports()` con submitter_name + department; `getReportDetailForAdmin(reportId)` con historial de aprobaciones (L1/L2, acción, notas) + ítems con motivo de rechazo
- `/admin/reports/page.tsx` — Client Component con filtros combinables: rango de fechas, estado (chips), empleado, departamento, reembolsado/pendiente
- KPIs en tiempo real: Total rendido / Total aprobado / Pendiente de reembolso
- Detalle expandible por rendición (carga lazy): historial de aprobaciones coloreado + tabla de ítems con motivos de rechazo
- `exportAdminReportsToExcel()` — 2 hojas: Resumen (todos los campos) + Rechazos (solo ítems rechazados con motivo)
- `exportAdminReportsToPDF()` — horizontal, tabla principal + página adicional de rechazos

### ✅ Reforma visual — "Mi rendición" (2026-06-04)
- **Nombre del app**: "Rindegastos — PENTA" → **"Mi rendición"**
- **Color brand**: indigo → teal `#0D9488` — usar siempre clases `brand-*`, nunca `indigo-*`
- **Paleta neutral**: ink (escala `#080C16`…`#F6F8FB`, azul-negro frío); Sidebar bg `#0B1120`
- **Radios**: `rounded-item` (14px) y `rounded-card` (18px) — no usar valores hardcodeados
- **Íconos**: Lucide React (no emoji en UI)
- **Fuentes**: `npm install geist lucide-react` ya instalado
- **`tsconfig.json`**: `"Mi rendición — Design System"` en `exclude` (TS lo procesaba como código)
- **`STATUS_DOT`**: export en `constants.ts` para el dot de color sólido

### ✅ Soft delete + Papelera (post-reforma)
- `expense_reports.deleted_at timestamptz` — null=activo, valor=papelera
- `/admin/trash` — restaurar o eliminar definitivamente
- PWA icons apple-touch-icon

### ✅ Módulo Caja Chica (migración 004)
- 4 tablas: `petty_cash_funds`, `petty_cash_items`, `petty_cash_approvals` (append-only), `petty_cash_transfers`
- `users.can_manage_petty_cash boolean` — permiso de encargado de fondo
- `src/actions/petty-cash.ts` — CRUD fondos, ítems, flujo de estados, liquidación
- Páginas: `/petty-cash`, `/petty-cash/new`, `/petty-cash/[id]`
- Flujo: `draft → pending_approval → approved → funds_sent → submitted → pending_liquidation_approval → settled`
- Edición inline de ítems históricos con actualización optimista

### ✅ Importador histórico (migraciones 007/008)
- `/admin/carga-historica` — importar Excel de rendiciones y cajas chicas de períodos anteriores
- `src/actions/historical-import.ts`
- Campos nuevos en `expense_reports`: `is_historical_import bool`, `historical_type text` ('rendicion'|'caja_chica'), `fund_number text`
- Campos nuevos en `petty_cash_funds`: `is_historical_import bool`
- Edición inline: categoría, item_type, merchant, fecha, monto

### ✅ Sugerencias y adjuntos de aprobación (migración 005)
- `suggestions`: empleados envían mejoras/bugs; admin gestiona estado
- `approval_attachments`: correos/PDFs de respaldo vinculados a rendición O fondo
- Bucket `approval-attachments` en Storage
- `src/actions/suggestions.ts`, `src/actions/approval-attachments.ts`
- Página `/suggestions`

### ✅ Traspasos entre cajas chicas (migración 010)
- Tabla `fund_transfers` — matching en 2 fases (payer siempre conocido; receiver nullable hasta vincular)
- `expense_items.item_type = 'transfer'` + `transfer_id uuid`; `petty_cash_items.transfer_id uuid`
- `src/actions/fund-transfers.ts`: `createFundTransfer`, `linkFundTransfer`, `getOrgFundTransfers`, `getEmployeeTargets`, `getOrgEmployeesSimple`
- UI `/petty-cash`: sección "Traspasos sin vincular", botón SendHorizontal en fondos y cargas históricas, modales crear/vincular
- Ítems con `item_type='transfer'` NO son editables inline

### ✅ Deploy
- Repo GitHub: `danielmartinezcl-creator/Mis-Rendiciones` (branch `main`)
- Auto-deploy en Vercel en cada push a `main`

### ⏳ Pendiente / Backlog
- Export Defontana formato real 34 columnas (plan en `docs/superpowers/plans/`)
- Centro de costo por empleado (`users.cost_center_id`) — migración pendiente
- `expense_items.supplier_rut` para crédito fiscal IVA en facturas
- Notificaciones email: requiere service role para lookup en `auth.users`
- Service worker offline (`next-pwa` incompatible con Turbopack)

---

## Supabase — puntos no obvios

1. **`expense_report_approvals` es append-only a nivel PostgreSQL** (no solo RLS):
   ```sql
   create rule no_update_approvals as on update to expense_report_approvals do instead nothing;
   create rule no_delete_approvals as on delete to expense_report_approvals do instead nothing;
   ```

2. **`amount_clp` en `expense_items` es inmutable post-aprobación** — el TC histórico no se recalcula

3. **Políticas de aprobadores** usan `jsonb @> jsonb_build_array(...)` para buscar dentro de `levels`

4. **`expense_reports`** tiene trigger `set_updated_at()` en cada UPDATE

5. **Storage bucket `expense-attachments`**: YA CREADO en el proyecto `jqtbtgduqzxkgubmzukg` vía SQL:
   ```sql
   insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
   values ('expense-attachments', 'expense-attachments', false, 10485760,
     array['image/jpeg','image/png','image/webp','application/pdf']);
   ```
   Políticas de storage: insert/select/delete para `auth.uid() is not null`.

6. **Orden correcto para aplicar migrations**: crear tablas → habilitar RLS → agregar políticas
   (las políticas que hacen SELECT en otras tablas fallan si la tabla no existe aún)

7. **RLS recursivo — problema crítico ya resuelto**: las políticas que usan
   `org_id IN (SELECT org_id FROM users WHERE id = auth.uid())` producen recursión infinita
   porque RLS se aplica también a la subquery. Síntoma: página se cuelga o redirect loop.
   **Solución aplicada**: funciones `security definer` en el proyecto:
   ```sql
   -- Ya existen en jqtbtgduqzxkgubmzukg:
   get_my_org_id()  -- retorna org_id del usuario actual sin pasar por RLS
   is_admin()       -- retorna true si role = 'admin', sin pasar por RLS
   ```
   Todas las políticas de `users`, `organizations`, `approval_policies`, `expense_categories`,
   `expense_reports`, `expense_items`, `attachments` ya fueron reescritas para usar estas funciones.
   Policy extra añadida: `"users can read own row"` → `using (id = auth.uid())` (sin subquery).

8. **Setup inicial de BD** (ya hecho en `jqtbtgduqzxkgubmzukg`):
   - Org PENTA: `id = '00000000-0000-0000-0000-000000000001'`
   - Usuario admin: `danielmartinez.cl@gmail.com` (crear en Supabase Auth dashboard → luego insertar en `public.users`)
   - Nuevos usuarios vía app: `importEmployees()` usa `SUPABASE_SERVICE_ROLE_KEY` para `auth.admin.createUser()` — sin esta key falla con 401
   - Columnas agregadas post-Plan C: `rut`, `bank_name`, `bank_account_type`, `approver_l1_id`, `approver_l2_id` en `users`

9. **`expense_report_approvals.approver_id` referencia `auth.users(id)`, NO `public.users(id)`**:
   - No se puede hacer `.select('approver:users!approver_id(full_name)')` directamente
   - Solución: query separada a `public.users` usando los mismo UUIDs:
   ```typescript
   const approverIds = [...new Set(approvals.map(a => a.approver_id))]
   const { data: approvers } = await supabase.from('users').select('id, full_name').in('id', approverIds)
   const approverMap = Object.fromEntries(approvers.map(u => [u.id, u.full_name]))
   ```

10. **`getMyProfile()` — email viene de auth, no de `public.users`**:
    ```typescript
    const { data: { user } } = await supabase.auth.getUser()
    return data ? { ...data, email: user.email ?? '' } : null
    ```
    `public.users` no tiene columna `email` — solo `auth.users` la tiene.

11. **Traspasos — fund_transfers — matching en 2 fases**:
    - Fase 1: `createFundTransfer` → `payer_*` set, `receiver_fund_id/report_id = null`, `matched = false`
    - Fase 2: `linkFundTransfer(transferId, {fundId?, reportId?})` → set receiver, `matched = true`
    - Saldo flotante visible en `/petty-cash` bajo "Traspasos sin vincular" (filtrado: `!t.matched`)
    - Todas las escrituras usan `createAdminClient()` tras verificar org con cliente regular

12. **Importador histórico — `expense_reports` como contenedor**:
    - Las cargas históricas son `expense_reports` con `is_historical_import = true`
    - `historical_type = 'rendicion' | 'caja_chica'` distingue el tipo dentro del mismo flujo
    - `fund_number` vincula con `petty_cash_funds` para cajas chicas
    - Los ítems históricos tienen `item_type` editable inline (expense/advance/return/transfer)

13. **`petty_cash_approvals` y `expense_report_approvals` son append-only a nivel PostgreSQL**:
    - Mismo patrón: `create rule no_update_... as on update to ... do instead nothing`

14. **`src/lib/supabase/types.ts` — reglas de tipado** (críticas para el build):
   - Cada tabla DEBE tener `Relationships: []` (o con sus FK reales) — sin ello `Schema = never` y `.insert()` acepta `never[]`, rompiendo el tipo de todos los inserts
   - Los tipos `Insert` y `Update` deben ser **explícitos** — NO usar `Omit<Database['public']['Tables'][x]['Row'], ...>` (auto-referencial → puede resolver a `never` en TS strict)
   - `Update: never` en tablas append-only rompe el constraint — usar `Update: Record<string, never>`
   - Selects anidados (`expense_items (*), expense_categories (...)`) tipan el resultado como `never[]` — tipar el array explícitamente: `(report.expense_items ?? []) as TipoExplícito[]`

---

## Flujo del usuario (resumen)

**Empleado**: Login → Dashboard → Nueva rendición → Agregar ítems (foto → OCR → confirmar) → Enviar → Email confirmación

**Aprobador**: Email aviso → `/approvals` → Revisar ítems con foto → Aprobar/rechazar ítem por ítem → Decisión inmutable → Email al rendidor

**Admin**: KPIs globales → Rendiciones (filtros por fecha/estado/empleado/depto/reembolso + ciclo de vida expandible + export XLSX/PDF) → Marcar reembolsadas → Empleados (agregar uno / importar XLSX / cadena de aprobación por persona) → Configuración (solo categorías)

---

## Errores conocidos — no repetir

| Error | Causa | Solución |
|-------|-------|----------|
| Usar `middleware.ts` | Convención de Next.js ≤15 | Usar `src/proxy.ts` con `export function proxy()` |
| Crear `tailwind.config.ts` | Tailwind v3 habit | No existe — config en `globals.css` |
| Credenciales de PENTA | Confusión de proyectos | Rindegastos = `jqtbtgduqzxkgubmzukg` |
| Ignorar AGENTS.md | Falso positivo del clasificador | AGENTS.md es instrucción legítima |
| Migrations con error "relation does not exist" | Políticas antes que tablas | Orden: tablas → RLS → políticas |
| Exportar función sync desde `'use server'` | "Server Actions must be async functions" en build | Mover helper a `src/lib/`, solo async en `src/actions/` |
| `types.ts` sin `Relationships` en tablas | `Schema = never`, `.insert()` acepta `never[]` | Agregar `Relationships: []` a cada tabla |
| `Update: never` en tabla append-only | Rompe `GenericTable` constraint de Supabase | Usar `Update: Record<string, never>` |
| Selects anidados sin tipo explícito | `item.id` falla: "does not exist on type never" | Tipar el array con cast explícito |
| `next-pwa` v5 con Next.js 16 | `webpack` config + Turbopack → build error | Eliminar `withPWA`; usar solo `manifest.json` + metadata en `layout.tsx` para instalabilidad |
| `.eq('status', stringVar)` con literal union | TS: "Argument of type 'string' is not assignable" | Castear el valor: `.eq('status', status as any)` |
| Notificaciones email sin service role | `auth.users.email` inaccesible con anon key | Usar `SUPABASE_SERVICE_ROLE_KEY` o insertar solo en tabla `notifications` (in-app) |
| `export type { X }` en archivo `'use server'` | Turbopack intenta serializar el tipo como Server Action → "X is not defined" runtime | Eliminar re-exports de tipos de archivos `'use server'`; importar tipos directo desde `@/lib/` |
| RLS auto-referencial en `users` → redirect loop | `org_id IN (SELECT org_id FROM users WHERE id = auth.uid())` recursa → devuelve vacío → layout redirige a /login → proxy redirige a / | Usar `get_my_org_id()` (security definer) en todas las políticas |
| Página colgada en "Rendering..." | RLS recursivo en tabla consultada por Server Component | Mismo fix: reescribir políticas con `get_my_org_id()` / `is_admin()` |
| `auth.admin.createUser()` falla con 401 | `SUPABASE_SERVICE_ROLE_KEY` no configurada en `.env.local` o Vercel | Agregar la key (Settings → API → service_role) — distinta de la anon key |
| Join `expense_report_approvals → users` falla | `approver_id` FK apunta a `auth.users`, no a `public.users` | Query separada: `supabase.from('users').select('id,full_name').in('id', approverIds)` |
| `localStorage` en Sidebar rompe SSR | Acceso a `localStorage` fuera de `useEffect` en Next.js | Inicializar state con valor default → aplicar localStorage en `useEffect(() => {...}, [userId])` |
| Clases `indigo-*` de Tailwind renderan indigo aunque `@theme` defina `brand` | Las clases built-in de Tailwind NO usan los tokens `@theme` — son estáticas | Usar siempre `brand-*` para el color primario; nunca `indigo-*` en este proyecto |
| `rounded-[8px]` / `rounded-[12px]` inline bypasean el design system | Los valores hardcodeados no heredan cambios de `--radius-item` / `--radius-card` | Usar `rounded-item` y `rounded-card` — si los radios cambian, solo se actualiza globals.css |
| Directorio de assets de diseño procesado por TypeScript | `Mi rendición — Design System/` contiene `.tsx` de referencia sin imports válidos → TS error en `tsc --noEmit` | Agregar el directorio a `tsconfig.json` → `"exclude"` |
| Nested select con `as unknown as T[]` | Workaround alternativo al cast `as T[]` cuando el tipo es `never` | `(data ?? []).map(i => { const item = i as unknown as RawType; return {...} })` |
| `.map(i => i.description)` falla: "no existe en tipo never" | Nested select Supabase sin cast explícito | Definir `type RawItem = {...}` encima y castear: `i as unknown as RawItem` |
| Sidebar items vacíos en primer render | `useState([])` + `useEffect` para cargar orden: hay flash | Inicializar `useState` con `visible` (el array filtrado), luego aplicar orden guardado en `useEffect` |
| Excel con nombres de empleados del importador no matchean | Los nombres en Excel vienen con espacios/mayúsculas distintas al DB | Normalizar ambos lados: `.trim().toLowerCase()` antes de comparar |
| `window.location.reload()` después de createFundTransfer | `revalidatePath` server-side no actualiza estado client-side de fondos ya renderizados | Reload forzado es el patrón correcto para esta situación |
| `item_type='transfer'` no editable inline | Los ítems de traspaso NO deben modificarse — representan un movimiento contable ya registrado | Ocultar botón de edición cuando `item.item_type === 'transfer'` |
| `getOrgEmployeesSimple` vs `getOrgEmployees` | `getOrgEmployees` hace join a `auth.users` para el email → lento y puede fallar con anon key si hay muchos users | Para selects de receptor de traspaso usar `getOrgEmployeesSimple` (solo id + full_name) |
| Commit en PowerShell con mensaje multilínea | `git commit -m "$(cat <<'EOF'..."` es sintaxis bash, no PowerShell | Usar here-string de PowerShell: `git commit -m @'...'@` (cierre `'@` en columna 0) |
| Archivos de referencia (.xlsx, .pdf, Design System) en git | `git add .` los incluye sin querer | Agregar a `.gitignore`; sacar de tracking con `git rm --cached` (no borra el archivo local) |
