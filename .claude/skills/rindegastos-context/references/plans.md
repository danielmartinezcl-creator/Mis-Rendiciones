# Estado de implementación — Rindegastos

> Última actualización: 2026-07-23

## ✅ Plan A — Foundation
- Proyecto scaffolded, design system (Tailwind v4, paleta teal #0D9488, fuentes Bricolage + Hanken + Geist Mono)
- Constantes + utils + tests Vitest
- Schema Supabase completo (migración 001: 10 tablas + RLS + triggers + índices)
- `src/proxy.ts` (protección de rutas Next.js 16)
- Login Supabase Auth (email+password)
- Layout autenticado (Sidebar dark, MobileNav)

## ✅ Plan B — Dashboard + OCR + CRUD
- `src/actions/ocr.ts` — Claude Sonnet 4.6, ~$0.008/foto
- `src/actions/exchange-rate.ts` — TC histórico con cache 24h
- `src/actions/expenses.ts` — CRUD rendiciones completo
- `PhotoUpload.tsx`, `ExpenseItemForm.tsx`, `ExpenseItemCard.tsx`, `ExpenseReportCard.tsx`
- Páginas: `/`, `/expenses/new`, `/expenses/[id]`, `/reimbursements`

## ✅ Plan C — Aprobaciones + Admin + Export + PWA
- `src/actions/approvals.ts`, `notifications.ts`
- Páginas aprobador: `/approvals`, `/approvals/[id]`
- Páginas admin: `/admin`, `/admin/reports`, `/admin/employees`, `/admin/settings`
- Export Excel (SheetJS) + PDF (jsPDF + autotable)
- PWA: `public/manifest.json` + metadata en `layout.tsx`
- Deploy Vercel: repo `Mis-Rendiciones` en GitHub → auto-deploy en push a main

## ✅ Post Plan C — Módulos adicionales

### Gestión de empleados
- `src/lib/supabase/admin.ts` — `createAdminClient()` con `SUPABASE_SERVICE_ROLE_KEY`
- `src/actions/employees.ts` — `importEmployees(rows[])` con rollback
- `src/components/admin/EmployeeImport.tsx`, `AddEmployeeForm.tsx`

### Cadena de aprobación por empleado
- `approver_l1_id`, `approver_l2_id` en `users`
- `src/components/admin/ApproverConfig.tsx`
- Lógica en `submitApprovalDecision`: L1 aprueba → si existe L2 y todos OK → `pending_l2` → L2 decide

### Perfil de usuario
- `rut`, `bank_name`, `bank_account_type` en `users`
- `src/actions/profile.ts` — `getMyProfile()`, `updateProfile()`, `sendPasswordReset()`
- `/profile/page.tsx`

### Sidebar drag & drop
- Orden en `localStorage` key `sidebar_order_${userId}`
- HTML5 Drag & Drop API nativa (sin librerías)
- Solo admins pueden reordenar

### Admin Rendiciones completo
- `getAdminReports()` con submitter_name + department
- `getReportDetailForAdmin()` con historial de aprobaciones L1/L2
- Filtros combinables: rango fechas, estado, empleado, departamento, reembolsado
- Export Excel/PDF con historial de aprobaciones y rechazos

## ✅ Reforma visual (2026-06-04)
- Nombre: "Mi rendición"
- Color brand: teal `#0D9488` (todas las clases `brand-*`)
- Paleta neutral: ink (escala azul-negro frío)
- Sidebar bg: `#0B1120`
- Fuentes: Bricolage Grotesque (display) + Hanken Grotesk (UI/body) + Geist Mono (montos)
- Íconos: Lucide React
- Radios: `rounded-item` (14px) y `rounded-card` (18px)

## ✅ Soft delete + PWA icons + región
- `expense_reports.deleted_at` (papelera 90 días)
- `/admin/trash` — restaurar o eliminar definitivamente
- PWA icons apple-touch-icon
- Región Supabase: São Paulo (sa-east-1)

## ✅ Módulo Caja Chica (migración 004)
- `src/actions/petty-cash.ts` — CRUD fondos, ítems, estados, liquidación
- Páginas: `/petty-cash`, `/petty-cash/new`, `/petty-cash/[id]`
- Flujo: draft → pending_approval → approved → funds_sent → submitted → pending_liquidation_approval → settled
- `users.can_manage_petty_cash` = permiso de encargado

## ✅ Importador histórico (migraciones 007/008)
- `/admin/carga-historica` — importar Excel de rendiciones y cajas chicas históricas
- `src/actions/historical-import.ts`
- `expense_reports.is_historical_import`, `historical_type`, `fund_number`
- `petty_cash_funds.is_historical_import`
- Edición inline de ítems históricos (category, item_type, merchant, date, amount)
- Drag & drop Excel en página admin

## ✅ Sugerencias (migración 005)
- `src/actions/suggestions.ts`
- `/suggestions` — empleados envían sugerencias/bugs
- Tabla `suggestions` con estados y notas admin

## ✅ Adjuntos de aprobación (migración 005)
- `src/actions/approval-attachments.ts`
- Tabla `approval_attachments` — correos/PDFs como respaldo de aprobaciones
- Bucket `approval-attachments`

## ✅ Traspasos entre cajas chicas (migración 010)
- `src/actions/fund-transfers.ts` — `createFundTransfer`, `linkFundTransfer`, `getOrgFundTransfers`, `getEmployeeTargets`
- Tabla `fund_transfers` — matching en 2 fases (payer siempre conocido, receiver nullable hasta vincular)
- `expense_items.item_type = 'transfer'` + `transfer_id`
- `petty_cash_items.transfer_id`
- UI `/petty-cash`: sección "Traspasos sin vincular", botón en fondos y cargas históricas, modales crear/vincular

## ⏳ Pendiente / Backlog
- Export Defontana: formato real 34 columnas (plan escrito en `docs/superpowers/plans/2026-07-22-importador-historico.md`)
- Centro de costo por empleado (`users.cost_center_id`) — migración pendiente
- `supplier_rut` en `expense_items` para crédito fiscal IVA
- Notificaciones email: requiere service role para lookup en `auth.users`
- Service worker offline (next-pwa incompatible con Turbopack)

---

## Rutas implementadas (17 rutas)

| Ruta | Acceso |
|------|--------|
| `/` | todos |
| `/expenses/new` | employee |
| `/expenses/[id]` | employee |
| `/reimbursements` | employee |
| `/approvals` | approver |
| `/approvals/[id]` | approver |
| `/admin` | admin |
| `/admin/reports` | admin |
| `/admin/employees` | admin |
| `/admin/settings` | admin |
| `/admin/carga-historica` | admin |
| `/admin/trash` | admin |
| `/petty-cash` | manager + admin |
| `/petty-cash/new` | manager + admin |
| `/petty-cash/[id]` | manager + admin + employee |
| `/profile` | todos |
| `/suggestions` | todos |

## Server Actions implementados (13 archivos)

`admin.ts`, `approval-attachments.ts`, `approvals.ts`, `employees.ts`, `exchange-rate.ts`, `expenses.ts`, `fund-transfers.ts`, `historical-import.ts`, `notifications.ts`, `ocr.ts`, `petty-cash.ts`, `profile.ts`, `suggestions.ts`
