# Handoff: Mi rendición — Reforma visual completa

## Overview

Este paquete contiene los archivos listos para implementar la reforma visual completa de **Mi rendición** (antes "Rindegastos") en el codebase de Next.js.

**Cambios principales:**
- Color de marca: `indigo` → **teal** (`#0D9488`)
- Fuentes: Plus Jakarta Sans + Manrope → **Bricolage Grotesque** (display) + **Hanken Grotesk** (UI) + **Geist Mono** (cifras)
- Íconos: emoji → **Lucide React**
- Sidebar: `slate-900` → **ink** (`#0B1120`, azul-negro frío)
- Botones: radios más generosos (8px → 14px)
- Cards: radios más generosos (12px → 18px)
- Hero KPI: degradé teal (`linear-gradient(130deg, #0B1120, #0F766E)`)
- Nombre del app: "Rindegastos — PENTA" → **"Mi rendición"**

## ⚠️ Sobre estos archivos

Los archivos en `design_refs/` son **prototipos de diseño en HTML** — referencias visuales del resultado esperado, no código de producción para copiar directamente. El trabajo de Claude Code es **recrear esos diseños en el codebase Next.js existente** usando sus patrones y componentes establecidos.

Los archivos en `code/` sí son **reemplazos directos** — copiar y pegar sobre los archivos originales.

## Fidelidad

**Alta fidelidad (hifi):** Los prototipos HTML son pixel-perfect con colores, tipografía, espaciado e interacciones finales. Recrear fielmente usando las librerías existentes del codebase.

---

## Pasos de implementación

### 1. Instalar dependencias

```bash
npm install geist lucide-react
```

- `geist` — Geist Mono de Vercel (fuente para cifras monetarias)
- `lucide-react` — íconos SVG (reemplaza emoji en Sidebar y otros componentes)

### 2. Reemplazar archivos

Copiar cada archivo de `code/` sobre su equivalente en el proyecto:

| Archivo en este paquete | Destino en el proyecto |
|---|---|
| `code/globals.css` | `src/app/globals.css` |
| `code/layout.tsx` | `src/app/layout.tsx` |
| `code/Sidebar.tsx` | `src/components/layout/Sidebar.tsx` |
| `code/constants.ts` | `src/lib/constants.ts` |
| `code/Button.tsx` | `src/components/ui/Button.tsx` |
| `code/Badge.tsx` | `src/components/ui/Badge.tsx` |
| `code/AdminKpiHero.tsx` | `src/components/ui/AdminKpiHero.tsx` (nuevo) |

### 3. Usar AdminKpiHero en el dashboard

En `src/app/(app)/admin/page.tsx` y `src/app/(app)/admin/reports/page.tsx`, reemplazar los bloques de KPI cards por el nuevo componente:

```tsx
import { AdminKpiHero } from '@/components/ui/AdminKpiHero'

// Dashboard admin:
<AdminKpiHero
  title="Movimiento total del mes"
  total={totalAmount}
  secondary={[
    { label: 'Por aprobar', value: pendingAmount, color: 'amber' },
    { label: 'Sin reembolsar', value: unreimbursedAmount, color: 'emerald' },
  ]}
/>

// Rendiciones (resumen filtrado):
<AdminKpiHero
  title="Resumen filtrado"
  total={totalRendido}
  secondary={[
    { label: 'Total aprobado', value: totalAprobado, color: 'teal' },
    { label: 'Pendiente reembolso', value: pendingReimb, color: 'sky' },
  ]}
/>
```

### 4. Reemplazar íconos en otros componentes

Buscar cualquier uso de emoji como íconos de UI (`🏠`, `📷`, `✅`, etc.) y reemplazarlos con Lucide:

```tsx
import { LayoutDashboard, ScanLine, CheckCircle2, BarChart3,
         ReceiptText, Users, Settings2, Banknote, Bell } from 'lucide-react'
```

Mapeo completo:
| Emoji | Lucide | Uso |
|---|---|---|
| 🏠 | `LayoutDashboard` | Estado |
| 📷 | `ScanLine` | Nueva rendición |
| ✅ | `CheckCircle2` | Aprobaciones |
| 📊 | `BarChart3` | Dashboard Admin |
| 📋 | `ReceiptText` | Rendiciones |
| 👥 | `Users` | Empleados |
| ⚙️ | `Settings2` | Configuración |
| 💸 | `Banknote` | Reembolsos |
| 🔔 | `Bell` | Alertas |
| 🧾 | `ReceiptText` | Empty states |
| ✨ | `Sparkles` | IA / OCR |

---

## Design tokens de referencia

### Colores

| Token | Valor | Uso |
|---|---|---|
| `--color-brand` | `#0D9488` | Acciones primarias, links activos |
| `--color-brand-hover` | `#0F766E` | Hover en botones/links |
| `--color-sidebar` | `#0B1120` | Fondo del sidebar |
| `--color-ink-50` | `#F6F8FB` | Fondo de la app |
| Status aprobada | emerald | `bg-emerald-100 text-emerald-700` |
| Status pendiente | amber | `bg-amber-100 text-amber-700` |
| Status rechazada | rose | `bg-rose-100 text-rose-600` |
| Status reembolsada | sky | `bg-sky-100 text-sky-700` |
| Status revisión N2 | violet | `bg-violet-100 text-violet-700` |

### Fuentes

| Variable | Familia | Uso |
|---|---|---|
| `--font-bricolage` | Bricolage Grotesque | Títulos, heroes, cifras grandes |
| `--font-hanken` | Hanken Grotesk | UI, body, labels, inputs |
| `--font-geist-mono` | Geist Mono | Montos CLP/USD, tabular-nums |

### Clases utilitarias clave

```html
<!-- Títulos de página -->
<h1 class="font-bricolage font-extrabold text-2xl tracking-tight text-ink-900">

<!-- Monto monetario -->
<span class="font-mono-amount text-lg">$ 235.400</span>

<!-- Hero degradé -->
<div class="bg-card-hero rounded-xl p-6">

<!-- Card estándar -->
<div class="bg-white rounded-card shadow-card border border-ink-200">

<!-- Botón primario (sin cambios necesarios en JSX) -->
<Button variant="primary">Confirmar</Button>
```

---

## Archivos de referencia visual

Ver `design_refs/` para los prototipos HTML del diseño final:
- `design_refs/index.html` — UI Kit completo interactivo (login + todas las pantallas)
- `design_refs/Landing Page.html` — Landing page de marketing

Abrir en el browser directamente (no requieren build).

---

## Notas y caveats

1. **Fuente Bricolage Grotesque** — cargada via `next/font/google`. Si hay restricciones de CDN en producción, descargar desde Google Fonts y servir localmente con `@font-face`.

2. **Geist Mono** — instalado via `npm install geist`. Es el paquete oficial de Vercel, seguro de usar en proyectos Next.js.

3. **Lucide React** — peer dependency de React 16+. Compatible con Next.js 15/16.

4. **Nombre del app** — actualizado de "Rindegastos — PENTA" a "Mi rendición" en `layout.tsx`. Si hay referencias hardcodeadas en otros archivos, buscar y reemplazar globalmente.

5. **`rounded-item` y `rounded-card`** — el radius aumentó (8px→14px y 12px→18px). Revisar visualmente que no haya elementos que se vean demasiado redondeados con el cambio.

---

*Diseño creado en el proyecto Mi rendición — Design System. Prototipos en `design_refs/` sirven como fuente de verdad visual.*
