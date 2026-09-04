---
name: mi-rendicion-context
description: >
  Contexto completo de Mi Rendición — app de rendición de gastos corporativos
  para organizaciones chilenas (antes llamada "Rindegastos", nombre de prueba).
  USAR SIEMPRE al iniciar cualquier sesión en este proyecto, o cuando el agente
  mencione: proxy.ts, middleware, Tailwind config, expense reports, OCR de boletas,
  aprobaciones, caja chica, cola bancaria, Defontana, rendidor, aprobador,
  o cualquier entidad del dominio (ExpenseReport, ExpenseItem, Organization, etc.).
  También usar cuando el agente dude sobre convenciones de Next.js 16 o Tailwind v4.
---

# Mi Rendición — Contexto del Proyecto

> **Nombre:** "Mi Rendición". "Rindegastos" era el nombre de prueba y quedó descartado
> (rename completo el 14 de agosto de 2026). Si aparece en algún lado, es residuo histórico.

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
| Deploy | Vercel · repo `danielmartinezcl-creator/Mis-Rendiciones` | ✅ activo |

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
- Este proyecto usa el proyecto **`jqtbtgduqzxkgubmzukg`** (Mi Rendición)
- Es **distinto** de `qkctqhsugcflelnsitvl` (PENTA/fintrack) — no mezclar credenciales
- Clientes: `src/lib/supabase/client.ts` (browser) y `src/lib/supabase/server.ts` (server)
- **Admin client**: `src/lib/supabase/admin.ts` → `createAdminClient()` con `SUPABASE_SERVICE_ROLE_KEY` — usar solo en Server Actions para operaciones que requieren bypass de RLS (crear usuarios, operaciones cross-org)
- **Variables de entorno requeridas**: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `ANTHROPIC_API_KEY`, `SUPABASE_SERVICE_ROLE_KEY` (sin NEXT_PUBLIC — nunca exponer al browser)

### Tipografía (rediseño Tornasol, 2026-09-02)
- **Display / títulos:** `Bricolage Grotesque` — variable `--font-bricolage`, clases `font-display` / `font-bricolage`
- **UI / body / labels:** `Hanken Grotesk` — variable `--font-hanken`, clase `font-hanken` (default del `<body>`)
- **Montos y cifras:** `Manrope` — token `--font-amount`, clase `font-mono-amount`
- **Nunca** usar JetBrains Mono ni fuentes con cero marcado con barra (confunde a adultos mayores)
- **Las tres son LOCALES**: `.woff2` variables en `src/app/fonts/`, con `next/font/local`.
  No dependen de Google en tiempo de build — era la causa de deploys caídos
- Compatibilidad: `.font-jakarta` → alias de Bricolage, `.font-manrope` → alias de Manrope

> **Geist Mono ya no existe acá.** Manrope lo reemplazó en montos y el paquete npm
> `geist` se desinstaló. Si ves `--font-geist-mono` en algún lado, es residuo.

**Trampa de `next/font`:** nombrar la variable de la fuente igual que el token de
`@theme` deja `--font-amount: var(--font-amount)`, autorreferente e inválido, y la
fuente cae al fallback del sistema **en silencio**. `next/font` expone
`--font-manrope`; `@theme` define `--font-amount` en base a él.

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
approval_policies        → ApprovalPolicy     (levels: jsonb, soporta N niveles — LEGACY, reemplazado por cadena L1/L2)
employee_policies        →                    (join: qué política aplica a cada empleado — LEGACY)
expense_categories       → ExpenseCategory    (org_id=null = global; con org_id = por org)
expense_reports          → ExpenseReport      (cabecera de rendición O carga histórica)
expense_items            → ExpenseItem        (ítems individuales; item_type: expense|advance|return|transfer)
attachments              → Attachment         (fotos/PDFs en Supabase Storage, también por ítem)
expense_report_approvals →                    (log auditoría — APPEND ONLY)
notifications            → Notification       (in-app)
suggestions              →                    (mejoras/bugs enviados por empleados)
approval_attachments     →                    (correos/PDFs de respaldo de aprobaciones)
expense_policies         → ExpensePolicy      (políticas de límite de gasto por categoría/depto/user — migración 011)
cost_centers             → CostCenter         (46 centros de costo PENTA — migración 012; imputable=true recibe asientos)
defontana_suppliers      → DefontanaSupplier  (mapeo merchant → cuenta Defontana — migración 012)
travel_policies          → TravelPolicy       (límites de viáticos por destino/categoría — migración 015)
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
// petty_cash_funds.status (extendido migración 011):
FundStatus   = 'draft' | 'pending_approval' | 'approved' | 'pending_bank_load' |
               'pending_bank_auth' | 'funds_sent' | 'submitted' |
               'pending_liquidation_approval' | 'settled' | 'rejected'
```

### Columnas relevantes agregadas post-Plan C
```
users:          cost_center_id, approver_l1_id, approver_l2_id, approver_l1_backup_id,
                approver_l1_backup_from, approver_l1_backup_until,
                can_load_bank_transfer, can_authorize_bank_transfer,
                rut, bank_name, bank_account_type, can_manage_petty_cash
organizations:  defontana_provider_account, mileage_rate_per_km,
                defontana_bank_account, defontana_voucher_type_advance,
                defontana_voucher_type_return, defontana_voucher_type_transfer,
                defontana_doc_type_advance ('CARGO'), defontana_doc_type_return ('ABONO')
expense_items:  cost_center_id, supplier_rut, policy_justification, policy_violations,
                mileage_km, mileage_rate, transfer_id, attachment_url,
                defontana_exported_at
expense_reports: ai_analysis, ai_analysis_at, defontana_exported_at, defontana_export_ref,
                 is_historical_import, historical_type, fund_number, deleted_at
petty_cash_funds:     defontana_exported_at, defontana_export_ref, is_historical_import
petty_cash_items:     defontana_exported_at, defontana_export_ref
petty_cash_transfers: defontana_exported_at, defontana_export_ref
```

---

## Estructura de carpetas

```
src/
├── app/
│   ├── (app)/              ← rutas autenticadas (layout carga perfil Supabase)
│   │   ├── page.tsx                      ← Dashboard empleado (KPIs + pendiente reembolso)
│   │   ├── mis-gastos/                   ← Resumen mensual empleado (últimos 12 meses)
│   │   ├── quick/                        ← Flujo rápido móvil 3 pasos (R20)
│   │   ├── expenses/new + [id]/          ← Rendición empleado (OCR + viáticos + políticas)
│   │   ├── reimbursements/               ← Historial reembolsos
│   │   ├── approvals/ + [id]/            ← Bandeja aprobador (AI summary + travel badges)
│   │   ├── banco/                        ← Cola bancaria (operadores de carga/autorización)
│   │   ├── informes/                     ← Informes unificados (4 fuentes, filtros completos)
│   │   ├── admin/
│   │   │   ├── page.tsx                  ← KPIs globales + alerta rendiciones +5 días
│   │   │   ├── reports/                  ← Rendiciones (filtros, export Defontana, reasignar CC)
│   │   │   ├── employees/                ← Gestión empleados + cadena aprobación
│   │   │   ├── settings/                 ← Categorías + Políticas + Viáticos + Defontana
│   │   │   ├── fondos/                   ← Dashboard saldos caja chica activos
│   │   │   ├── analisis/                 ← Pivot gastos por centro de costo
│   │   │   ├── carga-historica/          ← Importador histórico Excel
│   │   │   └── trash/                    ← Papelera (soft delete, 90 días)
│   │   ├── petty-cash/ + new + [id]/     ← Módulo Caja Chica (flujo bancario)
│   │   ├── profile/                      ← Perfil + datos bancarios
│   │   └── suggestions/                  ← Sugerencias y bugs
│   ├── (auth)/login/                     ← 'use client', Suspense para useSearchParams
│   ├── (auth)/set-password/              ← Establecer contraseña inicial (link de invitación)
│   ├── api/auth/callback/                ← OAuth code exchange
│   └── globals.css                       ← Tailwind v4 @theme + clases fallback
├── actions/                ← 16 server actions
│   ├── admin.ts            ← KPIs, reportes, empleados, Defontana, CC masivo, fondos, getBankQueue
│   ├── approvals.ts        ← aprobaciones L1/L2/backup, reembolso, análisis IA
│   ├── cost-centers.ts     ← getCostCenters (sin requireAdmin — cualquier user)
│   ├── employees.ts        ← importEmployees, setApprovers, setBackup
│   ├── expenses.ts         ← CRUD rendiciones, addItem (con CC + supplier_rut + km)
│   ├── exchange-rate.ts    ← TC histórico con cache 24h
│   ├── fund-transfers.ts   ← traspasos entre cajas chicas
│   ├── historical-import.ts ← importador Excel histórico
│   ├── notifications.ts    ← in-app + Resend (requiere service role para email)
│   ├── ocr.ts              ← Claude Sonnet 4.6, ~$0.008/foto
│   ├── petty-cash.ts       ← CRUD fondos, flujo bancario, liquidación
│   ├── policies.ts         ← expense_policies CRUD + checkPolicyViolations + travel_policies CRUD + checkTravelPolicies
│   ├── profile.ts          ← getMyProfile, updateProfile, sendPasswordReset
│   ├── reports.ts          ← getReportFilterOptions + getUnifiedReportItems (4 fuentes)
│   ├── suggestions.ts      ← CRUD sugerencias
│   └── approval-attachments.ts ← adjuntos de respaldo de aprobaciones
├── components/
│   ├── layout/             ← Sidebar (drag&drop, personalizable por admin), MobileNav, LogoutButton
│   ├── ui/                 ← InsigniaEstado, Button, CurrencyAmount, MedidorArco,
│   │                         VerticalTimeline, CompactStepper, AdminKpiHero, Badge, Card
│   ├── admin/              ← EmployeeImport, AddEmployeeForm, ApproverConfig, DefontanaTypePanel
│   ├── petty-cash/         ← TarjetaFondo, RecorridoFondo, FundTimeline, AddFundItemForm,
│   │                         EditFundItemForm, FundDefontanaPanel
│   └── expenses/           ← ExpenseItemForm (OCR, km, viáticos, políticas), PhotoUpload, ExportButton
├── lib/
│   ├── constants.ts        ← CURRENCIES, DOC_TYPES, FAMILIA_REPORTE, FAMILIA_FONDO,
│   │                         FUND_STEPS, FUND_AUDIT_LABELS
│   ├── utils.ts            ← formatCLP, formatAmount, formatDate, cn
│   ├── auth.ts             ← helpers de autenticación
│   ├── approval-helpers.ts    ← computeReportStatus, computeApprovedAmount
│   ├── approval-analysis-helpers.ts ← buildApprovalAnalysisPrompt, parseAnalysisResponse
│   ├── expense-helpers.ts     ← calculateReportTotal, validateExpenseItem
│   ├── exchange-rate-helpers.ts ← buildExchangeRateUrl, parseExchangeRateResponse, convertToCLP
│   ├── ocr-helpers.ts         ← buildOcrPrompt, parseOcrResponse
│   ├── petty-cash-helpers.ts  ← computeFundBalance, computeFundStatus
│   ├── policy-helpers.ts      ← resolveApplicablePolicy, checkItemLimit, checkPeriodLimit
│   ├── report-helpers.ts      ← UnifiedReportItem, buildPeriodRange, computeUnifiedKpis (byMovement)
│   ├── supabase/           ← client.ts, server.ts, admin.ts (service role), types.ts
│   └── export/             ← excel.ts, pdf.ts, defontana.ts (asientos + serialización),
│                             defontana-settings.ts (config por movimiento)
├── proxy.ts                ← protección de rutas (Next.js 16)
└── tests/
supabase/
├── migrations/
│   ├── 001_initial_schema.sql                        ← tablas base + RLS + triggers
│   ├── 004_petty_cash.sql                            ← caja chica (4 tablas)
│   ├── 005_suggestions_and_approval_attachments.sql
│   ├── 007_historical_import_flag.sql
│   ├── 008_historical_import_type_and_fund_number.sql
│   ├── 009_expense_items_item_type.sql
│   ├── 010_fund_transfers.sql                        ← traspasos entre cajas chicas
│   ├── 011_expense_policies_and_ai_analysis.sql      ← expense_policies + ai_analysis en reports/items
│   ├── 011_bank_authorization_workflow.sql           ← permisos bancarios en users + status extendido
│   ├── 012_defontana_cost_centers.sql                ← cost_centers (46 PENTA) + defontana_suppliers + CC en users/items
│   ├── 013_petty_cash_defontana.sql                  ← defontana_exported_at/ref en petty_cash_funds
│   ├── 015_travel_policies.sql                       ← tabla travel_policies (viáticos por destino/categoría)
│   ├── 016_audit_log.sql                             ← tabla audit_log append-only + RLS
│   ├── 016_multi_tenant_cost_centers.sql             ← org_id en cost_centers  ⚠ segundo 016
│   ├── 017_soft_delete_extensions.sql                ← soft-delete en items/categorías, monthly_budget_clp,
│   │                                                    dedup_key en notifications, rate_limit_log
│   ├── 018_webhooks.sql                              ← tabla webhooks + RLS con is_admin()
│   ├── 019_security_fixes.sql                        ← RLS en rate_limit_log, notifications en realtime
│   ├── 020_reimbursed_amount.sql                     ← monto reembolsado
│   ├── 021_defontana_movements.sql                   ← cuenta banco + tipo comprobante/documento por movimiento
│   └── 022_petty_cash_defontana_by_movement.sql      ← marca Defontana por ítem y por transferencia de fondo vivo
└── seed.sql
docs/superpowers/
├── plans/                  ← planes de implementación (A, B, C + módulos adicionales)
└── specs/
references/
├── plans.md                ← estado actual de implementación + backlog
└── schema.md               ← schema SQL de referencia (ver migraciones para detalle)
```

---

## Estado de implementación

### ✅ Planes A / B / C — Base completa
- Proyecto scaffolded: Next.js 16, Tailwind v4, Supabase Auth, Vitest
- Schema Supabase completo (15+ migraciones aplicadas)
- `src/proxy.ts` (protección de rutas), Login, Layout autenticado
- Dashboard rendidor, OCR Claude (~$0.008/foto), TC histórico (cache 24h)
- CRUD rendiciones, aprobaciones L1/L2, notificaciones in-app
- Bandeja aprobador con fotos, toggles approve/reject por ítem, exportación
- Admin: KPIs, reportes, empleados, settings (categorías), PWA instalable
- 32+ tests Vitest pasando · build TypeScript limpio

### ✅ Rediseño Tornasol — el sistema visual vigente (etapas 0–4 completas)

**La regla que sostiene todo: el degradado es el contenedor, nunca la superficie de
trabajo.** Hay dos materiales y solo dos, los dos como clase CSS en `@layer components`
(así cualquier utilidad del markup les gana):

| | Clase | Para qué |
|---|---|---|
| **Vidrio** | `.tor-glass` (+ `-rail`, `-bar`) | Resúmenes, KPIs, encabezados. Cosas que se **miran** |
| **Hoja** | `.hoja` | Tablas, listas, formularios. Cosas que se **leen o deciden** |

Si el usuario compara cifras, revisa 40 filas o llena campos, va en hoja blanca.
**Un dato apoyado directo sobre el degradado está mal.**

- **No hay modo oscuro.** Se eliminó: Tornasol ya es el chasis oscuro
- **Los materiales son clases, no componentes de React.** Un componente sería un wrapper
  con passthrough de `className` — y encima habría que sumarlo al `:not()` del selector
  de legibilidad de `globals.css`. Solo es componente lo que tiene lógica o estructura
- Otras clases de material: `.campo` / `.campo-compacto`, `.btn-primario`
- **Toda la paleta vive en `globals.css` + `src/lib/design-tokens.ts`** (este segundo,
  para SVG, emails y metadata de la PWA, que no leen variables CSS). Los dos se mueven
  en paralelo. Escribir un hexadecimal en un componente rompe el sistema
- `globals.css` está partido en **ZONA 1 identidad** (brand, accent, sidebar, degradados
  de CTA — lo único que cambia si otro cliente trae su marca) y **ZONA 2 semánticos**
- Color de acción: `brand-600` = `#0D7F81`; `accent` repite brand; el lila es `flare`
- `rounded-item` (14px) · `rounded-card` (18px) — usar siempre, no valores hardcodeados
- Íconos: Lucide React, nunca emoji en UI
- Cuatro familias de estado en `constants.ts` (`FAMILIA_REPORTE` / `FAMILIA_FONDO`):
  `neutro` · `en-curso` · `atencion` · `resuelto`. **Hay un test que impide una quinta**
- `"Mi rendición — Design System"` en `tsconfig.json` `exclude`

**Antes de tocar estilos, leer `docs/Rediseño/tornasol-spec.md` — empezando por su fe de
erratas**, que lista los ocho puntos donde la spec dice una cosa y se hizo otra.

**Hay una línea base visual de 50 capturas** (`e2e/`, `npm run baseline:verificar`). Un
cambio de estilo que la deje en verde no tocó nada visible; si la ensucia, el reporte
dice dónde. Leer `e2e/README.md` antes de confiar en un resultado: solo captura el
estado de reposo, así que errores, hover y modales no se ven.

### ✅ Gestión avanzada de empleados
- `importEmployees()` con `SUPABASE_SERVICE_ROLE_KEY`: crea auth user + `public.users` + rollback
- Cadena de aprobación L1/L2 por empleado: `approver_l1_id`, `approver_l2_id` en `users`
- **Aprobador suplente (R8)**: `approver_l1_backup_id`, backup_from/until — el suplente ve las rendiciones en el período configurado
- `ApproverConfig.tsx`: preview "Ana → Carlos → Aprobado"
- Admin puede establecer contraseña de empleado directamente desde el panel

### ✅ Módulo Caja Chica completo + flujo bancario (migraciones 004 + 011-bank)
- 4 tablas: `petty_cash_funds`, `petty_cash_items`, `petty_cash_approvals` (append-only), `petty_cash_transfers`
- Flujo extendido: `draft → pending_approval → approved → pending_bank_load → pending_bank_auth → funds_sent → submitted → pending_liquidation_approval → settled`
- Permisos: `can_manage_petty_cash`, `can_load_bank_transfer`, `can_authorize_bank_transfer`
- Stepper visual de autorización bancaria
- Edición inline ítems históricos; adjuntos por ítem; filtros multi-select + período; export Excel/PDF
- `/admin/fondos` — dashboard saldos caja chica activos con KPIs

### ✅ Importador histórico (migraciones 007/008)
- `/admin/carga-historica` — importar Excel de rendiciones y cajas chicas de períodos anteriores
- `is_historical_import`, `historical_type` ('rendicion'|'caja_chica'), `fund_number` en `expense_reports`
- Edición inline: categoría, item_type, merchant, fecha, monto; auto-asigna empleado por nombre

### ✅ Traspasos entre cajas chicas (migración 010)
- `fund_transfers` — matching en 2 fases (payer/receiver nullable hasta vincular)
- `expense_items.item_type = 'transfer'` + `transfer_id` (NO editable inline)
- UI: sección "Traspasos sin vincular", modales crear/vincular, eliminar/editar traspasos no vinculados

### ✅ Adjuntos por ítem
- `expense_items.attachment_url` — fotos/PDFs de boletas por ítem individual
- `petty_cash_items.attachment_url` — mismo modelo para caja chica
- Bucket `expense-attachments` en Storage; `approval-attachments` para respaldos de aprobadores

### ✅ Defontana v2 — export contable real (migración 012)
- `cost_centers`: 46 centros PENTA seeded; `imputable=true` → recibe asientos
- `defontana_suppliers`: mapeo merchant → cuenta contable (prioridad sobre categoría)
- `users.cost_center_id`, `expense_items.cost_center_id` (override por ítem), `expense_items.supplier_rut`
- `organizations.defontana_provider_account` — cuenta Proveedor Nacional para facturas (previene doble contabilización)
- `expense_reports.defontana_exported_at / defontana_export_ref` — lock anti-duplicados
- `src/lib/export/defontana.ts` — 34 columnas reales (template `importador-comprobantes.xlsx`):
  - `stripDots()`: "4.5.1030.10.13" → "45103010013"
  - `toExcelSerial()`: YYYY-MM-DD → serial Excel (para que Defontana lo reconozca como fecha)
  - Facturas → línea individual (preserva RUT proveedor, tipo doc, número); boletas → agrupadas por (cuenta, CC)
  - `resolveAccount()`: supplier_account_code → providerAccount (facturas) → category code
- Botón "Reasignar CC" masivo en admin/reports → `bulkUpdateExpenseItemsCostCenter(reportId, ccId)`
- Badge "Exportado Defontana" + filtro "Sin exportar / Ya exportadas" en lista de reportes

### ✅ Defontana v3 — un asiento por movimiento (migraciones 021 + 022)
Verificado importando de verdad en Defontana. Cada movimiento arma su propio asiento:

| Movimiento | Debe | Haber | Banco |
|---|---|---|---|
| Adelanto   | Fondos por Rendir | Banco | `CARGO` |
| Gastos     | cuentas de gasto  | Fondos por Rendir | — |
| Devolución | Banco | Fondos por Rendir | `ABONO` |
| Traspaso   | Fondos por Rendir (ficha receptor) | Fondos por Rendir (ficha pagador) | — |

- `defontana_contra_account` **es** la cuenta Fondos por Rendir (PENTA: `1.1.1010.10.03`);
  `defontana_bank_account` es el banco (`1110102001`)
- **Un asiento por fecha** en adelantos y devoluciones: el N° de documento bancario *es*
  la fecha, así que dos movimientos de días distintos no pueden compartir comprobante
- Traspasos: cada uno deja un ítem en el reporte de **ambas** partes; el asiento se emite
  solo desde el pagador (`is_transfer_payer`) o saldría duplicado
- Configuración por movimiento (tipo de comprobante y tipo de documento) en
  `/admin/settings` → Defontana → "Movimientos de fondos"
- `src/lib/export/defontana-settings.ts`: `DEFONTANA_ORG_COLUMNS` + `mapDefontanaSettings()`,
  usados por las tres funciones que leen la config

**Fondos de caja chica vivos** (migración 022): el adelanto y los reembolsos son
`petty_cash_transfers`, no ítems. Se sintetizan como `DefontanaItem` para pasar por el
mismo generador. El mapeo sigue el sentido del dinero, no el nombre del registro:
`disbursement` y `refund_to_employee` sacan plata → adelanto; `reimbursement_from_employee`
la devuelve → devolución. Cada movimiento se contabiliza cuando queda firme, sin esperar
la liquidación (`FundDefontanaPanel`).

### ✅ Reversa del estado "Contabilizado"
- Rendiciones (`/admin/reports`), cargas históricas (`/admin/carga-historica`, `/petty-cash`)
  y fondos vivos (`/petty-cash/[id]`)
- Motivo obligatorio (mín. 5 caracteres) → `RevertDefontanaDialog`, queda en `/admin/auditoria`
  con acción `reverted`
- Cargas históricas y fondos: reversa **por tipo de movimiento**
- **Siembra perezosa del estado legacy**: una carga contabilizada desde `/admin/reports`
  tiene marca en la cabecera y no en los ítems. Al revertir un tipo, `revertHistoricalFundDefontana`
  baja esa marca a los tipos que NO se revierten — sin eso, revertir los adelantos dejaría
  los gastos como si nunca hubieran ido a Defontana

### ✅ Políticas de gasto en tiempo real (migración 011)
- `expense_policies`: límites por categoría / departamento / usuario, períodos mensual/trimestral/anual
- Enforcement: `warn` | `require_justification` | `block`
- `checkPolicyViolations()`: revisa ítem actual + acumulados del período → devuelve violaciones con severidad
- Badge inline en `ExpenseItemForm` (debounce 600ms); badge "Excede límite" en bandeja aprobador
- Tab "Políticas" en `/admin/settings`

### ✅ Política de viáticos PENTA (migración 015)
- `travel_policies`: límites por destino (`local|regional|exterior`) y/o categoría
- Prioridad: política específica de categoría > política global sin categoría
- `checkTravelPolicies()`: devuelve `{ policy, exceeds, limitAmount, limitCurrency }`
- Badge verde/ámbar inline en `ExpenseItemForm` mientras el empleado llena el monto
- Badge por ítem en bandeja aprobador `/approvals/[id]`
- Tab "Viáticos" en `/admin/settings` — CRUD completo con destino, categoría, monto, moneda

### ✅ Análisis IA para aprobador (R14)
- `generateApprovalAnalysis(reportId)` — Claude Sonnet 4.6: historial 6 meses + violaciones → `{ risk_level, headline, routine_item_ids[], attention_items[] }`
- Cache en `expense_reports.ai_analysis / ai_analysis_at`; se invalida si el reporte vuelve a draft
- Costo: ~$0.008/rendición

### ✅ Kilometraje (R1)
- `expense_items.mileage_km`, `mileage_rate`; `organizations.mileage_rate_per_km` (default $136/km SII)
- Subtipo "kilometraje" en `ExpenseItemForm`: monto calculado automáticamente (km × tarifa), boleta no requerida

### ✅ Recordatorios automáticos (R4)
- `src/app/api/cron/reminders/route.ts` + cron en `vercel.json` (9AM diario)
- 3 tipos: borradores >7 días → empleado; fondos saldo <20% → encargado; rendiciones submitted >3 días → aprobador L1

### ✅ Informes Unificados (plan 2026-07-27)
- `/informes` — 4 fuentes de datos combinadas (rendición nueva/histórica + caja chica nueva/histórica)
- Filtros server-side: tipo fuente, período (año/semestre/personalizado), departamento, empleado multi-select, categoría chips, estado informe/ítem, reembolso, Defontana
- KPIs: Total ítems, Total CLP, Monto aprobado, breakdown por fuente
- `src/actions/reports.ts`: `getReportFilterOptions()` + `getUnifiedReportItems(filters)`
- `src/lib/report-helpers.ts`: `UnifiedReportItem`, `buildPeriodRange`, `computeUnifiedKpis`
- Export Excel (3 hojas: Detalle / Por Empleado / Por Categoría) + PDF landscape
- Sidebar: entrada "Informes" con ícono BarChart3, visible para admin + approver

### ✅ Flujo rápido móvil (R20)
- `/quick` — 3 pasos optimizados para mobile: foto → OCR → confirmar monto/cat → seleccionar fondo → enviar
- Shortcut en `manifest.json` para acceso directo desde el ícono de la PWA

### ✅ Cola Bancaria (2026-08-14)
- `/banco` — vista centralizada de rendiciones en proceso de transferencia, para operadores bancarios
- `getBankQueue()` en `actions/admin.ts` resuelve `isAdmin` / `canLoad` / `canAuth` y devuelve **solo los estados que ese rol puede accionar**: admin ve `approved` + `partially_approved`; `canLoad` ve `pending_bank_load`; `canAuth` ve `pending_bank_auth`
- Sidebar: entrada "Cola Bancaria" visible para admin o para quien tenga `can_load_bank_transfer` / `can_authorize_bank_transfer`
- `revalidatePath('/banco')` en `requestReportBankLoad`, `confirmReportBankLoad` y `authorizeReportBank`
- `/admin/reports`: estados "En banco (carga)" y "En banco (auth)" en el filtro + botón "Iniciar proceso bancario"

### ✅ Otros módulos completados
- **Soft delete + Papelera** (`/admin/trash`): `expense_reports.deleted_at`; restaurar o eliminar definitivamente
- **Análisis pivot CC** (`/admin/analisis`): tabla pivot filas=centros, columnas=meses (últimos 6), export Excel
- **Resumen mensual empleado** (`/mis-gastos`): gráfico últimos 12 meses por categoría
- **Firma digital PDF (R17)**: SHA-256 del payload de ítems al final del PDF exportado
- **Borrador offline (R18)**: `localStorage` autosave cada 30s en nueva rendición; banner "¿Restaurar borrador?"
- **Aprobación rápida (R9)**: botón "Aprobar todo" con confirm() en bandeja aprobador
- **ZIP comprobantes (R7)**: `exportReportWithAttachments(reportId)` → descarga JSZip con adjuntos
- **Dashboard saldos caja chica (R16)**: `/admin/fondos` con saldo disponible + días sin actividad
- **Perfil** (`/profile`): nombre, RUT, email readonly, datos bancarios (banco, tipo cuenta, número)
- **Sidebar dinámico**: drag & drop (admin), orden persistido en `localStorage`, entrada "Informes"
- **Invitación empleados**: `set-password` flow — empleado recibe link, establece contraseña

### ⏳ Pendiente / Backlog
1. **Service worker offline**: `next-pwa` incompatible con Turbopack (Next.js 16). La app es instalable vía `manifest.json` pero sin cache offline. Sin solución disponible sin cambiar la arquitectura de build.
2. **Marca por organización (white-label)** — **nombre y logo: HECHOS** (2026-09-04).
   `organizations.name` y `logo_url` ya existían desde `001` y no los leía nadie, así
   que no hizo falta migración de tablas. El riel y el encabezado móvil los leen vía
   `<Marca>`; la carga vive en `/admin/settings` → pestaña «Marca»; el respaldo sin
   logo es el cuadrado con degradado y la inicial. Bucket `org-logos` en la migración
   `023`.
   **Falta**: el color de marca por organización (la ZONA 1 de tokens tendría que
   resolverse en tiempo de ejecución) y el favicon + `manifest.json` de la PWA, que
   siguen siendo archivos estáticos y necesitan rutas de metadata dinámicas.
3. **Defontana — `Codigo Legal` en facturas**: va vacío a propósito (la factura ya está ingresada en Defontana; el asiento solo rebaja la cuenta del proveedor). Fijado en un test. Si el importador llegara a exigirlo, es un cambio de una línea en `rowToArray`.
4. **Rediseño Tornasol**: el chasis y la regla de materiales están completos y verificados en las 24 pantallas (`npm run audit:materiales`). Falta el rediseño *conceptual* pantalla por pantalla — sólo `/petty-cash/[id]` pasó por eso. Ver [[project-rediseno-tornasol]] en la memoria.

> **Ya NO están pendientes, aunque documentos viejos lo digan:**
> · *Notificaciones email* — completo desde el 2026-08-12. `lookupEmails()` en
>   `actions/notifications.ts` usa `createAdminClient()` + `getUserById()`, y todos los
>   paths de envío pasan por ahí.
> · *«Penta Rend» hardcodeado* — el nombre no existe en ningún archivo desde `46d62ab`.
>   Lo que sigue pendiente es el white-label (punto 2), no ese literal.

---

## Supabase — puntos no obvios

1. **`expense_report_approvals` es append-only a nivel PostgreSQL** (no solo RLS):
   ```sql
   create rule no_update_approvals as on update to expense_report_approvals do instead nothing;
   create rule no_delete_approvals as on delete to expense_report_approvals do instead nothing;
   ```

2. **`amount_clp` en `expense_items` es inmutable post-aprobación** — el TC histórico no se recalcula

3. **`expense_reports`** tiene trigger `set_updated_at()` en cada UPDATE

4. **Storage bucket `expense-attachments`**: YA CREADO en el proyecto `jqtbtgduqzxkgubmzukg`:
   ```sql
   insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
   values ('expense-attachments', 'expense-attachments', false, 10485760,
     array['image/jpeg','image/png','image/webp','application/pdf']);
   ```
   Políticas de storage: insert/select/delete para `auth.uid() is not null`. Bucket `approval-attachments` igual.

5. **Orden correcto para aplicar migrations**: crear tablas → habilitar RLS → agregar políticas
   (las políticas que hacen SELECT en otras tablas fallan si la tabla no existe aún)

6. **RLS recursivo — problema crítico ya resuelto**: las políticas que usan
   `org_id IN (SELECT org_id FROM users WHERE id = auth.uid())` producen recursión infinita.
   **Solución aplicada**: funciones `security definer` ya en `jqtbtgduqzxkgubmzukg`:
   ```sql
   get_my_org_id()  -- retorna org_id del usuario actual sin pasar por RLS
   is_admin()       -- retorna true si role = 'admin', sin pasar por RLS
   ```
   Todas las políticas de tablas multi-tenant usan estas funciones.

7. **Setup inicial de BD** (ya hecho):
   - Org PENTA: `id = '00000000-0000-0000-0000-000000000001'`
   - Usuario admin: `danielmartinez.cl@gmail.com`
   - Nuevos usuarios vía app: `importEmployees()` usa `SUPABASE_SERVICE_ROLE_KEY` para `auth.admin.createUser()`
   - `cost_centers` ya seeded con los 46 centros PENTA

8. **`expense_report_approvals.approver_id` referencia `auth.users(id)`, NO `public.users(id)`**:
   ```typescript
   const approverIds = [...new Set(approvals.map(a => a.approver_id))]
   const { data: approvers } = await supabase.from('users').select('id, full_name').in('id', approverIds)
   const approverMap = Object.fromEntries(approvers.map(u => [u.id, u.full_name]))
   ```

9. **`getMyProfile()` — email viene de auth, no de `public.users`**:
   ```typescript
   const { data: { user } } = await supabase.auth.getUser()
   return data ? { ...data, email: user.email ?? '' } : null
   ```

10. **Traspasos — `fund_transfers` — matching 2 fases**:
    - Fase 1: `createFundTransfer` → `payer_*` set, `receiver_*` = null, `matched = false`
    - Fase 2: `linkFundTransfer` → set receiver, `matched = true`
    - Todas las escrituras usan `createAdminClient()` tras verificar org con cliente regular

11. **Importador histórico — `expense_reports` como contenedor**:
    - `historical_type = 'rendicion' | 'caja_chica'`; `fund_number` vincula con `petty_cash_funds`
    - Los ítems históricos tienen `item_type` editable inline (expense/advance/return/transfer)

12. **`src/lib/supabase/types.ts` — reglas de tipado** (críticas para el build):
    - Cada tabla DEBE tener `Relationships: []` — sin ello `Schema = never`
    - Los tipos `Insert`/`Update` deben ser explícitos — NO usar `Omit<Row, ...>`
    - `Update: Record<string, never>` en tablas append-only (no `Update: never`)
    - Selects anidados tipan como `never[]` — tipar con cast explícito: `(data ?? []) as TipoExplícito[]`

13. **`defontana.ts` — reglas del export**:
    - Código de cuenta SIN puntos: `stripDots("4.5.1030.10.13")` → `"45103010013"`
    - Fecha como serial Excel (número entero), no string — `toExcelSerial(dateStr)`
    - Facturas: línea individual (preserva RUT/tipoDoc/nroDoc para IVA); boletas: agrupadas
    - Prioridad de cuenta: supplier_account_code → providerAccount (si es factura) → category code
    - Lock inmediato post-export: `markDefontanaExported(reportIds, exportRef)` antes de cerrar el dialog
    - **Formato del importador → todo en la serialización (`rowToArray`), nunca en el asiento.**
      Verificado importando de verdad; cambiar cualquiera rompe la importación:
      | Columna | Valor |
      |---|---|
      | Número | la letra `A` fija — el voucher interno NO llega a Defontana |
      | Moneda comprobante | `PESO`, no `CLP` |
      | Centro de Negocios | `+000` al final (`EMPGESINGING000`); vacío queda vacío |
      | Código de Ficha | RUT con puntos y guión (`toSheetRut` → `76.247.147-7`) |
      | Tipo/Número de **movimiento** | `CARGO`/`ABONO` y fecha `DDMMYY` en la línea de banco |
      | Tipo/Número de **documento** | solo facturas (`FVAELECT` + folio) |
    - La cuenta Fondos por Rendir y el banco **no llevan centro de negocios**: son cuentas de
      balance, se imputan por ficha. El centro va en las líneas de gasto
    - `numero` interno (`AD-240226-8623`, `RE-…`) existe solo para agrupar líneas y partir el ZIP
    - **Un comprobante por archivo**: Defontana no distingue dos asientos dentro del mismo Excel
      (confirmado por el proveedor). `exportDefontanaAuto()` baja `.xlsx` si hay uno y `.zip`
      con un archivo por asiento si hay varios — usarla siempre en vez de `exportDefontanaToExcel`
    - `src/tests/defontana.test.ts` fija todo esto con los datos reales del fondo 174

14. **Políticas de gasto — resolución**:
    - `resolveApplicablePolicy(policies, userId, department, categoryId)` → prioridad: target_user_id > department > category_id > global
    - Los acumulados de período se calculan sobre rendiciones en estado submitted/pending_l2/approved/partially_approved/reimbursed

15. **Políticas de viáticos — prioridad**:
    - Categoría específica > categoría null (aplica a todas)
    - La comparación es en CLP; si la política es en USD, `exceeds = false` siempre (comparación imposible sin TC histórico)

16. **Gasto ≠ movimiento de fondos** (informes y dashboard):
    - Un adelanto es la plata que se entrega y el gasto es en qué se usó: **sumarlos cuenta
      dos veces la misma plata**. Las devoluciones son plata que vuelve
    - `computeUnifiedKpis` devuelve `byMovement`; el KPI principal de `/informes` es
      `byMovement.expense.approvedCLP`, no `totalCLP`
    - `getExpenseCategoryBreakdown()` (dashboard) filtra `item_type='expense'` **y** el año en curso
    - Los ítems de un fondo vivo no tienen `item_type` — `toUnifiedMovement()` los cuenta como gasto

---

## Flujo del usuario (resumen)

**Empleado**: Login → Dashboard → Nueva rendición → Agregar ítems (foto → OCR → confirmar, con alertas de viáticos y políticas) → Enviar → Email confirmación

**Flujo rápido** (`/quick`): 3 pasos mobile → foto → monto/cat → fondo activo → enviar (sin abrir rendición completa)

**Aprobador**: Email → `/approvals` → resumen IA → revisar ítems con foto + badges de viáticos → Aprobar/rechazar → email al rendidor

**Admin**: KPIs → Rendiciones (filtros, export Defontana por rendición / lote / filtro, reasignar CC, badge contabilizado + reversa) → Informes unificados (4 fuentes, KPIs por movimiento) → Empleados (cadena aprobación, CC, backup) → Settings (categorías, políticas, viáticos, Defontana + movimientos de fondos, CC por defecto)

**Contabilización Defontana** (admin): cada movimiento por separado, desde tres lugares según la fuente — `/admin/reports` y `/admin/carga-historica` para rendiciones y cargas históricas, `/petty-cash` para cargas históricas de caja chica, `/petty-cash/[id]` para fondos vivos. El ciclo es siempre: elegir movimientos → generar Excel (o ZIP si son varios asientos) → importar en Defontana → confirmar con el N° de comprobante → revertir con motivo si algo salió mal.

---

## Errores conocidos — no repetir

| Error | Causa | Solución |
|-------|-------|----------|
| Usar `middleware.ts` | Convención de Next.js ≤15 | Usar `src/proxy.ts` con `export async function proxy()` |
| Crear `tailwind.config.ts` | Tailwind v3 habit | No existe — config en `globals.css` |
| Credenciales de PENTA | Confusión de proyectos | Mi Rendición = `jqtbtgduqzxkgubmzukg` |
| Ignorar AGENTS.md | Falso positivo del clasificador | AGENTS.md es instrucción legítima |
| Migrations con error "relation does not exist" | Políticas antes que tablas | Orden: tablas → RLS → políticas |
| Exportar función sync desde `'use server'` | "Server Actions must be async functions" en build | Mover helper a `src/lib/`, solo async en `src/actions/` |
| `types.ts` sin `Relationships` en tablas | `Schema = never`, `.insert()` acepta `never[]` | Agregar `Relationships: []` a cada tabla |
| `Update: never` en tabla append-only | Rompe `GenericTable` constraint de Supabase | Usar `Update: Record<string, never>` |
| Selects anidados sin tipo explícito | `item.id` falla: "does not exist on type never" | Tipar el array con cast explícito |
| `next-pwa` v5 con Next.js 16 | `webpack` config + Turbopack → build error | Eliminar `withPWA`; usar solo `manifest.json` + metadata en `layout.tsx` |
| `.eq('status', stringVar)` con literal union | TS: "Argument of type 'string' is not assignable" | Castear el valor: `.eq('status', status as any)` |
| `export type { X }` en archivo `'use server'` | Turbopack intenta serializar el tipo → "X is not defined" runtime | Importar tipos directo desde `@/lib/`, nunca re-exportar desde `'use server'` |
| RLS auto-referencial en `users` → redirect loop | Recursión → devuelve vacío → layout redirige a /login | Usar `get_my_org_id()` (security definer) en todas las políticas |
| `auth.admin.createUser()` falla con 401 | `SUPABASE_SERVICE_ROLE_KEY` no configurada | Agregar la key (Settings → API → service_role) — distinta de la anon key |
| Join `expense_report_approvals → users` falla | `approver_id` FK apunta a `auth.users`, no a `public.users` | Query separada a `public.users` usando los UUIDs |
| `localStorage` en Sidebar rompe SSR | Acceso fuera de `useEffect` en Next.js | Inicializar state con valor default → aplicar localStorage en `useEffect` |
| Clases `indigo-*` renderan indigo aunque `@theme` defina `brand` | Las clases built-in de Tailwind son estáticas | Usar siempre `brand-*`; nunca `indigo-*` |
| `rounded-[8px]` inline bypasean el design system | Los valores hardcodeados no heredan cambios de `--radius-*` | Usar `rounded-item` y `rounded-card` |
| Directorio Design System procesado por TypeScript | `Mi rendición — Design System/` contiene `.tsx` sin imports válidos | Está en `tsconfig.json` → `"exclude"` |
| `item_type='transfer'` no editable inline | Los ítems de traspaso representan un movimiento contable registrado | Ocultar botón edición cuando `item.item_type === 'transfer'` |
| Commit en PowerShell con mensaje multilínea | `git commit -m "$(cat <<'EOF'..."` es sintaxis bash | Usar here-string PowerShell: `git commit -m @'...'@` (cierre `'@` en columna 0) |
| Archivos de referencia (.xlsx, .pdf) en git | `git add .` los incluye sin querer | Agregar a `.gitignore`; sacar con `git rm --cached` |
| Código de cuenta Defontana con puntos | "45103010013" ≠ "4.5.1030.10.13" → Defontana rechaza la importación | Siempre aplicar `stripDots()` al código antes de escribirlo en el XLSX |
| Fecha Defontana como texto formateado | Defontana espera serial numérico Excel, no "2026-07-15" | Usar `toExcelSerial(dateStr)` — devuelve número entero |
| Migraciones con prefijo duplicado | Hay **dos pares**: `011_bank_authorization_workflow` / `011_expense_policies_and_ai_analysis`, y `016_audit_log` / `016_multi_tenant_cost_centers`. Aplican sin conflicto porque tocan tablas distintas, y el orden es alfabético por nombre completo | Siempre usar número único. Los cuatro ya están en el repo y no se renumeran: renumerar una migración aplicada rompe el historial del servidor |
| `travel_policies_read` sin filtro de org | La policy usa `activo = true` pero no filtra `org_id` | La RLS está en `activo` y `auth.uid() is not null` — un usuario solo ve políticas de su org porque `get_my_org_id()` filtra en el select; si se agrega multi-tenant real, revisar esta policy |
| `window.location.reload()` después de createFundTransfer | `revalidatePath` server-side no actualiza estado client-side de fondos ya renderizados | Reload forzado es el patrón correcto para esta situación |
| Notificaciones email sin service role | `auth.users.email` inaccesible con anon key | Usar `createAdminClient()` para el lookup del email del destinatario antes de `resend.emails.send()` |
| Link de invitación apunta a localhost | `NEXT_PUBLIC_APP_URL=http://localhost:3000` en `.env.local` → el `redirectTo` de Supabase `generateLink` embebe la URL local | Setear `NEXT_PUBLIC_APP_URL=https://www.mi-rendicion.com` en Vercel + Supabase Site URL + Redirect URLs |
| Botón "Invitar" individual desaparece para usuarios ya invitados | `{!emp.invited_at && <button>}` oculta el botón — admin no puede reenviar | Siempre mostrar el botón; usar `emp.invited_at` para cambiar estilo (teal→ámbar) y texto (Invitar→Reenviar). Agregar `confirm()` en `handleSendInvitations` si algún seleccionado ya tiene `invited_at` |
| Reenviar invitación llega como "restablecer contraseña" | Supabase no distingue invitación de reset en el email | Es el comportamiento esperado. Informar al empleado con el confirm() que el nuevo correo llegará así |
| `getEmployeeTargets` retornaba solo caja chica histórica | `is_historical_import` y `historical_type` filtraban demasiado | Eliminar esos filtros — retornar todos los expense_reports del empleado para poder vincular traspasos a rendiciones regulares |
| `lookupEmails()` en notifications.ts carga todos los usuarios | `listUsers({ perPage: 1000 })` en cada envío de email — ineficiente a escala | Migrar a `getUserById()` individual por cada destinatario, o cachear el mapa user_id→email |
| Tratar un adelanto como gasto en el asiento Defontana | El generador solo sabía armar la rendición de gastos; los `item_type` advance/return/transfer caían en esa rama | Cada movimiento tiene su asiento — ver punto 13. Nunca meter un adelanto en la agrupación de gastos |
| Poner centro de negocios en Fondos por Rendir o en el banco | Son cuentas de balance: se imputan por ficha del responsable, no por centro | Solo las líneas de gasto llevan centro (`+000`) |
| RUT sin puntos en Código de Ficha | El OCR guarda `76247147-7` y el importador lo rechaza | `toSheetRut()` en la serialización — también normaliza el DV `k` a mayúscula |
| Varios asientos en un mismo Excel | Defontana no los distingue: los funde en un comprobante con fechas mezcladas | `exportDefontanaAuto()` → ZIP con un archivo por comprobante |
| Emitir el asiento de traspaso desde los dos lados | Cada traspaso deja un ítem en el reporte del pagador Y del receptor | Emitir solo desde `is_transfer_payer` |
| Sumar adelantos y gastos en un KPI de "total" | Es la misma plata contada dos veces | `byMovement` — el gasto es `expense`, el resto es flujo de fondos |
| Buscar los adelantos de un fondo vivo en `petty_cash_items` | Ahí solo hay gastos; adelantos y reembolsos son `petty_cash_transfers` | Mapear por sentido del dinero: `disbursement`/`refund_to_employee` → adelanto, `reimbursement_from_employee` → devolución |
| Heredoc largo con TSX/TS en el Bash tool | El comando falla con "unexpected EOF while looking for matching `''" | Usar el tool Write (o Write a un temporal + `cat >>`) para bloques grandes |
| `stroke="var(--color-brand-300)"` en un SVG sale sin color | Tailwind v4 solo emite las variables de `@theme` cuya **utilidad** detecta en uso; un `var()` inline no cuenta. Falla en silencio | Usar la clase (`className="stroke-brand-300"`), que sí es una utilidad. Mismo motivo por el que los degradados de CTA viven en un `:root` plano |
| Texto tenue dentro de un contenedor con `opacity` | El contraste se **multiplica**: `text-white/70` dentro de una tarjeta al 60% da 42% efectivo, ilegible | Al bajar la opacidad de un contenedor, subir la de su texto para compensar |
| `strokeLinecap="round"` con un arco de largo cero | Igual pinta el redondeo de las puntas: un punto que se lee como un 1% inexistente | No renderizar el trazo cuando el valor es 0 |
| Crear un componente de React para una superficie visual nueva | El selector de legibilidad de `globals.css` excluye superficies **por nombre de clase**; una clase nueva no excluida vuelve blancos sobre blanco los encabezados de adentro | Preferir la clase de material existente (`.hoja`, `.tor-glass`). Si de verdad hace falta una clase nueva, agregarla al `:not()` |
