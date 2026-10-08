# Filtro del empleado — Plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Un solo filtro de chips —proyecto, tipo de gasto, fecha, estado (y empleado para quien administra fondos)— en «Mis rendiciones» y en «Caja chica», «Rendiciones» en la barra de abajo, y «Mis gastos» con total aprobado, pendiente y promedio de rendiciones y caja chica.

**Architecture:** Las reglas (qué documento entra, qué suma, cómo se agrupan los estados) viven en módulos puros de `src/lib/` con pruebas. Las pantallas cargan los documentos del usuario con un resumen de sus gastos una sola vez y filtran en el navegador; el filtro se guarda en la dirección de la página. Un componente `BarraFiltros` (chips + hoja de opciones) sirve a las dos pantallas.

**Tech Stack:** Next.js 16.2 (App Router), React 19, TypeScript, Tailwind v4, Supabase, Vitest + Testing Library, Playwright (línea base visual).

**Spec:** `docs/superpowers/specs/2026-10-07-filtro-del-empleado-design.md` — leerla antes de empezar. Diseños aprobados: https://claude.ai/artifact/LXLQ3CbUgYbaSPYk8jRMkZ (Daniel eligió la **A**).

## Global Constraints

- Next.js 16: protección de rutas en `src/proxy.ts`; **toda función exportada en `src/actions/*.ts` es `async`**; los ayudantes puros van en `src/lib/` y las pruebas los importan de ahí. Nunca `export type { X }` re-exportado desde un archivo `'use server'`.
- `AGENTS.md`: antes de usar una API de Next, leer su guía en `node_modules/next/dist/docs/`. Para el filtro en la dirección: `01-app/01-getting-started/03-layouts-and-pages.md` (§ «Rendering with search params»: `searchParams` es una `Promise`) y `04-linking-and-navigating.md` (`window.history.replaceState` se integra con el router).
- Tailwind v4: no existe `tailwind.config.*`; nada de crearlo.
- Tornasol: **ningún dato apoyado en el degradado** — chips, hojas y listas van sobre `.hoja` (blanco). Ningún hexadecimal en un componente: clases de la paleta o `var(--cta-brand)`. Íconos de Lucide, nunca emoji. Radios `rounded-item` / `rounded-card`. Piso tipográfico de 11 px.
- Nunca `confirm()` ni `alert()`: `confirmar()` y `avisar()` de `useDialogos()`.
- Los correos están pausados (`CORREO_PAUSADO=1`) por decisión de Daniel. Nada de este plan manda correo; no tocar esa variable.
- **El servidor local escribe en la base REAL.** Al verificar en el navegador: solo navegar, abrir chips y mirar. Nunca invitar, aprobar, cargar, autorizar ni contabilizar; nunca hacer clic por posición, siempre por nombre.
- Se trabaja en `main`, como en los planes anteriores. **Subir a GitHub solo con el OK de Daniel** (Tarea 10).
- Commits: mensaje en español, terminado en `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- Verificación de cada tarea con código: `npx vitest run` (todo en verde), `npx tsc --noEmit` (sin salida), `npx eslint .` (**0 errores**; hoy hay 22 avisos, no subir ese número).
- No correr `next build` con `next dev` andando: los dos escriben en `.next` y dejan todas las rutas en 404. Parar el servidor y `rm -rf .next` antes de construir.

## Estructura de archivos

| Archivo | Responsabilidad |
|---|---|
| `src/lib/filtro-documentos.ts` (nuevo) | Tipos del filtro y del documento, `aplicarFiltro`, `rangoDeFecha`, conteos, estados, conversión desde las filas de la base |
| `src/lib/filtro-url.ts` (nuevo) | El filtro ↔ la dirección de la página; depurar valores que ya no existen |
| `src/lib/filtro-etiquetas.ts` (nuevo) | Los textos: qué dice cada chip, la línea de resultado, la de cada tarjeta |
| `src/lib/mis-gastos.ts` (nuevo) | Los indicadores, el gráfico y la tabla de «Mis gastos» desde gastos ya cargados |
| `src/lib/opciones-filtro.ts` (nuevo) | Nombres de proyectos y categorías para los chips (con el cliente de quien consulta) |
| `src/lib/navegacion.ts` (nuevo) | Qué pestañas lleva la barra de abajo según el perfil |
| `src/components/filtros/BarraFiltros.tsx` (nuevo) | Chips + línea de resultado |
| `src/components/filtros/HojaOpciones.tsx` (nuevo) | La hoja (teléfono) o el menú (escritorio) de un chip |
| `src/app/(app)/reimbursements/MisRendiciones.tsx` (nuevo) | La lista filtrable de rendiciones |
| `src/actions/expenses.ts` | `getMisRendicionesFiltrables`, `getMisGastos` (reemplaza a `getMyMonthlySummary`) |
| `src/actions/petty-cash.ts` | `listPettyCashFunds` (solo los míos + resumen de gastos), `getPettyCashItemsForReport` (chips) |
| `src/app/(app)/petty-cash/*` | Chips en lugar de `FundFilters`; exportar sin «Buscar» |
| `src/app/(app)/mis-gastos/page.tsx`, `src/app/(app)/page.tsx` | Indicadores nuevos; «Ver todas» siempre |
| `src/components/layout/MobileNav.tsx`, `Sidebar.tsx` | «Mis rendiciones» |
| `src/app/(app)/petty-cash/FundFilters.tsx` | **Se borra** |

---

## Task 1: Las reglas del filtro

**Files:**
- Create: `src/lib/filtro-documentos.ts`
- Test: `src/tests/filtro-documentos.test.ts`

**Interfaces:**
- Consumes: `FAMILIA_REPORTE`, `FAMILIA_FONDO`, `FamiliaEstado`, `ReportStatus`, `FundStatusConst` de `@/lib/constants`.
- Produces (todo exportado desde `@/lib/filtro-documentos`):
  - `interface GastoFiltrable { categoriaId: string | null; fecha: string; montoClp: number; rechazado: boolean }`
  - `interface DocumentoFiltrable { id: string; proyectoId: string | null; familia: FamiliaEstado; beneficiarioId: string; creadoEl: string; gastos: GastoFiltrable[] }`
  - `type PresetFecha = 'este-mes' | 'mes-pasado' | 'ultimos-3' | 'este-anio' | 'elegir'`
  - `interface Filtro { proyectos: string[]; categorias: string[]; fecha: PresetFecha | null; desde: string | null; hasta: string | null; estados: FamiliaEstado[]; empleados: string[] }`
  - `const SIN_PROYECTO = 'sin'`, `const FILTRO_VACIO: Filtro`, `function hayFiltro(f: Filtro): boolean`
  - `function fechaEnChile(fecha?: Date): string` (YYYY-MM-DD en America/Santiago)
  - `function rangoDeFecha(f: Pick<Filtro, 'fecha' | 'desde' | 'hasta'>, hoy: string): { desde: string | null; hasta: string | null }`
  - `interface Coincidencia<T> { doc: T; gastos: GastoFiltrable[]; montoClp: number }`, `interface ResultadoFiltro<T> { visibles: Coincidencia<T>[]; totalClp: number; totalGastos: number }`
  - `function aplicarFiltro<T extends DocumentoFiltrable>(docs: T[], filtro: Filtro, hoy: string): ResultadoFiltro<T>`
  - `function contarPorCategoria(docs: DocumentoFiltrable[]): Map<string, number>`
  - `function esGasto(itemType: string | null | undefined): boolean`
  - `function historicaEntraEnExportacion(f: Filtro): boolean`
  - `function documentoDeRendicion(r, items): DocumentoFiltrable`, `function documentoDeFondo(f, items): DocumentoFiltrable`
  - `const ETIQUETAS_ESTADO: Record<'rendicion' | 'fondo', Record<FamiliaEstado, string>>`, `const ORDEN_FAMILIAS: FamiliaEstado[]`
  - `interface OpcionesFiltro { proyectos: { id: string; numero: string; nombre: string | null }[]; categorias: { id: string; name: string }[] }`
  - `interface RendicionFiltrable extends DocumentoFiltrable { title: string; status: ReportStatus; total_amount: number; approved_amount: number; currency: string | null; submitted_at: string | null; created_at: string; reimbursed_at: string | null; payment_reference: string | null }`

- [ ] **Step 1: Escribir las pruebas**

Crear `src/tests/filtro-documentos.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import {
  aplicarFiltro, rangoDeFecha, contarPorCategoria, hayFiltro, esGasto, fechaEnChile,
  documentoDeRendicion, documentoDeFondo, historicaEntraEnExportacion,
  FILTRO_VACIO, SIN_PROYECTO,
  type DocumentoFiltrable, type Filtro, type GastoFiltrable,
} from '@/lib/filtro-documentos'

const HOY = '2026-10-07'
const g = (categoriaId: string | null, fecha: string, montoClp: number, rechazado = false): GastoFiltrable =>
  ({ categoriaId, fecha, montoClp, rechazado })
const doc = (id: string, over: Partial<DocumentoFiltrable> = {}): DocumentoFiltrable => ({
  id, proyectoId: null, familia: 'en-curso', beneficiarioId: 'ana', creadoEl: '2026-09-01', gastos: [], ...over,
})
const filtro = (over: Partial<Filtro>): Filtro => ({ ...FILTRO_VACIO, ...over })
const ids = (r: { visibles: { doc: { id: string } }[] }) => r.visibles.map(v => v.doc.id)

describe('aplicarFiltro — chips de documento', () => {
  const docs = [
    doc('a', { proyectoId: 'p1', familia: 'en-curso', beneficiarioId: 'ana' }),
    doc('b', { proyectoId: null, familia: 'resuelto', beneficiarioId: 'beto' }),
    doc('c', { proyectoId: 'p2', familia: 'atencion', beneficiarioId: 'ana' }),
  ]

  it('sin filtro entran todos', () => {
    expect(ids(aplicarFiltro(docs, FILTRO_VACIO, HOY))).toEqual(['a', 'b', 'c'])
  })

  it('«Sin proyecto» es el documento sin proyecto', () => {
    expect(ids(aplicarFiltro(docs, filtro({ proyectos: [SIN_PROYECTO] }), HOY))).toEqual(['b'])
  })

  it('dentro de un chip las opciones se suman (O)', () => {
    expect(ids(aplicarFiltro(docs, filtro({ proyectos: ['p1', 'p2'] }), HOY))).toEqual(['a', 'c'])
  })

  it('entre chips se exigen todos (Y)', () => {
    const f = filtro({ estados: ['en-curso', 'atencion'], empleados: ['ana'], proyectos: ['p2'] })
    expect(ids(aplicarFiltro(docs, f, HOY))).toEqual(['c'])
  })
})

describe('aplicarFiltro — tipo de gasto y fecha', () => {
  it('entra si tiene un gasto no rechazado de la categoría, y suma solo esos', () => {
    const d = doc('a', { gastos: [g('comb', '2026-09-03', 1000), g('alim', '2026-09-04', 500), g('comb', '2026-09-05', 300)] })
    const r = aplicarFiltro([d], filtro({ categorias: ['comb'] }), HOY)
    expect(r.visibles[0].gastos).toHaveLength(2)
    expect(r.totalClp).toBe(1300)
    expect(r.totalGastos).toBe(2)
  })

  it('un gasto rechazado de la categoría no hace entrar al documento ni suma', () => {
    const d = doc('a', { gastos: [g('comb', '2026-09-03', 1000, true), g('alim', '2026-09-04', 500)] })
    expect(aplicarFiltro([d], filtro({ categorias: ['comb'] }), HOY).visibles).toEqual([])
  })

  it('tipo de gasto y fecha los tiene que cumplir el MISMO gasto', () => {
    const d = doc('a', { gastos: [g('comb', '2026-08-20', 1000), g('alim', '2026-09-10', 500)] })
    expect(aplicarFiltro([d], filtro({ categorias: ['comb'], fecha: 'mes-pasado' }), HOY).visibles).toEqual([])
  })

  it('con fecha, suma solo los gastos del rango', () => {
    const d = doc('a', { gastos: [g('comb', '2026-08-20', 1000), g('alim', '2026-09-10', 500)] })
    expect(aplicarFiltro([d], filtro({ fecha: 'mes-pasado' }), HOY).totalClp).toBe(500)
  })

  it('un documento sin gastos se juzga por su fecha de creación', () => {
    const vacio = doc('a', { creadoEl: '2026-09-15', gastos: [] })
    expect(ids(aplicarFiltro([vacio], filtro({ fecha: 'mes-pasado' }), HOY))).toEqual(['a'])
    expect(ids(aplicarFiltro([vacio], filtro({ fecha: 'este-mes' }), HOY))).toEqual([])
  })

  it('un documento sin gastos nunca entra con tipo de gasto', () => {
    const vacio = doc('a', { creadoEl: '2026-09-15', gastos: [] })
    expect(aplicarFiltro([vacio], filtro({ categorias: ['comb'] }), HOY).visibles).toEqual([])
  })

  it('un documento con todos sus gastos rechazados no entra con fecha', () => {
    const d = doc('a', { creadoEl: '2026-09-15', gastos: [g('comb', '2026-09-03', 1000, true)] })
    expect(aplicarFiltro([d], filtro({ fecha: 'mes-pasado' }), HOY).visibles).toEqual([])
  })

  it('«Sin proyecto» combinado con tipo de gasto', () => {
    const docs = [
      doc('a', { proyectoId: null, gastos: [g('comb', '2026-09-03', 100)] }),
      doc('b', { proyectoId: 'p1', gastos: [g('comb', '2026-09-03', 200)] }),
      doc('c', { proyectoId: null, gastos: [g('alim', '2026-09-03', 300)] }),
    ]
    const r = aplicarFiltro(docs, filtro({ proyectos: [SIN_PROYECTO], categorias: ['comb'] }), HOY)
    expect(ids(r)).toEqual(['a'])
    expect(r.totalClp).toBe(100)
  })

  it('sin tipo ni fecha, los totales cuentan todos los gastos no rechazados', () => {
    const d = doc('a', { gastos: [g('comb', '2026-09-03', 1000), g('alim', '2026-09-04', 500, true)] })
    expect(aplicarFiltro([d], FILTRO_VACIO, HOY).totalClp).toBe(1000)
  })
})

describe('rangoDeFecha', () => {
  const r = (fecha: Filtro['fecha'], hoy: string, desde: string | null = null, hasta: string | null = null) =>
    rangoDeFecha({ fecha, desde, hasta }, hoy)

  it('sin fecha, sin rango', () => {
    expect(r(null, HOY)).toEqual({ desde: null, hasta: null })
  })
  it('este mes, del 1 al último día', () => {
    expect(r('este-mes', '2026-02-10')).toEqual({ desde: '2026-02-01', hasta: '2026-02-28' })
  })
  it('año bisiesto', () => {
    expect(r('este-mes', '2028-02-03').hasta).toBe('2028-02-29')
  })
  it('mes pasado cruza el año en enero', () => {
    expect(r('mes-pasado', '2026-01-15')).toEqual({ desde: '2025-12-01', hasta: '2025-12-31' })
  })
  it('últimos 3 meses arranca el 1 del mes de hace dos', () => {
    expect(r('ultimos-3', '2026-02-10')).toEqual({ desde: '2025-12-01', hasta: '2026-02-10' })
  })
  it('este año, del 1 de enero a hoy', () => {
    expect(r('este-anio', HOY)).toEqual({ desde: '2026-01-01', hasta: HOY })
  })
  it('elegir fechas con una sola deja el otro lado abierto', () => {
    expect(r('elegir', HOY, '2026-09-01', null)).toEqual({ desde: '2026-09-01', hasta: null })
  })
})

describe('apoyos', () => {
  it('hayFiltro', () => {
    expect(hayFiltro(FILTRO_VACIO)).toBe(false)
    expect(hayFiltro(filtro({ fecha: 'este-mes' }))).toBe(true)
    expect(hayFiltro(filtro({ empleados: ['ana'] }))).toBe(true)
  })

  it('contarPorCategoria no cuenta rechazados ni gastos sin categoría', () => {
    const m = contarPorCategoria([doc('a', {
      gastos: [g('comb', '2026-09-01', 1), g('comb', '2026-09-01', 1, true), g(null, '2026-09-01', 1)],
    })])
    expect(m.get('comb')).toBe(1)
    expect(m.size).toBe(1)
  })

  it('esGasto: solo expense o sin tipo', () => {
    expect(esGasto('expense')).toBe(true)
    expect(esGasto(null)).toBe(true)
    expect(esGasto(undefined)).toBe(true)
    expect(esGasto('advance')).toBe(false)
    expect(esGasto('return')).toBe(false)
    expect(esGasto('transfer')).toBe(false)
  })

  it('fechaEnChile: a las 23:30 de Chile sigue siendo el mismo día', () => {
    // 2026-10-08T02:30Z = 2026-10-07 23:30 en Chile (UTC-3, horario de verano)
    expect(fechaEnChile(new Date('2026-10-08T02:30:00Z'))).toBe('2026-10-07')
  })

  it('la carga histórica entra en la exportación salvo que los chips la excluyan', () => {
    expect(historicaEntraEnExportacion(FILTRO_VACIO)).toBe(true)
    expect(historicaEntraEnExportacion(filtro({ proyectos: ['p1'] }))).toBe(false)
    expect(historicaEntraEnExportacion(filtro({ proyectos: ['p1', SIN_PROYECTO] }))).toBe(true)
    expect(historicaEntraEnExportacion(filtro({ estados: ['en-curso'] }))).toBe(false)
    expect(historicaEntraEnExportacion(filtro({ estados: ['resuelto'] }))).toBe(true)
  })
})

describe('desde las filas de la base', () => {
  it('una rendición deja fuera adelantos y su familia sale de FAMILIA_REPORTE', () => {
    const d = documentoDeRendicion(
      { id: 'r1', status: 'partially_approved', proyecto_id: 'p1', submitter_id: 'ana', created_at: '2026-09-01T12:00:00Z' },
      [
        { item_type: 'expense', category_id: 'comb', date: '2026-09-02', amount_clp: 100, status: 'approved' },
        { item_type: 'advance', category_id: null,   date: '2026-09-02', amount_clp: 999, status: 'approved' },
        { item_type: null,      category_id: 'alim', date: '2026-09-03', amount_clp: 50,  status: 'rejected' },
      ],
    )
    expect(d.familia).toBe('atencion')
    expect(d.proyectoId).toBe('p1')
    expect(d.creadoEl).toBe('2026-09-01')
    expect(d.gastos).toEqual([
      { categoriaId: 'comb', fecha: '2026-09-02', montoClp: 100, rechazado: false },
      { categoriaId: 'alim', fecha: '2026-09-03', montoClp: 50,  rechazado: true },
    ])
  })

  it('un fondo usa al beneficiario y FAMILIA_FONDO', () => {
    const d = documentoDeFondo(
      { id: 'f1', status: 'funds_sent', proyecto_id: null, employee_id: 'beto', created_at: '2026-09-01T12:00:00Z' },
      [{ category_id: 'comb', date: '2026-09-02', amount_clp: 100, status: 'pending' }],
    )
    expect(d.beneficiarioId).toBe('beto')
    expect(d.familia).toBe('en-curso')
    expect(d.gastos[0].rechazado).toBe(false)
  })
})
```

- [ ] **Step 2: Correrlas y ver que fallan**

Run: `npx vitest run src/tests/filtro-documentos.test.ts`
Expected: FAIL — «Failed to resolve import "@/lib/filtro-documentos"».

- [ ] **Step 3: Implementar**

Crear `src/lib/filtro-documentos.ts`:

```ts
// Las reglas del filtro del empleado: qué documento entra y qué suma.
//
// Las usan las dos listas (rendiciones y caja chica), la exportación y «Mis
// gastos». Si una de estas reglas aparece escrita en un componente, está mal:
// la pantalla y el Excel tienen que contar lo mismo.
//
// Spec: docs/superpowers/specs/2026-10-07-filtro-del-empleado-design.md

import {
  FAMILIA_REPORTE, FAMILIA_FONDO,
  type FamiliaEstado, type ReportStatus, type FundStatusConst,
} from '@/lib/constants'

export interface GastoFiltrable {
  categoriaId: string | null
  /** La de la boleta, YYYY-MM-DD: el filtro de fecha mira el gasto, no el documento */
  fecha:       string
  montoClp:    number
  rechazado:   boolean
}

export interface DocumentoFiltrable {
  id:             string
  proyectoId:     string | null
  familia:        FamiliaEstado
  /** Quien recibe la plata: quien rinde, o el empleado del fondo */
  beneficiarioId: string
  /** YYYY-MM-DD en Chile. Lo usa el filtro de fecha cuando el documento no tiene gastos */
  creadoEl:       string
  gastos:         GastoFiltrable[]
}

export type PresetFecha = 'este-mes' | 'mes-pasado' | 'ultimos-3' | 'este-anio' | 'elegir'

export interface Filtro {
  /** Ids de proyecto, o SIN_PROYECTO */
  proyectos:  string[]
  categorias: string[]
  fecha:      PresetFecha | null
  /** Solo con fecha = 'elegir' */
  desde:      string | null
  hasta:      string | null
  estados:    FamiliaEstado[]
  empleados:  string[]
}

export const SIN_PROYECTO = 'sin'

export const FILTRO_VACIO: Filtro = {
  proyectos: [], categorias: [], fecha: null, desde: null, hasta: null, estados: [], empleados: [],
}

export function hayFiltro(f: Filtro): boolean {
  return f.proyectos.length > 0 || f.categorias.length > 0 || f.fecha !== null
    || f.estados.length > 0 || f.empleados.length > 0
}

/** La fecha en Chile, YYYY-MM-DD. `toISOString()` daría el día siguiente después de las 21:00. */
export function fechaEnChile(fecha: Date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Santiago', year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(fecha)
}

const iso = (a: number, m: number, d: number) =>
  `${a}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`

/** Último día del mes `m` (1-12): el día 0 del mes siguiente. */
const ultimoDia = (a: number, m: number) => new Date(Date.UTC(a, m, 0)).getUTCDate()

/** El rango inclusivo de un filtro de fecha. Un lado en null queda abierto. */
export function rangoDeFecha(
  f: Pick<Filtro, 'fecha' | 'desde' | 'hasta'>,
  hoy: string,
): { desde: string | null; hasta: string | null } {
  const [a, m] = hoy.split('-').map(Number)
  switch (f.fecha) {
    case null:
      return { desde: null, hasta: null }
    case 'este-mes':
      return { desde: iso(a, m, 1), hasta: iso(a, m, ultimoDia(a, m)) }
    case 'mes-pasado': {
      const [pa, pm] = m === 1 ? [a - 1, 12] : [a, m - 1]
      return { desde: iso(pa, pm, 1), hasta: iso(pa, pm, ultimoDia(pa, pm)) }
    }
    case 'ultimos-3': {
      const meses = a * 12 + (m - 1) - 2
      return { desde: iso(Math.floor(meses / 12), (meses % 12) + 1, 1), hasta: hoy }
    }
    case 'este-anio':
      return { desde: iso(a, 1, 1), hasta: hoy }
    case 'elegir':
      return { desde: f.desde, hasta: f.hasta }
  }
}

export interface Coincidencia<T> {
  doc:      T
  /** Los gastos no rechazados que cumplen tipo de gasto y fecha */
  gastos:   GastoFiltrable[]
  montoClp: number
}

export interface ResultadoFiltro<T> {
  visibles:    Coincidencia<T>[]
  totalClp:    number
  totalGastos: number
}

const enRango = (fecha: string, r: { desde: string | null; hasta: string | null }) =>
  (r.desde === null || fecha >= r.desde) && (r.hasta === null || fecha <= r.hasta)

/**
 * Qué documentos entran y cuánto suman. Entre chips, Y; dentro de un chip, O.
 *
 * Tipo de gasto y fecha miran los GASTOS, y el mismo gasto tiene que cumplir
 * los dos: combustible de agosto y comida de septiembre no es «combustible de
 * septiembre». Un gasto rechazado nunca hace entrar a un documento ni suma.
 */
export function aplicarFiltro<T extends DocumentoFiltrable>(
  docs: T[],
  filtro: Filtro,
  hoy: string,
): ResultadoFiltro<T> {
  const rango = rangoDeFecha(filtro, hoy)
  const hayFecha = rango.desde !== null || rango.hasta !== null
  const hayCategoria = filtro.categorias.length > 0

  const visibles: Coincidencia<T>[] = []
  for (const doc of docs) {
    if (filtro.proyectos.length && !filtro.proyectos.includes(doc.proyectoId ?? SIN_PROYECTO)) continue
    if (filtro.estados.length && !filtro.estados.includes(doc.familia)) continue
    if (filtro.empleados.length && !filtro.empleados.includes(doc.beneficiarioId)) continue

    const gastos = doc.gastos.filter(g =>
      !g.rechazado
      && (!hayCategoria || (g.categoriaId !== null && filtro.categorias.includes(g.categoriaId)))
      && (!hayFecha || enRango(g.fecha, rango)))

    if ((hayCategoria || hayFecha) && gastos.length === 0) {
      // Un documento SIN gastos todavía (un borrador vacío, un fondo recién
      // pedido) se juzga por su fecha de creación. Con tipo de gasto no entra:
      // sin gastos no puede tener uno.
      const vacio = doc.gastos.length === 0
      if (!(vacio && !hayCategoria && enRango(doc.creadoEl, rango))) continue
    }

    visibles.push({ doc, gastos, montoClp: gastos.reduce((s, g) => s + g.montoClp, 0) })
  }

  return {
    visibles,
    totalClp:    visibles.reduce((s, v) => s + v.montoClp, 0),
    totalGastos: visibles.reduce((s, v) => s + v.gastos.length, 0),
  }
}

/** Cuántos gastos no rechazados tiene cada categoría: el número que muestra la hoja. */
export function contarPorCategoria(docs: DocumentoFiltrable[]): Map<string, number> {
  const conteo = new Map<string, number>()
  for (const d of docs) {
    for (const g of d.gastos) {
      if (g.rechazado || g.categoriaId === null) continue
      conteo.set(g.categoriaId, (conteo.get(g.categoriaId) ?? 0) + 1)
    }
  }
  return conteo
}

/**
 * En rendiciones, solo `expense` (o nulo, en los ítems viejos) es un gasto.
 * Adelantos, devoluciones y traspasos son movimientos de fondos: sumarlos con
 * los gastos cuenta dos veces la misma plata (SKILL, «Gasto ≠ movimiento»).
 */
export function esGasto(itemType: string | null | undefined): boolean {
  return itemType === 'expense' || itemType === null || itemType === undefined
}

/**
 * La carga histórica no tiene proyecto y está cerrada (cuenta como liquidada):
 * entra en la exportación salvo que los chips de proyecto o estado la excluyan.
 */
export function historicaEntraEnExportacion(f: Filtro): boolean {
  const proyectoOk = f.proyectos.length === 0 || f.proyectos.includes(SIN_PROYECTO)
  const estadoOk = f.estados.length === 0 || f.estados.includes('resuelto')
  return proyectoOk && estadoOk
}

type FilaGasto = { category_id: string | null; date: string; amount_clp: number | null; status: string }

const aGasto = (i: FilaGasto): GastoFiltrable => ({
  categoriaId: i.category_id,
  fecha:       i.date.slice(0, 10),
  montoClp:    Number(i.amount_clp ?? 0),
  rechazado:   i.status === 'rejected',
})

export function documentoDeRendicion(
  r: { id: string; status: string; proyecto_id: string | null; submitter_id: string; created_at: string },
  items: (FilaGasto & { item_type: string | null })[],
): DocumentoFiltrable {
  return {
    id:             r.id,
    proyectoId:     r.proyecto_id,
    familia:        FAMILIA_REPORTE[r.status as ReportStatus] ?? 'neutro',
    beneficiarioId: r.submitter_id,
    creadoEl:       fechaEnChile(new Date(r.created_at)),
    gastos:         items.filter(i => esGasto(i.item_type)).map(aGasto),
  }
}

/** En caja chica todo `petty_cash_items` es gasto: los adelantos son transferencias. */
export function documentoDeFondo(
  f: { id: string; status: string; proyecto_id: string | null; employee_id: string; created_at: string },
  items: FilaGasto[],
): DocumentoFiltrable {
  return {
    id:             f.id,
    proyectoId:     f.proyecto_id,
    familia:        FAMILIA_FONDO[f.status as FundStatusConst] ?? 'neutro',
    beneficiarioId: f.employee_id,
    creadoEl:       fechaEnChile(new Date(f.created_at)),
    gastos:         items.map(aGasto),
  }
}

/** Los cuatro grupos de estado son las familias de siempre, no una clasificación nueva. */
export const ORDEN_FAMILIAS: FamiliaEstado[] = ['neutro', 'en-curso', 'resuelto', 'atencion']

export const ETIQUETAS_ESTADO: Record<'rendicion' | 'fondo', Record<FamiliaEstado, string>> = {
  // «Con rechazos» y no «Rechazadas»: incluye las aprobadas en parte
  rendicion: { neutro: 'Borradores', 'en-curso': 'En proceso', resuelto: 'Aprobadas', atencion: 'Con rechazos' },
  fondo:     { neutro: 'Borradores', 'en-curso': 'En proceso', resuelto: 'Liquidados', atencion: 'Rechazados' },
}

export interface OpcionesFiltro {
  proyectos:  { id: string; numero: string; nombre: string | null }[]
  categorias: { id: string; name: string }[]
}

export interface RendicionFiltrable extends DocumentoFiltrable {
  title:             string
  status:            ReportStatus
  total_amount:      number
  approved_amount:   number
  currency:          string | null
  submitted_at:      string | null
  created_at:        string
  reimbursed_at:     string | null
  payment_reference: string | null
}
```

- [ ] **Step 4: Correr las pruebas**

Run: `npx vitest run src/tests/filtro-documentos.test.ts`
Expected: PASS, 27 pruebas.

- [ ] **Step 5: Commit**

```bash
git add src/lib/filtro-documentos.ts src/tests/filtro-documentos.test.ts
git commit -m "feat(filtro): las reglas del filtro del empleado, como funciones puras" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

## Task 2: El filtro en la dirección y sus textos

**Files:**
- Create: `src/lib/filtro-url.ts`, `src/lib/filtro-etiquetas.ts`
- Test: `src/tests/filtro-url.test.ts`, `src/tests/filtro-etiquetas.test.ts`

**Interfaces:**
- Consumes: `Filtro`, `FILTRO_VACIO`, `SIN_PROYECTO`, `PresetFecha` de `@/lib/filtro-documentos`; `formatCLP` de `@/lib/utils` (devuelve `"$ 97.300"`).
- Produces:
  - `@/lib/filtro-url`: `leerFiltro(params: URLSearchParams): Filtro`, `escribirFiltro(f: Filtro): string` (`''` o `'?…'`), `depurarFiltro(f: Filtro, validos: { proyectos: string[]; categorias: string[]; empleados: string[] }): Filtro`, `paramsDePagina(sp: Record<string, string | string[] | undefined>): URLSearchParams`
  - `@/lib/filtro-etiquetas`: `type ClaveChip = 'proyectos' | 'categorias' | 'fecha' | 'estados' | 'empleados'`, `interface Opcion { id: string; etiqueta: string }`, `ETIQUETA_PRESET: Record<PresetFecha, string>`, `nombreDeChip(c: ClaveChip): string`, `chipActivo(c: ClaveChip, f: Filtro): boolean`, `quitarChip(c: ClaveChip, f: Filtro): Filtro`, `etiquetaDeChip(c: ClaveChip, f: Filtro, opciones: Opcion[]): string`, `etiquetaDeProyecto(p: { numero: string; nombre: string | null }): string`, `textoResumen(r: { visibles: number; total: number; totalClp: number }, f: Filtro, categorias: Opcion[]): string`, `textoCoincidencia(c: { gastos: number; montoClp: number }, f: Filtro, categorias: Opcion[]): string`

- [ ] **Step 1: Escribir las pruebas**

Crear `src/tests/filtro-url.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { leerFiltro, escribirFiltro, depurarFiltro, paramsDePagina } from '@/lib/filtro-url'
import { FILTRO_VACIO, SIN_PROYECTO, type Filtro } from '@/lib/filtro-documentos'

describe('el filtro en la dirección', () => {
  it('ida y vuelta', () => {
    const f: Filtro = {
      proyectos: ['p1', SIN_PROYECTO], categorias: ['comb'], fecha: 'elegir',
      desde: '2026-09-01', hasta: '2026-09-30', estados: ['en-curso'], empleados: ['ana'],
    }
    expect(leerFiltro(new URLSearchParams(escribirFiltro(f).slice(1)))).toEqual(f)
  })

  it('sin filtro, sin parámetros', () => {
    expect(escribirFiltro(FILTRO_VACIO)).toBe('')
  })

  it('ignora una fecha o un estado que no existen, y «desde» sin «elegir»', () => {
    const f = leerFiltro(new URLSearchParams('fecha=ayer&estado=en-curso,inventado&desde=2026-09-01'))
    expect(f.fecha).toBeNull()
    expect(f.estados).toEqual(['en-curso'])
    expect(f.desde).toBeNull()
  })

  it('una fecha mal escrita no entra', () => {
    expect(leerFiltro(new URLSearchParams('fecha=elegir&desde=1-9-2026')).desde).toBeNull()
  })

  it('depurar saca los ids que ya no existen y conserva «Sin proyecto»', () => {
    const f: Filtro = { ...FILTRO_VACIO, proyectos: ['p1', 'borrado', SIN_PROYECTO], categorias: ['vieja'], empleados: ['ana'] }
    expect(depurarFiltro(f, { proyectos: ['p1'], categorias: ['comb'], empleados: ['ana'] }))
      .toEqual({ ...FILTRO_VACIO, proyectos: ['p1', SIN_PROYECTO], categorias: [], empleados: ['ana'] })
  })

  it('paramsDePagina toma el último valor repetido y salta los vacíos', () => {
    expect(paramsDePagina({ tipo: ['a', 'b'], fecha: 'este-mes', nada: undefined }).toString())
      .toBe('tipo=b&fecha=este-mes')
  })
})
```

Crear `src/tests/filtro-etiquetas.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import {
  etiquetaDeChip, chipActivo, quitarChip, etiquetaDeProyecto, textoResumen, textoCoincidencia,
} from '@/lib/filtro-etiquetas'
import { FILTRO_VACIO, type Filtro } from '@/lib/filtro-documentos'

const cats = [{ id: 'comb', etiqueta: 'Combustible' }, { id: 'alim', etiqueta: 'Alimentación' }]
const f = (over: Partial<Filtro>): Filtro => ({ ...FILTRO_VACIO, ...over })

describe('lo que dice un chip', () => {
  it('sin nada elegido, su nombre', () => {
    expect(etiquetaDeChip('categorias', FILTRO_VACIO, cats)).toBe('Tipo de gasto')
    expect(etiquetaDeChip('fecha', FILTRO_VACIO, [])).toBe('Fecha')
  })
  it('una opción, su nombre', () => {
    expect(etiquetaDeChip('categorias', f({ categorias: ['comb'] }), cats)).toBe('Combustible')
  })
  it('varias, cuántas', () => {
    expect(etiquetaDeChip('categorias', f({ categorias: ['comb', 'alim'] }), cats)).toBe('2 tipos de gasto')
    expect(etiquetaDeChip('proyectos', f({ proyectos: ['a', 'b', 'c'] }), [])).toBe('3 proyectos')
  })
  it('fecha con atajo', () => {
    expect(etiquetaDeChip('fecha', f({ fecha: 'ultimos-3' }), [])).toBe('Últimos 3 meses')
  })
  it('fecha elegida: las dos puntas o una', () => {
    expect(etiquetaDeChip('fecha', f({ fecha: 'elegir', desde: '2026-09-01', hasta: '2026-09-30' }), [])).toBe('1 sep – 30 sep')
    expect(etiquetaDeChip('fecha', f({ fecha: 'elegir', desde: '2026-09-01' }), [])).toBe('Desde 1 sep')
    expect(etiquetaDeChip('fecha', f({ fecha: 'elegir', hasta: '2026-09-30' }), [])).toBe('Hasta 30 sep')
  })
})

describe('activar y quitar', () => {
  it('chipActivo', () => {
    expect(chipActivo('fecha', f({ fecha: 'este-mes' }))).toBe(true)
    expect(chipActivo('estados', FILTRO_VACIO)).toBe(false)
  })
  it('quitar la fecha borra también las puntas', () => {
    expect(quitarChip('fecha', f({ fecha: 'elegir', desde: '2026-09-01', categorias: ['comb'] })))
      .toEqual(f({ categorias: ['comb'] }))
  })
  it('quitar un chip de lista deja los demás', () => {
    expect(quitarChip('categorias', f({ categorias: ['comb'], estados: ['neutro'] }))).toEqual(f({ estados: ['neutro'] }))
  })
})

describe('las líneas de texto', () => {
  it('un proyecto con y sin nombre', () => {
    expect(etiquetaDeProyecto({ numero: '2991', nombre: 'Planta Norte' })).toBe('2991 · Planta Norte')
    expect(etiquetaDeProyecto({ numero: '2991', nombre: null })).toBe('2991')
  })
  it('resumen con una categoría', () => {
    expect(textoResumen({ visibles: 3, total: 12, totalClp: 97300 }, f({ categorias: ['comb'] }), cats))
      .toBe('3 de 12 · $ 97.300 en Combustible')
  })
  it('resumen con varias categorías y sin categoría', () => {
    expect(textoResumen({ visibles: 3, total: 12, totalClp: 97300 }, f({ categorias: ['comb', 'alim'] }), cats))
      .toBe('3 de 12 · $ 97.300 en 2 tipos de gasto')
    expect(textoResumen({ visibles: 3, total: 12, totalClp: 97300 }, f({ fecha: 'este-mes' }), cats))
      .toBe('3 de 12 · $ 97.300')
  })
  it('coincidencia de una tarjeta, singular y plural', () => {
    expect(textoCoincidencia({ gastos: 1, montoClp: 13700 }, f({ categorias: ['comb'] }), cats))
      .toBe('1 gasto de Combustible · $ 13.700')
    expect(textoCoincidencia({ gastos: 2, montoClp: 38400 }, f({ categorias: ['comb', 'alim'] }), cats))
      .toBe('2 gastos · $ 38.400')
  })
})
```

- [ ] **Step 2: Correrlas y ver que fallan**

Run: `npx vitest run src/tests/filtro-url.test.ts src/tests/filtro-etiquetas.test.ts`
Expected: FAIL — no resuelven `@/lib/filtro-url` ni `@/lib/filtro-etiquetas`.

- [ ] **Step 3: Implementar `src/lib/filtro-url.ts`**

```ts
// El filtro vive en la dirección de la página: recargar, volver atrás o
// compartir el enlace lo conserva. `?proyecto=…&tipo=…&fecha=este-anio&estado=en-curso`
//
// Las páginas lo leen del `searchParams` del servidor (una Promise en Next 16)
// y la pantalla lo escribe con `window.history.replaceState`, que se integra
// con el router sin volver a pedir la página.

import { FILTRO_VACIO, SIN_PROYECTO, type Filtro, type PresetFecha } from '@/lib/filtro-documentos'
import type { FamiliaEstado } from '@/lib/constants'

const PRESETS: PresetFecha[] = ['este-mes', 'mes-pasado', 'ultimos-3', 'este-anio', 'elegir']
const FAMILIAS: FamiliaEstado[] = ['neutro', 'en-curso', 'resuelto', 'atencion']
const FECHA = /^\d{4}-\d{2}-\d{2}$/

const lista = (v: string | null) => (v ? v.split(',').map(s => s.trim()).filter(Boolean) : [])

export function leerFiltro(params: URLSearchParams): Filtro {
  const crudo = params.get('fecha')
  const fecha = PRESETS.includes(crudo as PresetFecha) ? (crudo as PresetFecha) : null
  const punta = (v: string | null) => (fecha === 'elegir' && v && FECHA.test(v) ? v : null)
  return {
    ...FILTRO_VACIO,
    proyectos:  lista(params.get('proyecto')),
    categorias: lista(params.get('tipo')),
    fecha,
    desde:      punta(params.get('desde')),
    hasta:      punta(params.get('hasta')),
    estados:    lista(params.get('estado')).filter((e): e is FamiliaEstado => FAMILIAS.includes(e as FamiliaEstado)),
    empleados:  lista(params.get('empleado')),
  }
}

export function escribirFiltro(f: Filtro): string {
  const p = new URLSearchParams()
  if (f.proyectos.length)  p.set('proyecto', f.proyectos.join(','))
  if (f.categorias.length) p.set('tipo', f.categorias.join(','))
  if (f.fecha)             p.set('fecha', f.fecha)
  if (f.fecha === 'elegir' && f.desde) p.set('desde', f.desde)
  if (f.fecha === 'elegir' && f.hasta) p.set('hasta', f.hasta)
  if (f.estados.length)    p.set('estado', f.estados.join(','))
  if (f.empleados.length)  p.set('empleado', f.empleados.join(','))
  const qs = p.toString()
  return qs ? `?${qs}` : ''
}

/**
 * Saca lo que ya no existe —un proyecto borrado, una categoría que la persona
 * ya no tiene, un empleado que no le toca ver—. Sin esto, un enlace viejo
 * dejaría la lista vacía sin que se entienda por qué.
 */
export function depurarFiltro(
  f: Filtro,
  validos: { proyectos: string[]; categorias: string[]; empleados: string[] },
): Filtro {
  return {
    ...f,
    proyectos:  f.proyectos.filter(p => p === SIN_PROYECTO || validos.proyectos.includes(p)),
    categorias: f.categorias.filter(c => validos.categorias.includes(c)),
    empleados:  f.empleados.filter(e => validos.empleados.includes(e)),
  }
}

/** Del `searchParams` que recibe una página de servidor a URLSearchParams. */
export function paramsDePagina(sp: Record<string, string | string[] | undefined>): URLSearchParams {
  const p = new URLSearchParams()
  for (const [clave, valor] of Object.entries(sp)) {
    if (typeof valor === 'string') p.set(clave, valor)
    else if (Array.isArray(valor) && valor.length) p.set(clave, valor[valor.length - 1])
  }
  return p
}
```

- [ ] **Step 4: Implementar `src/lib/filtro-etiquetas.ts`**

```ts
// Los textos del filtro: qué dice cada chip, la línea de resultado y la de
// cada tarjeta. Separados de los componentes para poder probarlos.

import type { Filtro, PresetFecha } from '@/lib/filtro-documentos'
import { formatCLP } from '@/lib/utils'

export type ClaveChip = 'proyectos' | 'categorias' | 'fecha' | 'estados' | 'empleados'

export interface Opcion {
  id:       string
  etiqueta: string
}

const NOMBRE: Record<ClaveChip, string> = {
  proyectos: 'Proyecto', categorias: 'Tipo de gasto', fecha: 'Fecha', estados: 'Estado', empleados: 'Empleado',
}

const PLURAL: Record<Exclude<ClaveChip, 'fecha'>, string> = {
  proyectos: 'proyectos', categorias: 'tipos de gasto', estados: 'estados', empleados: 'empleados',
}

export const ETIQUETA_PRESET: Record<PresetFecha, string> = {
  'este-mes': 'Este mes', 'mes-pasado': 'Mes pasado', 'ultimos-3': 'Últimos 3 meses',
  'este-anio': 'Este año', elegir: 'Elegir fechas',
}

const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic']
const corta = (iso: string) => {
  const [, m, d] = iso.split('-')
  return `${Number(d)} ${MESES[Number(m) - 1]}`
}

export const nombreDeChip = (c: ClaveChip) => NOMBRE[c]

export function chipActivo(c: ClaveChip, f: Filtro): boolean {
  return c === 'fecha' ? f.fecha !== null : f[c].length > 0
}

export function quitarChip(c: ClaveChip, f: Filtro): Filtro {
  return c === 'fecha' ? { ...f, fecha: null, desde: null, hasta: null } : { ...f, [c]: [] }
}

/** Sin nada elegido, el nombre del chip; con algo, lo elegido. */
export function etiquetaDeChip(c: ClaveChip, f: Filtro, opciones: Opcion[]): string {
  if (c === 'fecha') {
    if (!f.fecha) return NOMBRE.fecha
    if (f.fecha !== 'elegir') return ETIQUETA_PRESET[f.fecha]
    if (f.desde && f.hasta) return `${corta(f.desde)} – ${corta(f.hasta)}`
    if (f.desde) return `Desde ${corta(f.desde)}`
    if (f.hasta) return `Hasta ${corta(f.hasta)}`
    return ETIQUETA_PRESET.elegir
  }
  const elegidos: string[] = f[c]
  if (elegidos.length === 0) return NOMBRE[c]
  if (elegidos.length > 1) return `${elegidos.length} ${PLURAL[c]}`
  return opciones.find(o => o.id === elegidos[0])?.etiqueta ?? NOMBRE[c]
}

export function etiquetaDeProyecto(p: { numero: string; nombre: string | null }): string {
  return p.nombre ? `${p.numero} · ${p.nombre}` : p.numero
}

const nombreDeCategoria = (f: Filtro, categorias: Opcion[]) =>
  categorias.find(c => c.id === f.categorias[0])?.etiqueta ?? 'ese tipo de gasto'

/** La línea bajo los chips: «3 de 12 · $ 97.300 en Combustible». */
export function textoResumen(
  r: { visibles: number; total: number; totalClp: number },
  f: Filtro,
  categorias: Opcion[],
): string {
  const base = `${r.visibles} de ${r.total} · ${formatCLP(r.totalClp)}`
  if (f.categorias.length === 1) return `${base} en ${nombreDeCategoria(f, categorias)}`
  if (f.categorias.length > 1) return `${base} en ${f.categorias.length} tipos de gasto`
  return base
}

/** La línea de una tarjeta con tipo de gasto elegido: «2 gastos de Combustible · $ 38.400». */
export function textoCoincidencia(
  c: { gastos: number; montoClp: number },
  f: Filtro,
  categorias: Opcion[],
): string {
  const gastos = c.gastos === 1 ? '1 gasto' : `${c.gastos} gastos`
  const de = f.categorias.length === 1 ? ` de ${nombreDeCategoria(f, categorias)}` : ''
  return `${gastos}${de} · ${formatCLP(c.montoClp)}`
}
```

- [ ] **Step 5: Correr las pruebas**

Run: `npx vitest run src/tests/filtro-url.test.ts src/tests/filtro-etiquetas.test.ts`
Expected: PASS (6 + 12 pruebas).

- [ ] **Step 6: Commit**

```bash
git add src/lib/filtro-url.ts src/lib/filtro-etiquetas.ts src/tests/filtro-url.test.ts src/tests/filtro-etiquetas.test.ts
git commit -m "feat(filtro): el filtro en la dirección de la página y los textos de los chips" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

## Task 3: «Mis gastos» con los indicadores nuevos

**Files:**
- Create: `src/lib/mis-gastos.ts`
- Test: `src/tests/mis-gastos.test.ts`
- Modify: `src/actions/expenses.ts:816-884` (reemplazar `MonthlyCategoryRow` y `getMyMonthlySummary` por `getMisGastos`)
- Modify: `src/app/(app)/mis-gastos/page.tsx` (completo)

**Interfaces:**
- Consumes: `esGasto`, `fechaEnChile` de `@/lib/filtro-documentos`.
- Produces:
  - `@/lib/mis-gastos`: `interface GastoMio { documentoId: string; fecha: string; montoClp: number; categoriaId: string | null; categoriaNombre: string | null; aprobado: boolean; esperandoDecision: boolean }`, `interface ResumenMisGastos { meses: string[]; porMes: Record<string, number>; porCategoria: { id: string | null; nombre: string; total: number }[]; totalAprobado: number; mesesConGastos: number; promedioMensual: number; pendiente: { montoClp: number; documentos: number } }`, `ultimosDoceMeses(hoy: string): string[]`, `esperaDecision(tipo: 'rendicion' | 'fondo', status: string): boolean`, `resumenMisGastos(gastos: GastoMio[], hoy: string): ResumenMisGastos`
  - `@/actions/expenses`: `getMisGastos(): Promise<GastoMio[]>`

- [ ] **Step 1: Escribir las pruebas**

Crear `src/tests/mis-gastos.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { resumenMisGastos, ultimosDoceMeses, esperaDecision, type GastoMio } from '@/lib/mis-gastos'

const HOY = '2026-10-07'
const gm = (over: Partial<GastoMio>): GastoMio => ({
  documentoId: 'd1', fecha: '2026-09-10', montoClp: 1000, categoriaId: 'comb', categoriaNombre: 'Combustible',
  aprobado: true, esperandoDecision: false, ...over,
})

describe('ultimosDoceMeses', () => {
  it('termina en el mes de hoy y cruza el año', () => {
    const m = ultimosDoceMeses(HOY)
    expect(m).toHaveLength(12)
    expect(m[0]).toBe('2025-11')
    expect(m[11]).toBe('2026-10')
  })
})

describe('resumenMisGastos', () => {
  it('total aprobado y promedio por mes con gastos', () => {
    const r = resumenMisGastos([gm({ fecha: '2026-09-10', montoClp: 1000 }), gm({ fecha: '2026-08-10', montoClp: 500 })], HOY)
    expect(r.totalAprobado).toBe(1500)
    expect(r.mesesConGastos).toBe(2)
    expect(r.promedioMensual).toBe(750)
    expect(r.porMes['2026-09']).toBe(1000)
  })

  it('lo aprobado de hace más de 12 meses no cuenta', () => {
    expect(resumenMisGastos([gm({ fecha: '2025-10-31' })], HOY).totalAprobado).toBe(0)
  })

  it('sin gastos, promedio 0 y no divide por cero', () => {
    expect(resumenMisGastos([], HOY).promedioMensual).toBe(0)
  })

  it('pendiente: suma lo que espera decisión y cuenta documentos distintos', () => {
    const r = resumenMisGastos([
      gm({ aprobado: false, esperandoDecision: true, documentoId: 'a', montoClp: 100 }),
      gm({ aprobado: false, esperandoDecision: true, documentoId: 'a', montoClp: 50 }),
      gm({ aprobado: false, esperandoDecision: true, documentoId: 'b', montoClp: 10 }),
    ], HOY)
    expect(r.pendiente).toEqual({ montoClp: 160, documentos: 2 })
    expect(r.totalAprobado).toBe(0)
  })

  it('un gasto sin aprobar de un documento que no se envió no es pendiente', () => {
    expect(resumenMisGastos([gm({ aprobado: false, esperandoDecision: false })], HOY).pendiente)
      .toEqual({ montoClp: 0, documentos: 0 })
  })

  it('por categoría, de mayor a menor, con «Sin categoría»', () => {
    const r = resumenMisGastos([
      gm({ categoriaId: 'comb', categoriaNombre: 'Combustible', montoClp: 100 }),
      gm({ categoriaId: null, categoriaNombre: null, montoClp: 300 }),
      gm({ categoriaId: 'comb', categoriaNombre: 'Combustible', montoClp: 50 }),
    ], HOY)
    expect(r.porCategoria).toEqual([
      { id: null, nombre: 'Sin categoría', total: 300 },
      { id: 'comb', nombre: 'Combustible', total: 150 },
    ])
  })
})

describe('esperaDecision', () => {
  it('rendición enviada sí; borrador no', () => {
    expect(esperaDecision('rendicion', 'submitted')).toBe(true)
    expect(esperaDecision('rendicion', 'pending_l2')).toBe(true)
    expect(esperaDecision('rendicion', 'draft')).toBe(false)
  })
  it('fondo presentado a liquidar sí; activo o pedido, no', () => {
    expect(esperaDecision('fondo', 'pending_liquidation_approval')).toBe(true)
    expect(esperaDecision('fondo', 'pending_liquidation_l2')).toBe(true)
    expect(esperaDecision('fondo', 'funds_sent')).toBe(false)
    // Un pedido de fondo no es un gasto
    expect(esperaDecision('fondo', 'pending_approval')).toBe(false)
  })
})
```

- [ ] **Step 2: Correrlas y ver que fallan**

Run: `npx vitest run src/tests/mis-gastos.test.ts`
Expected: FAIL — no resuelve `@/lib/mis-gastos`.

- [ ] **Step 3: Implementar `src/lib/mis-gastos.ts`**

```ts
// Los indicadores de «Mis gastos», desde gastos ya cargados.
//
// Cuenta rendiciones Y caja chica, y solo GASTOS: hasta el 2026-10-07 la
// pantalla sumaba los adelantos y devoluciones de las cargas históricas como
// si fueran gastos (la misma plata contada dos veces).

export interface GastoMio {
  /** La rendición o el fondo: para contar «en N documentos» */
  documentoId:       string
  fecha:             string
  montoClp:          number
  categoriaId:       string | null
  categoriaNombre:   string | null
  aprobado:          boolean
  /** Enviado y sin decidir. Un borrador o un fondo activo todavía no se presentó */
  esperandoDecision: boolean
}

export interface ResumenMisGastos {
  /** YYYY-MM, del más viejo al actual */
  meses:           string[]
  porMes:          Record<string, number>
  porCategoria:    { id: string | null; nombre: string; total: number }[]
  totalAprobado:   number
  mesesConGastos:  number
  promedioMensual: number
  pendiente:       { montoClp: number; documentos: number }
}

export function ultimosDoceMeses(hoy: string): string[] {
  const [a, m] = hoy.split('-').map(Number)
  const meses: string[] = []
  for (let i = 11; i >= 0; i--) {
    const total = a * 12 + (m - 1) - i
    meses.push(`${Math.floor(total / 12)}-${String((total % 12) + 1).padStart(2, '0')}`)
  }
  return meses
}

/**
 * Si un gasto pendiente de ese documento está esperando que alguien decida.
 * En caja chica, los gastos se deciden en la liquidación: mientras el fondo
 * está activo (`funds_sent`) todavía no se presentaron. Un pedido de fondo no
 * es un gasto.
 */
export function esperaDecision(tipo: 'rendicion' | 'fondo', status: string): boolean {
  return tipo === 'rendicion'
    ? status === 'submitted' || status === 'pending_l2'
    : status === 'pending_liquidation_approval' || status === 'pending_liquidation_l2'
}

export function resumenMisGastos(gastos: GastoMio[], hoy: string): ResumenMisGastos {
  const meses = ultimosDoceMeses(hoy)
  const porMes: Record<string, number> = Object.fromEntries(meses.map(m => [m, 0]))
  const porCategoria = new Map<string, { id: string | null; nombre: string; total: number }>()
  let totalAprobado = 0

  for (const g of gastos) {
    if (!g.aprobado) continue
    const mes = g.fecha.slice(0, 7)
    if (!(mes in porMes)) continue
    porMes[mes] += g.montoClp
    totalAprobado += g.montoClp
    const clave = g.categoriaId ?? '__sin__'
    const fila = porCategoria.get(clave) ?? { id: g.categoriaId, nombre: g.categoriaNombre ?? 'Sin categoría', total: 0 }
    fila.total += g.montoClp
    porCategoria.set(clave, fila)
  }

  const mesesConGastos = meses.filter(m => porMes[m] > 0).length
  const pendientes = gastos.filter(g => g.esperandoDecision)

  return {
    meses,
    porMes,
    porCategoria:    [...porCategoria.values()].sort((x, y) => y.total - x.total),
    totalAprobado,
    mesesConGastos,
    promedioMensual: mesesConGastos ? totalAprobado / mesesConGastos : 0,
    pendiente: {
      montoClp:   pendientes.reduce((s, g) => s + g.montoClp, 0),
      documentos: new Set(pendientes.map(g => g.documentoId)).size,
    },
  }
}
```

- [ ] **Step 4: Correr las pruebas**

Run: `npx vitest run src/tests/mis-gastos.test.ts`
Expected: PASS (9 pruebas).

- [ ] **Step 5: Reemplazar la acción en `src/actions/expenses.ts`**

Borrar el bloque desde `// ── Resumen mensual del empleado (R6) ──…` hasta el cierre de `getMyMonthlySummary` (hoy líneas 816-884, `MonthlyCategoryRow` incluido) y poner en su lugar:

```ts
// ── «Mis gastos»: lo aprobado y lo que espera decisión, de rendiciones y caja chica ──

export async function getMisGastos(): Promise<GastoMio[]> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return []

  // La forma de la fila se declara: el select anidado tipa como never
  type FilaItem = {
    report_id: string; amount_clp: number | null; date: string; status: string
    item_type: string | null; category_id: string | null
    expense_reports: { status: string } | null
  }

  const [{ data: items }, { data: fondos }] = await Promise.all([
    supabase
      .from('expense_items')
      .select('report_id, amount_clp, date, status, item_type, category_id, expense_reports!inner (submitter_id, status, deleted_at)')
      .eq('expense_reports.submitter_id', user.id)
      .is('expense_reports.deleted_at', null)
      .is('deleted_at', null)
      .in('status', ['approved', 'pending']),
    supabase
      .from('petty_cash_funds')
      .select('id, status')
      .eq('employee_id', user.id)
      .is('deleted_at', null),
  ])

  const estadoFondo = new Map((fondos ?? []).map(f => [f.id, f.status as string]))
  const { data: itemsFondo } = estadoFondo.size
    ? await supabase
        .from('petty_cash_items')
        .select('fund_id, amount_clp, date, status, category_id')
        .in('fund_id', [...estadoFondo.keys()])
        .in('status', ['approved', 'pending'])
    : { data: [] as { fund_id: string; amount_clp: number; date: string; status: string; category_id: string | null }[] }

  const filas = (items ?? []) as unknown as FilaItem[]
  const idsCategoria = [...new Set(
    [...filas.map(i => i.category_id), ...(itemsFondo ?? []).map(i => i.category_id)]
      .filter((id): id is string => !!id),
  )]
  const { data: categorias } = idsCategoria.length
    ? await supabase.from('expense_categories').select('id, name').in('id', idsCategoria)
    : { data: [] as { id: string; name: string }[] }
  const nombre = new Map((categorias ?? []).map(c => [c.id, c.name]))
  const nombreDe = (id: string | null) => (id ? nombre.get(id) ?? null : null)

  const deRendiciones: GastoMio[] = filas
    .filter(i => esGasto(i.item_type))
    .map(i => ({
      documentoId:       i.report_id,
      fecha:             i.date,
      montoClp:          Number(i.amount_clp ?? 0),
      categoriaId:       i.category_id,
      categoriaNombre:   nombreDe(i.category_id),
      aprobado:          i.status === 'approved',
      esperandoDecision: i.status === 'pending' && esperaDecision('rendicion', i.expense_reports?.status ?? ''),
    }))

  const deFondos: GastoMio[] = (itemsFondo ?? []).map(i => ({
    documentoId:       i.fund_id,
    fecha:             i.date,
    montoClp:          Number(i.amount_clp ?? 0),
    categoriaId:       i.category_id,
    categoriaNombre:   nombreDe(i.category_id),
    aprobado:          i.status === 'approved',
    esperandoDecision: i.status === 'pending' && esperaDecision('fondo', estadoFondo.get(i.fund_id) ?? ''),
  }))

  return [...deRendiciones, ...deFondos]
}
```

Y arriba, junto a los demás imports del archivo:

```ts
import { esGasto } from '@/lib/filtro-documentos'
import { esperaDecision, type GastoMio } from '@/lib/mis-gastos'
```

- [ ] **Step 6: Reescribir `src/app/(app)/mis-gastos/page.tsx`**

```tsx
import { getMisGastos } from '@/actions/expenses'
import { resumenMisGastos } from '@/lib/mis-gastos'
import { fechaEnChile } from '@/lib/filtro-documentos'
import { formatCLP } from '@/lib/utils'
import { Card } from '@/components/ui/Card'
import { CurrencyAmount } from '@/components/ui/CurrencyAmount'
import { TrendingUp, BarChart3 } from 'lucide-react'

export const dynamic = 'force-dynamic'

const NOMBRES_MES = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic']
const etiquetaMes = (ym: string) => NOMBRES_MES[parseInt(ym.split('-')[1], 10) - 1]

export default async function MisGastosPage() {
  const r = resumenMisGastos(await getMisGastos(), fechaEnChile())
  const maxMes = Math.max(...Object.values(r.porMes), 1)

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-display font-bold tor-on-gradient">Mis gastos</h1>
        <p className="tor-on-gradient-soft text-sm mt-1">Rendiciones y caja chica · últimos 12 meses</p>
      </div>

      {/* Los tres indicadores en la tarjeta de resumen, como el inicio: es lo que
          se mira; el gráfico y la tabla de abajo son lo que se lee. */}
      <Card hero>
        <div className="space-y-1.5">
          <p className="card-eyebrow text-brand-300">Total aprobado</p>
          <CurrencyAmount amount={r.totalAprobado} currency="CLP" size="xl" fit className="text-white block" />
        </div>
        <div className="mt-4 grid grid-cols-2 gap-4">
          <div>
            <p className="card-label text-brand-300 mb-1">Pendiente de aprobación</p>
            <CurrencyAmount amount={r.pendiente.montoClp} currency="CLP" size="md" fit className="text-white block" />
            <p className="card-meta text-white/80 mt-0.5">
              {r.pendiente.documentos === 1 ? 'en 1 documento' : `en ${r.pendiente.documentos} documentos`}
            </p>
          </div>
          <div>
            <p className="card-label text-brand-300 mb-1">Promedio mensual</p>
            <CurrencyAmount amount={r.promedioMensual} currency="CLP" size="md" fit className="text-white block" />
            <p className="card-meta text-white/80 mt-0.5">
              {r.mesesConGastos === 1 ? '1 mes con gastos' : `${r.mesesConGastos} meses con gastos`}
            </p>
          </div>
        </div>
      </Card>

      {r.totalAprobado > 0 ? (
        <div className="hoja p-5">
          <div className="flex items-center gap-2 mb-4">
            <BarChart3 size={16} className="text-accent-600" />
            <h2 className="text-sm font-semibold text-ink-700">Gastos por mes</h2>
          </div>
          {/* Los 12 meses entran SIN desplazamiento lateral: el mes en tres
              letras y el año solo donde cambia (ver el historial de este archivo). */}
          <div className="flex items-end gap-1 sm:gap-1.5 h-36">
            {r.meses.map((m, i) => {
              const valor = r.porMes[m]
              const pct = (valor / maxMes) * 100
              const esEsteMes = i === r.meses.length - 1
              return (
                <div key={m} className="flex-1 min-w-0 flex flex-col items-center gap-1 group relative">
                  {valor > 0 && (
                    <div className="absolute bottom-6 left-1/2 -translate-x-1/2 bg-ink-800 text-white text-[11px] px-1.5 py-0.5 rounded whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-10">
                      {formatCLP(valor)}
                    </div>
                  )}
                  <div className="w-full flex items-end" style={{ height: '96px' }}>
                    <div
                      className={`w-full rounded-t transition-all ${esEsteMes ? 'bg-accent-500' : 'bg-accent-200 group-hover:bg-accent-300'} ${valor === 0 ? 'opacity-30' : ''}`}
                      style={{ height: `${Math.max(pct, valor > 0 ? 4 : 0)}%` }}
                    />
                  </div>
                  <span className="text-[11px] leading-tight text-ink-400 text-center">
                    {etiquetaMes(m)}
                    <span className="block h-3">{(i === 0 || m.endsWith('-01')) ? m.slice(2, 4) : ''}</span>
                  </span>
                </div>
              )
            })}
          </div>
        </div>
      ) : (
        <div className="hoja p-12 text-center">
          <TrendingUp size={36} className="mx-auto mb-3 text-ink-200" />
          <p className="text-ink-400 font-medium">Sin gastos aprobados en los últimos 12 meses</p>
          <p className="text-ink-400 text-sm mt-1">Los gastos aparecen aquí una vez que el aprobador los confirma</p>
        </div>
      )}

      {r.porCategoria.length > 0 && (
        <div className="hoja overflow-hidden">
          <div className="px-5 py-3 border-b border-ink-100">
            <h2 className="text-sm font-semibold text-ink-700">Por categoría</h2>
          </div>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-ink-50">
                <th className="text-left px-5 py-2.5 text-xs font-semibold text-ink-400">Categoría</th>
                <th className="text-right px-5 py-2.5 text-xs font-semibold text-ink-400">Total</th>
                <th className="text-right px-5 py-2.5 text-xs font-semibold text-ink-400">% del total</th>
              </tr>
            </thead>
            <tbody>
              {r.porCategoria.map(c => (
                <tr key={c.id ?? '__sin__'} className="border-b border-ink-50 hover:bg-ink-50/40">
                  <td className="px-5 py-3 text-ink-700 font-medium">{c.nombre}</td>
                  <td className="px-5 py-3 text-right font-mono-amount text-ink-700">{formatCLP(c.total)}</td>
                  <td className="px-5 py-3 text-right text-ink-400 text-xs">{((c.total / r.totalAprobado) * 100).toFixed(1)}%</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="bg-ink-50/60">
                <td className="px-5 py-3 font-semibold text-ink-700">Total</td>
                <td className="px-5 py-3 text-right font-mono-amount font-bold text-accent-700">{formatCLP(r.totalAprobado)}</td>
                <td className="px-5 py-3 text-right text-ink-400 text-xs">100%</td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}

      {r.totalAprobado > 0 && (
        <div className="hoja overflow-hidden">
          <div className="px-5 py-3 border-b border-ink-100">
            <h2 className="text-sm font-semibold text-ink-700">Detalle mensual</h2>
          </div>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-ink-50">
                <th className="text-left px-5 py-2.5 text-xs font-semibold text-ink-400">Mes</th>
                <th className="text-right px-5 py-2.5 text-xs font-semibold text-ink-400">Total</th>
              </tr>
            </thead>
            <tbody>
              {r.meses.filter(m => r.porMes[m] > 0).reverse().map(m => (
                <tr key={m} className="border-b border-ink-50 hover:bg-ink-50/40">
                  <td className="px-5 py-3 text-ink-700">{etiquetaMes(m)} {m.slice(2, 4)}</td>
                  <td className="px-5 py-3 text-right font-mono-amount text-ink-700">{formatCLP(r.porMes[m])}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
```

(Las etiquetas de mes y la burbuja pasan de 9-10 px a 11 px: el piso tipográfico de Tornasol.)

- [ ] **Step 7: Verificar**

Run: `npx vitest run && npx tsc --noEmit && npx eslint .`
Expected: todo en verde, sin salida de `tsc`, 0 errores de lint. `grep -rn "getMyMonthlySummary\|MonthlyCategoryRow" src` no devuelve nada.

- [ ] **Step 8: Commit**

```bash
git add src/lib/mis-gastos.ts src/tests/mis-gastos.test.ts src/actions/expenses.ts "src/app/(app)/mis-gastos/page.tsx"
git commit -m "feat(mis-gastos): total aprobado, pendiente y promedio, con caja chica y solo gastos" -m "Hasta hoy sumaba adelantos y devoluciones de las cargas históricas como gastos, y no contaba caja chica." -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

## Task 4: Los documentos filtrables

**Files:**
- Create: `src/lib/opciones-filtro.ts`
- Modify: `src/actions/expenses.ts` (agregar `getMisRendicionesFiltrables` después de `getMyReports`, ~línea 344)
- Modify: `src/actions/petty-cash.ts:587-624` (`listPettyCashFunds`)

**Interfaces:**
- Consumes: `documentoDeRendicion`, `documentoDeFondo`, `RendicionFiltrable`, `OpcionesFiltro`, `DocumentoFiltrable` de `@/lib/filtro-documentos`.
- Produces:
  - `@/lib/opciones-filtro`: `cargarOpcionesFiltro(supabase: Cliente, docs: DocumentoFiltrable[]): Promise<OpcionesFiltro>` (`Cliente` = el de `@/lib/supabase/server`).
  - `@/actions/expenses`: `getMisRendicionesFiltrables(): Promise<RendicionFiltrable[]>`
  - `@/actions/petty-cash`: `listPettyCashFunds()` devuelve además, por fondo, `proyecto_id` y los campos de `DocumentoFiltrable` (`proyectoId`, `familia`, `beneficiarioId`, `creadoEl`, `gastos`). `FundListItem` cambia solo (es `ReturnType`). **Un empleado sin `can_manage_petty_cash` ni rol admin recibe solo sus fondos.**

- [ ] **Step 1: Crear `src/lib/opciones-filtro.ts`**

```ts
// Los nombres de lo que aparece en los chips, desde los ids que traen los
// documentos. Recibe el cliente de QUIEN CONSULTA: lo que su RLS no le deja
// ver, no aparece como opción. No es una acción del servidor a propósito: la
// llaman las páginas, no el navegador.

import type { createClient } from '@/lib/supabase/server'
import type { DocumentoFiltrable, OpcionesFiltro } from '@/lib/filtro-documentos'

type Cliente = Awaited<ReturnType<typeof createClient>>

export async function cargarOpcionesFiltro(supabase: Cliente, docs: DocumentoFiltrable[]): Promise<OpcionesFiltro> {
  const idsProyecto = [...new Set(docs.map(d => d.proyectoId).filter((id): id is string => !!id))]
  const idsCategoria = [...new Set(docs.flatMap(d => d.gastos.map(g => g.categoriaId)).filter((id): id is string => !!id))]

  const [{ data: proyectos }, { data: categorias }] = await Promise.all([
    idsProyecto.length
      ? supabase.from('proyectos').select('id, numero, nombre').in('id', idsProyecto).order('numero')
      : Promise.resolve({ data: [] as OpcionesFiltro['proyectos'] }),
    idsCategoria.length
      ? supabase.from('expense_categories').select('id, name').in('id', idsCategoria).order('name')
      : Promise.resolve({ data: [] as OpcionesFiltro['categorias'] }),
  ])

  return { proyectos: proyectos ?? [], categorias: categorias ?? [] }
}
```

- [ ] **Step 2: Agregar `getMisRendicionesFiltrables` en `src/actions/expenses.ts`**

Después de `getMyReports` (que se queda: la usa el inicio):

```ts
/**
 * Todas las rendiciones de quien consulta, con el resumen de sus gastos, para
 * el filtro de «Mis rendiciones». Se cargan una vez y se filtran en el
 * navegador: son pocas decenas al año por persona.
 */
export async function getMisRendicionesFiltrables(): Promise<RendicionFiltrable[]> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return []

  const { data: reportes } = await supabase
    .from('expense_reports')
    .select('id, title, status, total_amount, approved_amount, currency, submitted_at, created_at, reimbursed_at, payment_reference, proyecto_id, submitter_id')
    .eq('submitter_id', user.id)
    .is('deleted_at', null)
    .order('created_at', { ascending: false })
  if (!reportes?.length) return []

  const { data: items } = await supabase
    .from('expense_items')
    .select('report_id, item_type, category_id, date, amount_clp, status')
    .in('report_id', reportes.map(r => r.id))
    .is('deleted_at', null)

  const porReporte = new Map<string, NonNullable<typeof items>>()
  for (const i of items ?? []) {
    const lista = porReporte.get(i.report_id) ?? []
    lista.push(i)
    porReporte.set(i.report_id, lista)
  }

  return reportes.map(r => ({
    ...r,
    status: r.status as ReportStatus,
    ...documentoDeRendicion(r, porReporte.get(r.id) ?? []),
  }))
}
```

Imports a agregar arriba (si `ReportStatus` ya está importado, no duplicarlo):

```ts
import { documentoDeRendicion, type RendicionFiltrable } from '@/lib/filtro-documentos'
import type { ReportStatus } from '@/lib/constants'
```

(Si el import de `@/lib/filtro-documentos` de la Tarea 3 ya existe, sumar estos nombres a esa misma línea.)

- [ ] **Step 3: Cambiar `listPettyCashFunds` en `src/actions/petty-cash.ts`**

Reemplazar la función entera (hoy líneas 587-624) por:

```ts
export async function listPettyCashFunds() {
  const { supabase, profile } = await getProfile()
  const esGestor = profile.role === 'admin' || !!profile.can_manage_petty_cash

  let query = supabase
    .from('petty_cash_funds')
    .select('id, name, status, amount_requested, amount_approved, currency, period_start, period_end, employee_id, manager_id, created_at, proyecto_id')
    .is('deleted_at', null)
    .order('created_at', { ascending: false })

  // Qué fondos PUEDE ver cada uno lo decide la RLS (migración 032): los suyos,
  // los que creó, los de su cadena y los que esperan su paso en el banco.
  // «Aprueba» ya no deja ver todos los pendientes de la empresa.
  if (profile.role === 'admin') {
    query = query.eq('org_id', profile.org_id)
  }
  // Pero esta pantalla le muestra al empleado SOLO los fondos donde es el
  // beneficiario (Daniel, 2026-10-07): los que le toca aprobar se trabajan en
  // «Aprobaciones» y los del banco en «Cola bancaria». La RLS no cambia.
  if (!esGestor) {
    query = query.eq('employee_id', profile.id)
  }

  const { data: funds } = await query
  if (!funds?.length) return []

  const userIds = [...new Set([
    ...funds.map(f => f.employee_id),
    ...funds.map(f => f.manager_id),
  ])]

  // El resumen de gastos: lo mínimo para filtrar y sumar en la pantalla
  const [{ data: users }, { data: items }] = await Promise.all([
    supabase.from('users').select('id, full_name').in('id', userIds),
    supabase
      .from('petty_cash_items')
      .select('fund_id, category_id, date, amount_clp, status')
      .in('fund_id', funds.map(f => f.id)),
  ])

  const userMap = Object.fromEntries((users ?? []).map(u => [u.id, u.full_name]))
  const porFondo = new Map<string, NonNullable<typeof items>>()
  for (const i of items ?? []) {
    const lista = porFondo.get(i.fund_id) ?? []
    lista.push(i)
    porFondo.set(i.fund_id, lista)
  }

  return funds.map(f => ({
    ...f,
    employee_name: userMap[f.employee_id] ?? 'Desconocido',
    manager_name:  userMap[f.manager_id]  ?? 'Desconocido',
    ...documentoDeFondo(f, porFondo.get(f.id) ?? []),
  }))
}
```

Import arriba: `import { documentoDeFondo } from '@/lib/filtro-documentos'`.

- [ ] **Step 4: Verificar**

Run: `npx vitest run && npx tsc --noEmit && npx eslint .`
Expected: todo en verde. (`listPettyCashFunds` tiene un solo llamador, `petty-cash/page.tsx`; `FundListItem` gana campos y nada se rompe.)

- [ ] **Step 5: Commit**

```bash
git add src/lib/opciones-filtro.ts src/actions/expenses.ts src/actions/petty-cash.ts
git commit -m "feat(filtro): rendiciones y fondos llegan con el resumen de sus gastos" -m "En caja chica el empleado ve solo los fondos donde es beneficiario; quien administra fondos, los de siempre." -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

## Task 5: La barra de chips y su hoja

**Files:**
- Create: `src/components/filtros/BarraFiltros.tsx`, `src/components/filtros/HojaOpciones.tsx`
- Test: `src/tests/barra-filtros.test.tsx`
- Modify: `docs/superpowers/specs/2026-10-07-filtro-del-empleado-design.md` (§ Materiales: el chip activo usa `var(--cta-brand)`)

**Interfaces:**
- Consumes: `Filtro`, `FILTRO_VACIO`, `PresetFecha` (`@/lib/filtro-documentos`); `ClaveChip`, `Opcion`, `ETIQUETA_PRESET`, `nombreDeChip`, `chipActivo`, `quitarChip`, `etiquetaDeChip` (`@/lib/filtro-etiquetas`).
- Produces:
  - `export interface Dimension { clave: ClaveChip; opciones: (Opcion & { detalle?: string })[] }`
  - `export function BarraFiltros(props: { filtro: Filtro; onCambio: (f: Filtro) => void; dimensiones: Dimension[]; contar: (f: Filtro) => number; sustantivo: [string, string]; resumen: string | null })`
  - `export function HojaOpciones(props: { dimension: Dimension; filtro: Filtro; contar: (f: Filtro) => number; sustantivo: [string, string]; onAplicar: (f: Filtro) => void; onCerrar: () => void })`

- [ ] **Step 1: Escribir la prueba**

Crear `src/tests/barra-filtros.test.tsx`:

```tsx
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { BarraFiltros, type Dimension } from '@/components/filtros/BarraFiltros'
import { FILTRO_VACIO, type Filtro } from '@/lib/filtro-documentos'

const dimensiones: Dimension[] = [
  { clave: 'categorias', opciones: [
    { id: 'comb', etiqueta: 'Combustible', detalle: '3 gastos' },
    { id: 'alim', etiqueta: 'Alimentación' },
  ] },
  { clave: 'fecha', opciones: [] },
]

function montar(filtro: Filtro = FILTRO_VACIO, resumen: string | null = null) {
  const onCambio = vi.fn()
  render(
    <BarraFiltros
      filtro={filtro} onCambio={onCambio} dimensiones={dimensiones}
      contar={f => (f.categorias.length ? 1 : 5)}
      sustantivo={['rendición', 'rendiciones']} resumen={resumen}
    />,
  )
  return onCambio
}

describe('BarraFiltros', () => {
  it('sin filtro, cada chip muestra su nombre y no hay línea de resultado', () => {
    montar()
    expect(screen.getByRole('button', { name: 'Tipo de gasto' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Fecha' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Limpiar' })).toBeNull()
  })

  it('elegir en la hoja y aplicar devuelve el filtro, con el número de lo que queda', () => {
    const onCambio = montar()
    fireEvent.click(screen.getByRole('button', { name: 'Tipo de gasto' }))
    fireEvent.click(screen.getByLabelText(/Combustible/))
    fireEvent.click(screen.getByRole('button', { name: 'Ver 1 rendición' }))
    expect(onCambio).toHaveBeenCalledWith({ ...FILTRO_VACIO, categorias: ['comb'] })
  })

  it('cerrar la hoja descarta lo marcado', () => {
    const onCambio = montar()
    fireEvent.click(screen.getByRole('button', { name: 'Tipo de gasto' }))
    fireEvent.click(screen.getByLabelText(/Combustible/))
    fireEvent.click(screen.getByRole('button', { name: 'Cerrar' }))
    expect(onCambio).not.toHaveBeenCalled()
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('Escape también cierra', () => {
    montar()
    fireEvent.click(screen.getByRole('button', { name: 'Tipo de gasto' }))
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('con algo elegido, el chip lo muestra y su ✕ lo quita', () => {
    const onCambio = montar({ ...FILTRO_VACIO, categorias: ['comb'] }, '3 de 12 · $ 97.300 en Combustible')
    expect(screen.getByRole('button', { name: 'Combustible' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Quitar filtro Tipo de gasto' }))
    expect(onCambio).toHaveBeenCalledWith(FILTRO_VACIO)
  })

  it('«Limpiar» de la línea de resultado lo saca todo', () => {
    const onCambio = montar({ ...FILTRO_VACIO, categorias: ['comb'], fecha: 'este-mes' }, 'resumen')
    fireEvent.click(screen.getByRole('button', { name: 'Limpiar' }))
    expect(onCambio).toHaveBeenCalledWith(FILTRO_VACIO)
  })

  it('la fecha se elige de una lista, y «Elegir fechas» muestra los dos campos', () => {
    const onCambio = montar()
    fireEvent.click(screen.getByRole('button', { name: 'Fecha' }))
    fireEvent.click(screen.getByLabelText('Elegir fechas'))
    expect(screen.getByLabelText('Desde')).toBeInTheDocument()
    fireEvent.click(screen.getByLabelText('Este mes'))
    fireEvent.click(screen.getByRole('button', { name: /^Ver / }))
    expect(onCambio).toHaveBeenCalledWith({ ...FILTRO_VACIO, fecha: 'este-mes' })
  })
})
```

- [ ] **Step 2: Correrla y ver que falla**

Run: `npx vitest run src/tests/barra-filtros.test.tsx`
Expected: FAIL — no resuelve `@/components/filtros/BarraFiltros`.

- [ ] **Step 3: Crear `src/components/filtros/HojaOpciones.tsx`**

```tsx
'use client'

// Las opciones de un chip. En el teléfono, una hoja que sube desde abajo;
// desde `sm`, un menú anclado bajo el chip. Lo marcado es un borrador: solo
// cambia el filtro al tocar «Ver N …»; cerrar lo descarta.

import { useEffect, useMemo, useState } from 'react'
import { Search, X } from 'lucide-react'
import type { Filtro, PresetFecha } from '@/lib/filtro-documentos'
import { ETIQUETA_PRESET, nombreDeChip, quitarChip } from '@/lib/filtro-etiquetas'
import type { Dimension } from './BarraFiltros'

const PRESETS: PresetFecha[] = ['este-mes', 'mes-pasado', 'ultimos-3', 'este-anio', 'elegir']

interface Props {
  dimension:  Dimension
  filtro:     Filtro
  contar:     (f: Filtro) => number
  sustantivo: [string, string]
  onAplicar:  (f: Filtro) => void
  onCerrar:   () => void
}

export function HojaOpciones({ dimension, filtro, contar, sustantivo, onAplicar, onCerrar }: Props) {
  const { clave, opciones } = dimension
  const [borrador, setBorrador] = useState<Filtro>(filtro)
  const [busqueda, setBusqueda] = useState('')

  useEffect(() => {
    const alTeclear = (e: KeyboardEvent) => { if (e.key === 'Escape') onCerrar() }
    window.addEventListener('keydown', alTeclear)
    return () => window.removeEventListener('keydown', alTeclear)
  }, [onCerrar])

  const visibles = useMemo(() => {
    const q = busqueda.trim().toLowerCase()
    return q ? opciones.filter(o => o.etiqueta.toLowerCase().includes(q)) : opciones
  }, [opciones, busqueda])

  // Con pocas opciones un buscador estorba más de lo que ayuda
  const conBuscador = (clave === 'proyectos' || clave === 'empleados') && opciones.length > 6
  const n = contar(borrador)

  function alternar(id: string) {
    if (clave === 'fecha') return
    const actual: string[] = borrador[clave]
    const nuevo = actual.includes(id) ? actual.filter(x => x !== id) : [...actual, id]
    setBorrador({ ...borrador, [clave]: nuevo })
  }

  return (
    <>
      {/* Velo: oscuro en el teléfono; transparente en escritorio, donde solo sirve para cerrar al tocar afuera */}
      <div className="fixed inset-0 z-[60] bg-black/50 sm:bg-transparent" onClick={onCerrar} aria-hidden="true" />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={nombreDeChip(clave)}
        className="hoja fixed inset-x-0 bottom-0 z-[61] max-h-[80vh] overflow-y-auto rounded-b-none p-4 pb-6
                   sm:absolute sm:inset-x-auto sm:bottom-auto sm:left-0 sm:top-full sm:mt-2 sm:w-80 sm:max-h-96 sm:rounded-card sm:pb-4"
      >
        <div className="flex items-center justify-between gap-3 mb-2">
          <h2 className="font-display font-bold text-lg text-ink-900">{nombreDeChip(clave)}</h2>
          <button
            type="button" onClick={onCerrar} aria-label="Cerrar"
            className="h-11 w-11 inline-flex items-center justify-center rounded-item bg-ink-100 text-ink-600"
          >
            <X size={18} />
          </button>
        </div>

        {conBuscador && (
          <label className="campo flex items-center gap-2 mb-2">
            <Search size={16} className="text-ink-400 shrink-0" />
            <input
              value={busqueda} onChange={e => setBusqueda(e.target.value)}
              placeholder="Buscar por número o nombre" className="w-full bg-transparent outline-none"
            />
          </label>
        )}

        {clave === 'fecha' ? (
          <div className="divide-y divide-ink-100">
            {PRESETS.map(p => (
              <label key={p} className="flex items-center gap-3 min-h-12 card-label text-ink-800 cursor-pointer">
                <input
                  type="radio" name="fecha" checked={borrador.fecha === p}
                  onChange={() => setBorrador({ ...borrador, fecha: p, ...(p === 'elegir' ? {} : { desde: null, hasta: null }) })}
                  className="accent-brand-600 w-5 h-5 shrink-0"
                />
                {ETIQUETA_PRESET[p]}
              </label>
            ))}
            {borrador.fecha === 'elegir' && (
              <div className="grid grid-cols-2 gap-3 pt-3">
                <label className="card-meta text-ink-500">
                  Desde
                  <input
                    type="date" value={borrador.desde ?? ''}
                    onChange={e => setBorrador({ ...borrador, desde: e.target.value || null })}
                    className="campo w-full mt-1"
                  />
                </label>
                <label className="card-meta text-ink-500">
                  Hasta
                  <input
                    type="date" value={borrador.hasta ?? ''}
                    onChange={e => setBorrador({ ...borrador, hasta: e.target.value || null })}
                    className="campo w-full mt-1"
                  />
                </label>
              </div>
            )}
          </div>
        ) : (
          <div className="divide-y divide-ink-100">
            {visibles.map(o => {
              const marcado = (borrador[clave] as string[]).includes(o.id)
              return (
                <label key={o.id} className="flex items-center gap-3 min-h-12 cursor-pointer">
                  <input
                    type="checkbox" checked={marcado} onChange={() => alternar(o.id)}
                    className="accent-brand-600 w-5 h-5 shrink-0"
                  />
                  <span className={`card-label flex-1 min-w-0 ${marcado ? 'font-semibold text-ink-900' : 'text-ink-700'}`}>
                    {o.etiqueta}
                  </span>
                  {o.detalle && <span className="card-meta text-ink-400 shrink-0">{o.detalle}</span>}
                </label>
              )
            })}
            {visibles.length === 0 && <p className="card-meta text-ink-400 py-3">Sin resultados</p>}
          </div>
        )}

        <div className="flex items-center gap-2 mt-4">
          <button
            type="button" onClick={() => setBorrador(quitarChip(clave, borrador))}
            className="h-12 px-4 card-label font-bold text-brand-600"
          >
            Limpiar
          </button>
          <button type="button" onClick={() => onAplicar(borrador)} className="btn-primario flex-1 h-12">
            Ver {n} {n === 1 ? sustantivo[0] : sustantivo[1]}
          </button>
        </div>
      </div>
    </>
  )
}
```

Nota: la prueba de «Limpiar» de la línea de resultado busca el único botón «Limpiar» de la pantalla; con la hoja cerrada, el de la hoja no existe.

- [ ] **Step 4: Crear `src/components/filtros/BarraFiltros.tsx`**

```tsx
'use client'

// La barra de chips del filtro del empleado (diseño A, elegido por Daniel el
// 2026-10-07). No sabe de rendiciones ni de fondos: recibe qué chips mostrar y
// con qué opciones, y devuelve un Filtro. Qué documento entra lo decide
// src/lib/filtro-documentos.ts; acá solo se elige.
//
// Va sobre hoja blanca, nunca sobre el degradado (regla de Tornasol).

import { useState } from 'react'
import { ChevronDown, X } from 'lucide-react'
import { FILTRO_VACIO, type Filtro } from '@/lib/filtro-documentos'
import {
  chipActivo, etiquetaDeChip, nombreDeChip, quitarChip, type ClaveChip, type Opcion,
} from '@/lib/filtro-etiquetas'
import { HojaOpciones } from './HojaOpciones'

export interface Dimension {
  clave:    ClaveChip
  opciones: (Opcion & { detalle?: string })[]
}

interface Props {
  filtro:      Filtro
  onCambio:    (f: Filtro) => void
  dimensiones: Dimension[]
  /** Cuántos documentos quedarían con este filtro: el número del botón de la hoja */
  contar:      (f: Filtro) => number
  sustantivo:  [singular: string, plural: string]
  /** La línea bajo los chips; null cuando no hay filtro puesto */
  resumen:     string | null
}

export function BarraFiltros({ filtro, onCambio, dimensiones, contar, sustantivo, resumen }: Props) {
  const [abierta, setAbierta] = useState<ClaveChip | null>(null)

  return (
    <div className="hoja">
      {/* En el teléfono la fila se desliza; desde `sm` cabe, y el menú del
          chip necesita que nada lo recorte. */}
      <div className="flex gap-2 px-4 py-3 overflow-x-auto sm:overflow-visible sm:flex-wrap">
        {dimensiones.map(d => {
          const activo = chipActivo(d.clave, filtro)
          return (
            <div key={d.clave} className="relative shrink-0">
              <div
                className={`inline-flex items-center h-10 rounded-full border text-sm font-semibold whitespace-nowrap ${
                  activo ? 'border-transparent text-white' : 'border-ink-200 bg-white text-ink-700'
                }`}
                style={activo ? { background: 'var(--cta-brand)' } : undefined}
              >
                <button
                  type="button"
                  onClick={() => setAbierta(d.clave)}
                  aria-expanded={abierta === d.clave}
                  className={`inline-flex items-center gap-1.5 h-10 max-w-[13rem] ${activo ? 'pl-3.5 pr-1' : 'px-3.5'}`}
                >
                  <span className="truncate">{etiquetaDeChip(d.clave, filtro, d.opciones)}</span>
                  {!activo && <ChevronDown size={15} className="shrink-0" aria-hidden="true" />}
                </button>
                {activo && (
                  <button
                    type="button"
                    onClick={() => onCambio(quitarChip(d.clave, filtro))}
                    aria-label={`Quitar filtro ${nombreDeChip(d.clave)}`}
                    className="h-10 w-9 inline-flex items-center justify-center"
                  >
                    <X size={15} aria-hidden="true" />
                  </button>
                )}
              </div>
              {abierta === d.clave && (
                <HojaOpciones
                  dimension={d} filtro={filtro} contar={contar} sustantivo={sustantivo}
                  onAplicar={f => { onCambio(f); setAbierta(null) }}
                  onCerrar={() => setAbierta(null)}
                />
              )}
            </div>
          )
        })}
      </div>

      {/* Plegar o recargar nunca esconde que hay un filtro puesto */}
      {resumen && (
        <div className="flex items-center justify-between gap-3 px-4 py-2.5 border-t border-ink-100 bg-brand-50/60 rounded-b-card">
          <span className="card-meta text-ink-600 min-w-0">{resumen}</span>
          <button type="button" onClick={() => onCambio(FILTRO_VACIO)} className="card-meta font-bold text-brand-600 shrink-0">
            Limpiar
          </button>
        </div>
      )}
    </div>
  )
}
```

(`h-10` = 40 px de chip; con los 12 px de la fila arriba y abajo, el área de toque supera los 44 px.)

- [ ] **Step 5: Correr la prueba**

Run: `npx vitest run src/tests/barra-filtros.test.tsx`
Expected: PASS (7 pruebas).

- [ ] **Step 6: Ajustar la spec**

En `docs/superpowers/specs/2026-10-07-filtro-del-empleado-design.md`, § «Materiales», reemplazar «Chip activo con el relleno `--anod` corregido de la fe de erratas (`#199C90 → #12807C → #0B4448`).» por «Chip activo con `var(--cta-brand)`, el degradado de acción de la app: `--anod` no existe como variable, y escribir sus hexadecimales en un componente rompería el sistema.»

- [ ] **Step 7: Verificar y commit**

Run: `npx vitest run && npx tsc --noEmit && npx eslint .` — todo en verde.

```bash
git add src/components/filtros src/tests/barra-filtros.test.tsx docs/superpowers/specs/2026-10-07-filtro-del-empleado-design.md
git commit -m "feat(filtro): la barra de chips y su hoja de opciones" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

## Task 6: Mis rendiciones

**Files:**
- Create: `src/app/(app)/reimbursements/MisRendiciones.tsx`
- Modify: `src/app/(app)/reimbursements/page.tsx` (completo)
- Modify: `src/components/expenses/ExpenseReportCard.tsx` (prop `coincidencia`)
- Modify: `src/app/(app)/page.tsx:100-104` («Ver todas» siempre)
- Modify: `e2e/rutas.ts:71` (nombre de la ruta)

**Interfaces:**
- Consumes: `getMisRendicionesFiltrables` (Tarea 4), `cargarOpcionesFiltro` (Tarea 4), `aplicarFiltro`, `contarPorCategoria`, `hayFiltro`, `fechaEnChile`, `FILTRO_VACIO`, `SIN_PROYECTO`, `ETIQUETAS_ESTADO`, `ORDEN_FAMILIAS`, `Filtro`, `OpcionesFiltro`, `RendicionFiltrable` (Tarea 1), `leerFiltro`, `escribirFiltro`, `depurarFiltro`, `paramsDePagina`, `textoResumen`, `textoCoincidencia`, `etiquetaDeProyecto` (Tarea 2), `BarraFiltros`, `Dimension` (Tarea 5).
- Produces: `ExpenseReportCard` acepta `coincidencia?: string | null`.

- [ ] **Step 1: `ExpenseReportCard` con su línea de coincidencia**

En `src/components/expenses/ExpenseReportCard.tsx`:

1. Import: cambiar `import Link from 'next/link'` por estas dos líneas:
```tsx
import Link from 'next/link'
import { Tag } from 'lucide-react'
```
2. En `ExpenseReportCardProps`, después de `report: {…}`, agregar:
```tsx
  /** Con tipo de gasto elegido en el filtro: «2 gastos de Combustible · $ 38.400» */
  coincidencia?: string | null
```
3. Firma: `export function ExpenseReportCard({ report, coincidencia }: ExpenseReportCardProps) {`
4. Justo antes del bloque `{report.status === 'partially_approved' && …}`, agregar:
```tsx
          {coincidencia && (
            <p className="mt-2 card-meta font-semibold text-brand-600 flex items-center gap-1.5">
              <Tag size={14} className="shrink-0" aria-hidden="true" />
              {coincidencia}
            </p>
          )}
```

- [ ] **Step 2: Crear `src/app/(app)/reimbursements/MisRendiciones.tsx`**

```tsx
'use client'

import { useMemo, useState } from 'react'
import { AlertTriangle, Filter, ReceiptText } from 'lucide-react'
import { ExpenseReportCard } from '@/components/expenses/ExpenseReportCard'
import { BarraFiltros, type Dimension } from '@/components/filtros/BarraFiltros'
import {
  aplicarFiltro, contarPorCategoria, hayFiltro,
  ETIQUETAS_ESTADO, FILTRO_VACIO, ORDEN_FAMILIAS, SIN_PROYECTO,
  type Filtro, type OpcionesFiltro, type RendicionFiltrable,
} from '@/lib/filtro-documentos'
import { depurarFiltro, escribirFiltro } from '@/lib/filtro-url'
import { etiquetaDeProyecto, textoCoincidencia, textoResumen } from '@/lib/filtro-etiquetas'

interface Props {
  documentos:    RendicionFiltrable[]
  opciones:      OpcionesFiltro
  filtroInicial: Filtro
  /** La fecha de hoy en Chile, del servidor: así servidor y navegador calculan lo mismo */
  hoy:           string
}

const gastos = (n: number) => (n === 1 ? '1 gasto' : `${n} gastos`)

export function MisRendiciones({ documentos, opciones, filtroInicial, hoy }: Props) {
  const categorias = useMemo(() => opciones.categorias.map(c => ({ id: c.id, etiqueta: c.name })), [opciones])

  const [filtro, setFiltro] = useState(() => depurarFiltro(filtroInicial, {
    proyectos:  opciones.proyectos.map(p => p.id),
    categorias: opciones.categorias.map(c => c.id),
    empleados:  [],
  }))

  function cambiar(f: Filtro) {
    setFiltro(f)
    // Se integra con el router de Next 16 sin volver a pedir la página
    window.history.replaceState(null, '', `${window.location.pathname}${escribirFiltro(f)}`)
  }

  const resultado = useMemo(() => aplicarFiltro(documentos, filtro, hoy), [documentos, filtro, hoy])
  const conteo = useMemo(() => contarPorCategoria(documentos), [documentos])

  const dimensiones: Dimension[] = [
    { clave: 'proyectos', opciones: [
      { id: SIN_PROYECTO, etiqueta: 'Sin proyecto' },
      ...opciones.proyectos.map(p => ({ id: p.id, etiqueta: etiquetaDeProyecto(p) })),
    ] },
    { clave: 'categorias', opciones: categorias.map(c => ({ ...c, detalle: gastos(conteo.get(c.id) ?? 0) })) },
    { clave: 'fecha', opciones: [] },
    { clave: 'estados', opciones: ORDEN_FAMILIAS.map(f => ({ id: f, etiqueta: ETIQUETAS_ESTADO.rendicion[f] })) },
  ]

  if (documentos.length === 0) {
    return (
      <div className="max-w-2xl mx-auto space-y-6">
        <h1 className="text-2xl font-display font-bold tor-on-gradient">Mis rendiciones</h1>
        <div className="hoja p-12 text-center">
          <ReceiptText size={40} className="mx-auto mb-3 text-ink-300" aria-hidden="true" />
          <p className="card-label font-medium text-ink-600">Sin rendiciones aún</p>
          <p className="card-meta text-ink-400 mt-1">Toca «Rendir» en la barra de abajo para crear la primera</p>
        </div>
      </div>
    )
  }

  return (
    <div className="max-w-2xl mx-auto space-y-3">
      <div>
        <h1 className="text-2xl font-display font-bold tor-on-gradient">Mis rendiciones</h1>
        <p className="tor-on-gradient-soft text-sm mt-1">
          {documentos.length === 1 ? '1 rendición' : `${documentos.length} rendiciones`}
        </p>
      </div>

      <BarraFiltros
        filtro={filtro}
        onCambio={cambiar}
        dimensiones={dimensiones}
        contar={f => aplicarFiltro(documentos, f, hoy).visibles.length}
        sustantivo={['rendición', 'rendiciones']}
        resumen={hayFiltro(filtro)
          ? textoResumen({ visibles: resultado.visibles.length, total: documentos.length, totalClp: resultado.totalClp }, filtro, categorias)
          : null}
      />

      {resultado.visibles.length === 0 ? (
        <div className="hoja p-8 text-center">
          <Filter size={28} className="mx-auto mb-2 text-ink-300" aria-hidden="true" />
          <p className="card-label text-ink-600">Ninguna rendición cumple este filtro</p>
          <button type="button" onClick={() => cambiar(FILTRO_VACIO)} className="mt-2 card-label font-semibold text-brand-600">
            Limpiar filtros
          </button>
        </div>
      ) : (
        <div className="space-y-3">
          {resultado.visibles.map(({ doc, gastos: coinciden, montoClp }) => (
            <div key={doc.id}>
              <ExpenseReportCard
                report={{ ...doc, currency: doc.currency ?? 'CLP' }}
                coincidencia={filtro.categorias.length
                  ? textoCoincidencia({ gastos: coinciden.length, montoClp }, filtro, categorias)
                  : null}
              />
              {doc.status === 'reimbursed' && doc.payment_reference && (
                <p className="card-meta text-ink-100 ml-2 mt-1">
                  Ref: {doc.payment_reference}
                  {doc.reimbursed_at && ` · ${new Date(doc.reimbursed_at).toLocaleDateString('es-CL')}`}
                </p>
              )}
              {(doc.status === 'rejected' || doc.status === 'partially_approved') && (
                <p className="card-meta text-white ml-2 mt-1 font-medium flex items-center gap-1.5">
                  <AlertTriangle size={14} className="shrink-0" aria-hidden="true" />
                  Requiere corrección — revisa los motivos en el detalle
                </p>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
```

(Las dos líneas bajo una tarjeta quedan sobre el degradado: van en blanco, como pide `tor-on-gradient`. Hoy eran `text-ink-400` y `text-danger-500` apoyados en el fondo oscuro.)

- [ ] **Step 3: Reescribir `src/app/(app)/reimbursements/page.tsx`**

```tsx
import { redirect } from 'next/navigation'
import { getAuthUser } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import { getMisRendicionesFiltrables } from '@/actions/expenses'
import { cargarOpcionesFiltro } from '@/lib/opciones-filtro'
import { fechaEnChile } from '@/lib/filtro-documentos'
import { leerFiltro, paramsDePagina } from '@/lib/filtro-url'
import { MisRendiciones } from './MisRendiciones'

export default async function ReimbursementsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const user = await getAuthUser()
  if (!user) redirect('/login')

  const [documentos, params] = await Promise.all([getMisRendicionesFiltrables(), searchParams])
  const opciones = await cargarOpcionesFiltro(await createClient(), documentos)

  return (
    <MisRendiciones
      documentos={documentos}
      opciones={opciones}
      filtroInicial={leerFiltro(paramsDePagina(params))}
      hoy={fechaEnChile()}
    />
  )
}
```

- [ ] **Step 4: «Ver todas» siempre en el inicio**

En `src/app/(app)/page.tsx`, reemplazar:

```tsx
          {reports.length > 5 && (
            <Link href="/reimbursements" className="block text-center card-label text-brand-600 hover:underline mt-3">
              Ver todas ({reports.length})
            </Link>
          )}
```

por:

```tsx
          {/* Siempre, no solo con más de 5: es la puerta a la lista con filtro */}
          <Link href="/reimbursements" className="block text-center card-label text-brand-600 hover:underline mt-3">
            Ver todas mis rendiciones
          </Link>
```

(Está dentro de `{recent.length > 0 && …}`, así que solo aparece si hay al menos una.)

- [ ] **Step 5: Nombre de la ruta en el arnés**

En `e2e/rutas.ts:71`, cambiar `nombre: 'Historial de reembolsos'` por `nombre: 'Mis rendiciones'`. El `slug` (`reembolsos`) **no cambia**: es el nombre del archivo de la captura.

- [ ] **Step 6: Verificar con pruebas y tipos**

Run: `npx vitest run && npx tsc --noEmit && npx eslint .` — todo en verde.

- [ ] **Step 7: Verificar en el navegador**

`preview_start` con `{ name: "mi-rendicion-dev" }`. En el panel del navegador, con la sesión que haya, ir a `/reimbursements` y `resize_window` a `mobile`:
- La barra de chips va en una hoja blanca bajo el título.
- Tocar «Tipo de gasto» (buscar el botón por su nombre) abre la hoja desde abajo, **por encima de la barra de navegación**. Si queda recortada o por debajo, envolver el contenido de `HojaOpciones` en `createPortal(…, document.body)` y anotarlo en el commit.
- Marcar una categoría: el botón dice «Ver N rendiciones»; al aplicarlo, el chip queda relleno, la línea «N de M · $ …» aparece y cada tarjeta muestra su coincidencia.
- La dirección muestra `?tipo=…`; recargar conserva el filtro.
- `resize_window` a `desktop`: el chip abre un menú bajo el chip, no una hoja.
- `read_console_messages` con `onlyErrors: true`: sin errores.
- Volver a `resize_window` `desktop`. **Solo navegar y filtrar: ningún botón que actúe sobre datos.**

- [ ] **Step 8: Commit**

```bash
git add "src/app/(app)/reimbursements" src/components/expenses/ExpenseReportCard.tsx "src/app/(app)/page.tsx" e2e/rutas.ts
git commit -m "feat(rendiciones): Mis rendiciones con la barra de chips" -m "Sale la tarjeta «Total reembolsado» (lo responde Mis gastos) y «Ver todas» aparece siempre." -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

## Task 7: Caja chica con los chips, y exportar lo filtrado

**Files:**
- Modify: `src/actions/petty-cash.ts:778-955` (`getPettyCashItemsForReport`)
- Modify: `src/app/(app)/petty-cash/usePettyCashState.ts`
- Modify: `src/app/(app)/petty-cash/client.tsx`, `FundList.tsx`, `page.tsx`
- Delete: `src/app/(app)/petty-cash/FundFilters.tsx`
- Modify: `docs/superpowers/specs/2026-10-07-filtro-del-empleado-design.md` (§2, el conteo de la exportación)

**Interfaces:**
- Consumes: Tareas 1, 2, 4 y 5 (`aplicarFiltro`, `contarPorCategoria`, `hayFiltro`, `rangoDeFecha`, `historicaEntraEnExportacion`, `fechaEnChile`, `ETIQUETAS_ESTADO`, `ORDEN_FAMILIAS`, `SIN_PROYECTO`, `FILTRO_VACIO`, `Filtro`, `OpcionesFiltro`, `leerFiltro`, `escribirFiltro`, `depurarFiltro`, `paramsDePagina`, `textoResumen`, `textoCoincidencia`, `etiquetaDeProyecto`, `cargarOpcionesFiltro`, `BarraFiltros`, `Dimension`).
- Produces: `getPettyCashItemsForReport(filtros: { fundIds: string[]; dateFrom?: string; dateTo?: string; categoryIds?: string[]; employeeIds?: string[]; incluirHistorica: boolean }): Promise<{ items: …; totalCLP: number; deHistorica: number }>`.

- [ ] **Step 1: La exportación recibe los chips**

En `src/actions/petty-cash.ts`, en `getPettyCashItemsForReport`:

1. Firma:
```ts
export async function getPettyCashItemsForReport(filters: {
  /** Los fondos que quedaron a la vista: proyecto, estado y empleado ya se aplicaron en la pantalla */
  fundIds:          string[]
  dateFrom?:        string
  dateTo?:          string
  categoryIds?:     string[]
  /** Solo para la carga histórica: en los fondos, ya lo resolvió `fundIds` */
  employeeIds?:     string[]
  /** `historicaEntraEnExportacion(filtro)`: la histórica no tiene proyecto y cuenta como liquidada */
  incluirHistorica: boolean
}) {
```
2. Reemplazar el bloque de la consulta de fondos (`let fundsQuery = …` hasta `const { data: funds } = await fundsQuery`) por:
```ts
  // ── Fondos reales: los que la pantalla dejó a la vista ───────────────────
  const { data: funds } = filters.fundIds.length
    ? await supabase
        .from('petty_cash_funds')
        .select('id, name, employee_id')
        .eq('org_id', profile.org_id)
        .in('id', filters.fundIds)
    : { data: [] as { id: string; name: string; employee_id: string }[] }
```
3. La carga histórica se consulta solo si corresponde: envolver la consulta `histReportsQuery` así:
```ts
  let histReports: { id: string; title: string; submitter_id: string }[] = []
  if (filters.incluirHistorica) {
    let histReportsQuery = supabase
      .from('expense_reports')
      .select('id, title, submitter_id')
      .eq('org_id', profile.org_id)
      .eq('is_historical_import', true)
      .eq('historical_type', 'caja_chica')
      .is('deleted_at', null)
    if (filters.employeeIds?.length) {
      histReportsQuery = histReportsQuery.in('submitter_id', filters.employeeIds)
    }
    histReports = (await histReportsQuery).data ?? []
  }
```
y cambiar las dos líneas que siguen para que usen esa variable:
```ts
  const histReportIds = histReports.map(r => r.id)
  const histReportMap = Object.fromEntries(histReports.map(r => [r.id, r]))
```
(más abajo, `allEmpIds` usa `(histReports ?? [])`: sigue funcionando.)
4. En `applyItemFilters`, reemplazar las dos líneas de `filters.itemStatus` por:
```ts
    // Un gasto rechazado no es plata que la empresa gastó: no se exporta (spec §3)
    r = r.neq('status', 'rejected')
```
5. En la consulta de ítems históricos (`histItemsP`), agregar `item_type` al `select` y, después de `.is('deleted_at', null)`, la línea:
```ts
          .or('item_type.eq.expense,item_type.is.null')   // adelantos y devoluciones no son gastos
```
6. El `return` final:
```ts
  return { items: all, totalCLP, deHistorica: normalizedHist.length }
```

- [ ] **Step 2: El estado de la pantalla**

En `src/app/(app)/petty-cash/usePettyCashState.ts`:

1. Imports: borrar `import type { PeriodPreset } from '@/lib/report-helpers'` y agregar:
```ts
import {
  aplicarFiltro, historicaEntraEnExportacion, rangoDeFecha, type Filtro,
} from '@/lib/filtro-documentos'
import { escribirFiltro } from '@/lib/filtro-url'
```
2. Borrar `export type ReportResult = …` (solo la usaba `FundFilters`).
3. En `UsePettyCashStateProps` agregar:
```ts
  /** Ya depurado contra las opciones que existen */
  filtroInicial:            Filtro
  hoy:                      string
```
y sumar `filtroInicial, hoy` a la desestructuración de la firma de `usePettyCashState`.
4. Reemplazar el bloque `// ── Filtros de lista (cliente) ──` y el bloque `// ── Panel de informe ──` (todo su `useState`) por:
```ts
  // ── Filtro (chips) ────────────────────────────────────────────────────────
  const [filtro, setFiltroEstado] = useState<Filtro>(filtroInicial)
  function setFiltro(f: Filtro) {
    setFiltroEstado(f)
    // Se integra con el router de Next 16 sin volver a pedir la página
    window.history.replaceState(null, '', `${window.location.pathname}${escribirFiltro(f)}`)
  }

  const [generating, setGenerating] = useState(false)
```
5. Reemplazar el `const filtered = useMemo(…)` y `const activeFilters = …` por:
```ts
  const resultado = useMemo(() => aplicarFiltro(funds, filtro, hoy), [funds, filtro, hoy])
  const filtered = useMemo(() => resultado.visibles.map(v => v.doc), [resultado])
```
6. Borrar las funciones `toggleCat`, `clearListFilters`, `clearSearchFilters` y `fetchReportItems`. Reemplazar `handleExport` por:
```ts
  async function handleExport(format: 'excel' | 'pdf') {
    setGenerating(true)
    try {
      const rango = rangoDeFecha(filtro, hoy)
      const r = await getPettyCashItemsForReport({
        fundIds:          filtered.map(f => f.id),
        dateFrom:         rango.desde ?? undefined,
        dateTo:           rango.hasta ?? undefined,
        categoryIds:      filtro.categorias,
        employeeIds:      filtro.empleados,
        incluirHistorica: historicaEntraEnExportacion(filtro),
      })
      if (!r.items.length) {
        avisar('No hay gastos que exportar con este filtro')
        return
      }
      const titulo = `Caja Chica${rango.desde ? ` ${rango.desde}` : ''}${rango.hasta ? ` al ${rango.hasta}` : ''}`
      if (format === 'excel') {
        const { exportPettyCashToExcel } = await import('@/lib/export/excel')
        exportPettyCashToExcel(r.items, 'caja-chica-informe')
      } else {
        const { exportPettyCashToPDF } = await import('@/lib/export/pdf')
        exportPettyCashToPDF(r.items, titulo)
      }
      avisar(`Exportados ${r.items.length} gastos${r.deHistorica ? ` (${r.deHistorica} de la carga histórica)` : ''}`)
    } catch (err) {
      avisar(err instanceof Error ? err.message : 'Error al exportar', 'error')
    } finally {
      setGenerating(false)
    }
  }
```
7. En el `return` del hook, borrar las claves de los filtros viejos y del informe (`statusFilter` … `activeFilters`, `reportDateFrom` … `reportError`, `toggleCat`, `clearListFilters`, `clearSearchFilters`, `fetchReportItems`) y agregar:
```ts
    // Filtro
    filtro, setFiltro, resultado,
    generating,
```
(`filtered`, `employees` y `handleExport` se quedan.)

- [ ] **Step 3: `FundList` sin el filtro viejo**

En `src/app/(app)/petty-cash/FundList.tsx`:

1. Import de íconos: agregar `Tag` a la lista de `lucide-react`.
2. Props: reemplazar `selectedEmpIds_list: string[]` por `compacta: boolean`, `clearListFilters: () => void` por `limpiarFiltro: () => void`, y agregar `coincidencia: (fundId: string) => string | null`. Ajustar la desestructuración igual.
3. `if (selectedEmpIds_list.length > 0) {` → `if (compacta) {`.
4. El botón del estado vacío llama `onClick={limpiarFiltro}`.
5. En la vista detallada, después de `<p className="card-meta text-ink-400 mt-0.5">{formatPeriod(…)}</p>`, agregar:
```tsx
                {coincidencia(f.id) && (
                  <p className="card-meta font-semibold text-brand-600 mt-1 flex items-center gap-1.5">
                    <Tag size={14} className="shrink-0" aria-hidden="true" />
                    {coincidencia(f.id)}
                  </p>
                )}
```

- [ ] **Step 4: `client.tsx` con la barra de chips**

En `src/app/(app)/petty-cash/client.tsx`:

1. Imports: borrar `import { FundFilters } from './FundFilters'`; agregar:
```tsx
import { useMemo } from 'react'
import { BarraFiltros, type Dimension } from '@/components/filtros/BarraFiltros'
import {
  contarPorCategoria, hayFiltro, ETIQUETAS_ESTADO, FILTRO_VACIO, ORDEN_FAMILIAS, SIN_PROYECTO,
  type Filtro, type OpcionesFiltro,
} from '@/lib/filtro-documentos'
import { depurarFiltro } from '@/lib/filtro-url'
import { etiquetaDeProyecto, textoCoincidencia, textoResumen } from '@/lib/filtro-etiquetas'
```
2. `Props`: borrar `initialCategories: Category[]`; agregar `opciones: OpcionesFiltro`, `filtroInicial: Filtro`, `hoy: string`. En la desestructuración, lo mismo. Si `Category` queda sin uso en el import de `./usePettyCashState`, sacarlo de ese import.
3. Antes de `const state = usePettyCashState({…})`:
```tsx
  // Empleados para el chip: los beneficiarios de los fondos que ve
  const empleadosFondos = useMemo(() => {
    const m = new Map<string, string>()
    for (const f of initialFunds) m.set(f.employee_id, f.employee_name)
    return [...m].map(([id, etiqueta]) => ({ id, etiqueta })).sort((a, b) => a.etiqueta.localeCompare(b.etiqueta))
  }, [initialFunds])

  const filtroDepurado = useMemo(() => depurarFiltro(filtroInicial, {
    proyectos:  opciones.proyectos.map(p => p.id),
    categorias: opciones.categorias.map(c => c.id),
    empleados:  isManager ? empleadosFondos.map(e => e.id) : [],
  }), [filtroInicial, opciones, isManager, empleadosFondos])
```
y pasar `filtroInicial: filtroDepurado, hoy` en la llamada a `usePettyCashState`.
4. Desestructurar además `filtro, setFiltro, resultado` del `state` (y quitar `reportData`, `clearListFilters`).
5. Subtítulo bajo el título, reemplazar la expresión por:
```tsx
            {filtered.length !== state.funds.length
              ? `${filtered.length} de ${state.funds.length} fondos`
              : `${state.funds.length} fondo${state.funds.length !== 1 ? 's' : ''} registrado${state.funds.length !== 1 ? 's' : ''}`}
```
6. Botones Excel y PDF: `disabled={!!generating}` (ya no dependen de una búsqueda previa).
7. Reemplazar el bloque `<FundFilters … />` completo por:
```tsx
      <BarraFiltros
        filtro={filtro}
        onCambio={setFiltro}
        dimensiones={dimensiones}
        contar={f => aplicarFiltro(state.funds, f, hoy).visibles.length}
        sustantivo={['fondo', 'fondos']}
        resumen={hayFiltro(filtro)
          ? textoResumen({ visibles: filtered.length, total: state.funds.length, totalClp: resultado.totalClp }, filtro, categorias)
          : null}
      />
```
y, antes del `return`, definir:
```tsx
  const categorias = opciones.categorias.map(c => ({ id: c.id, etiqueta: c.name }))
  const conteo = contarPorCategoria(state.funds)
  const dimensiones: Dimension[] = [
    { clave: 'proyectos', opciones: [
      { id: SIN_PROYECTO, etiqueta: 'Sin proyecto' },
      ...opciones.proyectos.map(p => ({ id: p.id, etiqueta: etiquetaDeProyecto(p) })),
    ] },
    { clave: 'categorias', opciones: categorias.map(c => {
      const n = conteo.get(c.id) ?? 0
      return { ...c, detalle: n === 1 ? '1 gasto' : `${n} gastos` }
    }) },
    { clave: 'fecha', opciones: [] },
    { clave: 'estados', opciones: ORDEN_FAMILIAS.map(f => ({ id: f, etiqueta: ETIQUETAS_ESTADO.fondo[f] })) },
    // El empleado ve solo sus fondos: filtrar por empleado es de quien administra
    ...(isManager ? [{ clave: 'empleados' as const, opciones: empleadosFondos }] : []),
  ]
  const coincidencia = (fundId: string) => {
    if (!filtro.categorias.length) return null
    const v = resultado.visibles.find(x => x.doc.id === fundId)
    return v ? textoCoincidencia({ gastos: v.gastos.length, montoClp: v.montoClp }, filtro, categorias) : null
  }
```
(e importar `aplicarFiltro` en la línea de `@/lib/filtro-documentos`).
8. En `<FundList …>`: reemplazar `selectedEmpIds_list={state.selectedEmpIds_list}` por `compacta={filtro.empleados.length > 0}`, `clearListFilters={clearListFilters}` por `limpiarFiltro={() => setFiltro(FILTRO_VACIO)}`, y agregar `coincidencia={coincidencia}`.

- [ ] **Step 5: `page.tsx` de caja chica**

Reemplazar `src/app/(app)/petty-cash/page.tsx` por:

```tsx
import { listPettyCashFunds } from '@/actions/petty-cash'
import { getHistoricalCajaChicaImports } from '@/actions/admin'
import { getOrgFundTransfers, getOrgEmployeesSimple } from '@/actions/fund-transfers'
import { getAuthProfile } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import { cargarOpcionesFiltro } from '@/lib/opciones-filtro'
import { fechaEnChile } from '@/lib/filtro-documentos'
import { leerFiltro, paramsDePagina } from '@/lib/filtro-url'
import { PettyCashClient } from './client'

export default async function PettyCashPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const [profile, initialFunds, historicalImports, allTransfers, orgEmployees, params] = await Promise.all([
    getAuthProfile(),
    listPettyCashFunds(),
    getHistoricalCajaChicaImports().catch(() => []),
    getOrgFundTransfers().catch(() => []),
    getOrgEmployeesSimple().catch(() => []),
    searchParams,
  ])
  const opciones = await cargarOpcionesFiltro(await createClient(), initialFunds)

  const isManager = profile?.role === 'admin' || !!profile?.can_manage_petty_cash
  const pendingTransfers = allTransfers.filter(t => !t.matched)

  return (
    <PettyCashClient
      initialFunds={initialFunds}
      isManager={isManager}
      historicalImports={historicalImports}
      orgEmployees={orgEmployees}
      pendingTransfers={pendingTransfers}
      opciones={opciones}
      filtroInicial={leerFiltro(paramsDePagina(params))}
      hoy={fechaEnChile()}
    />
  )
}
```

- [ ] **Step 6: Borrar el filtro viejo**

```bash
git rm "src/app/(app)/petty-cash/FundFilters.tsx"
```

Run: `grep -rn "FundFilters\|selectedEmpIds_list\|fetchReportItems\|clearSearchFilters\|ReportResult" src`
Expected: sin resultados.

- [ ] **Step 7: Ajustar la spec sobre el conteo de la exportación**

En `docs/superpowers/specs/2026-10-07-filtro-del-empleado-design.md`, §2, reemplazar «El botón dice qué exporta: «Exportar 23 gastos».» y «El botón lo dice: «Exportar 23 gastos (5 de la carga histórica)».» por: «Al terminar, un aviso dice qué salió: «Exportados 23 gastos (5 de la carga histórica)». El número va después y no en el botón porque la parte histórica se resuelve en el servidor: quien administra fondos sin ser admin no la tiene cargada en la pantalla.»

- [ ] **Step 8: Verificar**

Run: `npx vitest run && npx tsc --noEmit && npx eslint .` — todo en verde.

En el navegador (`/petty-cash`, a `mobile` y a `desktop`), solo mirar y filtrar:
- Los chips en una hoja blanca; con la sesión de admin aparece el chip «Empleado».
- Elegir un tipo de gasto: la lista se reduce, cada fondo muestra su coincidencia, la línea de resultado suma.
- Con «Empleado» elegido, la lista pasa a la vista compacta.
- La sección de carga histórica sigue debajo, igual.
- `read_console_messages` con `onlyErrors: true`: sin errores.
- **No hace falta probar la exportación en el navegador**: baja un archivo y no cambia datos, pero la cubren las pruebas de las reglas y la prueba de humo de Daniel.

- [ ] **Step 9: Commit**

```bash
git add -A "src/app/(app)/petty-cash" src/actions/petty-cash.ts docs/superpowers/specs/2026-10-07-filtro-del-empleado-design.md
git commit -m "feat(caja chica): la barra de chips reemplaza a los dos filtros, y se exporta lo filtrado" -m "La exportación deja fuera los rechazados y, en la carga histórica, lo que no es gasto; la histórica sigue entrando cuando los chips no la excluyen." -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

## Task 8: «Rendiciones» en la barra de abajo

**Files:**
- Create: `src/lib/navegacion.ts`
- Test: `src/tests/navegacion.test.ts`
- Modify: `src/components/layout/MobileNav.tsx`, `src/components/layout/Sidebar.tsx`

**Interfaces:**
- Produces: `pestanasPrincipales(u: { role: 'admin' | 'approver' | 'employee'; can_submit: boolean }): string[]`

- [ ] **Step 1: Escribir la prueba**

Crear `src/tests/navegacion.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { pestanasPrincipales } from '@/lib/navegacion'

describe('pestanasPrincipales', () => {
  it('el empleado que rinde: Estado · Rendir · Rendiciones · C. Chica', () => {
    expect(pestanasPrincipales({ role: 'employee', can_submit: true }))
      .toEqual(['/', '/expenses/new', '/reimbursements', '/petty-cash'])
  })
  it('el empleado que no rinde no tiene rendiciones que listar: queda como antes', () => {
    expect(pestanasPrincipales({ role: 'employee', can_submit: false }))
      .toEqual(['/', '/petty-cash', '/mis-gastos'])
  })
  it('aprobador y admin no cambian', () => {
    expect(pestanasPrincipales({ role: 'approver', can_submit: true }))
      .toEqual(['/', '/approvals', '/petty-cash', '/expenses/new'])
    expect(pestanasPrincipales({ role: 'admin', can_submit: true }))
      .toEqual(['/', '/admin/reports', '/petty-cash', '/approvals'])
  })
})
```

- [ ] **Step 2: Correrla y ver que falla**

Run: `npx vitest run src/tests/navegacion.test.ts` — FAIL, no resuelve `@/lib/navegacion`.

- [ ] **Step 3: Crear `src/lib/navegacion.ts`**

```ts
// Las 4 pestañas de la barra de abajo según el perfil; el resto va a «Más».
// Separado de MobileNav para poder probarlo.

export function pestanasPrincipales(u: { role: 'admin' | 'approver' | 'employee'; can_submit: boolean }): string[] {
  if (u.role === 'admin')    return ['/', '/admin/reports', '/petty-cash', '/approvals']
  if (u.role === 'approver') return ['/', '/approvals', '/petty-cash', u.can_submit ? '/expenses/new' : '/mis-gastos']
  // Empleado (Daniel, 2026-10-07): «Rendiciones» entra a la barra y «Mis
  // gastos» pasa a «Más». Sin permiso de rendir no hay rendiciones que listar.
  return u.can_submit
    ? ['/', '/expenses/new', '/reimbursements', '/petty-cash']
    : ['/', '/petty-cash', '/mis-gastos']
}
```

- [ ] **Step 4: Correr la prueba**

Run: `npx vitest run src/tests/navegacion.test.ts` — PASS (3).

- [ ] **Step 5: `MobileNav`**

En `src/components/layout/MobileNav.tsx`:
1. Agregar `Receipt` a los íconos importados de `lucide-react`, e `import { pestanasPrincipales } from '@/lib/navegacion'`.
2. En `ALL_ITEMS`, después de la línea de `/expenses/new`:
```ts
  { href: '/reimbursements',        label: 'Mis rendiciones', shortLabel: 'Rendiciones', Icon: Receipt,     roles: ['admin','approver','employee'], section: 'personal', requiresSubmit: true },
```
3. Borrar la función `getPrimaryHrefs` entera y cambiar `const primaryHrefs  = getPrimaryHrefs(user)` por `const primaryHrefs  = pestanasPrincipales(user)`.

- [ ] **Step 6: `Sidebar`**

En `src/components/layout/Sidebar.tsx`:
1. Agregar `Receipt` a los íconos importados.
2. En `NAV_ITEMS`, después de `/expenses/new`:
```ts
  { href: '/reimbursements',  label: 'Mis rendiciones', Icon: Receipt,          roles: [] as const },
```
3. En el filtro `visible`, agregar la condición:
```ts
    (item.href === '/reimbursements' && user.can_submit) ||
```
(Como «Cola Bancaria»: la visibilidad depende de un permiso, no del rol.)

- [ ] **Step 7: ¿Cabe «Rendiciones» en la barra?**

No hace falta entrar como empleado: se mide el ancho del texto con la misma letra que usa la barra. `preview_start` `mi-rendicion-dev`, cualquier pantalla con sesión, `resize_window` a 360×800 (el ancho más angosto que se soporta; la barra tiene 5 columnas para todos los roles), y con `javascript_tool`:

```js
const span = document.querySelector('nav a span')
const cs = getComputedStyle(span)
const ctx = document.createElement('canvas').getContext('2d')
ctx.font = `${cs.fontWeight} ${cs.fontSize} ${cs.fontFamily}`
;({ texto: ctx.measureText('Rendiciones').width, columna: span.parentElement.getBoundingClientRect().width })
```

- Si `texto` es menor que `columna` menos 8 px de aire: listo.
- Si desborda: en `MobileNav`, la etiqueta pasa de `text-[13px]` a `text-[12px] tracking-tight` **para las cinco** (una etiqueta más chica que las otras se ve como un error). Volver a medir.
- Si aun así desborda: parar y preguntarle a Daniel por una palabra más corta. No inventarla.

Volver a `resize_window` `desktop`.

- [ ] **Step 8: Verificar y commit**

Run: `npx vitest run && npx tsc --noEmit && npx eslint .` — todo en verde.

```bash
git add src/lib/navegacion.ts src/tests/navegacion.test.ts src/components/layout/MobileNav.tsx src/components/layout/Sidebar.tsx
git commit -m "feat(navegación): «Rendiciones» en la barra del empleado; «Mis gastos» pasa a «Más»" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

## Task 9: Verificación completa, línea base y contexto

**Files:**
- Modify: `e2e/baseline/**` (recaptura)
- Modify: `.claude/skills/mi-rendicion-context/SKILL.md`
- Modify: `docs/superpowers/plans/2026-10-07-filtro-del-empleado.md` (Registro de avance)

- [ ] **Step 1: Todo en verde, y el build**

Parar el servidor de desarrollo (`preview_stop`). Luego:

Run: `npx vitest run && npx tsc --noEmit && npx eslint . && rm -rf .next && npx next build`
Expected: pruebas en verde (eran 537; ahora ~600), sin salida de `tsc`, **0 errores** de lint (22 avisos o menos), build con código 0.

- [ ] **Step 2: La línea base visual**

Run (en segundo plano, tarda ~8 min; **leer el resumen, no el código de salida**):

```bash
npm run baseline:verificar > "$TEMP/verificar-filtro.log" 2>&1; grep -E "^\s+[0-9]+ (passed|failed|skipped)" "$TEMP/verificar-filtro.log"; grep -E "^\s+\[(escritorio|movil|materiales)\] ›" "$TEMP/verificar-filtro.log" | sort -u
```

Cambios esperados, y **solo** estos:
- `reembolsos`, `caja-chica`, `mis-gastos` y `estado` (el enlace «Ver todas»), en las dos anchuras.
- Las capturas de teléfono de un usuario **empleado**, por la barra de abajo nueva.
- El riel de escritorio de quien rinde: un ítem más («Mis rendiciones»), así que en esas capturas el riel se corre.

Mirar el `-actual.png` de cada una (no el `-diff.png`, que en las rutas con datos vivos compara documentos distintos). Una captura fuera de esta lista es una regresión: investigar antes de seguir. La prueba `[materiales]` tiene que pasar: ningún dato sobre el degradado.

- [ ] **Step 3: Recapturar**

Run: `npm run baseline:crear` (en segundo plano, ~8 min). Expected: todas `passed`, `[materiales]` en verde.

- [ ] **Step 4: Actualizar el SKILL**

En `.claude/skills/mi-rendicion-context/SKILL.md`:
1. Conteo de pruebas: «**537 tests Vitest en 37 archivos**» → el número real que dio el Step 1, con la fecha.
2. Estructura de carpetas, en `lib/`, agregar:
```
│   ├── filtro-documentos.ts   ← el filtro del empleado: qué documento entra y qué suma (aplicarFiltro),
│   │                            rangos de fecha, estados = las 4 familias. Lo usan las listas, la
│   │                            exportación de caja chica y «Mis gastos»
│   ├── filtro-url.ts / filtro-etiquetas.ts ← el filtro en la dirección; los textos de los chips
│   ├── mis-gastos.ts          ← total aprobado, pendiente y promedio (rendiciones + caja chica, solo gastos)
│   ├── navegacion.ts          ← las 4 pestañas de la barra de abajo según el perfil
```
3. Nueva sección después de «✅ Aprobador por proyecto»:
```markdown
### ✅ Filtro del empleado (2026-10-07)

Spec `docs/superpowers/specs/2026-10-07-filtro-del-empleado-design.md`; diseños en
https://claude.ai/artifact/LXLQ3CbUgYbaSPYk8jRMkZ (Daniel eligió la A, barra de chips).

- **Un solo filtro** —Proyecto · Tipo de gasto · Fecha · Estado, y Empleado para quien
  administra fondos— en «Mis rendiciones» (`/reimbursements`) y en «Caja chica».
  Reemplazó a `FundFilters` (filtros de lista + «Búsqueda de ítems»). Componente
  `src/components/filtros/BarraFiltros.tsx`; las reglas, en `src/lib/filtro-documentos.ts`
- **La fecha es la del gasto** y tipo de gasto + fecha los tiene que cumplir el mismo
  gasto. **Un gasto rechazado no suma nunca**, ni en pantalla ni en la exportación
- Estados = las 4 familias de siempre (`FAMILIA_REPORTE` / `FAMILIA_FONDO`). En
  rendiciones el grupo de atención se llama «Con rechazos» (incluye las aprobadas en parte)
- El filtro va en la dirección (`?tipo=…&fecha=este-anio`) y se escribe con
  `window.history.replaceState`
- En caja chica **el empleado ve solo los fondos donde es beneficiario**
  (`listPettyCashFunds`); los de su cadena están en «Aprobaciones». La RLS no cambió
- **Exportar caja chica = lo filtrado**, sin «Buscar». Incluye la carga histórica cuando
  los chips no la excluyen (no tiene proyecto y cuenta como liquidada), sin rechazados ni
  adelantos/devoluciones
- «Rendiciones» está en la barra de abajo del empleado que rinde; «Mis gastos» pasó a «Más»
- «Mis gastos»: total aprobado, pendiente de aprobación y promedio mensual, de
  rendiciones **y** caja chica, solo gastos. Hasta este cambio sumaba los adelantos de
  las cargas históricas como gastos
```
4. En «Errores conocidos — no repetir», agregar la fila:
```markdown
| Sumar `expense_items` de un empleado sin mirar `item_type` | Las cargas históricas traen adelantos, devoluciones y traspasos como ítems: «Mis gastos» los sumaba como gastos hasta el 2026-10-07 | `esGasto(item_type)` de `src/lib/filtro-documentos.ts` antes de sumar. En `petty_cash_items` no hace falta: ahí solo hay gastos |
```

- [ ] **Step 5: Registro de avance y commit**

Agregar al final de este plan una tabla `## Registro de avance` con una fila por tarea (fecha, tarea, resultado, commit). Luego:

```bash
git add e2e/baseline .claude/skills/mi-rendicion-context/SKILL.md docs/superpowers/plans/2026-10-07-filtro-del-empleado.md
git commit -m "test(línea base): recaptura con el filtro del empleado; contexto al día" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

## Task 10: Despliegue y prueba de humo

> Daniel pasa la sesión a «pedir aprobación» y aprueba paso a paso. No hay migración.

- [ ] **Step 1: Pedir el OK para subir**, contando qué cambia para la gente: la barra de abajo del empleado, «Mis rendiciones» con filtro, caja chica con chips (y el empleado ve solo sus fondos), «Mis gastos» con indicadores nuevos. Los correos siguen pausados: nada de esto manda correo.

- [ ] **Step 2: Subir**: `git push origin main`.

- [ ] **Step 3: Confirmar el despliegue por la API de Vercel**: `list_deployments` con el `sha` del commit (proyecto `prj_VNh86yZNTJMTRP58fXQxH8bdliA3`, equipo `danielmartinezcl-creators-projects`) y `get_deployment` hasta `READY` con el alias `www.mi-rendicion.com`. **Nunca sondear el dominio con `curl` en bucle**: dispara el escudo anti-bot de Vercel. Después, `get_runtime_errors` de los últimos 10 minutos.

- [ ] **Step 4: Prueba de humo de Daniel, con un usuario que NO sea admin:**
  - En el teléfono, la barra de abajo dice Estado · Rendir · Rendiciones · C. Chica · Más.
  - «Rendiciones»: filtrar por un tipo de gasto y por fecha; recargar y ver que el filtro sigue.
  - «Caja chica»: aparecen solo sus fondos; los chips funcionan; no hay chip «Empleado».
  - «Más» → «Mis gastos»: los tres indicadores.

- [ ] **Step 5: Registrar el despliegue** en el «Registro de avance» de este plan y en el de `docs/superpowers/plans/2026-09-29-hoja-de-ruta-pendientes.md` (commit local; viaja con el próximo push).
