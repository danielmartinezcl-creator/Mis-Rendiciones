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

> **Contrastado contra el disco el 2026-09-21** (migraciones, rutas, capturas, tests y
> backlog). Este archivo se carga en cada sesión, así que cuando envejece **desvía todas
> las sesiones a la vez**: eso ya pasó con el service worker, con el conteo de pantallas
> rediseñadas y con dos migraciones que no figuraban. Si una sesión descubre que un hecho
> de acá es falso, **corregirlo acá en el momento**, no solo en el commit.

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

> **⚠️ La organización está en plan FREE y el proyecto se pausa solo tras ~7 días
> sin uso.** Al pausarse, Supabase **retira el registro DNS** del subdominio: no es
> que la base responda lento, es que el dominio deja de existir.
>
> **Si alguien dice «no puedo iniciar sesión», sospechar esto PRIMERO.** Un solo
> `get_project` del MCP de Supabase lo confirma o lo descarta: `status` distinto de
> `ACTIVE_HEALTHY` es la respuesta, y entonces el código, las variables y el deploy
> están todos sanos y no hay que revisarlos. Detalle completo en
> [[project-supabase-plan-free-pausa]] en la memoria.
>
> Pasó el 2026-09-21 tras catorce días de silencio. Se restaura con `restore_project`
> y tarda ~8 minutos. **Durante ese rato el esquema se ve VACÍO —`public.users` no
> existe— y eso es normal, no es pérdida de datos:** no declarar nada roto hasta que
> `/rest/v1/` devuelva 200 (la secuencia es 521 → 404 → 200).

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
               'partially_approved' | 'rejected' | 'pending_bank_load' |
               'pending_bank_auth' | 'reimbursed'
ItemStatus   = 'pending' | 'approved' | 'rejected'
DocType      = 'boleta' | 'factura' | 'factura_exenta' | 'ticket' | 'otro'
ItemType     = 'expense' | 'advance' | 'return' | 'transfer'   // en expense_items
// petty_cash_funds.status (extendido migraciones 011 y 032 — N2 de fondo y de liquidación):
FundStatus   = 'draft' | 'pending_approval' | 'pending_approval_l2' | 'approved' |
               'pending_bank_load' | 'pending_bank_auth' | 'funds_sent' | 'submitted' |
               'pending_liquidation_approval' | 'pending_liquidation_l2' | 'settled' | 'rejected'
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
                mileage_km, mileage_rate, transfer_id,
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
│   │   │   ├── proyectos/                ← Catálogo de proyectos: corregir número, nombre, jefe, activo (039)
│   │   │   ├── centros-costo/            ← Catálogo de centros de costo: crear (padre + 3 letras), nombre,
│   │   │   │                                si recibe asientos, activo, borrar si nada lo usa (2026-10-08)
│   │   │   ├── auditoria/                ← Registro append-only (incluye reversas Defontana)
│   │   │   └── trash/                    ← Papelera (soft delete; nada la purga sola)
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
│   ├── cost-centers.ts     ← getCostCenters (sin requireAdmin — cualquier user) + el catálogo:
│   │                         listarCentrosCosto / crearCentroCosto / corregirCentroCosto /
│   │                         eliminarCentroCosto (admin). Antes era SOLO lectura: los 46
│   │                         venían sembrados por la 012 y sumar uno exigía SQL a mano
│   ├── employees.ts        ← importEmployees, setApprovers, setBackup + la planilla de alta:
│   │                         datosParaPlanilla, cargarPlanillaAlta, otorgarPermisoAprobar
│   ├── expenses.ts         ← CRUD rendiciones, addItem (con CC + supplier_rut + km)
│   ├── exchange-rate.ts    ← TC histórico con cache 24h
│   ├── fund-transfers.ts   ← traspasos entre cajas chicas
│   ├── historical-import.ts ← importador Excel histórico
│   ├── notifications.ts    ← solo getMyNotifications / markNotificationRead. Los avisos (in-app + Resend)
│   │                         viven en src/lib/avisos.ts: como acciones del servidor, cualquier sesión los invocaba
│   ├── ocr.ts              ← Claude Sonnet 4.6, ~$0.008/foto
│   ├── petty-cash.ts       ← CRUD fondos, flujo bancario, liquidación
│   ├── policies.ts         ← expense_policies CRUD + checkPolicyViolations + travel_policies CRUD + checkTravelPolicies
│   ├── profile.ts          ← getMyProfile, updateProfile, sendPasswordReset
│   ├── reports.ts          ← getReportFilterOptions + getUnifiedReportItems (4 fuentes)
│   ├── suggestions.ts      ← CRUD sugerencias
│   ├── proyectos.ts        ← buscarProyecto, jefesDeProyecto, resolverOCrearProyecto (el catálogo se
│   │                         arma con el uso), listarProyectos / corregirProyecto (admin)
│   └── approval-attachments.ts ← adjuntos de respaldo de aprobaciones; escribe y firma solo el servidor (037)
├── components/
│   ├── layout/             ← Sidebar (drag&drop, personalizable por admin), MobileNav, LogoutButton
│   ├── ui/                 ← InsigniaEstado, Button, CurrencyAmount, MedidorArco,
│   │                         VerticalTimeline, CompactStepper, AdminKpiHero, Badge, Card
│   ├── admin/              ← PlanillaAlta (la carga de empleados), EmployeeImport (la vieja, a retirar),
│   │                         AddEmployeeForm, ApproverConfig, DefontanaTypePanel
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
│   ├── respaldos.ts           ← puedeBorrarRespaldo, puedeSubirRespaldo, destinoDelRespaldo (037)
│   ├── archivos.ts            ← archivosQueCaen, retirarArchivos: los archivos que un borrado de verdad deja sin fila
│   ├── papelera.ts            ← qué impide eliminar de verdad un documento (hoy: aparecer en un traspaso)
│   ├── planilla-alta.ts       ← la carga de empleados desde Excel: resolverPersona (solo ACTIVAS),
│   │                            resolverCentroCosto, parcheDeFila (vacío nunca borra), resolverPlanilla
│   ├── rut.ts                 ← normalizarRut (para comparar) / formatearRut (para guardar: la base
│   │                            los tiene CON puntos y 5 con la k minúscula). Módulo propio para que
│   │                            planilla-alta y alta-repetida no se importen en círculo
│   ├── alta-repetida.ts       ← por qué un alta rebota cuando la persona YA existe: la busca por
│   │                            correo o RUT SIN mirar si está activa, y dice qué hacer según dónde
│   │                            esté (papelera → restaurar, bloqueo → habilitar, baja → reactivar)
│   ├── centros-costo.ts       ← el código ES el centro de negocios de Defontana y se lee de tres en
│   │                            tres: profundidad / codigoDePadre / armarCodigo / erroresDeAlta /
│   │                            ordenarEnArbol / sePuedeBorrar / toSheetCostCenter (los tres ceros)
│   ├── segregacion.ts         ← las 3 alertas sobre el resultado: carga Y autoriza pagos, se aprueban
│   │                            mutuamente (validarCadena no lo ve: mira una persona, no el conjunto),
│   │                            demasiada gente a cargo. NO bloquean
│   ├── cadena-aprobacion.ts   ← erroresDeCadena + camposDeCadena: las reglas de la cadena en un solo
│   │                            lugar, que usan setEmployeeApprovalChain y la planilla.
│   │                            coherenciaJefeProyecto: «jefe de proyecto» y «aprueba» van juntos
│   ├── cadena-proyecto.ts     ← resolverCadena / umbralAplicable / requiereN2: QUIÉN aprueba un
│   │                            documento (039). La usan el envío y la previa: la misma función
│   ├── invitaciones.ts        ← confirmacionInvitacion: varias personas exigen escribir INVITAR
│   ├── filtro-documentos.ts   ← el filtro del empleado: qué documento entra y qué suma (aplicarFiltro),
│   │                            rangos de fecha, estados = las 4 familias. Lo usan las listas, la
│   │                            exportación de caja chica y «Mis gastos»
│   ├── filtro-url.ts / filtro-etiquetas.ts ← el filtro en la dirección; los textos de los chips
│   ├── filtros/dimensiones.ts ← la FORMA de un filtro, sin dominio adentro: Dimension (multi,
│   │                            único, fecha, texto), Valores, etiquetaDe, ocultasPuestas
│   ├── filtros/adaptador-documentos.ts ← Filtro (el del empleado) ↔ Valores. Existe para NO
│   │                            reescribir filtro-documentos.ts
│   ├── filtros/vistas.ts      ← depurarVista / coincideConVista / erroresDeNombre
│   ├── filtro-rendiciones-admin.ts ← el predicado de /admin/reports (la fecha es la de ENVÍO)
│   ├── filtro-items.ts        ← el predicado de /informes: doce dimensiones en el navegador
│   ├── filtro-auditoria.ts    ← las dimensiones de la bitácora y su traducción a la consulta
│   ├── filtro-empleados.ts    ← el predicado de la nómina, con «le faltan los datos bancarios».
│   │                            Un BLOQUEADO no sale salvo que se lo pida (chip o buscador)
│   ├── bancos.ts              ← la lista de bancos y tipos de cuenta, y el normalizador que
│   │                            impide dos vocabularios en la misma columna. opcionesDeBanco
│   │                            mete el valor guardado como opción: sin eso, guardar lo borra
│   ├── texto.ts               ← normalizarNombre (comparar) y sinTildes (buscar)
│   ├── opciones-filtro.ts     ← los nombres de proyectos y categorías que ven los chips
│   ├── mis-gastos.ts          ← total aprobado, pendiente y promedio (rendiciones + caja chica, solo gastos)
│   ├── navegacion.ts          ← las 4 pestañas de la barra de abajo según el perfil
│   ├── supabase/           ← client.ts, server.ts, admin.ts (service role), types.ts
│   └── export/             ← excel.ts, pdf.ts, defontana.ts (asientos + serialización),
│                             defontana-settings.ts (config por movimiento)
├── proxy.ts                ← protección de rutas (Next.js 16); las que pasan sin sesión, en `lib/rutas-publicas.ts`
scripts/
├── medir-pantallas.mjs     ← pantallas de scroll por ruta y qué BLOQUE se come el alto
│                             (§5 de la spec). `--empleado` y `--ancho`; sin `--empleado`
│                             las pantallas del rendidor salen vacías y miden aire
├── deuda-sistema.mjs       ← `npm run audit:deuda`
└── generate-icons.mjs      ← los íconos de la PWA y el favicon
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
│   ├── 022_petty_cash_defontana_by_movement.sql      ← marca Defontana por ítem y por transferencia de fondo vivo
│   ├── 023_org_logos.sql                             ← bucket `org-logos` (white-label); no toca tablas
│   ├── 024_invalidar_analisis_ia.sql                 ← el caché del análisis IA se invalida donde cambian los datos
│   ├── 025_empleado_borra_sus_borradores.sql         ← política DELETE del rendidor (solo borradores propios)
│   ├── 026_aprobaciones_append_only.sql              ← historial de aprobaciones inmutable; rendición con aprobaciones solo la borra un admin
│   ├── 027_usuario_bloqueado.sql                     ← users.blocked_at: «eliminar definitivamente» un empleado lo bloquea, no lo borra
│   ├── 028_adjuntos_correos.sql                      ← adjuntos: correos .eml/.msg en el bucket + file_type 'email' (lista espejo de src/lib/attachment-types.ts)
│   ├── 029_bucket_respaldos_aprobacion.sql           ← crea el bucket approval-attachments, que nunca existió (+ Excel)
│   ├── 030_aprobador_puede_decidir.sql               ← WITH CHECK en la política del aprobador: un no-admin nunca pudo cerrar una rendición. Función es_aprobador_de()
│   ├── 031_suplente_bancario.sql                     ← users.bank_is_backup: puede cargar/autorizar, pero los avisos van solo a titulares
│   ├── 032_flujo_por_asignacion.sql                  ← fondos con N2, suplencia bancaria por función (bank_load_backup / bank_auth_backup), historial de fondos firmado e inmutable, ver por cadena
│   ├── 033_estado_solo_desde_servidor.sql            ← ✅ APLICADA el 2026-09-25, tras el despliegue (ensayada antes con BEGIN/ROLLBACK: 42/42; en vivo: 41 ok, 1 no concluyente por falta de datos, 0 fallas): estado, montos, a quién se paga e historiales solo desde el servidor; un gasto nunca cambia de documento y solo lo toca su dueño, con la rendición en borrador o el fondo en `funds_sent` — el admin, además, corrige cargas históricas y reclasifica (categoría, centro de costo, Defontana) (sección 3b); el admin de caja chica queda acotado a su organización (sección 7). Pruebas: supabase/tests/033_proteccion.sql
│   ├── 034_borrar_bank_is_backup.sql                 ← ✅ APLICADA el 2026-10-01, tras el despliegue. Borra `users.bank_is_backup`, la suplencia bancaria vieja de un solo interruptor. Antes: `git grep bank_is_backup -- src` sin resultados, el `drop` ensayado con BEGIN/ROLLBACK sin error, y ningún dato en riesgo (de 58 usuarios, 1 tenía la suplencia vieja y ya estaba copiada por la 032 a `bank_load_backup` / `bank_auth_backup`). **Desde acá, volver a código anterior al 2026-09-25 exige recrear la columna** y copiarla desde `bank_load_backup`
│   ├── 035_adjuntos_solo_desde_servidor.sql          ← ✅ APLICADA el 2026-09-25, tras el despliegue (ensayo con BEGIN/ROLLBACK: sin la 035, 9 de 12 pruebas rotas, que eran los agujeros; con la 035, 12/12; en vivo, 12/12): ninguna sesión escribe en `attachments` ni en el bucket `expense-attachments`, lo hace el servidor con la llave de servicio tras `puedeCambiarAdjuntos()`; la lectura del bucket queda en la carpeta de la propia org. Pruebas: supabase/tests/035_adjuntos.sql
│   ├── 036_tipo_recordatorio.sql                     ← ✅ APLICADA el 2026-09-28, antes del despliegue; tipo 'reminder' en notifications. Aditiva: el código viejo nunca escribe ese tipo. Ensayo con BEGIN/ROLLBACK: 4/4 (se guarda, el repetido no entra por dedup_key, los `reminder_*` viejos siguen rechazados, los tipos de siempre siguen entrando)
│   ├── 037_respaldos_solo_desde_servidor.sql         ← ✅ APLICADA el 2026-09-28, tras el despliegue (ensayo con BEGIN/ROLLBACK: sin la 037, 12 de 17 pruebas rotas, que eran los agujeros; con la 037, 17/17; en vivo, 17/17). Un rollback de Vercel a código anterior deja sin subir, abrir ni borrar respaldos: el código viejo lo hacía con la sesión. Ninguna sesión escribe en `approval_attachments` ni toca el bucket `approval-attachments`, ni para leer: el servidor sube, borra y firma con la llave de servicio tras `src/lib/respaldos.ts`. La tabla se lee solo con el documento a la vista (subselect que hereda la RLS de la rendición o del fondo). Pruebas: supabase/tests/037_respaldos.sql
│   ├── 038_funciones_sin_acceso_publico.sql          ← ✅ APLICADA el 2026-10-01, tras el despliegue (ensayo con BEGIN/ROLLBACK: sin la 038, 22 de sus 26 pruebas en `false`, que eran los agujeros; con la 038, 26/26, y las otras tres baterías intactas — 033: 41 ok + 1 no concluyente · 035: 12/12 · 037: 17/17; en vivo, 26/26). Las 12 funciones `SECURITY DEFINER` eran ejecutables por `anon` y `authenticated` vía `/rest/v1/rpc`. Las 8 de disparador no las necesita nadie: **Postgres verifica `EXECUTE` al CREAR el disparador, no cada vez que dispara** (comprobado en vivo: una sesión `authenticated` sigue siendo rechazada por `proteger_estado_rendicion` con su mensaje, no con «permission denied for function»). Las 4 que usan las políticas las conserva `authenticated`, nunca `anon`. Lo que cierra el acceso es el `revoke ... from public`: `anon` y `authenticated` heredan de PUBLIC. `set_updated_at` queda además con `search_path = ''` (su cuerpo solo usa `now()`, de `pg_catalog`). Pruebas: supabase/tests/038_funciones.sql
│   ├── 039_aprobador_por_proyecto.sql                ← ✅ APLICADA el 2026-10-07, ANTES del despliegue (es aditiva y nullable: el código viejo no lee ninguna de sus columnas — al revés que la 033/035/037, que protegían y tenían que ir después). Ensayo con BEGIN/ROLLBACK: 23/23, más un segundo ensayo apuntando el relleno a los borradores (no había documentos en vuelo y el bloque no se ejercitaba): 9 filas, N1 copiado igual al de la ficha. En vivo: 23/23. Tabla `proyectos` (número único por organización), `users.es_jefe_proyecto` / `umbral_n2_clp`, `organizations.aprobador_defecto_id` / `aprobador_n2_defecto_id` / `umbral_n2_clp`, y la cadena congelada en `expense_reports` y `petty_cash_funds` (`cadena_*`, y `liq_cadena_*` para la liquidación). Pruebas: supabase/tests/039_proyectos.sql
│   └── 040_vistas_de_filtro.sql                     ← ✅ APLICADA el 2026-10-08 (20261008220657), ANTES del despliegue: es aditiva y el código viejo no lee esta tabla. Ensayo con BEGIN/ROLLBACK: 23 ok, 0 rotas, 1 no concluyente —el cruce entre organizaciones, porque PENTA es la única— y comprobado después que no dejó rastro; en vivo, 24/24. Las vistas guardadas del admin, **de la organización**: la lee cualquier miembro, la escribe solo su admin. NO siembra ninguna. Pruebas: supabase/tests/040_vistas.sql
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
- **970 tests Vitest en 59 archivos** (2026-10-20; eran 884 en 54 antes del saldo
  pendiente), todos pasando · **lint: 0 errores y 22 avisos** (`npx eslint .`)
- **`realtime-provider.test.tsx` falla a veces en la corrida completa** con
  `Error: UNKNOWN: unknown error, lstat 'C:\'` y sus 2 tests no corren — por eso una corrida
  entera puede informar 881. Corriéndolo solo pasa 2/2: es el filesystem de Windows con 54
  archivos en paralelo, no el test. **No gastar tiempo depurándolo como si fuera del código**
- **El generador de íconos de la PWA es `scripts/generate-icons.mjs`**, en ESM. Era `generate-icons.js` en la raíz con `require`, y eran los 3 errores del lint. Al moverlo hay que recordar que su `path.join(__dirname, 'public', 'icons')` apuntaba a la raíz porque vivía ahí: desde `scripts/` necesita subir un nivel, o escribe en `scripts/public/icons/` sin que nada falle
- **El ícono (2026-10-06, Tarea 3.6):** el `ReceiptText` de Lucide en trazo blanco sobre `--cta-brand` — el mismo dibujo y el mismo degradado que `<Marca>` ya usa en el riel, la barra del teléfono y el acceso. Reemplazó al degradado índigo de «Penta Rend», que no usaba ningún color de Tornasol. El script genera los dos PNG **y** `src/app/favicon.ico`, sigue sin dependencias, y lo que hay que saber antes de tocarlo está en sus comentarios: rasteriza el trazo **por distancia a la curva** (un stroke de puntas redondas es exactamente eso, y el suavizado sale gratis), el favicon lleva **otro encuadre** que el ícono de la app porque a él no lo recorta ningún launcher, y **a 16 px el recibo va sin sus tres líneas** o se lee como una mancha
- **`eslint.config.mjs` repite en `globalIgnores` lo que `.gitignore` ya excluye.** No es
  redundancia: **eslint 9 con flat config no lee `.gitignore`**, y `npm run lint` es
  `eslint` a secas. Sin esa lista, el comando linteaba lo que hubiera en disco —el
  2026-10-01, 2.347 archivos de `.claude/worktrees/`, 1.336 de ellos del `.next` ya
  compilado de cada worktree— y devolvía 4.712 errores que no eran del proyecto.
  `.next/**` cubre solo el de la raíz, así que `.claude/worktrees/**` va entero: las
  worktrees se crean y se retiran todo el tiempo. **Un número de lint sin decir sobre qué
  se corrió no sirve como línea base**

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

**Hay una línea base visual de 54 capturas** (27 escritorio + 27 móvil — sumó «Centros de
costo» el 2026-10-08; antes eran 52, recapturadas enteras ese mismo día con el filtro del
empleado: cambiaron **todas**, porque la barra de
abajo y el riel ganaron «Mis rendiciones»). `aprobacion-detalle` sigue afuera por no
haber ninguna aprobación pendiente que abrir: sin datos esa ruta queda en «skipped» y
**no tiene base**, que el arnés trata como información, no como falla. Cuando vuelva a
haber una, hay que recapturarla — `e2e/`,
`npm run baseline:verificar`). Un cambio de estilo que la deje en verde no tocó nada
visible; si la ensucia, el reporte dice dónde. Leer `e2e/README.md` antes de confiar
en un resultado: solo captura el estado de reposo, así que errores y hover no se ven.
Los paneles y formularios cerrados sí se auditan aparte (`npm run audit:materiales`),
y la deuda de sistema tiene su propio detector (`npm run audit:deuda`, hoy en **cero**).

**Los diálogos del sistema ya no existen en esta app** (commit `a1edf8f`). Los 56
`confirm()` y `alert()` nativos se reemplazaron por dos piezas propias:

| Pieza | Qué es |
|---|---|
| `confirmar()` | Modal, siguiendo a `RevertDefontanaDialog`. **Devuelve una promesa**, así que el sitio de llamada casi no cambia: `if (!await confirmar('¿Eliminar?')) return`. Con `palabra: 'ELIMINAR'` pide escribirla para habilitar el botón — así reemplazó a los `window.prompt` de los borrados irreversibles (decisión de Daniel: la palabra escrita se queda) |
| `avisar()` | El «aviso flotante» de la §5 de la spec: píldora blanca abajo al centro con punto aqua. 2,6 s; 7 s cuando es error, porque casi siempre trae algo que leer |

**Nunca volver a escribir `confirm()` o `alert()`**: el navegador les antepone el
dominio («mi-rendicion.com dice:») y en Android se ven como avisos de error aunque
pregunten algo inofensivo. Un borrado usa el diálogo en rojo, con ícono de alerta y
el verbo real en el botón («Eliminar», no «Confirmar»).

### ✅ Planilla de alta — la carga de empleados desde Excel (2026-10-02)

Un panel en `/admin/employees`: **once columnas** con todo lo que define a una persona
(nombre, RUT, correo, cargo, centro de costo, rol, N1, N2, banco, tipo y número de
cuenta). **Crea a quien no está y completa a quien sí.** Spec y plan:
`docs/superpowers/specs/2026-10-01-planilla-de-alta-design.md`.

**Reemplaza a «Importar nómina»** (`EmployeeImport`), que solo creaba y se retira cuando
Daniel esté conforme con la primera carga real. Hasta entonces conviven.

Decisiones que NO se cambian sin volver a hablarlas:

- **El RUT identifica a la persona, no el correo.** Si no está, cae al correo y le graba
  el RUT. Si el correo encuentra a alguien con OTRO rut, es error: no se le cambia.
- **Una celda vacía nunca borra.** El tipo `ParcheEmpleado` solo admite las claves que la
  fila trae con valor, así que lo hace cumplir el compilador y no la disciplina.
- **El nombre no se escribe al actualizar**: una planilla de RR.HH. con el nombre escrito
  distinto no renombra a nadie.
- **Las filas válidas entran aunque otras queden fuera.**
- **Los permisos NO son columnas.** En una pantalla, dar el permiso de autorizar pagos es
  un acto visible; en la fila 43 de un Excel no lo ve nadie. El de «aprueba» se señala y
  se ofrece dar en bloque, con un botón aparte.
- **Alguien que la planilla crea no puede ser aprobador en esa misma carga**: los
  aprobadores se resuelven contra el estado actual de la base, para que el orden de las
  filas no cambie el resultado. Hay que subir la planilla dos veces.
- **Los encabezados de la plantilla y los que el lector acepta son lo mismo, y hay
  una prueba que lo exige.** No lo eran: la plantilla que la app hace descargar
  decía **«N° de Cuenta»** y el lector solo aceptaba «n de cuenta», porque `°` no
  es un acento y `\p{Diacritic}` no lo sacaba. La columna se ignoraba EN SILENCIO.
  Medido tras la carga real del 2026-10-08: de 61 personas, 58 con banco, 58 con
  tipo de cuenta y **1 con número de cuenta**. Sin número no se le puede pagar a
  nadie. `CABECERAS`, `EJEMPLO` y `mapHeader` se mudaron del `.tsx` a
  `src/lib/planilla-alta.ts`: vivían en un componente sin pruebas, y por eso nadie
  lo vio. **Hay que volver a subir la planilla** para que entren los números.
- **Las alertas de segregación no bloquean** (`src/lib/segregacion.ts`). Si alguna
  impide cargar, está mal implementada.

### ✅ Aprobador por proyecto (migración 039, 2026-10-07)

PENTA trabaja por obras (150 activas, +50 al año) y quién aprueba depende de la obra, no
de la persona. Spec `docs/superpowers/specs/2026-10-07-aprobador-por-proyecto-design.md`,
plan `docs/superpowers/plans/2026-10-07-aprobador-por-proyecto.md` (su «Registro de
avance» dice si ya se desplegó).

**Quién aprueba** — una sola función, `resolverCadena()` de `src/lib/cadena-proyecto.ts`,
que usan el envío y la previa («esto va a…»), así lo que se ve es lo que pasa:

| | Sale de |
|---|---|
| **N1** | el jefe del proyecto elegido → si no es de obra, el jefe propio de la ficha (`approver_l1_id`, ahora una **excepción**) → si no tiene, `organizations.aprobador_defecto_id` |
| **N2** | el N2 de la ficha → si no, el de la organización |
| **Monto del N2** | **sin monto, firma siempre**; con monto, desde ese total (`>=`). El de la ficha vale para los dos N2; el de la organización, solo para el suyo |

- **La cadena se congela en el documento al enviar** (`cadena_l1_id/l2_id/fijada_at`), sobre
  el total solicitado; la liquidación de un fondo congela **la suya**, sobre lo gastado.
  `cargarCadena()` lee la del documento y cae a la ficha solo si no hay. **El suplente se
  sigue leyendo en vivo**: es una ausencia, no parte de la ruta
- La cadena se resuelve **antes** de `puedeEnviar()`: si se validara con la ficha, los 50
  sin jefe propio seguirían sin poder enviar aunque eligieran una obra
- **El catálogo se arma con el uso**: nadie carga los 150. El número manda
  (`normalizarNumeroProyecto`: sin ceros a la izquierda, en mayúsculas); el empleado elige
  jefe de la lista de `es_jefe_proyecto`, y el sistema sugiere el último usado
- **Caja chica**: cualquier empleado con `can_submit` pide **su** fondo; a nombre de otro
  sigue exigiendo `can_manage_petty_cash`. El jefe directo del beneficiario, si no es el
  que aprueba, **se entera, no autoriza** (`jefeQueSeEntera`)
- Admin: «Jefe de proyecto» en la ficha (da «aprueba»; quitar «aprueba» lo saca de la
  lista — `coherenciaJefeProyecto`), aprobadores por defecto en Configuración → Aprobación,
  monto en Límites, y `/admin/proyectos` para corregir el catálogo
- **El rol `approver` casi no se usa, y conviene saberlo antes de leer código que lo mira.**
  Quien aprueba se define por `can_approve` + estar en la cadena, así que en PENTA los 11
  que aprueban son `employee`: el rol solo fija los permisos por defecto al crear a alguien
  (`approver` → aprueba y no rinde) y qué sale en el menú. Decidir una pantalla por el rol
  es un error — ver la fila «Decidir qué sale en el menú por el ROL» en errores conocidos

**Configuración real (2026-10-07):** aprobadora por defecto **Claudia Lobos** (Gestión de
Personas), con «aprueba»; lo de ella lo aprueba Francisco Hagar. 50 de los 57 no tienen
jefe propio y van a ella con lo que no sea de obra. **Jefes de proyecto: los 6 que cargó
Daniel el 2026-10-08** — Seaton Edwin, Riquelme Juan Francisco, Mancini Leonardo, Cancino
Pablo, Díaz Eduardo y Pizarro Erick. Ninguno tiene jefe propio, así que lo que rinden fuera
de una obra va a Claudia; Daniel puede querer cambiarlo. Antes decía «ninguno todavía»,
los configura Daniel. Hecho por SQL con su fila en `audit_log`.

### ✅ Filtro del empleado (2026-10-08)

Spec `docs/superpowers/specs/2026-10-07-filtro-del-empleado-design.md`; diseños en
https://claude.ai/artifact/LXLQ3CbUgYbaSPYk8jRMkZ (Daniel eligió la A, barra de chips).
Plan `docs/superpowers/plans/2026-10-07-filtro-del-empleado.md` — su «Registro de avance»
dice si ya se desplegó (al cerrar el 2026-10-08 estaba en `main`, sin subir).

- **Un solo filtro** —Proyecto · Tipo de gasto · Fecha · Estado, y Empleado para quien
  administra fondos— en «Mis rendiciones» (`/reimbursements`) y en «Caja chica».
  Reemplazó a `FundFilters` (filtros de lista + «Búsqueda de ítems», 420 líneas, borrado).
  Componente `src/components/filtros/BarraFiltros.tsx`; las reglas, en
  `src/lib/filtro-documentos.ts`
- **La fecha es la del gasto**, no la del documento, y tipo de gasto + fecha los tiene que
  cumplir el **mismo** gasto: combustible de agosto y comida de septiembre no entra en
  «combustible de septiembre». Un documento sin gastos se juzga por su fecha de creación
- **Un gasto rechazado no suma nunca**, ni en pantalla ni en la exportación
- Estados = las 4 familias de siempre (`FAMILIA_REPORTE` / `FAMILIA_FONDO`). En
  rendiciones el grupo de atención se llama **«Con rechazos»** (incluye las aprobadas en
  parte); en fondos, «Rechazados»
- El filtro va en la dirección (`?tipo=…&fecha=este-anio`) y se escribe con
  `window.history.replaceState`, que se integra con el router sin volver a pedir la página.
  `depurarFiltro` ignora un proyecto o una categoría que ya no existen
- **El filtro corre en el navegador**, sobre lo que se cargó al entrar: cada chip responde
  al instante. `getMisRendicionesFiltrables` y `listPettyCashFunds` traen el resumen de
  gastos de cada documento (categoría, fecha, monto, si está rechazado)
- En caja chica **el empleado ve solo los fondos donde es beneficiario**; los de su cadena
  están en «Aprobaciones». La RLS no cambió: el filtro es de la pantalla
- **Exportar caja chica = lo filtrado**, sin «Buscar». Incluye la carga histórica cuando
  los chips no la excluyen (no tiene proyecto y cuenta como liquidada), sin rechazados ni
  adelantos/devoluciones. El conteo va en el aviso del final, no en el botón: la parte
  histórica la resuelve el servidor
- «Rendiciones» está en la barra de abajo del empleado que rinde (`src/lib/navegacion.ts`);
  «Mis gastos» pasó a «Más». El rótulo de las cinco pestañas bajó a 12 px con
  `tracking-tight` para que «Rendiciones» entre a 360 px de ancho
- «Mis gastos»: total aprobado, pendiente de aprobación y promedio mensual, de
  rendiciones **y** caja chica, solo gastos. Sale «Categoría principal» (el gráfico ya lo
  dice) y sale la tarjeta «Total reembolsado» de `/reimbursements`

### ✅ Centros de costo — el catálogo, administrable (2026-10-08)

`/admin/centros-costo`. Hasta hoy **no había pantalla**: los 46 de PENTA venían sembrados
por la migración 012 y agregar uno exigía SQL a mano, lo que Daniel descubrió subiendo la
planilla con un centro nuevo. La RLS ya lo permitía desde la 016
(`admin_manage_cost_centers`, for all): no hizo falta migración.

**El código ES el centro de negocios de Defontana.** Viaja tal cual al comprobante con tres
ceros al final (`toSheetCostCenter`), así que no es un nombre interno: tiene que coincidir
letra por letra o la importación falla.

**Y se lee de tres en tres letras**, un tramo por nivel. Los 46 lo cumplen sin excepción:

```
EMP              EMPRESA                  agrupa
└ EMPGES         AREAS DE GESTION         agrupa
  └ EMPGESING    INGENIERIA               agrupa
    └ EMPGESINGELE  ELECTRICIDAD          imputable · 18 personas
```

- **El alta pide el padre y las tres letras nuevas, nunca el código completo**: así sale
  bien armado y colgado de donde corresponde. Un código escrito entero a mano es la forma
  de inventar una rama que Defontana no tiene. La pantalla muestra, antes de crear, el
  código que va a quedar y cómo sale en el comprobante (`EMPGESINGMEC` → `EMPGESINGMEC000`)
- **El código no se puede cambiar**: es la clave primaria, y la nombran `users.cost_center_id`
  y `expense_items.cost_center_id` (las dos únicas llaves foráneas). Uno mal escrito se
  arregla creando el correcto y borrando el otro
- **Borrar de verdad solo si NADA lo nombra** (`sePuedeBorrar`: 0 personas, 0 gastos, 0
  hijos) — es para arreglar un código recién escrito mal. Para retirar uno en uso está
  `activo`, que lo saca de los desplegables sin tocar lo ya imputado. Lo cuenta el servidor,
  no la pantalla: el botón se esconde, pero la acción se puede llamar igual
- **`imputable` no se deduce del nivel**: dice si recibe asientos. Los que agrupan no reciben,
  y una hoja puede estar a cualquier altura (`EMPPRU`, CENTRO PRUEBA, es imputable en el
  nivel 2). Solo los imputables se pueden elegir en una ficha o en un gasto
- **El árbol se arma con TODOS y recién después se filtra**: ordenando lo filtrado, el nivel
  de cada fila y la marca «sin padre» saldrían de una lista incompleta y mentirían
- `toSheetCostCenter` **se mudó** de `lib/export/defontana` a `lib/centros-costo` y se
  re-exporta desde el export: la pantalla lo necesita y `defontana.ts` importa xlsx, que no
  puede entrar al bundle del navegador

### ✅ Filtros del admin (2026-10-09)

Spec `docs/superpowers/specs/2026-10-08-filtros-del-admin-design.md`; diseños en
https://claude.ai/artifact/BzqGbLQfrNKmo5wMcaruLC (Daniel eligió **B + C**). Plan
`docs/superpowers/plans/2026-10-08-filtros-del-admin.md` — su «Registro de avance»
dice qué tarea se hizo y qué se encontró en cada una.

**La misma barra en las seis pantallas que filtran.** `BarraFiltros` dejó de saber
de rendiciones: recibe `Dimension[]` + `Valores` (`src/lib/filtros/dimensiones.ts`).
Lo que PASA el filtro vive en un módulo por pantalla, con pruebas. Si en
`dimensiones.ts` aparece la palabra «rendición», «fondo» o «gasto», está mal puesto.

- **«Más filtros» aparece solo si hay dimensiones no destacadas**, y lleva el número
  de las puestas — sin ese número escondería un filtro de verdad. Con las cuatro o
  cinco del empleado NO existe, y hay una prueba que lo exige: si se pone roja, sus
  pantallas ganaron un botón que nadie pidió
- **El filtro del empleado no se reescribió.** Un adaptador `Filtro ↔ Valores`
  (`adaptador-documentos.ts`) deja `filtro-documentos.ts` intacto, con sus reglas
  ganadas a pulso. La barra **conserva el resumen por props**: la línea del empleado
  no nombra lo puesto, dice cuánto queda y cuánta plata
- **El chip de fecha dice de QUÉ fecha habla**, nunca «Fecha» a secas: «Fecha de
  envío» en Rendiciones (una rendición enviada el 2 de septiembre trae gastos de
  agosto) y «Fecha del gasto» en Informes y en el empleado. Y un borrador sin enviar
  queda FUERA de cualquier rango: antes pasaba cualquiera
- **El chip de Proyecto se esconde con el catálogo vacío** (hoy lo está): su única
  opción sería «Sin proyecto», que ocupa lugar y no filtra nada. Aparece solo cuando
  alguien rinda a una obra

**Informes responde al instante y el botón «Generar informe» ya no existe.** El
servidor recibe un período y nada más; las doce dimensiones corren en el navegador
(`filtro-items.ts`). De los once filtros que `getUnifiedReportItems` resolvía en la
base, diez solo DESCARTABAN de lo traído: obligaban a un viaje por clic sin ahorrar
una fila. **Medido el 2026-10-09: 387 KB para 478 ítems** (~0,81 KB por ítem), así
que la proyección a 6.000 ítems al año es **~4,9 MB** — tres veces lo que la spec
estimó. Antes de ese volumen hay que achicar el ítem (`employee_name`,
`department`, `parent_title` y `category_name` se repiten en cada fila) o dejar el
alcance por omisión más corto que un año.

**Auditoría es la excepción y sigue filtrando en el servidor**: la bitácora crece
sin techo y se pagina de a 50, así que traerla entera sería traer justo lo que nadie
va a mirar. `getAuditLog` recibe **listas** en entidad y acción (`.in`, no `.eq`):
una vista como «Borrados» pide dos acciones a la vez.

**Vistas guardadas (migración 040).** Son de la ORGANIZACIÓN, no de cada persona
(decisión de Daniel): la lee cualquier miembro, la escribe solo su admin. Van como
pestañas **sobre el degradado** —son navegación, no datos—. Reglas que no se cambian
sin volver a hablarlas:

- **Guardar ENCIMA de una vista nunca es lo que pasa por omisión.** Tocar un chip no
  la modifica: aparece «Guardar como vista» o «Descartar». Una vista de la empresa
  no cambia porque alguien estaba revisando
- **Se depuran una sola vez** contra las dimensiones de hoy, antes de compararlas,
  contarlas o aplicarlas. Depurarlas solo al elegirlas dejaría la pestaña sin volver
  a marcarse nunca
- **Borrar alcanza también a las de fábrica**: la marca `de_fabrica` sirve para
  distinguirlas en la auditoría, no para protegerlas
- **No hay ninguna sembrada todavía.** La migración no siembra: dos de las ocho que
  la spec listaba no son valores de filtro sino PREDICADOS. «Sin datos bancarios» ya
  tiene su dimensión de respuestas cocinadas; **«Más de 5 días» todavía no**, y la
  necesita: ningún preset de fecha dice eso y una fecha fija queda vencida mañana

### ✅ Datos bancarios en la nómina (2026-10-09)

Pedido de Daniel: «si voy a Empleados, no puedo ver los datos bancarios de nadie…
si coloco editar datos, estaría bueno que se me expanda toda la información del
empleado». Tenía razón por partida doble: la fila no los mostraba y
**`updateEmployee` ni siquiera aceptaba `bank_name` ni `bank_account_type`** —
solo el número—, así que el banco únicamente entraba por la planilla o por el
perfil del propio empleado.

- La fila los LEE: «BCI · Cuenta Corriente · 00012345», «sin datos bancarios», o
  «falta el n.° de cuenta» en ámbar cuando hay banco y no cuenta
- «Editar datos» abre los seis campos juntos. En el mismo cajón y no en uno
  aparte: editar es una sola intención

**La misma columna tenía dos vocabularios**, y es el hallazgo que importa. Medido
sobre las 58 personas con banco cargado:

| | La planilla escribió | La lista decía |
|---|---|---|
| tipo de cuenta | `Corriente` / `Vista` | `corriente` / `vista` — **cero coincidencias** |
| banco | `Falabella`, `Itau`, `Mercadopago Emisora S.A.` | `Banco Falabella`, `Itaú`, `Mercado Pago` |

**Un `<select>` cuyo `value` no figura entre sus opciones se dibuja en blanco, y
el siguiente «Guardar» escribe ese blanco.** No es hipotético: la captura de
`perfil` cambió al arreglarlo porque el «Tipo de cuenta» de Daniel aparecía vacío
teniendo «Corriente» guardado — su propia pantalla le habría borrado el dato.

`src/lib/bancos.ts` cierra las dos puntas, con 29 pruebas sobre los valores REALES
de la base:

- `normalizarBanco` / `normalizarTipoCuenta` en **toda escritura** (panel del
  admin, perfil del empleado, planilla) y también **al leer**, para que el
  desplegable no salga vacío
- `opcionesDeBanco` mete el valor guardado como opción aunque no esté en la lista.
  **Esa es la red de verdad**, más que el normalizador: mientras el valor actual
  sea una opción, abrir el panel y guardar no puede borrar nada
- Un banco que no reconoce **se conserva tal cual**. Un tipo de cuenta que no
  reconoce sí se descarta: son tres y un cuarto valor no le sirve a nadie

La lista estaba suelta dentro de `profile/page.tsx` y nadie más la veía: de ahí
salió el vocabulario paralelo.

**Los datos viejos se normalizaron solos y NO hace falta migrarlos** (medido el
2026-10-09, después de que Daniel volviera a subir la planilla en producción): la
carga reescribe cada ficha y pasa por el normalizador, así que de 61 personas las
59 reales quedaron con banco, tipo Y número de cuenta —antes era **1**—, los bancos
en su nombre canónico y el tipo en minúscula (`corriente` 52 · `vista` 7). Las dos
sin datos son «1 Daniel Prueba» y «Daniel Martinez Prueba», cuentas de prueba que
Daniel confirmó que está bien que queden así. **No escribir un UPDATE masivo para
esto**: ya está hecho.

### ✅ Movimientos en cargas históricas (2026-10-19)

Pedido de Daniel: «cargué una rendición histórica y no veo cómo cargar el reembolso para
que luego me genere el comprobante». Tenía razón por partida doble: no había dónde, y la
palabra no estaba en ninguna pantalla.

**El reembolso al empleado NO es un tipo de movimiento nuevo: es un `advance`.**
Contablemente es el mismo asiento —Debe Fondos por Rendir / Haber Banco, línea de banco
`CARGO`— porque en los dos casos sale plata del banco y se debita la cuenta de la persona.
Lo único que cambia es el orden en el tiempo: en caja chica primero se entrega y después se
gasta; en una rendición se gasta primero y se paga después. Un `item_type` propio exigiría
migración (el CHECK admite cuatro valores), un tipo de comprobante nuevo en `organizations`
y tocar `buildBankVoucher`, que solo conoce dos direcciones. **Decisión de Daniel: solo la
etiqueta.** Las opciones del selector son cuatro y dos escriben `advance`
(`MOVIMIENTOS` en `src/lib/movimientos-historicos.ts`).

- **`commitHistoricalImport` era la única función que insertaba ítems**, y corre una sola
  vez. Ahora `agregarMovimientoHistorico` suma el movimiento que faltó, y
  `eliminarMovimientoHistorico` lo saca. `/admin/carga-historica` **no listaba ni un ítem**
  (su select es de cabeceras): los muestra `MovimientosHistoricos`, tras el botón `ListPlus`
  de cada fila, con `getMovimientosHistoricos`
- **Estado «legacy»: 27 de las 145 cargas** (las de agosto, `DEF-2026-08-26`) tienen la
  marca de Defontana en la cabecera y no en los ítems, y el panel por tipo trata eso como
  «todo exportado» (`legacyHeaderOnly` → `pending = []`). Sin sembrar, un movimiento
  agregado ahí nacería pendiente pero el panel lo contaría como contabilizado y **nunca
  ofrecería su comprobante**. `agregarMovimientoHistorico` baja la marca a los ítems
  existentes antes de insertar — mismo patrón que `revertHistoricalFundDefontana`
- **Un movimiento contabilizado no se borra**: primero hay que revertir el comprobante
  (`motivoNoSeBorra`, que mira la marca propia **y** el estado legacy). En caja chica el
  borrado sigue siendo `deleteExpenseItem` y **conserva** su comportamiento de siempre: ahí
  sí se puede borrar un ítem contabilizado, y Daniel lo usa
- `FormularioMovimiento` se comparte con `/petty-cash`. Ahí `categorias` va vacío porque esa
  pantalla no carga el catálogo, y entonces **no se ofrece «Gasto»**: sin categoría no hay
  cómo imputarlo (`movimientosDisponibles`). La tabla de caja chica NO se fusionó: depende
  del estado optimista de `usePettyCashState` y la otra pantalla recarga del servidor
- Lo que viaja a Defontana no cambió: el movimiento nuevo entra por el panel por tipo como
  cualquier adelanto o devolución

**Dos bugs del total, encontrados midiendo y arreglados acá** (`totalesDeCargaHistorica`):

| | Causa | Daño medido |
|---|---|---|
| `updateHistoricalExpenseItem` | editaba el monto y **no recalculaba** la cabecera | «RENDICION CAJA CHICA N°18 FD» −$278.710 · «N°1 ESTEBAN VARAS» +$221.700 |
| `deleteExpenseItem` | recalculaba con `calculateReportTotal`, que **suma todo** | «Caja Chica N°180» +$8.640, el mismo día |

`approved_amount` se recalcula aparte de `total_amount`: hay cargas con ítems `pending`, y
sumarlos al aprobado inflaría el monto que el cuadre compara contra lo reembolsado. Va con
la llave de servicio porque la 033 protege `approved_amount` (con la sesión,
`proteger_estado_rendicion` rechaza el UPDATE; `auth.uid()` null lo deja pasar).

**EL TRASPASO CUENTA, Y SOLO DEL LADO QUE PAGA** (Daniel, 2026-10-20). La primera versión
de `totalDeGastos` lo excluía de los dos lados, y el próximo recálculo sobre una carga que
hubiera pagado uno le bajaba el total ese monto, en silencio.

Un traspaso deja un ítem en los documentos de **las dos** partes, con el mismo monto
positivo: para quien lo paga es plata que salió de su caja, igual que un gasto; para quien
lo recibe es financiamiento, igual que un adelanto. Sumarlo en los dos lados cuenta la
misma plata dos veces; sumarlo del lado que recibe le da un «total gastado» a una caja que
todavía no gastó nada.

Los 8 traspasos de producción lo confirman sin excepción: en los 4 que PAGAN el total
guardado ya los incluía (Caja Chica N°180: 330.864 + 8.640 = 339.504) y en los 4 que
RECIBEN no (CAJA CHICA N°1 ESTEBAN VARAS recibe 21.592 de Katherine, que junto con el
adelanto de 150.000 financia sus 171.592 de gastos; «Rendicion N°3 Leonel Caceres» recibe
52.703 y gastó 52.703 — su total es 52.703, no 105.406).

**La dirección NO es una columna**: se resuelve contra `fund_transfers.payer_report_id`,
igual que `is_transfer_payer` en el export a Defontana, y entra como dato del ítem para
que `totalDeGastos` siga sin tocar la base. **Sin ese dato un traspaso no suma**, que es el
valor seguro: un callsite que se olvide de resolverlo deja el total como estaba en vez de
inflarlo por los dos lados. Hay una prueba para eso.

**Y a un traspaso no lo aprueba nadie**, así que el pagado cuenta también en el aprobado,
mire lo que mire su `status`. `createFundTransfer` ni siquiera lo escribe: los 8 de
producción están en el `pending` por omisión de la columna. Un gasto pendiente sí sigue
fuera del aprobado — la distinción tiene su prueba al lado.

**Corregido en producción el 2026-10-20, con autorización de Daniel y ensayo previo**
(BEGIN/ROLLBACK; el ensayo se verificó releyendo las filas, que seguían intactas): las 3
cargas a las que les faltaba el traspaso que pagan — N°175 192.680 → 220.820, N°177
407.887 → 429.479, CAJA CHICA N°2 CAMILA NAVARRO 0 → 52.703 en los dos montos. Cada
diferencia es exactamente su traspaso. Quedó su fila en `audit_log`. **De 147 cargas,
cuadran 145.**

**Las 2 que faltan esperan a Daniel** porque su valor guardado no sale de ningún ítem:

| Carga | Hoy | Lo que dicen sus ítems |
|---|---:|---:|
| RENDICION CAJA CHICA N°18 FD | 12.470 | 291.180 |
| RENDICION CAJA CHICA N°1 ESTEBAN VARAS | 393.292 | 171.592 |

**«Rendicion N°6 Claudia Lobos» también se corrigió** (2026-10-20, autorizado por Daniel).
No era un error de cálculo sino otro significado: `approved_amount` guardaba **4.000**, que
es lo que quedaba PENDIENTE de reembolsarle — rindió 38.080 y se le pagaron 34.080. Pasó a
aprobado 38.080 + `reimbursed_amount` 34.080: los mismos 4.000 pendientes, pero ahora
**derivables y a salvo**. Con el valor viejo, cualquier edición en esa rendición disparaba
el recálculo y pisaba el 4.000 con 38.080.

**Es el primer reembolso PARCIAL de la base**: las otras 6 cargas con `reimbursed_amount`
están pagadas al 100 % y en estado `reimbursed`.

> **Esta limitación ya NO existe** (resuelta ese mismo día — ver «Saldo pendiente en la
> carátula»). Decía que el aviso solo salía con estado `reimbursed`, y que para verlo
> habría que marcar la rendición como reembolsada inventando una `reimbursed_at` que
> nadie sabe. El distintivo nuevo aparece con cualquier estado de `ESTADOS_APROBADOS`,
> así que **N°6 muestra «Falta reembolsar $4.000» estando en `approved`**, que es lo
> cierto: aprobada y pagada en parte. No hay que inventar ninguna fecha.

### ✅ Saldo pendiente en la carátula (2026-10-20)

Pedido de Daniel: «me cuesta saber cuáles tienen algo pendiente por devolver o que le
reembolse la empresa, mirando las carátulas de cada rendición». Reglas en
`src/lib/saldo-rendicion.ts`, dibujo en `components/ui/InsigniaSaldo.tsx`, 16 pruebas.

**Reemplaza al distintivo de CUADRE** (`reimbursed_amount` contra `approved_amount`,
«Cuadrado» / «Exceso de reembolso» / «— Sin registro»), que estaba **copiado** en
`/admin/reports` y `/admin/carga-historica` y no servía por tres motivos medidos:

- **Solo aparecía con `status = 'reimbursed'`**, así que las 115 rendiciones con saldo
  sin esa marca —las que hay que revisar— no mostraban nada
- **`reimbursed_amount` casi nunca está cargado**: 23 de las 37 marcadas como
  reembolsadas no tienen monto. Es opcional en `markAsReimbursed`, así que es la norma
- **`approved_amount` no significa lo mismo en todas las filas**: en **149 de 155** es la
  suma de los gastos aprobados y en **1** es el neto (la que alguien revirtió, porque
  `revertReimbursement` lo recalcula con `computeApprovedAmount`)

**El hallazgo que gobierna el módulo: la misma plata está registrada por dos vías.** El
reembolso al empleado figura como ítem `advance` (las cargas históricas: era la única
forma hasta `agregarMovimientoHistorico`), como `reimbursed_amount` en la cabecera, o
**las dos a la vez**, y nada en el esquema dice cuál se usó. Por eso lo recibido es
`max(vía de los ítems, vía de la cabecera)` y **nunca la suma**. Medido sobre las 155
rendiciones: con `max()` quedan 59 en cero, sumando 27, y en las 13 donde ambas vías
traen dato `max()` mejora en las 13. Los cuatro casos que lo prueban están fijados con
sus montos reales:

| Rendición | Gastos | Adelantos | `reimbursed_amount` | Pendiente |
|---|---|---|---|---|
| N°8 Claudia  | 173.701 | 0      | 173.701 | 0 — pagada **solo** por carátula |
| N°2 A. Peña  |  17.240 | 0      | null    | +17.240 — aprobada sin pagar |
| N°6 Claudia  |  38.080 | 34.080 |  34.080 | +4.000 — las dos vías, el mismo pago |
| N°7 Claudia  |  85.571 | 87.571 |  85.571 | −2.000 — recibió de más |

- **La devolución reduce lo que el empleado tiene en mano**, al revés del adelanto. No es
  una preferencia: de las 24 filas con devoluciones, restándola quedan 21 en cero y
  sumándola, 0. ⚠️ **`computeApprovedAmount` la resta igual que un adelanto** — con
  adelanto 100.000, gastos 60.000 y devolución 40.000 (saldado) devuelve −80.000. **No se
  corrigió**: gobierna el monto a pagar del flujo vivo y merece su propia revisión; hoy no
  se ejercita porque las 155 rendiciones son históricas
- El traspaso cuenta de un solo lado, con la regla de `totalDeGastos`: suma al que paga,
  financia al que recibe
- Aparece con el documento ya decidido (`ESTADOS_APROBADOS`), no solo al marcarlo pagado
- En el detalle, «Por reembolsar» y «Reembolsado» pasaron a **«Pendiente» y «Recibido»**:
  la primera leía `approved_amount` (marcaba $173.701 por pagar en una rendición saldada)
  y la segunda solo `reimbursed_amount` (un pago anotado como movimiento se veía «—»).
  Ahora las tres tarjetas cierran: gastos aprobados − recibido = pendiente
- **`/admin/reports` no muestra cajas chicas** (filtra `historical_type != caja_chica`),
  así que ahí se ven solo las 38 rendiciones: 34 saldadas y 4 con saldo. **Las 117 cajas
  chicas históricas tienen saldo en 114** —mediana ~200.000— porque su movimiento de
  cierre nunca se cargó; se ven en `/petty-cash`, que **no lleva el distintivo todavía**.
  Ponerlo ahí es decisión de Daniel: mostraría 114 avisos a la vez

**El signo de la devolución en `computeApprovedAmount`, corregido el 2026-10-20.** Esa
función restaba los `return` igual que los adelantos. El comentario que lo justificaba
decía que una devolución «reduce lo que la empresa debe reembolsar»: reduce lo que debe
**la persona**, que en el signo de esa función es lo contrario. Con adelanto 100.000,
gastos 60.000 y devolución 40.000 —un caso saldado— devolvía −80.000.

No era cosmético: `estadoTrasDecisionReporte` manda a `pending_bank_load` **solo si el
monto es mayor que cero**, así que un monto hundido de más deja la rendición en
`approved` y nadie paga. Medido sobre las 155 rendiciones: 24 tienen devoluciones y las
24 cambian de monto; **9 cruzan el cero y las 9 pasan a estar por pagar**, por $2.895.638.
No se ejercitaba porque las 155 son cargas históricas —su monto lo calcula
`totalesDeCargaHistorica`— pero las alcanza por `revertReimbursement`, que recalcula
`approved_amount` con ella. **No se tocó ningún dato: el cambio es de comportamiento.**

**Caja chica NO lleva este distintivo, y es a propósito** (se intentó el 2026-10-20 y se
revirtió). `/petty-cash` ya muestra «Cuadra», «Pendiente de rendir» y «Reembolsar al
empleado», y los calcula **por FONDO, no por documento**: un fondo tiene su adelanto en
un documento y sus gastos en otro, así que el documento suelto casi nunca cuadra. Medido
sobre las 117 cargas históricas de caja chica: **por documento cuadran 15 de 117;
agrupadas por fondo, 47 de 53**. Un distintivo por documento habría puesto 102 avisos de
un problema que no existe — y la cifra de «114 cajas con saldo» que una sesión informó
antes de medir por fondo era ese mismo artefacto.

Su fórmula (`adelantos + recibidos − gastos − devoluciones − pagados`) es exactamente
`−pendiente` de `saldoDeRendicion`, **con el mismo signo de devolución**: son la misma
regla escrita dos veces, lo que la valida por una vía independiente. Queda una diferencia
sin decidir: la de caja chica **no mira `status`** y suma todos los ítems, y hay 7 cargas
con ítems sin aprobar. Unificarlas movería los números de esas 7 en producción, así que
es decisión de Daniel, no de refactor.

**Fecha corregida en producción el 2026-10-20:** `CAJA CHICA N° 15 FD` (`90e379f8`) tenía
`submitted_at` y `approved_at` en **24-12-2026**, un año adelante, con su adelanto de
$200.000 fechado 24-12-2025 y el fondo liquidado el 03-03-2026. Era un dedazo del campo
«fecha de rendición» al importar, y **la única rendición con fecha futura**. Corregida con
su fila en `audit_log`; el ítem y su asiento de Defontana no se tocaron (el asiento usa la
fecha del ítem). **Hay cuatro documentos cuyo título contiene «15 FD»**, todos de Francisco
Díaz: conviene identificarlos por id y no por título.

### ✅ Caja chica en la bandeja, y el paso bancario correcto (2026-10-20)

Tres cosas que pidió Daniel, las tres de caja chica.

**1. Los fondos entran a `/approvals`.** La bandeja mostraba solo rendiciones, así que un
fondo pendiente no tenía dónde aparecer: había que entrar a «Caja chica» y saber cuál
mirar. `getPendingFundApprovals()` usa las MISMAS reglas que las rendiciones —`puedeActuar`
sobre la cadena congelada— porque la bandeja no decide permisos, los muestra.

- Un fondo da **dos vueltas** y son documentos distintos: el fondo (lo que se pide) y su
  liquidación (lo que se gastó), cada uno con su cadena congelada (`cadena_*` /
  `liq_cadena_*`). `tipoDeFondo` resuelve cuál leer, igual que `contextoFondo`
- **Los pasos bancarios quedan fuera**: tienen su pantalla en `/banco`. Los estados salen
  de `estadosQueEsperanDecision()`, **derivada del mismo mapa** que `pasoSegunEstado` en
  vez de una lista a mano, con una prueba que exige que todos mapeen a `decidir_l1/l2`
- Tres consultas, no una por fondo: `contextoFondo` sirve para actuar sobre uno, pero en
  una lista haría N+1
- La fila dice qué es (Rendición · Caja chica · Liquidación) y a dónde lleva: la rendición
  a `/approvals/[id]`, el fondo a `/petty-cash/[id]`, que es donde están sus botones

**2. La entrega al empleado no cuenta hasta que el banco la autoriza** (`transferenciaFirme`).
`confirmBankLoad` —el paso de CARGA— inserta la transferencia `disbursement`, y hasta hoy
eso tenía dos efectos equivocados, porque ahí la plata **todavía no salió**:

- la pantalla la rotulaba «Fondos enviados al empleado» (ahora: «Carga registrada ·
  esperando autorización del banco», en ámbar);
- **el panel de Defontana la ofrecía para contabilizar**, así que se podía emitir un
  asiento Debe Fondos por Rendir / Haber Banco por plata que seguía en la cuenta de la
  empresa. Ese era el daño real

Que la fila se cree en la carga **es correcto** y no se cambió: el dato lo conoce quien
carga, y volver a pedirlo al autorizar sería peor. Lo que estaba mal era tratarla como un
hecho consumado. La regla **no toca `authorizeBank`** ni la condición «sin carga registrada
nadie autoriza», que mira el historial (`bank_load_confirmed`), no la transferencia.
Ningún dato en riesgo: al aplicarlo no había ningún fondo en `pending_bank_auth`.

**3. Foto y archivo al agregar un gasto de caja chica.** `AddFundItemForm` no tenía dónde
adjuntar nada, así que un gasto se registraba sin comprobante — y la boleta está en la mano
justo en ese momento. Ahora lleva el mismo `PhotoUpload` que una rendición: el OCR rellena
monto, fecha, comercio y documento, y la foto se adjunta al gasto creado. Como en `/quick`,
**se adjunta DESPUÉS de crear** (recién ahí hay id) y si la subida falla el gasto igual
queda, con un aviso: perder el gasto por no poder subir la foto sería peor.
`ItemAttachmentZone` ya permitía adjuntar a un gasto existente; lo que faltaba era al crear.

> **El panel «Contabilidad Defontana» ya estaba restringido a admin** y lo sigue estando
> (`currentUser.role === 'admin'` en `petty-cash/[id]`). Medido el 2026-10-20: de los 5 del
> piloto más Daniel, **solo Daniel es admin**, así que ningún empleado lo ve. Lo que sí
> cambió es que en `pending_bank_auth` ya no tiene nada que ofrecer, y muestra «Todavía no
> hay movimientos para contabilizar».

### ✅ Caja chica en «Estado», y el atajo para rendir (2026-10-20)

**El dashboard mostraba solo rendiciones.** Daniel lo notó desde el celular: alguien con
un fondo activo no veía ni su saldo ni en qué paso estaba sin entrar a «Caja chica».
`getMyActiveFunds()` trae los fondos **propios** en curso (sin `settled` ni `rejected`)
con su saldo, calculado con `calculateFundBalance` —el mismo del detalle, para que las
dos pantallas no puedan decir cifras distintas.

- Es una acción propia y **no `listPettyCashFunds`**: esa, para un admin o un gestor de
  caja chica, devuelve los de toda la organización, y en una vista personal eso es ruido.
  Acá siempre es `employee_id = yo`, el mismo criterio que Daniel fijó para `/petty-cash`
  el 2026-10-07 (lo que toca aprobar está en «Aprobaciones»)
- **La sección NO suma a los montos de arriba.** «Por cobrar», «En revisión» y
  «Borradores» siguen siendo solo de rendiciones: un fondo es plata que ya se recibió
  para gastar, y meterlo ahí contaría dos veces la misma plata
- Con los fondos en mano muestra **Disponible**; antes de eso, lo solicitado
- **Incluye también los fondos que uno ADMINISTRA como EFF** (Daniel lo pidió el
  2026-10-20, apenas lo vio). Los dos casos vienen **distinguidos** (`esMio`) y los
  propios van primero: el saldo de un fondo ajeno es plata de otra persona, y sin el
  nombre del beneficiario se leería como «me quedan $200.000» algo que no es de uno.
  Son los dos vínculos directos —beneficiario o EFF—; lo que cada uno PUEDE ver lo sigue
  decidiendo la RLS de la 032

**Atajo «Rendir» en «Mis rendiciones»** (pedido de Daniel: «como una especie de atajo al
estar ahí»). Arriba a la derecha, al mismo `/expenses/new` que la pestaña de la barra de
abajo y **con el mismo permiso** (`can_submit`), para que no haya dos puertas con reglas
distintas. También en el estado vacío, donde además el texto dejó de mandar a la barra de
abajo: con el botón al lado, sería mandar al más lejano de los dos.

### ✅ Aviso de nombre repetido (2026-10-21)

Daniel: «hay personas que solicitan fondos siempre por la misma razón, entonces
seguramente se repetirán nombres». Al crear un fondo o una rendición, si la persona ya
tiene uno **sin cerrar** con ese nombre, aparece una línea gris debajo del campo:
«Ya tenés un fondo sin cerrar con este nombre, del 3 de octubre. *Podés seguir igual.*»

**Avisa, nunca bloquea, y eso no es cosmético.** Los nombres repetidos son legítimos y ya
son la norma: medido ese día, **16 nombres repetidos sobre 156 documentos**, y «CAJA CHICA
N°18 FD» aparece tres veces. Una restricción de unicidad rompería las cargas históricas
—que parten un mismo fondo en varios documentos— y los fondos mensuales que se llaman
igual todos los meses. **Nada interno depende del nombre**: todo va por `id` y la carga
histórica agrupa por `fund_number`. Lo que el aviso evita es que una PERSONA se equivoque
de documento al verlo en una lista (al vincular un traspaso, en la bandeja de aprobaciones,
entre dos archivos de Defontana que se llaman casi igual).

- **Solo avisa por documentos EN CURSO** (`enCurso` en `src/lib/nombre-repetido.ts`).
  Cerrado es `settled`/`rejected` en fondos y `reimbursed`/`rejected` en rendiciones. Si
  avisara por los cerrados, el fondo mensual lo dispararía siempre — y un aviso que salta
  siempre se aprende a ignorar
- **Es por BENEFICIARIO, no por organización**: que otro tenga un «Caja chica octubre» no
  es un duplicado mío. En caja chica el beneficiario puede no ser quien crea (un EFF pide
  a nombre de otro), así que el componente le pasa `form.employee_id || yoId`
- Compara con `normalizarNombre` (sin tildes, sin mayúsculas, espacios colapsados), el
  mismo de la nómina y las vistas de filtro. **Verificado contra datos reales**: buscando
  «Rendicion N°2 Daniel Martinez» la acción trajo 2 filas y acertó 1 contra el título
  guardado en MAYÚSCULAS, descartada después por estar reembolsada
- El filtro por nombre corre en TypeScript y no en SQL porque la comparación es
  normalizada, y eso en Postgres exige `unaccent` o un índice de expresión; traer los
  documentos de una persona es un puñado de filas

> **No se puede ver en el navegador**, y conviene saberlo antes de intentarlo: al
> 2026-10-21 **no queda ni un documento en curso en la base** —los fondos están todos en
> la papelera y las dos rendiciones de prueba, reembolsadas—, así que la pantalla nunca
> entra al camino del aviso. Por eso el render se prueba en `aviso-nombre-repetido.test.tsx`
> con la acción simulada.

### ✅ Eliminar un fondo propio, y los errores en español (2026-10-21)

Francisco Díaz no podía borrar un fondo de caja chica **que acababa de crear y seguía en
borrador**, y encima el error salía en inglés. Dos problemas con la misma captura.

**1. `deletePettyCashFund` exigía `role === 'admin'` y nada más.** En rendiciones el
rendidor borra sus borradores desde la migración 025 (`deleteExpenseReport`); en caja
chica esa puerta nunca se abrió, así que había que pedírselo al admin.

La regla vive en `motivoNoSeEliminaFondo` (`petty-cash-helpers.ts`) y **la usan la acción
y la pantalla**: si el botón se dibujara con una regla y el servidor decidiera con otra,
la app ofrecería algo que después niega.

- El **beneficiario o el EFF** que lo creó, mientras sea `draft`. Los dos, porque en caja
  chica no son siempre la misma persona
- **Enviado, ya no**: hay gente esperándolo y un historial firmado detrás; para deshacerlo
  está el rechazo. El admin sí, en cualquier estado: es quien limpia lo que quedó mal
- **El botón se separó de `isManager`.** Estaba junto al de traspaso bajo esa condición,
  así que un empleado **sin** `can_manage_petty_cash` no veía cómo borrar un borrador
  suyo. El traspaso sigue siendo de quien administra; eliminar, de quien puede eliminar
  ESE fondo

**2. El error en inglés NO era de esta pantalla: es de toda la app.**

> «An error occurred in the Server Components render. The specific message is omitted in
> production builds to avoid leaking sensitive details…»

**Lo pone Next**: en producción reemplaza el mensaje de cualquier `throw` del servidor
antes de que llegue al navegador. En desarrollo se ve el mensaje real, **así que el
problema no aparece hasta que está desplegado** — y son **90 sitios en 35 archivos** los
que muestran `err.message` al usuario.

Por eso la red va en **`avisar()`**, el embudo por el que pasan todos los avisos, y no en
cada `catch`: `mensajeLegible()` (`src/lib/errores.ts`) detecta las firmas del párrafo de
Next y lo cambia por uno en español, con el `digest` entre paréntesis cuando viene — es lo
único que permite cruzarlo con el registro de Vercel. Las firmas van en inglés y nuestros
mensajes están todos en español, así que no hay falso positivo posible.

**La red tapa el síntoma; lo que arregla un caso es devolver el error como dato.**
`deletePettyCashFund` ahora devuelve `{ error }` en vez de lanzar: un valor de retorno no
lo redacta nadie, y la persona lee «Solo se pueden eliminar fondos en borrador. Este ya
fue enviado». Conviene hacer lo mismo en cualquier acción cuyo error el usuario tenga que
entender. Un fallo de la base sí se sigue lanzando: no es algo que la persona resuelva.

**Los rechazados NO se borran: se esconden de la lista** (decisión de Daniel, 2026-10-21:
«no quiero que se eliminen, que estén para mantener una trazabilidad de que fue rechazado
y el porqué»). `aplicarFiltro` los deja fuera cuando nadie pidió un estado, y la línea
`<RechazadosOcultos>` dice cuántos son y los trae — el mismo trato que la nómina le da a
los empleados bloqueados: se ocultan en la pantalla, **nunca en la consulta**.

- **Se esconde por `rechazado`, NO por familia.** En fondos `atencion` es solo `rejected`,
  pero en rendiciones incluye las **aprobadas en parte**, que están vivas y tienen plata
  por cobrar: esconderlas sería esconder trabajo pendiente. Por eso `DocumentoFiltrable`
  tiene su propio `rechazado: boolean` y hay una prueba que lo fija
- **El aviso cuenta solo lo que ese filtro habría mostrado**: con un proyecto o una
  persona elegidos, no ofrece los rechazados de otro
- Se aplica a `/petty-cash` y a `/reimbursements`. `/admin/reports` no se tocó: el admin
  supervisa todo y tiene su propio filtro

> **El rechazo se está usando como «corregí y volvé a mandar», y no hay cómo hacerlo.**
> Los tres motivos reales del 2026-10-21 lo muestran: «especificar epp», «Monto se fusionó
> con otra caja chica» y «Se amplió el presupuesto solicitado, por nueva visita a terreno».
> Ninguno es «esto está mal»: los tres piden una corrección. Como un fondo rechazado no
> vuelve atrás, Francisco creó uno nuevo cada vez — de ahí los **cuatro** fondos llamados
> «Caja chica especial» en un día.
>
> **`returned_to_draft` ya existe** como etiqueta en `constants.ts` («Devuelto a borrador»)
> y el historial sabe leerlo (`expenses.ts`), pero **ninguna acción lo escribe y no hay
> botón**. Falta ese camino, y el uso real lo está pidiendo.

### ✅ Gestión avanzada de empleados
- `importEmployees()` con `SUPABASE_SERVICE_ROLE_KEY`: crea auth user + `public.users` + rollback
- Cadena de aprobación L1/L2 por empleado: `approver_l1_id`, `approver_l2_id` en `users` — desde
  la 039 es el caso específico, no la regla (ver «Aprobador por proyecto»)
- **Aprobador suplente (R8)**: `approver_l1_backup_id`, backup_from/until — el suplente ve las rendiciones en el período configurado
- `ApproverConfig.tsx`: preview "Ana → Carlos → Aprobado"
- Admin puede establecer contraseña de empleado directamente desde el panel

### ✅ Módulo Caja Chica completo + flujo bancario (migraciones 004 + 011-bank)
- 4 tablas: `petty_cash_funds`, `petty_cash_items`, `petty_cash_approvals` (append-only), `petty_cash_transfers`
- Flujo (desde 2026-09-25, cadena N1 → N2 del beneficiario): `draft → pending_approval → [pending_approval_l2] → pending_bank_load → pending_bank_auth → funds_sent → pending_liquidation_approval → [pending_liquidation_l2] → settled`. Sin N2 se saltan los pasos entre corchetes; no existen «Enviar al banco» ni «Elevar liquidación». `approved` y `submitted` quedan solo por datos viejos
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
- Tabla `attachments`: una fila por archivo, con `item_id` (rendición) **o** `petty_cash_item_id`
  (caja chica), nunca los dos (`chk_attachments_one_parent`). **No existe ninguna columna
  `attachment_url`**, aunque este archivo lo dijo hasta el 2026-09-25
- Bucket `expense-attachments`, ruta `{org_id}/{item_id}/{timestamp}.{ext}`;
  `approval-attachments` para respaldos de aprobadores, ruta `{org_id}/{report_id | fund_id}/{timestamp}_{user_id}.{ext}`
- Un comprobante se sube o se borra solo si se puede cambiar su gasto: `puedeCambiarAdjuntos()`.
  Lo escribe solo el servidor (ver «Permisos por asignación» y la migración 035)
- **Dónde va cada cosa en la pantalla de rendición (2026-10-07, NO volver a subirlo).**
  «Adjuntos de respaldo» estaba **arriba de todo**, antes de los gastos, y en las pruebas
  con empleados pasó lo previsible: un bloque que pide archivos, primero en la pantalla y
  aceptando PDF e imágenes, se lee como el lugar donde van las boletas — y el OCR está en
  «Agregar ítem». La pantalla los mandaba al lugar equivocado. Ahora, en `expenses/[id]`:
  va **entre «+ Agregar ítem» y «Enviar a revisión»**, se llama **«Respaldos extras de la
  rendición»** y **solo aparece con al menos un gasto cargado** (quien entra a una
  rendición vacía no ve ninguna opción de adjuntar, así que no puede creer que sea el
  camino). En una rendición ya enviada va suelto al final: no hay botones, pero lo
  adjuntado es parte del expediente y quien rindió tiene que poder consultarlo — por eso
  es una constante usada en dos sitios y no JSX dentro del `isMyDraft`.
  `ApprovalAttachments` recibe `titulo` y `nota` del llamador: en `approvals/[id]` y en
  `petty-cash/[id]` el nombre de siempre es correcto y esas dos pantallas **ya tenían el
  bloque al final** (líneas 498/570 y 640/657) — el desorden era de una sola pantalla

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

### ✅ Análisis IA para aprobador (R14) — caché arreglado en la migración 024
- `generateApprovalAnalysis(reportId)` — Claude Sonnet 4.6: historial 6 meses + violaciones → `{ risk_level, headline, routine_item_ids[], attention_items[] }`
- Caché en `expense_reports.ai_analysis / ai_analysis_at`. Costo: ~$0.008/rendición

**El caché no acertaba NUNCA y cada vista pagaba de nuevo** (`f44aba3` + migración
`024`). Vale la pena entender por qué, porque el patrón se repite:

> La validez se decidía comparando `ai_analysis_at > updated_at`. Pero **guardar el
> análisis ES un UPDATE** sobre `expense_reports`, y esa tabla tiene el trigger
> `set_updated_at()` en cada UPDATE: la escritura del caché pisaba la misma marca
> contra la que después se comparaba. Medido: 0 de 4 rendiciones con caché válido.

La invalidación **se movió a la base, con un trigger sobre `expense_items`**. No fue
por elegancia: `expenses.ts` anulaba el análisis en 2 sitios, pero hay ~11 lugares que
modifican ítems (reclasificar desde admin, traspasos, carga histórica) y los otros
nueve dejaban el caché viejo. Un trigger cubre los caminos de hoy, los de mañana y el
SQL manual.

**El guard `and ai_analysis is not null` no es decorativo:** sin él, una carga histórica
de 300 ítems dispara 300 UPDATE sobre la misma rendición, cada uno arrastrando su propio
trigger de `updated_at`.

### ✅ Kilometraje (R1)
- `expense_items.mileage_km`, `mileage_rate`; `organizations.mileage_rate_per_km` (default $136/km SII)
- Subtipo "kilometraje" en `ExpenseItemForm`: monto calculado automáticamente (km × tarifa), boleta no requerida

### ✅ Recordatorios automáticos (R4) — rehechos y desplegados el 2026-09-28
**El cron anterior nunca funcionó**, aunque este archivo lo daba por hecho: el proxy lo
mandaba al login (307: `/api/cron` no era ruta pública y Vercel llama sin cookies);
faltaba `CRON_SECRET` en Vercel; escribía `title`, `body` y `link`, columnas que
`notifications` no tiene, con tipos `reminder_*` que el CHECK rechaza; no miraba el
error del upsert, y la regla de borradores filtraba `is_historical_import is null` en
una columna `NOT NULL`.

- `src/app/api/cron/reminders/route.ts`, **lunes a viernes 12:00 UTC** (`vercel.json`):
  9:00 de Chile en verano, 8:00 en invierno. Exige `CRON_SECRET` en Vercel
- Qué y a quién: funciones puras en `src/lib/recordatorios.ts`; envío en
  `enviarRecordatorios()` de `avisos.ts`. Tipo `reminder` (migración 036)
- La fila lleva solo tipo, documento y `dedup_key` (`filaDeRecordatorio`). El texto va
  en el correo (`correoDeRecordatorios`) y, en vivo, en `textoNotificacion`
- Un error al guardar corta el envío y el cron responde 500 con `fallas`: ya no informa
  éxito sin haber guardado nada. `?simular` muestra qué saldría hoy, sin guardar ni enviar

| Recordatorio | Cuándo | A quién |
|---|---|---|
| Te toca actuar | 3 días en el mismo paso, y cada 3 | `destinatarios()` de `permisos.ts`: los mismos del aviso original (D8, titulares del banco) |
| Borrador sin enviar | 7 días desde que se creó, y cada 7 | quien rinde |
| Saldo bajo (`funds_sent`) | saldo < 20 % según `calculateFundBalance` — una vez por fondo | solo el beneficiario. Daniel, 2026-09-25: el EFF se suma en `destinatariosSaldoBajo()` si en la práctica hace falta |

- **La espera se mide desde la última entrada del historial** (o `submitted_at`),
  nunca desde `updated_at`: guardar el análisis IA lo mueve
- **dedup_key** = `rec:{doc}:{paso}:{día que entró al paso}:{tanda}:{persona}`. Lleva la
  tanda, no la fecha: correr el cron dos veces no duplica, y si un día falla, al
  siguiente sale lo pendiente. Solo las filas nuevas generan correo, **uno por
  persona** con todo lo suyo
- Las filas de una persona entran juntas y cada una llega por Realtime: `avisar()` no
  apila un aviso igual a uno que ya está a la vista

### ✅ Informes Unificados (plan 2026-07-27)
- `/informes` — 4 fuentes de datos combinadas (rendición nueva/histórica + caja chica nueva/histórica)
- Filtros server-side: tipo fuente, período (año/semestre/personalizado), departamento, empleado multi-select, categoría chips, estado informe/ítem, reembolso, Defontana
- KPIs: Total ítems, Total CLP, Monto aprobado, breakdown por fuente
- `src/actions/reports.ts`: `getReportFilterOptions()` + `getUnifiedReportItems(filters)`
- `src/lib/report-helpers.ts`: `UnifiedReportItem`, `buildPeriodRange`, `computeUnifiedKpis`
- Export Excel (3 hojas: Detalle / Por Empleado / Por Categoría) + PDF landscape
- Sidebar: entrada "Informes" con ícono BarChart3, visible para admin + approver

### ⏸ Flujo rápido móvil (R20) — OCULTO para empleados desde el 2026-09-23
- `/quick` — 3 pasos: foto → OCR → confirmar monto/cat → seleccionar fondo → registrar
- **Solo registra en caja chica**: sin un fondo `funds_sent` dice «Sin fondos activos»
- **Decisión de Daniel (2026-09-23): invisible para empleados hasta que sirva también
  para rendiciones.** Solo admin lo ve: `roles: ['admin']` en `MobileNav.tsx` y
  `Sidebar.tsx`, y `(app)/quick/layout.tsx` redirige a `/` a cualquier otro rol (el
  menú no alcanza: la ruta se puede escribir a mano). El shortcut del `manifest.json`
  ahora apunta a `/expenses/new`. Ver backlog punto 5

### ✅ El dominio viejo redirige al canónico (`6db0a42`)
- `rindegastos.vercel.app` —el nombre de prueba— **sigue respondiendo y apuntando a
  este proyecto**. Quien tenga ese marcador, o la PWA instalada desde ahí, la usa por
  ese dominio sin enterarse
- `src/proxy.ts` lo redirige con **308** (no 302: para que el navegador lo recuerde),
  conservando ruta y parámetros. El canónico sale de `NEXT_PUBLIC_APP_URL`
- Se redirige **solo una lista explícita** (`HOSTS_VIEJOS`), nunca «cualquier host que
  no sea el canónico»: cada despliegue de vista previa de Vercel tiene su propia URL y
  hay que poder usarla antes de mezclar

### ✅ Fronteras de error (`b9e2cff`)
- `(app)/error.tsx` — dentro del área autenticada, así el menú sigue ahí y la persona
  puede irse a otro lado en vez de quedar varada con un botón de recargar
- `global-error.tsx` — último recurso, con estilos **en línea**: reemplaza al layout
  raíz, así que `globals.css` no aplica y depender de él sería depender de lo que falló
- `not-found.tsx` — 404 propia, que entra a la línea base con `estadoEsperado` en
  `e2e/rutas.ts` (es la única ruta que DEBE responder 404)
- Las tres muestran el `digest`: en producción es lo único que permite cruzar el error
  con el registro de Vercel, porque Next redacta `error.message`
- **`getUser()` LANZA con el token de refresco caducado** y el proxy corre antes que
  todo, así que ninguna frontera lo atrapa: por eso va en `try/catch` y un token vencido
  se trata como sesión ausente → redirección al login, no un 500

### ✅ Cola Bancaria (2026-08-14)
- `/banco` — vista centralizada de rendiciones en proceso de transferencia, para operadores bancarios
- `getBankQueue()` en `actions/admin.ts` resuelve `canLoad` / `canAuth` (ya no hay `isAdmin`: ser admin no da acceso al banco) y muestra `pending_bank_load` a quien carga y `pending_bank_auth` a quien autoriza, **filtrando cada fila con `puedeActuar`**: lo propio o lo que uno cargó no aparece para autorizar
- Sidebar: entrada "Cola Bancaria" visible solo para quien tenga `can_load_bank_transfer` / `can_authorize_bank_transfer` (`roles: []`)
- `revalidatePath('/banco')` en `cerrarDecision`, `confirmReportBankLoad` y `authorizeReportBank`. `requestReportBankLoad` («Iniciar proceso bancario») ya no existe
- **Permisos por asignación** (spec `2026-09-24-permisos-y-flujo-de-aprobacion-design.md`):
  las reglas viven en `src/lib/permisos.ts` y el contexto en `src/lib/contexto-permisos.ts`.
  Cinco reglas: nadie aprueba lo propio; nadie autoriza el pago de lo propio; quien
  cargó no autoriza; aprobar en N2 y autorizar está permitido; cargar lo propio está
  permitido. «Lo propio» = lo que recibe uno (en un fondo, el beneficiario).
- **El admin configura, no opera**: ningún `role === 'admin'` habilita aprobar,
  cargar ni autorizar. Durante las pruebas también (sin interruptor, D2).
- **Los gastos de un documento vivo los cambia solo su dueño** (Daniel, 2026-09-25): quien rinde la rendición, en borrador, o el empleado del fondo, con `funds_sent`. Ni el admin agrega, edita o borra gastos ajenos, y el gasto rápido le lista solo sus fondos (`listMyOpenFunds`). Sí reclasifica (categoría, centro de costo, Defontana) y corrige cargas históricas. Código: `puedeCambiarGastos()`; base: 033 §3b.
- **Los comprobantes siguen a su gasto** (Daniel, 2026-09-25): se suben o se borran solo si se puede cambiar el gasto. `puedeCambiarAdjuntos()` no tiene regla propia: delega en `puedeCambiarGastos` / `puedeCambiarGastosFondo`, y las pantallas usan la misma función. Los escribe solo el servidor con la llave de servicio; la ruta y la organización salen de la fila del gasto, nunca del navegador (035). El aprobador de una liquidación ya no sube ni borra comprobantes del empleado: sus respaldos van en «Adjuntos de respaldo».
- **Los respaldos de aprobación son evidencia** (Daniel, 2026-09-25): los ve y los sube quien ve el documento (lo decide la RLS de la rendición o del fondo, no una lista aparte). Los borra solo quien los subió, y solo mientras nadie haya dado un paso en el documento después de la subida; en rendiciones cuenta también el envío (`submitted_at`), que no queda en `expense_report_approvals`. El admin tampoco borra respaldos ajenos: un error grave se saca a mano desde Supabase. Código: `src/lib/respaldos.ts`; la ruta sale de la fila y el servidor escribe y firma con la llave de servicio (037).
- **Suplencia por función**: `bank_load_backup` y `bank_auth_backup`.
  **Quién tiene hoy los permisos bancarios (medido el 2026-10-21): SOLO las cuentas de
  Daniel** —el admin carga y autoriza; «Daniel Martinez Prueba» carga—. El 2026-10-20,
  entre 20:19 y 20:24, para probar el flujo de fondos se les quitaron a Roberto Hagar
  (autorizaba) y a Katherine Corvalán (cargaba), y no se devolvieron: está en
  `audit_log`. Hasta que se decida, **ningún empleado de PENTA puede ejecutar el paso
  bancario**, y como quien cargó no autoriza, Daniel solo no completa un pago. Este
  archivo decía «FH es titular para autorizar y suplente para cargar», que ya no era cierto
- **Aprobador inactivo = sin aprobador** (`cadenaActiva`): bloquea el envío y avisa al
  admin. Por eso desactivar o borrar a alguien que está en cadenas ajenas pide reasignar
  primero. **Autorizar exige una carga registrada** en el historial: sin ella nadie
  autoriza (no se puede comprobar quién cargó). Aprobar un fondo y aprobar su
  liquidación son acciones distintas (`enEtapa`).
- **La aprobación final va directo a `pending_bank_load`**: no existe «Iniciar proceso
  bancario» ni «Enviar al banco». `approved` solo queda cuando no hay nada que pagar
  (o en cargas históricas). Para buscar aprobadas usar `ESTADOS_APROBADOS` /
  `ESTADOS_POR_PAGAR` de `constants.ts`, nunca `['approved', 'partially_approved']`.
- **Permisos por asignación implementados** (2026-09-24): spec en
  `docs/superpowers/specs/2026-09-24-permisos-y-flujo-de-aprobacion-design.md`, plan
  en `docs/superpowers/plans/2026-09-24-permisos-por-asignacion.md`. Reemplaza
  `bank-helpers.ts` (borrado) y el modelo de un solo `bank_is_backup`.
- `/admin/reports`: estados "En banco (carga)" y "En banco (auth)" en el filtro (sin
  botón "Iniciar proceso bancario" — ver arriba)

### ✅ Otros módulos completados
- **Soft delete + Papelera** (`/admin/trash`): `expense_reports.deleted_at`; restaurar o eliminar definitivamente
- **Análisis pivot CC** (`/admin/analisis`): tabla pivot filas=centros, columnas=meses (últimos 6), export Excel
- **Resumen mensual empleado** (`/mis-gastos`): gráfico últimos 12 meses por categoría
- **Firma digital PDF (R17)**: SHA-256 del payload de ítems al final del PDF exportado
- **Borrador offline (R18)**: `localStorage` autosave cada 30s en nueva rendición; banner "¿Restaurar borrador?"
- **Aprobación rápida (R9)**: botón "Aprobar todo" con `await confirmar()` en bandeja aprobador
- **ZIP comprobantes (R7)**: `exportReportWithAttachments(reportId)` → descarga JSZip con adjuntos
- **Dashboard saldos caja chica (R16)**: `/admin/fondos` con saldo disponible + días sin actividad
- **Perfil** (`/profile`): nombre, RUT, email readonly, datos bancarios (banco, tipo cuenta, número)
- **Sidebar dinámico**: drag & drop (admin), orden persistido en `localStorage`, entrada "Informes"
- **Invitación empleados**: `set-password` flow — empleado recibe link, establece contraseña

### ⏳ Pendiente / Backlog

> Revisado contra el disco y la base el **2026-09-28**. Lo que está acá está pendiente
> de verdad; lo que se completó salió de la lista.
>
> **Plan de ejecución: `docs/superpowers/plans/2026-09-29-hoja-de-ruta-pendientes.md`**
> — el orden por fases, qué choca con qué, las decisiones previas y cómo retomar. Cada
> sesión marca su avance ahí («Registro de avance») y saca de acá lo que terminó.

1. **Marca por organización (white-label)** — **nombre y logo: HECHOS** (2026-09-04).
   `organizations.name` y `logo_url` ya existían desde `001` y no los leía nadie, así
   que no hizo falta migración de tablas. El riel y el encabezado móvil los leen vía
   `<Marca>`; la carga vive en `/admin/settings` → pestaña «Marca»; el respaldo sin
   logo es el cuadrado con degradado y la inicial. Bucket `org-logos` en la migración
   `023`.
   **El color por organización está MEDIDO Y DESCARTADO por ahora** (decisión de
   Daniel, 2026-09-04). No es que falte hacerlo: se decidió que el cliente traiga
   su logo y la app conserve su color. El logo va sobre un chip blanco que lo
   aísla del chasis, así que ningún color de logo choca — y la app sigue siendo
   reconocible como Mi Rendición, que es un activo del producto.
   Comparación visual de las dos opciones:
   https://claude.ai/code/artifact/7eae73e8-026e-4e22-b356-06fa3d84ff94

   > Si algún día un cliente lo pide y lo paga, **el algoritmo ya está validado**:
   > el cliente aporta matiz y croma, el sistema impone la luminosidad de la rampa.
   > Contraste garantizado por construcción —el peor caso medido es el teal actual,
   > 4,81:1— porque la rampa está en `oklch` y ahí la L es luminosidad perceptual.
   > Las 386 clases `brand-*`/`accent-*` se reanclarían solas sobrescribiendo las
   > variables; los únicos 7 lugares que NO pueden seguirlas son los que leen
   > `BRAND.*` desde JS (gráficos SVG, plantillas de email, metadata de la PWA).
   > Eran 8 hasta el 2026-09-25: el aviso en vivo se pintaba con `BRAND.accent`.

   **Sigue faltando**: el favicon y el `manifest.json` de la PWA, que son archivos
   estáticos y necesitarían rutas de metadata dinámicas.

2. **Rediseño Tornasol — el rediseño *conceptual*, pantalla por pantalla.**
   El chasis y la regla de materiales están **completos y verificados en las 26
   pantallas** (`npm run audit:materiales`), con deuda de sistema en cero. Lo que
   falta es repensar cada pantalla, que es otra cosa.

   **MEDIDO el 2026-10-13 con `scripts/medir-pantallas.mjs`, y el diagnóstico de
   «faltan 21 pantallas» era falso.** De las 23 medibles, 17 estaban bajo 2,5
   pantallas de scroll. El problema lo cargaban cinco, y de esas tres ya se
   arreglaron:

   | Pantalla | Antes | Ahora | Qué pasaba |
   |---|---:|---:|---|
   | `/informes` | 44,4 | **4,2** | 471 ítems dibujados enteros — regresión del 2026-10-09 |
   | `/admin/centros-costo` | 7,1 | **2,3** | 49 centros planos; es un árbol y ahora se pliega |
   | `/admin/auditoria` | 5,7 | **3,7** | tabla de 6 columnas en 390 px, páginas de 50 |
   | `/admin/employees` | 10,4 | **9,3** | la tarjeta envolvía en cinco líneas |
   | `/admin/reports` | 8,3 | 8,3 | en escritorio ya está en presupuesto (163 px/tarjeta) |

   **Las dos de admin tenían su problema solo en el teléfono.** En escritorio
   miden 5,7 y 4,5 pantallas: 204 y 163 px por tarjeta, y 163 es exactamente el
   presupuesto que la spec le da a una tarjeta. **Daniel decidió el 2026-10-13
   no esconder nada** —el banco, el correo y la cadena se siguen leyendo en la
   fila— así que se tomaron las dos mejoras que no esconden:

   - **El rol se edita en «Editar datos»**, no en un desplegable por fila. Eran
     61 controles vivos en una lista que se recorre con el pulgar. **Ahorro
     medido: 10 px por tarjeta, no los ~45 que se estimaron** — compartía línea
     con «Invitar», así que sacarlo casi nunca eliminaba una línea entera.
   - **El avatar no se dibuja abajo de `sm`** (27 px por tarjeta). Es la inicial
     del nombre, que está al lado; él y el checkbox dejaban la columna del
     nombre en 250 px de 326, y ahí «RUT · cargo · centro de costo» caía en
     TRES líneas.

   Quedan ~300 px por tarjeta. Bajarlos exige esconder, que es lo que Daniel
   descartó. `/admin/reports` no se tocó por el mismo motivo.

   **Lo que sí sirve como método, y ya está escrito:** medir por bloques antes de
   tocar. Las tres arregladas tenían el mismo defecto —una tabla o una lista
   dibujada entera— y ninguna necesitaba repensar la pantalla, solo paginar el
   dibujo o plegar. Ver [[project-rediseno-tornasol]].

   **✅ Los emoji de la interfaz: resueltos el 2026-10-13.** Eran 53 líneas en
   20 archivos (`💸 👤 🏢 🌐 📎 🟣 📋 ✏️ 📊 🚗 ⏳ ✉` y los más extendidos
   `✓ ✕ ✗ ⚠ ✦ ⛓ ⚙`), y nada las detectaba. Ahora son íconos Lucide y
   `npm run audit:deuda` tiene la regla, con sus casos en la autocomprobación.

   **Tres quedan a propósito** y no son deuda: los nombres de hoja de Excel
   «Sin CC ⚠» y «Sin mapear ⚠», que viajan al archivo que abre un contador —
   ahí el carácter se dibuja igual en todas partes, que es justo lo que no pasa
   en una interfaz—, y el título de una prueba que describe el ✕ de un chip.
   El de `/admin/analisis` vive DENTRO del archivo de su ruta, así que no
   quedaba afuera solo: lo saca `sinExcel` en el detector.

   **Para medir lo que ve un EMPLEADO falta configurar su cuenta en el arnés**:
   `E2E_EMPLEADO_EMAIL` / `E2E_EMPLEADO_PASSWORD` en `e2e/.env.e2e`, que las pone
   Daniel. Sin eso los proyectos `ingreso-empleado`, `movil-empleado` y
   `materiales-empleado` ni se arman, y las siete pantallas del rendidor se miden
   con la sesión de admin —que no tiene rendiciones propias ni está en ninguna
   cadena— así que dan 1,0 pantallas: no es que sean cortas, es que no se midió
   nada.

3. **Landing comercial en la raíz — pedida por Daniel el 2026-09-21.**
   Una página pública que **venda el sistema**: qué hace, sus características, sus
   ventajas, y un botón de «Iniciar sesión» que derive a `/login`.

   Hoy la raíz `/` es el dashboard del empleado y el proxy manda al login a cualquiera
   sin sesión, así que **la app no tiene ninguna superficie pública**: quien llega sin
   cuenta solo ve un formulario. Es la pieza que falta para que Mi Rendición se pueda
   mostrar a un cliente que todavía no la usa.

   Decisiones que hay que tomar antes de construirla: en qué ruta vive (la raíz
   pública con el dashboard movido, o `/inicio`), y cómo se comporta el proxy con
   alguien que SÍ tiene sesión y cae ahí. Nada de esto está decidido todavía.

4. **Plan de Supabase — decisión abierta (2026-09-21).**
   La organización está en **free** y el proyecto se pausa solo tras ~7 días sin uso
   (ver la advertencia en «Reglas críticas → Supabase»). Con los 57 usuarios usándola
   dejaría de pasar por uso natural, pero **hasta el lanzamiento va a repetirse**.

   Opciones: plan Pro (~US$25/mes, un proyecto en Pro nunca se pausa) o dejar que el
   cron lo mantenga vivo. **Por qué el cron no alcanzaba:** nunca llegó a la base — el
   proxy lo mandaba al login y en Vercel no existía `CRON_SECRET`. Arreglado el
   2026-09-28: el cron consulta la base de lunes a viernes, así que la brecha máxima es
   de 3 días, bajo los ~7 que tolera el plan free. Si vuelve a pausarse, revisar primero
   que el cron responda (fila «Un cron de Vercel que corre pero no hace nada» en errores).

5. **Gasto rápido para rendiciones Y caja chica — pedido por Daniel el 2026-09-23.**
   Hoy `/quick` solo registra en un fondo de caja chica, y por eso está oculto para
   empleados (ver «Flujo rápido móvil»). Lo pedido: después de la foto y la
   confirmación, el paso 3 deja **elegir el destino**:
   - **una rendición** — un borrador propio existente, o crear uno nuevo ahí mismo;
   - **un fondo de caja chica** previamente asignado al empleado (`funds_sent`).

   Cuando esté, se vuelve a abrir a empleados: `roles` en `MobileNav.tsx` y
   `Sidebar.tsx`, borrar `(app)/quick/layout.tsx`, la pestaña en
   `pestanasPrincipales` (`src/lib/navegacion.ts` — era `getPrimaryHrefs` dentro de
   `MobileNav` hasta el 2026-10-08), el shortcut del `manifest.json`, `rol` en
   `e2e/rutas.ts` y la sección en `docs/manual/manual.html`.
   **Ojo con la barra**: desde que entró «Rendiciones» las 4 pestañas del empleado
   están ocupadas, así que meter «Gasto rápido» obliga a sacar otra.

6. ~~**Mensaje claro al eliminar un documento con traspaso.**~~ ✅ **HECHO el 2026-10-01**
   (Daniel eligió no dejar y explicar, en vez de borrar también el traspaso: toca a dos
   personas y dos documentos). El motivo lo calcula `getTrashItems`, el **cargador** de
   la página, no el botón —en producción Next puede ocultar el mensaje de un `throw`—,
   así que la fila bloqueada muestra el motivo en ámbar y **no ofrece** «Eliminar
   permanentemente»; «Restaurar» queda. `permanentlyDeleteFromTrash` lo vuelve a exigir
   como defensa. Reglas en `src/lib/papelera.ts` (módulo común, sin `'use server'`:
   `traspasosDe` usa la llave de servicio), con 7 pruebas.

7. ~~**Migración 034 — borrar `users.bank_is_backup`.**~~ ✅ **APLICADA el 2026-10-01**
   (ver el listado de migraciones).

8. **Lanzamiento — decisión de Daniel.** El 2026-09-28 había 57 usuarios activos: 5
   invitados y 6 que entraron alguna vez. El correo ya no bloquea (ver «Ya NO están
   pendientes»); falta decidir cuándo invitar al resto.

9. **Avisos de Supabase (`get_advisors`, 2026-09-28).** Ninguno urgente con una sola
   organización; conviene resolverlos antes de sumar clientes:

   **Estado medido el 2026-10-01, después de aplicar la 038:**

   | Tipo | Aviso | Estado |
   |---|---|---|
   | Seguridad | 12 funciones `SECURITY DEFINER` ejecutables por **`anon`** | ✅ **cerrado por la 038** |
   | Seguridad | `set_updated_at` sin `search_path` fijo | ✅ **cerrado por la 038** |
   | Seguridad | 4 funciones `SECURITY DEFINER` ejecutables por **`authenticated`** (`is_admin`, `get_my_org_id`, `es_aprobador_de`, `es_operador_bancario`) | ⚠️ **queda, y es a propósito** — ver abajo |
   | Seguridad | Protección de contraseñas filtradas apagada | ⚠️ **queda**: solo existe en Pro, y Daniel decidió seguir en el plan gratuito (punto 4). **No es una regresión** |
   | Seguridad | `rate_limit_log` con RLS y sin políticas (INFO) | ⚠️ queda, intencional: la escribe solo la llave de servicio |
   | Rendimiento | 28 `auth_rls_initplan` | pendiente — Fase 7 |
   | Rendimiento | 155 políticas permisivas múltiples, 37 FK sin índice, 10 índices sin uso | pendiente — Fase 7 |

   > **Las 4 que quedan NO se revocan.** Una política RLS se evalúa con el rol de quien
   > consulta, así que si `authenticated` no puede ejecutarlas, **ninguna consulta de la
   > app devuelve nada**. El plan de la hoja de ruta esperaba que el aviso desapareciera
   > entero; era una expectativa equivocada, no un trabajo a medias.
   >
   > Lo único que lo cerraría del todo es **sacarlas del esquema expuesto** (moverlas a
   > uno privado y apuntar ahí las políticas), porque lo que el aviso señala es que se
   > pueden llamar por `/rest/v1/rpc`. No se hizo: toca todas las políticas de la base y
   > el riesgo real es bajo — devuelven datos del propio usuario (su organización, si es
   > admin, si es aprobador de alguien), nunca de otros.

10. **Manual de usuario sin versionar.** `docs/manual/` (HTML, PDF de 8 MB y 20
    capturas) y `e2e/manual/` (los guiones que las toman) existen solo en la raíz,
    fuera de git, desde el 2026-09-24: son anteriores a los permisos por asignación
    (2026-09-25). Decidir si se versionan y regenerarlos. El 2026-09-28 una sesión
    encontró que al manual compartido le faltaban las imágenes.

> **Ya NO están pendientes, aunque documentos viejos lo digan:**
>
> · *Correo* — funciona desde el 2026-09-23: `RESEND_API_KEY` válida en Vercel y el
>   SMTP de Supabase Auth apuntando a Resend (`smtp.resend.com`:465, usuario `resend`,
>   la clave `mi-rendicion-app`). **La clave vive en dos lados: si se rota, cambiarla en
>   ambos.** Todo link de contraseña sale por Resend hacia `/set-password?token_hash=…`
>   y se canjea recién al guardar (`verifyOtp`), así que los escáneres de Outlook ya no
>   lo queman. `revisarConfigCorreo` corta antes del bucle si el correo no puede salir.
>
>   **⚠️ INCIDENTE 2026-10-07 — esto decía que «en local la recuperación no envía». Era
>   FALSO.** En Vercel, `RESEND_API_KEY` estaba marcada para *development, preview y
>   production*: «development» es lo que baja a `.env.local`, así que **la clave real de
>   producción estaba en local**, y el servidor local apunta a la base real. Una prueba
>   automatizada con la sesión de admin hizo clic por posición en «Invitar sin invitar» y
>   salieron **52 invitaciones reales**, con la app a medio reconfigurar. El botón no pedía
>   confirmación para un lote nuevo (solo para reenvíos).
>
>   **La raíz se cerró el 2026-10-20: `RESEND_API_KEY` quedó SOLO en production.** Se
>   cambiaron los destinos sin tocar el valor, así que la clave no se descifró. Desde acá,
>   `vercel env pull` ya no la baja. **No volver a marcarla fuera de production**: el
>   candado de `VERCEL_ENV` contiene el daño, pero esto es lo que lo evita.
>
>   **Ojo: eso NO limpia las máquinas.** El `.env.local` que ya la tenía la sigue
>   teniendo —verificado el 2026-10-20 en la de Daniel, 36 caracteres— y sacarla de
>   Vercel no la borra de ningún disco. Hay que reemplazarla a mano por `placeholder`.
>   Nada de la app la usa en local: el candado de entorno corta antes.
>
>   Desde `764e43f` hay **un candado en `revisarConfigCorreo`**, que es la única puerta —
>   `trySendEmail` de `avisos.ts` también pasa por ella—:
>   1. **Fuera de producción no sale ningún correo**: `VERCEL_ENV` tiene que ser
>      `production`. Ni local ni previews (que también apuntan a la base real).
>   2. **`CORREO_PAUSADO`** corta todo en producción. **Está en `1` desde el
>      2026-10-07, por decisión de Daniel.** Para reanudar del todo: borrar la
>      variable en Vercel y redesplegar. Falla cerrado: un valor que no sea
>      vacío/`0`/`false`/`no` pausa.
>   3. **`CORREO_SOLO_A`** abre la pausa **para unas pocas direcciones** (2026-10-20).
>      Direcciones separadas por coma: con la lista cargada el correo sale solo a
>      ellas y **nadie más recibe nada**, ni avisos ni links de contraseña.
>
>      **Es una excepción a la pausa, no un reemplazo, y por eso falla cerrado:**
>      borrar la lista no abre nada, porque `CORREO_PAUSADO` sigue puesto y vuelve
>      la pausa total. Al revés que una lista de bloqueados, donde olvidarse de un
>      nombre manda el correo. Y **no sirve fuera de producción**: el candado de
>      `VERCEL_ENV` va antes y no lo levanta nada.
>
>      El filtro vive en los **dos únicos embudos de salida** —`enviarLinkDeAcceso`
>      para todo link de contraseña y `trySendEmail` para todos los avisos— y no en
>      cada sitio que manda un correo: un `destinatarios()` nuevo no puede olvidarse
>      de aplicarlo. En `enviarLinkDeAcceso` el parámetro `soloA` es **obligatorio**
>      a propósito: un callsite que se lo olvide no compila, en vez de mandarle a
>      todos. Son 3 los que lo pasan (invitar desde el panel, la planilla y
>      «olvidé mi contraseña»).
>
>      **El piloto de la semana del 2026-10-20**, que pidió Daniel para probar la app
>      entre seis:
>
>      ```
>      CORREO_SOLO_A=fdiaz@pentaingenieros.cl,fhagar@pentaingenieros.cl,jtorres@pentaingenieros.cl,kcorvalan@pentaingenieros.cl,rhagar@pentaingenieros.cl,danielmartinez.cl@gmail.com
>      ```
>
>
>      **Se puede MIRAR desde la app** (2026-10-20): Configuración → pestaña
>      «Correo» muestra si sale correo, a qué direcciones llega hoy y desde qué
>      remitente, con `getEstadoCorreo()`. Sale del MISMO `revisarConfigCorreo`
>      que decide si un correo sale, así que no puede decir que todo está bien
>      mientras el envío falla. **Es de solo lectura a propósito**, no por una
>      limitación: abrir el correo a más gente exige entrar a Vercel, y esa
>      fricción es la que faltó el 2026-10-07. La clave nunca se muestra, ni un
>      fragmento — solo si sirve o por qué no.
>
>      Su camino real se prueba en `correo-tab.test.tsx` y no en el navegador:
>      `CORREO_SOLO_A` vive en Vercel, así que **en local la pantalla siempre cae
>      en «fuera de producción»** y la lista no se ejercita. Simularlo con
>      `VERCEL_ENV=production` en local sería poner la base real al lado del
>      candado abierto, que es justo lo que mandó las 52 invitaciones.
>
>      Francisco Díaz · Francisco Hagar · Julián Torres · Katherine Corvalán ·
>      Roberto Hagar · Daniel. **De los seis, Francisco Díaz es el único sin
>      invitar y que nunca entró**, así que es el que ejercita el flujo completo
>      desde cero. Al terminar el piloto se borra la variable y vuelve la pausa.
>
>   Los 51 links que seguían vivos se anularon a mano (ensayado con ROLLBACK): hay que
>   limpiar **dos** lugares, `auth.users.recovery_token` **y** `auth.one_time_tokens`
>   (`token_type = 'recovery_token'`). Limpiar solo uno deja el link funcionando.
>
>   Para sacar a alguien que ya entró alcanza con **cambiarle la contraseña desde el
>   panel** (`setEmployeePassword`): Supabase revoca todas sus sesiones al hacerlo,
>   aunque el código no llame a ningún `signOut`. Verificado el 2026-10-07 con la única
>   persona que alcanzó a entrar: 1 sesión abierta antes, 0 después. Con los links
>   anulados y los correos pausados no hay otra vía para conseguir contraseña —ningún
>   flujo usa el correo propio de Supabase—, así que no hizo falta un bloqueo de acceso
>
> · *Defontana — `Codigo Legal` en facturas* — va vacío a propósito (la factura ya
>   está en Defontana; el asiento solo rebaja al proveedor), fijado en un test. Si el
>   importador llegara a exigirlo, es una línea en `rowToArray`.
>
> · *Service worker / caché offline* — **ya NO está bloqueado técnicamente** (resuelto
>   el 2026-09-04). El motivo histórico —«`next-pwa` v5 no es compatible con Turbopack»—
>   era cierto y dejó de serlo: `@serwist/turbopack`, su sucesor mantenido, tiene soporte
>   explícito. `next-pwa` quedó huérfano en `package.json` durante meses y se eliminó.
>   El arnés ya corre con `serviceWorkers: 'block'` en `playwright.config.ts`, así que
>   la línea base sigue siendo determinista.
>   **Lo que queda es una decisión de producto, no técnica**, y es de Daniel: caché
>   offline —valioso para fotografiar boletas donde no hay señal— a cambio del riesgo
>   clásico de servir assets viejos después de un deploy. El razonamiento completo está
>   en el comentario de cabecera de `next.config.ts`.
>
>   **DECIDIDO el 2026-10-21: no se hace nada hasta que la app se use de verdad.**
>   Daniel evaluó tres caminos —modo offline con cola, una bandeja de «gastos sueltos»
>   sin documento, y completar `/quick`— y eligió **esperar al piloto**. El dato que
>   cerró la discusión: con la app desplegada hacía meses, el uso real era de **5 gastos
>   de caja chica, 20 de rendición y 1 uso de OCR en toda su historia**.
>   Nadie había cargado todavía una boleta en obra, así que construir offline era
>   construir para un problema que nadie midió.
>
>   **Y era peor de lo que esos números dicen** (medido el 2026-10-21). Los 20 gastos no
>   son «de UNA sola» rendición, como decía acá: están repartidos en **11**, y **todos son
>   de prueba**. Los 5 de caja chica son datos sembrados de «Daniel Martinez Prueba»; de
>   los 20 de rendición, solo 3 los cargaron empleados reales —Roberto Hagar, Francisco
>   Hagar y Katherine Corvalán, el 2026-09-24, en documentos titulados «Prueba», «prueba
>   02» y «Nodo Penta»—, y el único OCR lo usó «1 Daniel Prueba». Hoy 16 de esas 17
>   rendiciones y 8 de los 9 fondos vivos están en la papelera. **La consulta de abajo
>   cuenta papelera y cuentas de prueba**: para uso real, sumar `deleted_at is null` y
>   descartar las cuentas de Daniel.
>
>   **No volver a proponerlo sin estos números delante.** La consulta que los da:
>
>   ```sql
>   select (select count(*) from petty_cash_items) as gastos_caja_chica,
>          (select count(*) from expense_items i join expense_reports r on r.id=i.report_id
>            where r.is_historical_import = false) as gastos_rendicion,
>          (select count(*) from attachments) as adjuntos,
>          (select count(*) from rate_limit_log where action = 'ocr') as usos_de_ocr;
>   ```
>
>   Lo que el piloto tiene que responder, y la base NO puede: **¿alguien no pudo cargar
>   por falta de señal?** Eso solo se sabe preguntándole a los seis. Según la respuesta:
>   si el problema es la señal, el camino es offline **solo en la pantalla de captura**
>   (un gasto + su foto en cola, con clave anti-duplicado), nunca «la app entera»; si el
>   problema resulta ser el flujo —no sé a qué documento mandarlo, no tengo fondo
>   abierto— el camino es la bandeja, que necesita tabla nueva porque hoy
>   `expense_items.report_id` y `petty_cash_items.fund_id` son **NOT NULL**.
>
>   Tres restricciones que cualquier plan de offline tiene que respetar, encontradas al
>   evaluarlo: **el OCR no puede correr offline** (es una llamada a la API de Anthropic
>   desde el servidor, así que sin señal el monto se escribe a mano o el OCR corre al
>   sincronizar); **las fotos van en IndexedDB**, no en `localStorage`, que no guarda
>   binarios; y **una cola no puede guardar llamadas a Server Actions**, cuyos
>   identificadores cambian en cada build — tiene que guardar datos y reintentar contra
>   la app recargada, o se rompe con cualquier despliegue hecho mientras hay gastos
>   pendientes.
>
> · *Notificaciones email* — el código está completo desde el 2026-08-12
>   (`lookupEmails()` en `lib/avisos.ts`, con `createAdminClient()` + `getUserById()`)
>   y la credencial es válida desde el 2026-09-23.
>
> · *«Penta Rend» hardcodeado* — el nombre no se muestra en ninguna pantalla desde
>   `46d62ab`. Lo que sigue pendiente es el white-label (punto 1), no ese literal.
>   El 2026-10-01 quedaba un último rastro, en el comentario de cabecera de
>   `scripts/generate-icons.mjs`, porque **el ícono mismo seguía siendo el degradado
>   índigo de «Penta Rend»**. **Cerrado el 2026-10-06** (Tarea 3.6): el ícono se
>   rehízo con la marca actual y el comentario se reescribió. Ya no queda ninguno.

---

## Supabase — puntos no obvios

1. **`expense_report_approvals` es append-only a nivel PostgreSQL** (no solo RLS) —
   con triggers de la migración `026`. Hasta el 2026-09-23 este archivo decía que lo
   hacían dos `create rule ... do instead nothing`, **que nunca existieron en la base**.
   - Editar una aprobación → error, siempre (también con service role o SQL manual)
   - Borrar una aprobación suelta → error. Solo cae por la cascada de su rendición
   - Borrar una rendición **con aprobaciones** → solo si `is_admin()`. Con la service
     role `auth.uid()` es null y se rechaza: por eso `permanentlyDeleteFromTrash`
     borra rendiciones con el cliente del admin, no con `createAdminClient()`

2. **Los montos de un gasto se congelan cuando su documento sale de manos de quien rinde — desde la 033 (aplicada el 2026-09-25).**
   Con la 033 (§3b, `proteger_documento_item`), un gasto de rendición solo se toca
   mientras la rendición está en borrador, y uno de caja chica mientras el fondo está en
   `funds_sent`, y en los dos casos solo lo toca su dueño. Después, montos, fechas y
   comercio solo los cambia la llave de servicio.
   El admin, con su sesión, solo en cargas históricas; en un documento vivo, solo
   categoría, centro de costo y la marca de Defontana. El TC histórico no se recalcula.
   Lo imponen la base (033) y, antes, el código (`puedeCambiarGastos`,
   `addFundItem` / `updateFundItem` / `removeFundItem`). Hasta el 2026-09-25 este
   archivo lo daba por hecho sin que ningún disparador lo impusiera

3. **`expense_reports`** tiene trigger `set_updated_at()` en cada UPDATE

4. **Storage bucket `expense-attachments`**: YA CREADO en el proyecto `jqtbtgduqzxkgubmzukg`:
   ```sql
   insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
   values ('expense-attachments', 'expense-attachments', false, 10485760,
     array['image/jpeg','image/png','image/webp','application/pdf']);
   ```
   Políticas de storage: hasta la 035, subir, leer y borrar pedían solo tener sesión —
   cualquiera borraba cualquier comprobante conociendo la ruta. Desde la 035 (aplicada el
   2026-09-25) solo el servidor escribe en el bucket y en `attachments`, y la lectura queda
   en la carpeta de la propia organización. **Para probar un borrado por SQL**: `storage.objects`
   tiene el disparador `protect_objects_delete`, que rechaza todo DELETE directo salvo
   `set_config('storage.allow_delete_query', 'true', true)` — lo mismo que hace la API.
   Bucket `approval-attachments` («Adjuntos de respaldo»): **no existió hasta el
   2026-09-24** aunque este archivo decía que sí — toda subida fallaba con «Bucket
   not found». Lo crea la migración `029`; acepta lo de un comprobante más Excel.
   Sus tres políticas pedían solo tener sesión, de cualquier organización. Desde la 037
   no tiene ninguna, ni de lectura: lo firma un solo lugar (`getApprovalAttachments`),
   con la llave de servicio, después de comprobar que la persona ve el documento.
   Los tipos admitidos de ambos buckets son espejo de `src/lib/attachment-types.ts`.

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

17. **Ensayar una migración contra la base real sin dejar rastro** (verificado el 2026-09-25):
    `execute_sql` del MCP de Supabase respeta `BEGIN` / `ROLLBACK` explícitos dentro de
    una misma llamada, y el DDL de Postgres es transaccional. Así se ensayó la 033:
    `begin;` + la migración + sus pruebas (`supabase/tests/033_proteccion.sql` sin su
    propio begin/rollback) + `rollback;`. El resultado sale del último `select` (los
    NOTICE no se ven: por eso las pruebas escriben en una tabla temporal). Antes de
    confiar en eso con DDL, una sonda: crear una tabla descartable en una transacción,
    deshacerla y comprobar con `to_regclass` en otra llamada que no quedó

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
| `next-pwa` v5 con Next.js 16 | `webpack` config + Turbopack → build error | Ya no aplica: `next-pwa` se eliminó el 2026-09-04. Si hace falta un service worker, el camino es `@serwist/turbopack` — **no** reinstalar `next-pwa` |
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
| Botón "Invitar" individual desaparece para usuarios ya invitados | `{!emp.invited_at && <button>}` oculta el botón — admin no puede reenviar | Siempre mostrar el botón; usar `emp.invited_at` para cambiar estilo (teal→ámbar) y texto (Invitar→Reenviar), y `await confirmar()` en `handleSendInvitations` si algún seleccionado ya tiene `invited_at` |
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
| Un cron de Vercel que «corre» pero no hace nada | Dos cortes antes del handler, y ninguno deja rastro: Vercel llama sin cookies y el proxy manda al login (307) toda ruta que no sea pública; y manda `Authorization: Bearer $CRON_SECRET` solo si la variable existe, si no el guard responde 401. Los logs de Vercel (Hobby) duran ~1 hora. Pasó con los recordatorios hasta el 2026-09-28 | La ruta en `src/lib/rutas-publicas.ts` y `CRON_SECRET` en Vercel (se activa con el próximo deploy). Prueba rápida: `curl -I` a la ruta sin secreto tiene que dar **401** (llegó al handler), nunca 307 |
| Buscar en el código por qué «no se puede iniciar sesión» | El proyecto Supabase se pausó solo (plan free, ~7 días sin uso) y **el DNS del subdominio deja de existir**. El `try/catch` del proxy lo degrada a redirección al login, así que no se ve ningún error: parece un problema de credenciales | `get_project` del MCP de Supabase **antes** de mirar código, variables o deploys. `status` ≠ `ACTIVE_HEALTHY` es la respuesta. La firma en los logs de Vercel es `getaddrinfo ENOTFOUND` + `AuthRetryableFetchError` |
| Dar por perdidos los datos durante un `restore_project` | Supabase levanta la infraestructura primero y restaura el esquema después: hay varios minutos en que `public.users` no existe y la base se ve vacía | Esperar a que `/rest/v1/` devuelva 200 (la secuencia es 521 → 404 → 200). El puerto 5432 abre MUCHO antes de que se pueda leer una fila |
| Validar un caché contra `updated_at` en una tabla con trigger `set_updated_at()` | Guardar el caché **es** un UPDATE, así que pisa la misma marca contra la que se compara: la condición no se cumple nunca y cada vista recalcula | Invalidar con un trigger donde cambian los datos de verdad, no comparando marcas de tiempo en la misma fila. Ver migración `024` |
| Repartir la invalidación de un caché entre los llamadores | `expenses.ts` la hacía en 2 sitios, pero ~11 lugares modifican ítems (admin, traspasos, carga histórica): los otros nueve dejaban el caché viejo | Un trigger en la base cubre los caminos de hoy, los de mañana y el SQL manual |
| Un `.delete()` / `.update()` del cliente Supabase «funciona» pero no cambia nada | Si RLS no tiene política para esa operación, Postgres no da error: afecta 0 filas y Supabase devuelve éxito. Pasó con el borrado de borradores del empleado (sin política DELETE) | Encadenar `.select('id')` y lanzar si vuelve vacío. Y crear la política que falta (migración `025`) |
| Borrar de verdad un usuario (`auth.admin.deleteUser`) | `audit_log.actor_id` es ON DELETE SET NULL y `audit_log` tiene la regla `no_update_audit_log`: la cascada choca y Postgres aborta («referential integrity query ... gave unexpected result») | Un usuario no se borra, se **bloquea**: `blocked_at` + ban en auth. Sale de la papelera y solo un admin lo habilita (`enableBlockedEmployee`). Migración `027` |
| Política RLS de UPDATE con condición de `status` en USING y sin WITH CHECK | Postgres le aplica el USING también a la fila nueva: la política deja *encontrar* la fila pero no *cambiarle* el estado. Pasó con el aprobador no-admin (migración `030`): nunca pudo cerrar una rendición y nadie lo vio porque todas las pruebas se hacían como admin | USING = qué filas puede tocar; WITH CHECK = a qué estados las puede llevar. **Probar los flujos con un usuario sin rol admin** |
| `capture="environment"` en un `<input type="file">` que también acepta PDF | En el celular abre la cámara directo: no hay forma de elegir un archivo guardado | Una entrada con `capture` para la foto y otra SIN `capture` para archivos (ver `PhotoUpload`) |
| Pasar `contentType` a `storage.upload()` con un `File` | supabase-js lo ignora y manda el tipo del archivo; un `.msg` de Windows llega sin tipo y el bucket lo rechaza | Re-tipar: `new Blob([file], { type })`. El tipo sale de la extensión (`classifyAttachment`) |
| Invertir quién le debe a quién al liquidar un fondo | El empleado recibe el fondo ANTES de gastar: lo que sobra lo tiene él. `calculateFundBalance` lo marcaba como «empresa devuelve al empleado» y el cierre precargaba `refund_to_employee`, que en Defontana sale como adelanto (plata que SALE). Hasta el 2026-09-24 | `calculateFundBalance` devuelve `settlementType` y la pantalla lo usa tal cual — nunca decidir la dirección en el componente. `pending` descuenta las transferencias de cierre ya registradas. Fijado en `petty-cash-helpers.test.ts` |
| Escribir `confirm()` o `alert()` en un componente | Son cajas del sistema operativo sin nada del diseño; el navegador les antepone el dominio («mi-rendicion.com dice:») y en Android parecen avisos de error | `await confirmar()` y `avisar()`. Quedan **0** nativos en `src/` desde `a1edf8f` — que no vuelva a entrar uno |
| Dar permisos operativos por `role === 'admin'` | El admin se salteaba la segregación: aprobó, cargó y autorizó fondos solo | El admin configura, no opera. Cada paso pasa por `puedeActuar()` |
| Mandar un aviso a «todos los que tienen el permiso» | Correos a quien no puede actuar; el permiso y el aviso salían de consultas distintas | `destinatarios()` de `permisos.ts`: la misma función decide quién puede y a quién avisar |
| Cambiar un estado con el cliente de la sesión | Desde la 033 (aplicada el 2026-09-25) la base lo rechaza: «El estado y los montos aprobados solo los cambia la aplicación…» | Verificar con `exigirPaso` y escribir con `createAdminClient()` |
| Proteger el estado de un ítem y no el ítem | Las políticas de dueño de `expense_items` / `petty_cash_items` son ALL sin condición de estado: el rendidor movía un gasto aprobado a su borrador (se pagaba dos veces) y editaba montos de rendiciones en revisión | 033 §3b (`proteger_documento_item`) + `puedeCambiarGastos()` en las acciones. Una acción del servidor no pasa el patch del navegador tal cual a la base: `soloCampos()` con la lista de lo que manda su formulario |
| Exportar un `notify*` desde un archivo `'use server'` | Toda función exportada ahí es una acción del servidor que el navegador puede invocar con los argumentos que quiera: correos con nuestro remitente a quien elija | Los avisos van en `src/lib/avisos.ts` (módulo común). Lo escrito por personas entra al HTML con `escaparHtml()` |
| Proteger la fila de un adjunto y no su archivo | El archivo vive en `storage.objects`, con su propia RLS: el bucket dejaba borrar a cualquier sesión, y `deleteItemAttachment` borraba la ruta que mandaba el navegador. Un disparador en `attachments` no lo habría cerrado | La ruta sale de la fila, y ninguna sesión escribe en el bucket (035). Al revisar permisos de archivos, mirar las dos RLS: la tabla y `storage.objects` |
| Leer `title` / `body` de una notificación | `notifications` solo guarda `type` y a qué documento apunta (`report_id` / `fund_id`). El hook de Realtime casteaba la fila a `{ title, body }` y el aviso en vivo salía como una caja vacía | El texto lo arma `textoNotificacion()` (`src/lib/notificaciones.ts`) y se muestra con `avisar()`. La fila se tipa con `Notification` de `types.ts`, nunca con un cast a mano |
| Suscribir un canal Realtime sin esperar el token de la sesión | realtime-js 2.106 arma el join en el `subscribe()` y busca el token en paralelo: con la sesión recuperada de cookies (recargar, reabrir la PWA) el join sale sin `access_token`, el canal queda como anon y RLS descarta cada fila **sin ningún error** | `await supabase.realtime.setAuth()` antes de `.subscribe()` (ver `useRealtimeNotifications`). Para diagnosticar, mirar el frame `phx_join` en el websocket: si no trae `access_token`, es esto |
| Borrar de verdad un documento o un gasto que tiene archivos | La cascada borra las filas de `attachments` y `approval_attachments`, pero no los archivos: Storage no tiene llaves foráneas. Quedaron 6 huérfanos (~12 MB) de la papelera y de borradores, hasta el 2026-09-28 | `archivosQueCaen()` antes del borrado (después la cascada ya se llevó las filas), borrado con `.select('id')`, y `retirarArchivos()` recién si cayó la fila (`src/lib/archivos.ts`). Un huérfano se retira por la API de Storage, nunca con un DELETE en `storage.objects`: el archivo físico queda |
| Sondear el sitio con `curl` en bucle para esperar un despliegue | Vercel lo toma por un bot y responde **403 a todo** —`/login`, la raíz, `/api/cron`—, con `X-Vercel-Mitigated: challenge` y una página «Vercel Security Checkpoint». Parece que la app se cayó justo después de desplegar, y de aplicar migraciones, que es el peor momento para creerlo. Pasó el 2026-10-01 tras 38 peticiones en 380 s | Antes de declarar nada roto, mirar la cabecera `X-Vercel-Mitigated` del 403: si dice `challenge`, es el escudo y no la app. Confirmar con un navegador de verdad (el panel del navegador resuelve el reto solo) y, para esperar un despliegue, preguntarle a la API de Vercel (`list_deployments` / `get_deployment` hasta `READY`) en vez de martillar el dominio |
| Correr `next build` y después `next dev` sin limpiar | Los dos escriben en el mismo `.next`, y con Turbopack ese estado mezclado deja **TODAS las rutas en 404** — `/login` incluido—, con el dev server arrancando normal («Ready in 1.6s») y sin un solo error en los logs. Parece que la app se rompió entera. Pasó el 2026-10-02 al verificar la planilla | `rm -rf .next` y relevantar. Mejor aún: el build va **después** de probar en dev, no antes. Si hay que hacer las dos cosas, parar el dev server, borrar `.next` y recién ahí construir |
| Buscar el buildId en el HTML de `/login` para saber si el despliegue entró | **Ya no está ahí**: el `"b":"…"` que la hoja de ruta daba por hecho no aparece en el HTML servido (verificado el 2026-10-01). Buscarlo da una cadena vacía, no un error | Confirmar con `get_deployment` que el despliegue del commit está `READY` y que tiene el alias `www.mi-rendicion.com`. Como huella secundaria sirve el nombre de un chunk de `/_next/static/chunks/`, que cambia entre builds |
| Meter un PNG RGB dentro de un `.ico` | Un ICO con PNG embebido exige que ese PNG sea de **32 bits con alfa**. Quien lo hace cumplir es el build: Next procesa `src/app/favicon.ico` como metadata de ruta y corta con «Format error decoding Ico: The PNG is not in RGBA format!». El archivo se ve perfecto en cualquier visor, así que sin construir no se nota | Escribir el favicon en RGBA (tipo de color 6) aunque el ícono sea opaco: el canal constante lo comprime deflate y no pesa. Pasó el 2026-10-06 al rehacer el ícono |
| Creer que la captura «Cola bancaria» de la línea base muestra `/banco` | Muestra el **dashboard**: el admin del arnés no tiene permisos bancarios —ser admin no da acceso al banco— así que `/banco` lo redirige a `/`. La captura se llama `banco.png` y fotografía otra pantalla, y encima la ruta no está marcada `datosVivos`, así que falla cada vez que cambian los números del dashboard y parece una regresión. Visto el 2026-10-07 | Para auditar la cola bancaria de verdad, el arnés necesita un usuario con `can_load_bank_transfer` / `can_authorize_bank_transfer`. Mientras tanto, tratar ese rojo como dato vivo |
| Leer el código de salida de `playwright ... | tail` | El código es el de `tail`, no el de Playwright: una corrida con 14 capturas en rojo informa **exit code 0**. Pasó el 2026-10-07 y por poco se toma por verde | Leer el resumen («N failed / N passed») del final de la salida, nunca el código de salida de un comando con tubería |
| Mirar el `-diff.png` de `rendicion-detalle` y creer que el cambio es enorme | Esa captura entra por el primer enlace de `/admin/reports`, y esa lista cambia: la base puede tener una rendición y la corrida otra, así que el diff compara dos documentos distintos y sale casi todo rojo | Mirar el `-actual.png`, no el `-diff.png`, cuando la captura navega por un enlace en vez de ir a una URL fija |
| Correr pruebas automatizadas con la sesión de admin contra el servidor local, y hacer clic por posición | El servidor local apunta a la **base real** y tenía la **clave real** de Resend (bajada de Vercel por el target «development»). Un `button:has(svg)` número 4 cayó en «Invitar sin invitar» y mandó 52 invitaciones a empleados reales el 2026-10-07 | Nunca clics a ciegas: elegir siempre por nombre o etiqueta (`getByRole('button', { name: … })`). Nunca automatizar pantallas de administración que disparan acciones hacia afuera (invitar, aprobar, cargar, autorizar). Desde `764e43f` fuera de producción no sale correo, pero la base sigue siendo la real |
| Una acción masiva sin confirmación | «Invitar sin invitar (N)» enviaba N correos con un solo clic: `handleSendInvitations` solo pedía confirmación cuando alguno ya estaba invitado | Toda acción que llega a muchas personas pide confirmación con el número a la vista. Para invitar, desde `c3ecd2a`: dos o más personas exigen escribir INVITAR (`confirmacionInvitacion` en `src/lib/invitaciones.ts`) |
| Sumar `expense_items` de un empleado sin mirar `item_type` | Las cargas históricas traen adelantos, devoluciones y traspasos como ítems: «Mis gastos» los sumaba como gastos hasta el 2026-10-08, y encima no contaba caja chica | `esGasto(item_type)` de `src/lib/filtro-documentos.ts` antes de sumar. En `petty_cash_items` no hace falta: ahí solo hay gastos |
| Dejar en blanco el monto de N2 y creer que «nunca escala» | Hasta el 2026-10-07 el diseño decía «sin umbral = nunca», y nadie había cargado montos: quien tenía N2 en la ficha (Francisco Díaz) lo perdía en silencio al desplegar | **Un N2 sin monto firma siempre.** El monto de la ficha vale para los dos N2; el de la organización, solo para el suyo (`umbralAplicable`). Ante un cambio de regla de aprobación, consultar quién tiene hoy esa configuración ANTES de desplegar |
| Decidir qué sale en el menú por el ROL cuando el poder lo da un permiso | Desde los permisos por asignación, quién aprueba lo decide la cadena: **en PENTA nadie tiene el rol `approver`**, los 11 que aprueban son `employee` con `can_approve`. `pestanasPrincipales` y el `isVisible` de MobileNav seguían cortando por rol, así que «Aprobaciones» no salía en la barra de abajo NI en «Más» —isVisible corta por rol en su PRIMERA línea— y en el teléfono no había forma de llegar a aprobar. El riel de escritorio sí tenía su escapatoria por permiso. Visto el 2026-10-08 | Si una pantalla la habilita un permiso, el menú se decide por **ese permiso**, nunca por el rol. Antes de confiar en una lista de roles, consultar qué roles tiene la gente de verdad, no los que el código supone |
| Creer que eliminar a alguien libera su correo | No lo libera nunca: «Eliminar» manda la ficha a la papelera y «Eliminar definitivamente» la bloquea (027, porque su historial la referencia), y la cuenta de Auth sigue existiendo con su correo tomado — Auth es GLOBAL, no por organización. El alta rebotaba con «el correo ya lo usa otra cuenta», sin decir quién ni dónde estaba. Pasó con Julián Torres el 2026-10-08 | `cuentaQueChoca` de `src/lib/alta-repetida.ts` antes de tocar Auth: busca por correo y por RUT **sin mirar si está activa** —las inactivas son justo las que no se ven en la nómina— y el texto termina en la acción de ese estado. La pantalla ofrece el botón ahí mismo. Una cuenta de OTRA organización no se nombra: eso sería filtrar gente ajena |
| Dar por hecho que un `overflow-x-auto` evita que la página scrollee | A veces no alcanza, y el arnés lo encuentra pero no explica por qué. En `/admin/centros-costo` una tabla de 6 columnas dentro de su scroller dejaba el cuerpo corriendo **334 px** a lo ancho (`scrollX` llegaba a 334 de verdad, no era un número raro): no lo arregló `overflow-x:hidden` en NINGUNO de los siete ancestros, uno por vez, ni `max-width`, ni un ancho fijo — solo `contain:paint`. En `/admin/analisis`, con la misma estructura, un scroller de 358 px contiene una tabla de 1021 sin problema. La diferencia no se encontró | No pelear con el scroller: **si el contenido no entra en 390 px, no va en una tabla**. Una lista de `flex flex-col` que se vuelve fila alineada en el corte grande no tiene el problema, y en el teléfono se lee mejor. Y el corte va en `lg:`, no en `sm:`: a `md:` aparece el riel lateral y se come 256 px, así que **a 768 hay menos ancho de contenido que a 640** — ahí desbordaba 30 px |
| Resolver en el servidor un filtro que no reduce cuántas filas se traen | Diez de los once filtros de `/informes` vivían en la base y solo DESCARTABAN de lo traído: cada clic era un viaje que no ahorraba una sola fila, y por eso la pantalla necesitaba un botón «Generar informe» en vez de responder sola | Al servidor va únicamente lo que decide **cuántas** filas viajan —el período, el alcance—; el resto se filtra donde ya están los datos. Y antes de mover un filtro al navegador, **medir el peso de la respuesta** y proyectarlo al volumen real, no estimarlo: acá el estimado estaba tres veces corto |
| Un `<select>` alimentado con un valor que no está entre sus opciones | Se dibuja **en blanco**, sin ningún error, y el siguiente «Guardar» escribe ese blanco: el dato se borra sin que nadie lo haya tocado. Pasó con `bank_account_type`, donde la planilla escribía «Corriente» y el formulario ofrecía 'corriente' — el perfil del propio Daniel mostraba el campo vacío teniendo el dato | Normalizar al leer **y** al escribir, y sobre todo incluir el valor actual entre las opciones (`opcionesDeBanco`). Antes de poner un `<select>` sobre una columna que ya tiene datos, **consultar qué valores hay realmente** |
| Dar por larga una pantalla sin medirla por bloques | El backlog decía «faltan 21 pantallas por repensar» y lo medido el 2026-10-13 fueron **cinco**: 17 de 23 estaban bajo 2,5 pantallas de scroll. Y las cinco tenían el MISMO defecto —una tabla o una lista dibujada entera—, no «falta repensar la pantalla» | `node scripts/medir-pantallas.mjs` antes de abrir ningún archivo. El desglose por bloque dice si el problema es la lista, los filtros o el encabezado, y casi siempre es la lista |
| Sacar el botón que retrasaba una lista sin paginarla | `/informes` tenía «Generar informe» y no dibujaba nada hasta que alguien apretaba. Al volverla instantánea (2026-10-09) pasó a dibujar los 471 ítems al entrar: 37.479 px, 44 pantallas de teléfono. El botón estaba escondiendo el problema, no causándolo | Al quitar una barrera, medir lo que queda del otro lado. Y paginar el DIBUJO: KPIs, totales y exportaciones siguen sobre la lista filtrada entera |
| Medir una pantalla del rendidor con la sesión de admin | Sale **1,0 pantallas** clavado y parece corta. No tiene rendiciones propias, no está en ninguna cadena y `/banco` lo redirige al dashboard: no se midió la pantalla, se midió el vacío. Es el mismo error que la captura `banco.png` de la línea base | `--empleado`, que necesita `E2E_EMPLEADO_EMAIL` / `E2E_EMPLEADO_PASSWORD` en `e2e/.env.e2e`. Un `1.0` exacto en cualquier medición es sospechoso: es el alto del viewport |
| Dejar la lista de opciones suelta dentro de la pantalla que la usa | `BANKS` y `ACCOUNT_TYPES` vivían en `profile/page.tsx` y nadie más las veía, así que la planilla inventó su propio vocabulario para la misma columna | Una lista que describe un dato del dominio va en `src/lib/`, con su normalizador al lado. Lo que la comparte deja de poder divergir |
| Creer que «eliminar definitivamente» borra a un usuario | No lo borra: lo **bloquea** (migración 027) y le baja `deleted_at`, así que volvía a la nómina con un chip rojo. Daniel, 2026-10-09: «lo eliminé de la papelera y sigue apareciendo en empleados» | Se esconde en la pantalla, nunca en la consulta: `getOrgEmployees` lo sigue trayendo o un bloqueo por error sería irreversible. Dos puertas para encontrarlo —el chip Estado → «Bloqueados» y el buscador por nombre o RUT—, porque pedir a alguien por su nombre y no recibir nada es una pantalla que miente |
| Un encabezado de plantilla que el lector de esa misma plantilla no reconoce | «N° de Cuenta»: el `°` no es un acento, así que `\p{Diacritic}` no lo saca y la columna se ignora EN SILENCIO. 58 de 61 personas quedaron con banco y sin número de cuenta | La prueba que lo impide es `CABECERAS.filter(h => mapHeader(h) === null)` igual a `[]`: lo que la app hace descargar tiene que poder leerlo la app. Y el normalizador saca también `° º . # :` y los paréntesis |
| Guardar encima de una vista compartida como comportamiento por omisión | Las vistas son de la organización: si tocar un chip la modificara, alguien que solo estaba revisando cambiaría lo que ven todos los demás | Tocar un chip NUNCA modifica la vista. Aparece la línea «cambiaste el filtro sobre la vista X» con «Guardar como vista» y «Descartar»; guardar encima es una acción aparte |
| Recalcular el total de una carga histórica con `calculateReportTotal` | Suma **todos** los `amount_clp` sin mirar `item_type`, pero una carga se crea con `total_amount` = solo gastos. Así, borrar un ítem absorbía los adelantos al total, y editar un monto no recalculaba nada: tres cargas desviadas en producción, una por $278.710 | `totalesDeCargaHistorica` de `src/lib/movimientos-historicos.ts`, que devuelve total **y** aprobado juntos para que un recálculo no arregle uno y deje el otro viejo. Va con la llave de servicio: la 033 protege `approved_amount` |
| Excluir los traspasos de un total «porque no son gastos» | Un traspaso deja un ítem en los documentos de las DOS partes con el mismo monto positivo. Del lado que paga es plata que salió, igual que un gasto; del lado que recibe es financiamiento, igual que un adelanto. Excluirlo de los dos le bajaba el total a la caja que pagó; incluirlo en los dos contaría la misma plata dos veces | La dirección sale de `fund_transfers.payer_report_id`, como `is_transfer_payer` en el export a Defontana. Y **sin el dato, no suma**: un callsite que se olvide de resolverlo deja el total como estaba, que es el error barato |
| Filtrar los traspasos por `status` para el monto aprobado | A un traspaso no lo aprueba nadie: `createFundTransfer` ni escribe `status`, así que los 8 de producción están en el `pending` por omisión de la columna. Filtrarlos dejaba fuera del aprobado plata que salió de la caja con total certeza | Un traspaso pagado cuenta en el aprobado mire lo que mire su estado. Un gasto pendiente sí queda afuera: la distinción tiene su prueba |
| Correr un ensayo con `BEGIN` y olvidar el `ROLLBACK` | `execute_sql` del MCP **no deja la transacción aplicada**: sin un `commit;` explícito, los datos quedan intactos (comprobado el 2026-10-20 releyendo las tres filas después del ensayo, que seguían como antes). Pero eso se verifica, no se supone | Después de cualquier ensayo sobre producción, **volver a leer las filas** en una llamada aparte antes de seguir. Y para aplicar de verdad, `commit;` explícito más un `select` final que muestre el antes y el después |
| Agregar un ítem a una carga contabilizada desde `/admin/reports` y esperar que el panel lo ofrezca | Esa pantalla marca la cabecera y no los ítems, y el panel por tipo trata ese estado como «todo exportado» (`legacyHeaderOnly` → `pending = []`): el ítem nuevo nace pendiente y queda **invisible**, sin error ni aviso. Eran 27 de 145 cargas el 2026-10-19 | Sembrar la marca de la cabecera en los ítems existentes **antes** de insertar, como ya hacía `revertHistoricalFundDefontana`. La condición está en `necesitaSiembra` |
| Editar código con un script de `node -e` y no correr `tsc` después | Un `replace` que saca una línea temporal puede llevarse la de al lado. Pasó el 2026-10-21 al quitar un `console.log` de diagnóstico: se fue también el `return` de la función, **las 950 pruebas siguieron en verde** —ningún test importa `src/actions/`— y el fallo apareció recién en `npm run build`, como «Parsing ecmascript source code failed» a 200 líneas del cambio | Después de CUALQUIER edición por script, `npx tsc --noEmit` antes de seguir: toma segundos y lo habría cazado al instante. Y no dar por buena una verificación cuyo `echo` de éxito corre pase lo que pase (`comando && echo ok` sí encadena; `comando; echo ok` miente) |
| Mostrarle a una persona el mensaje de un error lanzado en el servidor | En producción **Next reemplaza el mensaje de cualquier throw del servidor** por un párrafo suyo en inglés («omitted in production builds…»). En desarrollo se ve el mensaje real, así que **no se nota hasta que está desplegado**. Lo vio Francisco Díaz el 2026-10-21 al no poder borrar un borrador, y hay 90 sitios en 35 archivos que muestran err.message tal cual | La red está en `avisar()`, que es por donde pasan todos los avisos (`mensajeLegible` de `src/lib/errores.ts`). Pero eso tapa el síntoma: un error que la persona tiene que ENTENDER se devuelve como dato (`return { error: … }`), no se lanza — un valor de retorno no lo redacta nadie |
| Medir el cuadre de una caja chica POR DOCUMENTO | Un fondo tiene su adelanto en un documento y sus gastos en otro: el documento suelto casi nunca cuadra. Medido el 2026-10-20 sobre las 117 cargas históricas: por documento cuadran **15 de 117**; agrupadas por fondo, **47 de 53**. Sobre esa medición equivocada se informó que «114 cajas tienen saldo» y se agregó un distintivo que habría puesto 102 avisos falsos | Agrupar por `fund_number` antes de juzgar el cuadre, como ya hace `/petty-cash`. Y antes de agregar un indicador, **mirar si la pantalla ya tiene el suyo**: esa lo tenía, mejor hecho |
| Restar la devolución igual que el adelanto | Una devolución es plata que la persona YA entregó de vuelta: reduce lo que debe ELLA, no lo que debe la empresa. `computeApprovedAmount` la restaba hasta el 2026-10-20 y un ciclo saldado (adelanto 100.000, gastos 60.000, devolución 40.000) daba −80.000. Como `estadoTrasDecisionReporte` manda al banco solo si el monto es mayor que cero, la rendición quedaba en `approved` y nadie pagaba: 9 de 24 cruzan el cero, por $2.895.638 | La devolución **suma**. Las tres fórmulas de la app coinciden en esto (`saldoDeRendicion`, el cuadre por fondo de `/petty-cash` y ahora `computeApprovedAmount`); si una se toca, mirar las otras dos |
| Sumar las dos vías por las que está anotado el mismo pago | El reembolso al empleado figura como ítem `advance`, como `reimbursed_amount` en la cabecera, o **las dos a la vez**, y nada dice cuál se usó. Sumarlas cuenta la plata dos veces: así el distintivo viejo informaba «Exceso de reembolso $30.080» en una rendición a la que faltaba pagarle $4.000 | `max(vía de los ítems, vía de la cabecera)`, nunca la suma — `saldoDeRendicion`. Medido en las 155 rendiciones: 59 quedan en cero con `max()` y 27 sumando. Es el mismo error que «sumar adelantos y gastos en un KPI de total» |
| Leer `approved_amount` como si fuera el neto | Lo es en **1 de 155** filas. En las otras 149 es la suma de los gastos aprobados: `commitHistoricalImport` lo escribe así, y solo `revertReimbursement` lo recalcula con `computeApprovedAmount`. Una columna que cambia de significado según la historia de su fila no puede sostener una comparación | Calcular de los ítems. Antes de comparar contra una columna de cabecera, **consultar qué significa hoy en los datos reales**, no qué dice su nombre |
| Mostrar un distintivo solo cuando alguien marcó el documento | El de cuadre exigía `status = 'reimbursed'`, así que las 115 rendiciones con saldo **sin** esa marca no mostraban nada: justo las que hay que revisar. Un indicador que depende de que alguien se haya acordado de marcar no informa de lo que falta | Mostrarlo en cuanto el documento está decidido (`ESTADOS_APROBADOS`) y calcularlo de los datos, no de la marca |
| Ofrecer en un filtro una opción cuya respuesta siempre es cero | La nómina no trae a la gente de la papelera (`getOrgEmployees` filtra `deleted_at`), así que un estado «en la papelera» habría devuelto 0 siempre. Un filtro que miente una vez enseña a desconfiar de todos | Las opciones salen de lo que la pantalla PUEDE mostrar, no del dominio entero. Lo mismo con el chip de Proyecto, que no se dibuja mientras el catálogo de obras esté vacío |
