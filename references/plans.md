# Mi rendición — Estado de implementación y backlog

> Última actualización: 2026-08-11
> Ver SKILL.md para contexto completo del proyecto.

---

## Roadmap R1–R20 — Estado final

| R# | Feature | Estado | Commit / Nota |
|----|---------|--------|---------------|
| R1 | Kilometraje vehículo propio | ✅ | `feat: R1/R7/R8/R15` |
| R2 | Dashboard empleado (KPIs + pendiente reembolso) | ✅ | `feat: R2/R9/R16` |
| R3 | Banner motivo rechazo visible al empleado | ✅ | `fix: banner de rechazo` |
| R4 | Recordatorios automáticos (cron 9AM) | ✅ | `feat: R4 recordatorios` |
| R5 | Políticas de gasto en tiempo real | ✅ | migración 011 + `actions/policies.ts` |
| R6 | Resumen mensual empleado `/mis-gastos` | ✅ | `feat: R6/R17` |
| R7 | ZIP comprobantes | ✅ | `feat: R1/R7/R8/R15` |
| R8 | Aprobador suplente (backup L1) | ✅ | `feat: R1/R7/R8/R15` |
| R9 | Modo revisión rápida (Aprobar todo) | ✅ | `feat: R2/R9/R16` |
| R10 | Política de viáticos PENTA | ✅ | `feat: R10 política de viáticos + botón CC masivo` |
| R11 | Centro de costo por empleado (herencia automática) | ✅ | migración 012; `users.cost_center_id` + `expense_items.cost_center_id` |
| R12 | Defontana formato real 34 columnas | ✅ | `src/lib/export/defontana.ts` reescrito |
| R13 | Detección duplicados caja chica | ✅ | `actions/petty-cash.ts` |
| R14 | Resumen IA para aprobador | ✅ | `generateApprovalAnalysis()` con Claude Sonnet 4.6 |
| R15 | Notificaciones email reales vía Resend | ✅ | `feat: R1/R7/R8/R15` |
| R16 | Dashboard consolidado saldos caja chica | ✅ | `/admin/fondos` — `feat: R2/R9/R16` |
| R17 | Firma digital en PDF exportado | ✅ | SHA-256 del payload — `feat: R6/R17` |
| R18 | Borrador offline / localStorage | ✅ | `feat: R18` |
| R19 | Análisis pivot por centro de costo | ✅ | `/admin/analisis` — `feat: análisis pivot` |
| R20 | Flujo rápido móvil `/quick` | ✅ | `feat: R20` |

**Todos los 20 ítems del roadmap están completos.**

---

## Módulos implementados fuera del roadmap R1–R20

| Módulo | Estado | Detalle |
|--------|--------|---------|
| Fund transfers → rendiciones regulares | ✅ | `getEmployeeTargets` retorna todos los expense_reports; `createFundTransfer` acepta `receiver_report_id` para vinculación directa |
| Advertencia re-invitación empleados | ✅ | `handleSendInvitations` muestra confirm() si algún seleccionado ya tiene `invited_at`; botón ámbar "Reenviar" para ya invitados |
| Manual empleados HTML | ✅ | Artifact https://claude.ai/code/artifact/874284e5-4389-4b88-b857-0f7d058a0aa0 — guía ilustrada con mockups de pantallas |
| Fix NEXT_PUBLIC_APP_URL | ✅ | Corregido a `https://www.mi-rendicion.com` en `.env.local` |
| Defontana v2 (CC + suppliers + lock + formato 34 col) | ✅ | migración 012; `defontana.ts` |
| Módulo Informes Unificados `/informes` | ✅ | plan 2026-07-27; `actions/reports.ts` + `lib/report-helpers.ts` |
| Mejora filtros Caja Chica (multi-select + período) | ✅ | `petty-cash/client.tsx` |
| Flujo autorización bancaria (caja chica + rendiciones) | ✅ | migración 011-bank; `can_load_bank_transfer`, `can_authorize_bank_transfer` |
| Adjuntos por ítem (expense_items + petty_cash_items) | ✅ | `attachment_url` + `feat: adjuntos por ítem` |
| Auto-asignación empleado en importación histórica | ✅ | match por nombre normalizado |
| Admin puede establecer contraseña de empleado | ✅ | `set-password` flow |
| Eliminar traspasos no vinculados | ✅ | `feat: traspasos sin vincular — eliminar y editar` |
| Edición de ítems en caja chica cualquier estado (admin) | ✅ | `fix: permitir admin eliminar ítems` |
| Botón "Reasignar CC" masivo en admin/reports | ✅ | `bulkUpdateExpenseItemsCostCenter` |

---

## Planes de implementación escritos

| Plan | Archivo | Estado |
|------|---------|--------|
| A — Foundation | `docs/superpowers/plans/2026-06-01-rindegastos-plan-a-foundation.md` | ✅ Completo |
| B — Expense Flow | `docs/superpowers/plans/2026-06-01-rindegastos-plan-b-expense-flow.md` | ✅ Completo |
| C — Approval + Admin | `docs/superpowers/plans/2026-06-01-rindegastos-plan-c-approval-admin.md` | ✅ Completo |
| Importador histórico | `docs/superpowers/plans/2026-07-22-importador-historico.md` | ✅ Completo (incluye R11, R12, Defontana v2) |
| Políticas + IA | `docs/superpowers/plans/2026-07-24-politicas-gastos-aprobacion-ia.md` | ✅ Completo (R5, R14, R10) |
| Informes Unificados | `docs/superpowers/plans/2026-07-27-informes-unificados.md` | ✅ Completo |
| Auditoría + Seguridad + Robustez | `docs/superpowers/plans/2026-08-11-auditoria-seguridad-robustez.md` | ✅ Completo (rama `feat/auditoria-seguridad-robustez`, listo para merge) |

---

## Backlog real (2 ítems)

### 1. Notificaciones email completas
**Estado:** Parcialmente implementado. Resend está instalado y algunos paths envían email.
**Bloqueante:** Lookup de `auth.users.email` por UUID requiere `SUPABASE_SERVICE_ROLE_KEY`. La función `createAdminClient()` ya existe — hay que asegurar que todos los paths de `resend.emails.send()` la usen para el lookup del email del destinatario.
**Impacto:** Bajo — las notificaciones in-app funcionan; el email es complementario.

### 2. Service worker offline
**Estado:** No implementado.
**Bloqueante:** `next-pwa` v5 es incompatible con Turbopack (Next.js 16). La app es instalable como PWA (manifest.json + metadata en layout.tsx) pero sin cache offline.
**Workaround:** Manual service worker sin `next-pwa`, pero complejidad alta para beneficio bajo. Backlog indefinido.

---

## Migraciones aplicadas en Supabase (`jqtbtgduqzxkgubmzukg`)

| Archivo | Contenido |
|---------|-----------|
| `001_initial_schema.sql` | Tablas base, RLS, triggers, índices |
| `004_petty_cash.sql` | Caja chica (4 tablas) |
| `005_suggestions_and_approval_attachments.sql` | Sugerencias + adjuntos de aprobación |
| `007_historical_import_flag.sql` | `is_historical_import` en expense_reports |
| `008_historical_import_type_and_fund_number.sql` | `historical_type`, `fund_number` |
| `009_expense_items_item_type.sql` | `item_type` en expense_items |
| `010_fund_transfers.sql` | Traspasos entre cajas chicas |
| `011_expense_policies_and_ai_analysis.sql` | expense_policies + ai_analysis en reports/items |
| `011_bank_authorization_workflow.sql` | Permisos bancarios en users + status extendido |
| `012_defontana_cost_centers.sql` | cost_centers (46 PENTA seeded) + defontana_suppliers + CC en users/items + supplier_rut |
| `013_petty_cash_defontana.sql` | defontana_exported_at/ref en petty_cash_funds |
| `015_travel_policies.sql` | travel_policies (viáticos por destino/categoría) |
| `016_audit_log.sql` | Tabla `audit_log` append-only + RLS + índices |
| `017_soft_delete_extensions.sql` | soft-delete en expense_items/categories, `monthly_budget_clp`, `dedup_key` en notifications, `rate_limit_log` |
| `018_webhooks.sql` | Tabla `webhooks` + RLS con `is_admin()` |
| `019_security_fixes.sql` | RLS en `rate_limit_log`, drop policy insert abierta en `audit_log`, notifications en `supabase_realtime`, índice dedup sin cláusula WHERE |

**Nota:** Dos archivos `011_*.sql` coexisten — el servidor los aplica por orden alfabético del nombre completo. No hay conflicto de datos porque afectan columnas/tablas distintas.
