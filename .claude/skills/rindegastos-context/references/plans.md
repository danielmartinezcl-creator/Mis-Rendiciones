# Planes de implementación — Rindegastos

## Plan B — Dashboard + OCR + CRUD (próximo)

### Objetivo
Que un empleado pueda crear una rendición completa: foto → OCR → ítem confirmado → enviar.

### Archivos a crear

#### Server Actions
- `src/actions/ocr.ts` — recibe File, llama Anthropic Sonnet 4.6, retorna `{merchant, amount, currency, date, doc_type}`
- `src/actions/exchange-rate.ts` — recibe `{currency, date}`, llama ExchangeRate-API histórica, retorna `{rate, source_date}`
- `src/actions/expenses.ts` — CRUD: createReport, addItem, submitReport, getMyReports, getReportById

#### Componentes
- `src/components/expenses/PhotoUpload.tsx` — input `capture="environment"`, preview, llama `ocr` action
- `src/components/expenses/ExpenseItemForm.tsx` — formulario con TC dinámico (useTransition + exchange-rate action)
- `src/components/expenses/ExpenseItemCard.tsx` — muestra ítem con estado badge
- `src/components/expenses/ExpenseReportCard.tsx` — tarjeta de rendición para listas

#### Páginas
- `src/app/(app)/page.tsx` — Dashboard: hero card saldo pendiente, lista rendiciones activas, CTA nueva rendición
- `src/app/(app)/expenses/new/page.tsx` — wizard: crear cabecera → agregar ítems → enviar
- `src/app/(app)/expenses/[id]/page.tsx` — detalle rendición + items + estado
- `src/app/(app)/reimbursements/page.tsx` — historial reembolsadas

### Notas OCR
```typescript
// Costo estimado: ~$0.008 por foto con Sonnet 4.6
// Prompt sugerido: extraer merchant, amount, currency, date, doc_type
// Siempre permitir al usuario corregir — el OCR es sugerencia, no fuente de verdad
```

---

## Plan C — Aprobaciones + Admin + Export + PWA

### Objetivo
Flujo completo de aprobación y herramientas de administración.

### Archivos a crear

#### Server Actions
- `src/actions/approvals.ts` — approveReport, rejectItem, approveAllItems, markReimbursed
- `src/actions/notifications.ts` — sendSubmissionEmail, sendApprovalEmail (usa Resend)

#### Páginas aprobador
- `src/app/(app)/approvals/page.tsx` — inbox ordenado por más antiguas primero
- `src/app/(app)/approvals/[id]/page.tsx` — revisión ítem por ítem con foto

#### Páginas admin
- `src/app/(app)/admin/page.tsx` — KPIs: pendientes, monto total, reembolsadas
- `src/app/(app)/admin/reports/page.tsx` — todas las rendiciones con filtros
- `src/app/(app)/admin/employees/page.tsx` — gestión empleados + asignación políticas
- `src/app/(app)/admin/settings/page.tsx` — categorías, políticas de aprobación

#### Export
- `src/lib/export/excel.ts` — SheetJS client-side
- `src/lib/export/pdf.ts` — jsPDF + jspdf-autotable client-side

#### PWA
- `public/manifest.json`
- `public/icons/` (varios tamaños)
- `next.config.ts` — agregar withPWA wrapper

### Deploy Vercel
- Variables de entorno requeridas: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `ANTHROPIC_API_KEY`, `RESEND_API_KEY`, `EXCHANGE_RATE_API_KEY`
- Región: iad1 (us-east-1) o sfo1 — evaluar latencia a Supabase sa-east-1
