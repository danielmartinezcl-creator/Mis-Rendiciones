# App Rindegastos PENTA — Spec de Diseño
**Fecha:** 2026-06-01  
**Estado:** Aprobado por Daniel Martínez  
**Objetivo:** Aplicación SaaS de rendición de gastos, multi-tenant, pensada para salir al mercado como producto pago. PENTA y Cía. es el cliente #1 (beta).

---

## 1. Visión del producto

App web PWA (Progressive Web App) de gestión de rendiciones de gastos empresariales. Los empleados capturan boletas/facturas desde el celular, las envían a aprobación, y reciben reembolso. Inspirado en Rindegastos pero diferenciado en diseño, UX y modelo de datos.

**Mercado inicial:** Chile (tipos de documento chilenos, CLP como moneda base, expansión LATAM posterior).  
**Modelo de negocio:** SaaS, suscripción por organización. PENTA beta gratuita.

---

## 2. Stack tecnológico

| Capa | Tecnología |
|------|-----------|
| Frontend | Next.js 15 (App Router) + TypeScript |
| Estilos | Tailwind CSS |
| PWA | next-pwa |
| Base de datos | Supabase (PostgreSQL + RLS) — proyecto **separado** de fintrack |
| Auth | Supabase Auth (email/password + magic link) |
| Storage | Supabase Storage (fotos y PDFs de documentos) |
| OCR v1 | Claude Sonnet 4.6 via Anthropic API (Server Actions) |
| IA Asistente v2/v3 | Claude Opus 4.8 — aprobador y chat admin |
| Email | Resend |
| Tipo de cambio | ExchangeRate-API (histórico por fecha) |
| Deploy | Vercel |

**Supabase:** proyecto nuevo, independiente del fintrack existente. URL y keys propias.  
**Costo estimado infraestructura v1:** $0/mes (Supabase free tier, Vercel free, Resend free hasta 3k emails/mes).

---

## 3. Arquitectura del sistema

```
[Browser / PWA móvil]
        ↕ HTTPS
[Next.js 15 en Vercel]
  ├── App Router (páginas + layouts por rol)
  ├── Server Actions (OCR, emails, lógica de negocio)
  └── Supabase Client (auth + realtime)
        ↕
[Supabase]
  ├── PostgreSQL (tablas + RLS)
  ├── Auth (JWT, sesiones)
  └── Storage (fotos boletas)
        ↕
[APIs externas]
  ├── Anthropic API → Claude Haiku (OCR)
  ├── ExchangeRate-API (tipo de cambio histórico)
  └── Resend (emails transaccionales)
```

La lógica sensible (llamadas a Claude, generación de PDFs, validaciones de negocio) corre exclusivamente en **Server Actions de Next.js** — nunca expone API keys al cliente.

---

## 4. Roles y permisos

### 4.1 Rendidor (Empleado)
- Crea rendiciones con N ítems
- Sube fotos de boletas/facturas (OCR automático)
- Envía rendición a aprobación
- Ve estado de sus propias rendiciones
- Ve historial de reembolsos recibidos
- **No puede:** ver rendiciones de otros, aprobar

### 4.2 Aprobador (Supervisor/Jefe)
- Ve rendiciones de los empleados asignados a su política
- Aprueba o rechaza **ítem por ítem** (con motivo de rechazo obligatorio al rechazar)
- Puede aprobar la rendición completa en un clic
- Puede devolver a borrador con comentario
- También puede ser rendidor simultáneamente
- **No puede:** marcar como reembolsado, gestionar usuarios

### 4.3 Administrador (Contabilidad/Finanzas)
- Todo lo del aprobador, sobre todas las rendiciones de la organización
- Marca reembolsos como pagados (con fecha y referencia de pago)
- Dashboard financiero con KPIs
- Exporta Excel y PDF
- Gestiona empleados, aprobadores, categorías, organización

### 4.4 Regla clave de permisos
Los roles no son exclusivos: `can_submit` y `can_approve` son columnas booleanas independientes en `users`. Un usuario puede tener ambos en `true`.

---

## 5. Flujo de estados de una rendición

```
[BORRADOR] → (empleado envía) → [ENVIADA]
[ENVIADA]  → (aprobador decide) → [APROBADA] | [PARCIALMENTE_APROBADA] | [RECHAZADA]
[APROBADA / PARCIALMENTE_APROBADA] → (admin paga) → [REEMBOLSADA]
[RECHAZADA] → (admin devuelve) → [BORRADOR]
[CUALQUIER_ESTADO] → (admin devuelve) → [BORRADOR]
```

**Aprobación multinivel (preparada en schema, UI en v2):**  
Cuando nivel 1 aprueba → si `approval_policies.levels` tiene nivel 2 → estado pasa a `PENDING_L2` y se notifica al aprobador de nivel 2. En v1 la UI solo permite configurar 1 nivel; el campo `current_level` y el estado `pending_l2` ya existen en el schema para la activación futura sin migración.

---

## 6. Features — Scope v1

### ✅ En v1
| Feature | Detalle |
|---------|---------|
| Crear rendición con N ítems | Empleado crea, agrega ítems, guarda como borrador |
| Captura de foto desde móvil | Cámara nativa del dispositivo vía `<input type="file" capture>` |
| OCR automático | Claude Haiku extrae monto, fecha, proveedor, tipo de doc. Usuario confirma/edita |
| Multi-moneda | CLP (base), USD, EUR, ARS, BRL. API histórica + override manual. Almacena monto original + TC + monto_clp |
| Aprobación ítem por ítem | Aprobador marca ✓/✗ por ítem. Rechazo requiere motivo |
| Notificaciones por email | Envío (empleado→aprobador), aprobación/rechazo (aprobador→empleado), reembolso (admin→empleado) |
| Dashboard rendidor | KPI: total pendiente, en revisión, aprobado. Lista de rendiciones propias |
| Dashboard aprobador | Bandeja de pendientes, lista de rendiciones de su equipo |
| Dashboard admin | KPIs globales, tabla maestra con filtros (estado, empleado, fecha, monto) |
| Exportar Excel | Rendiciones con detalle de ítems, estados, montos |
| Exportar PDF | Rendición individual con fotos adjuntas |
| Marcar como reembolsado | Admin registra fecha de pago y referencia (número de transferencia) |
| Gestión de empleados | Admin crea/edita/desactiva empleados, asigna políticas de aprobación |
| Gestión de categorías | Admin configura categorías (nombre, ícono, tipos de doc requeridos) |
| Gestión de organización | Admin configura nombre, logo, moneda base |

### ❌ Fuera de v1 (v2)
- Límites de gasto por categoría (políticas de montos)
- UI para configurar aprobación multinivel (el schema ya lo soporta)
- Integración SII (Chile)
- Integración con fintrack-pro
- Dark mode completo
- Notificaciones push (Web Push API)

---

## 7. Modelo de datos Supabase

### 7.1 Tablas principales

```sql
-- Multi-tenant: cada empresa cliente
organizations (
  id uuid PK,
  name text,
  slug text UNIQUE,         -- usado en URL y lookup
  country text DEFAULT 'CL',
  currency text DEFAULT 'CLP',
  plan text DEFAULT 'free', -- 'free'|'pro'|'enterprise'
  logo_url text,
  created_at timestamptz
)

-- Extiende auth.users de Supabase
users (
  id uuid PK REFERENCES auth.users,
  org_id uuid REFERENCES organizations,
  full_name text,
  role text,                -- 'admin'|'approver'|'employee'
  can_submit boolean DEFAULT true,
  can_approve boolean DEFAULT false,
  department text,
  bank_account text,        -- para registro de reembolso
  is_active boolean DEFAULT true,
  created_at timestamptz
)

-- Políticas de aprobación por organización
approval_policies (
  id uuid PK,
  org_id uuid REFERENCES organizations,
  name text,
  levels jsonb,             -- [{level:1, approver_id:"uuid"}, {level:2, approver_id:"uuid"}]
  is_default boolean DEFAULT false
)

-- Políticas asignadas a empleados
employee_policies (
  user_id uuid REFERENCES users,
  policy_id uuid REFERENCES approval_policies,
  PRIMARY KEY (user_id)
)

-- Cabecera de rendición
expense_reports (
  id uuid PK,
  org_id uuid REFERENCES organizations,
  submitter_id uuid REFERENCES users,
  title text,
  description text,
  status text,              -- 'draft'|'submitted'|'pending_l2'|'approved'|'partially_approved'|'rejected'|'reimbursed'
  current_level int DEFAULT 1,
  total_amount numeric,
  approved_amount numeric,
  currency text DEFAULT 'CLP',
  submitted_at timestamptz,
  approved_at timestamptz,
  reimbursed_at timestamptz,
  reimbursed_by uuid REFERENCES users,
  payment_reference text,   -- número de transferencia al reembolsar
  created_at timestamptz,
  updated_at timestamptz
)

-- Ítems individuales de una rendición
expense_items (
  id uuid PK,
  report_id uuid REFERENCES expense_reports,
  org_id uuid REFERENCES organizations,
  description text,
  amount numeric,
  currency text DEFAULT 'CLP',
  exchange_rate numeric,    -- TC usado al momento del ingreso
  exchange_rate_source text, -- 'api'|'manual'
  amount_clp numeric,       -- monto convertido (inmutable después de aprobación)
  date date,                -- fecha del gasto (no de la rendición)
  category_id uuid REFERENCES expense_categories,
  merchant text,
  doc_type text,            -- 'boleta'|'factura'|'factura_exenta'|'ticket'|'otro'
  doc_number text,
  notes text,
  status text DEFAULT 'pending', -- 'pending'|'approved'|'rejected'
  rejection_reason text,
  ocr_raw jsonb,            -- respuesta cruda de Claude Haiku
  ocr_confidence numeric,
  created_at timestamptz
)

-- Archivos adjuntos (Supabase Storage)
attachments (
  id uuid PK,
  item_id uuid REFERENCES expense_items,
  org_id uuid REFERENCES organizations,
  storage_path text,        -- path en Supabase Storage
  file_type text,           -- 'image'|'pdf'
  file_size int,
  thumbnail_path text,
  created_at timestamptz
)

-- Categorías de gasto (globales + por organización)
expense_categories (
  id uuid PK,
  org_id uuid,              -- null = categoría global predefinida
  name text,
  icon text,
  color text,
  required_doc_types text[], -- tipos de doc obligatorios para esta categoría
  is_active boolean DEFAULT true
)

-- Log de auditoría inmutable de aprobaciones
expense_report_approvals (
  id uuid PK,
  report_id uuid REFERENCES expense_reports,
  approver_id uuid REFERENCES users,
  level int,
  action text,              -- 'approved'|'rejected'|'partially_approved'|'returned_to_draft'
  items_approved uuid[],    -- IDs de expense_items aprobados
  items_rejected uuid[],    -- IDs de expense_items rechazados
  notes text,
  created_at timestamptz    -- NUNCA se actualiza, solo se inserta
)

-- Notificaciones in-app
notifications (
  id uuid PK,
  org_id uuid REFERENCES organizations,
  user_id uuid REFERENCES users,
  type text,                -- 'submission'|'approval'|'rejection'|'reimbursement'
  report_id uuid REFERENCES expense_reports,
  read boolean DEFAULT false,
  created_at timestamptz
)
```

### 7.2 RLS (Row Level Security)
- Todas las tablas tienen RLS habilitado
- `org_id` es la barrera principal: ningún usuario ve datos de otra organización
- Rendidores: solo ven sus propias `expense_reports` (WHERE `submitter_id = auth.uid()`)
- Aprobadores: ven rendiciones de empleados con política asignada a ellos
- Admin: ve todo dentro de su `org_id`

---

## 8. Manejo de multi-moneda

**Flujo al agregar un ítem en moneda extranjera:**

1. OCR detecta moneda (ej: ARS, USD, EUR)
2. Server Action llama ExchangeRate-API con la fecha del gasto (histórico)
3. Se muestra al usuario: `ARS 5.000 ≈ CLP 2.847 (TC: 0.5694 al 15/05/2026 — fuente: API oficial)`
4. Usuario puede editar el TC manualmente si difiere del real
5. Se almacena: `amount=5000`, `currency='ARS'`, `exchange_rate=0.5694`, `exchange_rate_source='api'|'manual'`, `amount_clp=2847`
6. El aprobador ve el monto en CLP y puede ver el detalle original

**Principio:** `amount_clp` es inmutable una vez que la rendición se aprueba. El historial contable no cambia con fluctuaciones posteriores del TC.

**Monedas soportadas en v1:** CLP, USD, EUR, ARS, BRL

---

## 9. OCR con Claude Haiku

**Trigger:** empleado sube foto → Server Action llama Claude Sonnet 4.6  
**Prompt:** extrae `monto`, `moneda`, `fecha`, `proveedor`, `tipo_documento`, `numero_documento` de la imagen  
**Respuesta esperada:** JSON estructurado con confidence score  
**Costo estimado:** ~$0.008 por imagen, con prompt caching activo (~90% descuento en el system prompt)  
**Velocidad:** ~1.5s — aceptable con spinner. Haiku sería más rápido (~0.5s) pero falla en docs difíciles.  
**Fallback:** si OCR falla o confidence < 0.7, el formulario se pre-llena vacío y el usuario ingresa manualmente  
**No se bloquea el flujo** por falla de OCR

---

## 10. Diseño visual

### Sistema de diseño

| Elemento | Valor |
|---------|-------|
| **Tipografía UI** | Plus Jakarta Sans (400/600/700/800) |
| **Tipografía montos** | Manrope (700/800) — cero limpio, sin marcas internas |
| **Color primario** | `#4f46e5` Indigo |
| **Header / sidebar** | `#0f172a` Slate oscuro |
| **Card hero** | `linear-gradient(135deg, #312e81, #4c1d95)` |
| **Aprobado** | `#34d399` Esmeralda |
| **En revisión** | `#fbbf24` Ámbar |
| **Rechazado** | `#f87171` Rojo suave |
| **Reembolsado** | `#60a5fa` Azul |
| **Border radius** | `12px` cards, `8px` ítems, `9999px` pills |
| **Sombra** | `0 2px 8px rgba(0,0,0,.08)` cards normales |

### Diferenciadores visuales frente a competidores
1. **Header `#0f172a` extendido** — se fusiona con el notch del teléfono (efecto Revolut/Wise)
2. **Manrope bold para montos** — números grandes, protagonistas, sin ambigüedad
3. **Acento lateral por ítem** — línea de 3px de color indica estado sin necesidad de leer
4. **CTA con lenguaje del usuario** — "Tomá la foto y listo" en vez de "Nueva rendición"
5. **Plus Jakarta Sans** — más carácter que Inter, menos genérico

### Estructura de vistas

**Rendidor (mobile-first):**  
`/` → Dashboard (monto pendiente, contadores, lista reciente, CTA)  
`/expenses/new` → Crear rendición (título → agregar ítems → enviar)  
`/expenses/[id]` → Detalle rendición  
`/reimbursements` → Historial de reembolsos  

**Aprobador (desktop + mobile):**  
`/approvals` → Bandeja de pendientes (estilo email, más urgente primero)  
`/approvals/[id]` → Revisión ítem por ítem con fotos  

**Admin (desktop-first):**  
`/admin` → Dashboard KPIs  
`/admin/reports` → Tabla maestra con filtros + export  
`/admin/employees` → Gestión de empleados  
`/admin/settings` → Organización, categorías, políticas  

---

## 11. Emails transaccionales (Resend)

| Evento | Destinatario | Asunto |
|--------|-------------|--------|
| Rendición enviada | Aprobador | `[Nombre] envió una rendición por $X.XXX` |
| Aprobada total | Rendidor | `✅ Tu rendición fue aprobada — $X.XXX a reembolsar` |
| Aprobada parcial | Rendidor | `⚠️ Tu rendición fue aprobada parcialmente — $X.XXX de $Y.YYY` |
| Rechazada | Rendidor | `❌ Tu rendición fue rechazada — ver motivos` |
| Reembolsada | Rendidor | `💰 Reembolso procesado — $X.XXX (ref: XXXXXXXX)` |

---

## 12. Decisiones de arquitectura clave

| Decisión | Razón |
|---------|-------|
| Next.js sobre Vite SPA | Server Actions para OCR/emails sin exponer API keys al cliente |
| Supabase separado de fintrack | Arquitectura multi-tenant limpia desde día 1; fintrack usa key-value store incompatible |
| `approval_policies.levels` como jsonb | Soporta N niveles sin cambiar schema; UI de nivel 2 se agrega en v2 |
| `amount_clp` inmutable post-aprobación | El historial contable no debe cambiar con fluctuaciones del TC |
| `expense_report_approvals` append-only | Log de auditoría completo: quién aprobó qué, cuándo y qué ítems |
| Sonnet 4.6 para OCR (v1) | Excelente en docs difíciles, 4x más barato que Opus, ~1.5s — óptimo para SaaS escalable |
| Opus 4.8 para IA asistente (v2/v3) | Razonamiento complejo sobre patrones financieros; volumen bajo justifica el costo |
| ExchangeRate-API histórica | El TC del momento del gasto, no de hoy — fundamental para contabilidad |

---

## 13. Out of scope (confirmado)

- Límites de gasto por categoría (v2)
- UI aprobación multinivel (v2, schema ya listo)
- Integración SII Chile (v2)
- Integración fintrack-pro (v2)
- Notificaciones push Web API (v2)
- Dark mode (v2)
- App nativa iOS/Android (nunca — PWA es suficiente)
- Billing/pagos para clientes (v2 — primero validar producto)

---

## 14. Roadmap de Inteligencia Artificial

La infraestructura de v1 (Opus 4.8, historial en Postgres, patrones por empleado/categoría) está diseñada para soportar estas capas de IA sin reescritura.

### Capa 1 — Asistente al Rendidor (v2, alto impacto)
Interviene en el momento de mayor fricción: ingresar datos del ítem.

- **Post-OCR inteligente:** "Esto parece un taxi, ¿lo categorizamos como Transporte?" — confirmación con un toque
- **Memoria de patrones:** "Generalmente cargás almuerzo de clientes a Explotación — ¿igual esta vez?"
- **Alerta de anomalía:** "Este monto en USD es inusualmente alto para esta categoría, ¿revisaste el tipo de cambio?"
- **Autocompletado de proveedor** basado en historial de la organización

### Capa 2 — Asistente al Aprobador (v2, diferenciador clave)
Reduce el tiempo de revisión y mejora la calidad de las decisiones.

- **Resumen pre-revisión en lenguaje natural:** *"Juan rinde 3 ítems por $145.000. El almuerzo supera su promedio histórico en 40%. Los otros dos son consistentes."*
- **Detección de anomalías automática:** montos duplicados, proveedor nunca usado, fecha fuera del período laboral
- **Motivo de rechazo predrafteado:** el aprobador edita en lugar de escribir desde cero
- **Historial de comportamiento del rendidor:** "Juan ha tenido 2 rechazos por monto de almuerzo en los últimos 3 meses"

### Capa 3 — Asistente al Administrador (v3, feature premium)
Convierte los datos de gastos en inteligencia financiera conversacional.

- **Chat de consulta:** *"¿Cuánto gastó el equipo de ventas en viajes en el Q1?"*
- **Detección de patrones entre equipos:** *"El equipo de operaciones gasta 3x más en taxi que el promedio"*
- **Sugerencias de política:** *"Podrías limitar almuerzos de clientes a $35.000 — el 80% ya está por debajo"*
- **Alertas proactivas de gasto:** notifica cuando un equipo supera el ritmo histórico mensual

### Modelo recomendado por capa

| Capa | Tarea | Modelo | Razón |
|------|-------|--------|-------|
| v1 OCR | Extracción estructurada de documentos | Opus 4.8 | Máxima precisión en docs deteriorados |
| v2 Asistente rendidor | Categorización, alertas, autocompletado | Sonnet 4.6 | Balance velocidad/costo para respuestas inline |
| v2 Asistente aprobador | Resúmenes, detección anomalías | Opus 4.8 | Razonamiento complejo sobre patrones |
| v3 Chat admin | Consultas en lenguaje natural sobre datos | Opus 4.8 | Comprensión profunda del contexto financiero |
