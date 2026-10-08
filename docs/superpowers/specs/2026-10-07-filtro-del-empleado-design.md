# Filtro del empleado — diseño

**Fecha:** 2026-10-07 · **Estado:** aprobado por Daniel por secciones; spec en revisión
**Diseños:** https://claude.ai/artifact/LXLQ3CbUgYbaSPYk8jRMkZ — Daniel eligió la **A
(barra de chips)** y aprobó la pantalla de «Mis gastos».

---

## El problema

1. **El filtro de caja chica tiene demasiado protagonismo.** Abierto mide 785 px y empuja
   la lista hacia abajo; además son dos filtros distintos en la misma hoja —«Filtros de
   lista» (estado, período, empleado) y «Búsqueda de ítems» (fecha, estado del ítem,
   categoría, con su botón «Buscar»)— que se cruzan a medias.
2. **Las rendiciones no tienen filtro**, y el empleado ni siquiera tiene cómo llegar a la
   lista completa: «Mis rendiciones» (`/reimbursements`) solo aparece con el enlace «Ver
   todas» del inicio, y solo si tiene más de 5.
3. **«Mis gastos» no dice lo que importa.** Muestra «Categoría principal», que el gráfico
   ya responde, y no muestra lo pendiente. Cuenta solo rendiciones (no caja chica) y suma
   adelantos y devoluciones de las cargas históricas como si fueran gastos: la misma
   plata contada dos veces (ver «Gasto ≠ movimiento de fondos» en el SKILL).

## Decisiones de Daniel

| # | Decisión |
|---|---|
| D1 | Un solo filtro, el mismo en rendiciones y caja chica: **Proyecto · Tipo de gasto · Fecha · Estado** |
| D2 | La forma es la **barra de chips** (diseño A): una línea; cada chip abre sus opciones |
| D3 | «Mis gastos» muestra **total aprobado, pendiente de aprobación y promedio mensual**. «Categoría principal» sale |
| D4 | «Rendiciones» entra a la **barra de abajo**; «Mis gastos» pasa al menú «Más» |
| D5 | En caja chica el empleado ve **solo los fondos donde es el beneficiario**, sin filtro por empleado. Quien administra fondos sí lo tiene |
| D6 | Las secciones 1, 2 y 3 de esta spec, aprobadas en la conversación |

---

## 1. Lo que ve el empleado

### Navegación

| Dónde | Antes | Después |
|---|---|---|
| Barra de abajo, rol empleado con permiso de rendir | Estado · Rendir · C. Chica · Gastos · Más | **Estado · Rendir · Rendiciones · C. Chica · Más** |
| Barra de abajo, rol empleado sin permiso de rendir | Estado · C. Chica · Gastos · Más | **sin cambios**: no tiene rendiciones que listar |
| Menú «Más» y riel de escritorio | — | **«Mis rendiciones»** entra, visible para quien tiene permiso de rendir (`requiresSubmit`) |

Los roles aprobador y admin conservan su barra; a ellos «Mis rendiciones» les queda en
«Más» y en el riel. El enlace «Ver todas» del inicio aparece **siempre que haya al menos
una rendición**, no solo con más de 5.

### La barra de chips

Va **dentro de la hoja de la lista**, como su encabezado, nunca apoyada en el degradado.
Una línea con desplazamiento lateral si no cabe, con un desvanecido en el borde que
avisa que hay más.

| Chip | Opciones | Elección |
|---|---|---|
| **Proyecto** | «Sin proyecto» + los proyectos que aparecen en los documentos de la persona, con buscador por número o nombre | varios |
| **Tipo de gasto** | Las categorías que aparecen en sus gastos, cada una con cuántos gastos tiene | varios |
| **Fecha** | Este mes · Mes pasado · Últimos 3 meses · Este año · Elegir fechas | uno |
| **Estado** | Ver la tabla de estados (§3) | varios |
| **Empleado** | Solo para quien administra fondos (§2) | varios |

- **Sin nada elegido**, el chip muestra su nombre con una flecha.
- **Con algo elegido**, el chip toma el relleno activo (`--anod`), muestra lo elegido
  («Combustible», «2 proyectos», «Este año») y una ✕ que lo quita.
- **Al tocarlo** sube una hoja desde abajo en el teléfono (un menú anclado al chip en
  escritorio), con las opciones, «Limpiar» y un botón que dice cuántos documentos
  quedarían: «Ver 3 rendiciones». El número se recalcula mientras se marca.
- **Con al menos un filtro puesto**, una línea bajo los chips dice qué queda a la vista y
  cuánto suma: «3 de 12 · $97.300 en Combustible · Limpiar». Plegar o recargar nunca
  esconde que hay un filtro puesto.

### Mis rendiciones (`/reimbursements`)

- Título «Mis rendiciones», la barra de chips y la lista con la tarjeta de siempre
  (`ExpenseReportCard`).
- Con un tipo de gasto elegido, cada tarjeta agrega una línea: **«2 gastos de Combustible
  · $38.400»** —los gastos de esa rendición que cumplen el filtro—.
- **Sale la tarjeta «Total reembolsado»**: esa cifra la responde «Mis gastos», y la línea
  de resultado da el total de lo filtrado.

### Caja chica (`/petty-cash`), empleado

- Lista **solo los fondos donde es el beneficiario** (`employee_id = yo`). Hoy la RLS le
  deja ver también los de su cadena y los que esperan su paso en el banco: esos se
  trabajan en «Aprobaciones» y en «Cola bancaria», y salen de esta pantalla. La RLS no
  cambia: el filtro es de la pantalla.
- Mismos chips, mismo comportamiento.

### Mis gastos (`/mis-gastos`)

Como en el diseño aprobado: tarjeta de vidrio con **Total aprobado** grande y, debajo,
**Pendiente de aprobación** y **Promedio mensual**; después «Gastos por mes» y «Por
categoría», como hoy. La bajada dice «Rendiciones y caja chica · últimos 12 meses».

| Indicador | Qué suma |
|---|---|
| Total aprobado | Gastos aprobados de los últimos 12 meses: ítems `approved` de sus rendiciones y de sus fondos |
| Pendiente de aprobación | Gastos **enviados** que nadie decidió todavía: ítems `pending` de rendiciones en `submitted` / `pending_l2`, e ítems `pending` de fondos en `pending_liquidation_approval` / `pending_liquidation_l2`. Lleva debajo «en N documentos» |
| Promedio mensual | Total aprobado ÷ meses con gastos aprobados (la regla de hoy) |

- **Solo gastos**: en rendiciones, `item_type` `expense` o nulo. Adelantos, devoluciones y
  traspasos no son gastos.
- Un **pedido de fondo** no es un gasto: no entra en «pendiente».
- Un gasto de un fondo **activo** (`funds_sent`) todavía no se presentó: tampoco entra en
  «pendiente». Entra cuando el fondo se presenta a liquidar.

---

## 2. Quien administra fondos (admin o `can_manage_petty_cash`)

- Los mismos chips **más «Empleado»**, con buscador y elección múltiple.
- Ve los mismos fondos que hoy (`listPettyCashFunds` sin el filtro del empleado).
- **Excel y PDF exportan lo filtrado**, sin el paso de «Buscar». El botón dice qué
  exporta: «Exportar 23 gastos».
- **La exportación sigue incluyendo la carga histórica de caja chica**, como hoy
  (`getPettyCashItemsForReport` ya la trae). Se le aplican los chips que tienen sentido
  para ella: Empleado, Tipo de gasto y Fecha. Una carga histórica no tiene proyecto (solo
  entra con «Sin proyecto» o sin ese chip) y cuenta como **Liquidada**. El botón lo dice:
  «Exportar 23 gastos (5 de la carga histórica)».
  > *Agregado al escribir la spec, después de la aprobación de la sección 2:* sin esto,
  > exportar lo filtrado dejaba fuera la carga histórica sin aviso.
- La **sección de carga histórica** sigue debajo, con sus herramientas, y el filtro **no
  la filtra en pantalla**.
- `/admin/reports` no cambia.

---

## 3. Las reglas del filtro

Viven en **un solo módulo puro**, `src/lib/filtro-documentos.ts`, que usan las dos
pantallas, la exportación y «Mis gastos». Si una regla está escrita en un componente, está
mal.

### Qué es un documento y qué es un gasto

```ts
interface GastoFiltrable {
  categoriaId: string | null
  fecha:       string          // la de la boleta, YYYY-MM-DD
  montoClp:    number
  rechazado:   boolean
}

interface DocumentoFiltrable {
  id:            string
  proyectoId:    string | null
  familia:       FamiliaEstado // de FAMILIA_REPORTE o FAMILIA_FONDO
  beneficiarioId: string
  creadoEl:      string        // YYYY-MM-DD
  gastos:        GastoFiltrable[]
}
```

Solo entran a `gastos` los gastos de verdad: en rendiciones, `item_type` `expense` o nulo;
en caja chica, todo `petty_cash_items` (ahí solo hay gastos).

### Cuándo un documento entra

Todos los chips se combinan con **Y**; dentro de un chip, las opciones con **O**.

| Chip | El documento entra si… |
|---|---|
| Proyecto | su `proyectoId` está entre los elegidos («Sin proyecto» = `null`) |
| Estado | su `familia` está entre las elegidas |
| Empleado | su `beneficiarioId` está entre los elegidos |
| Tipo de gasto | tiene **al menos un gasto no rechazado** de alguna categoría elegida |
| Fecha | tiene **al menos un gasto no rechazado** en el rango; **sin gastos**, usa `creadoEl` |

Si hay **Tipo de gasto y Fecha** a la vez, el mismo gasto tiene que cumplir las dos: un
documento con combustible de agosto y comida de septiembre **no** entra en «Combustible ·
septiembre».

### Qué suma

- **Los gastos que coinciden** con un documento son sus gastos no rechazados que cumplen
  Tipo de gasto y Fecha (si no hay ninguno de los dos chips, todos sus gastos no
  rechazados).
- **La línea de cada tarjeta** («2 gastos de Combustible · $38.400») aparece solo con Tipo
  de gasto elegido.
- **El total de la línea de resultado** suma los gastos que coinciden de todos los
  documentos que entran.
- **Un gasto rechazado no suma nunca**, ni en pantalla ni en la exportación. El documento
  igual aparece si cumple por otros gastos o por sus chips de documento.

### Estados: cuatro grupos, los de siempre

Se reusan `FAMILIA_REPORTE` y `FAMILIA_FONDO` de `constants.ts`: el filtro **no inventa
una clasificación propia** (hay una prueba que impide una quinta familia).

| Familia | Rendiciones | Caja chica |
|---|---|---|
| `neutro` | **Borradores** — `draft` | **Borradores** — `draft` |
| `en-curso` | **En proceso** — `submitted`, `pending_l2`, `pending_bank_load`, `pending_bank_auth` | **En proceso** — del pedido a la liquidación en revisión, incluido el fondo activo |
| `resuelto` | **Aprobadas** — `approved`, `reimbursed` | **Liquidados** — `settled` |
| `atencion` | **Con rechazos** — `rejected`, `partially_approved` | **Rechazados** — `rejected` |

> En rendiciones el grupo se llama **«Con rechazos»** y no «Rechazadas», como en la
> conversación: incluye las aprobadas en parte, y llamarlas «rechazadas» confundiría. Es
> el mismo grupo que la tarjeta ya marca con «Requiere corrección».

### Fechas

`rangoDeFecha(preset, hoy)` devuelve `{ desde, hasta }` inclusivos. «Este mes» es del 1 al
último día del mes de hoy; «Mes pasado», el mes anterior completo; «Últimos 3 meses», del
1 del mes de hace dos meses a hoy; «Este año», del 1 de enero a hoy. «Elegir fechas» usa
las dos que se escriban; si falta una, el rango queda abierto de ese lado.

---

## 4. Cómo se construye

### Archivos

| Archivo | Qué |
|---|---|
| `src/lib/filtro-documentos.ts` (nuevo) | Tipos, `aplicarFiltro`, `rangoDeFecha`, conteos para las hojas, y la conversión desde las filas de rendición y de fondo |
| `src/lib/mis-gastos.ts` (nuevo) | `resumenMisGastos`: los tres indicadores, el gráfico y la tabla, desde filas ya cargadas |
| `src/components/filtros/BarraFiltros.tsx` (nuevo) | Los chips, la línea de resultado y la apertura de cada hoja |
| `src/components/filtros/HojaOpciones.tsx` (nuevo) | La hoja que sube (teléfono) o el menú anclado (escritorio), con sus opciones |
| `src/lib/filtro-url.ts` (nuevo) | Leer y escribir el filtro en la dirección de la página |
| `src/actions/expenses.ts` | `getMisRendicionesFiltrables()`: sus rendiciones con proyecto y el resumen de sus gastos. `getMyMonthlySummary` pasa a juntar rendiciones y caja chica |
| `src/actions/petty-cash.ts` | La lista de fondos trae el resumen de gastos de cada uno; el empleado recibe solo los suyos. La exportación recibe los chips |
| `src/app/(app)/reimbursements/page.tsx` | Chips + lista; sale «Total reembolsado» |
| `src/app/(app)/petty-cash/*` | Chips en lugar de `FundFilters`; exportar sin «Buscar» |
| `src/app/(app)/mis-gastos/page.tsx` | Los indicadores nuevos |
| `src/app/(app)/page.tsx` | «Ver todas» siempre que haya rendiciones |
| `src/components/layout/MobileNav.tsx`, `Sidebar.tsx` | «Mis rendiciones» en la barra del empleado, en «Más» y en el riel |

**Sale:** `FundFilters.tsx` entero y, de `usePettyCashState`, el estado de los dos filtros
viejos y de la búsqueda de ítems.

### Datos

- **El filtro corre en el navegador**, sobre lo que se cargó al entrar: cada chip responde
  al instante, sin ir al servidor. Para un empleado son pocas decenas de documentos al
  año. Quien administra fondos carga los fondos que ve hoy, más el resumen de sus gastos.
- **El resumen de gastos** es lo mínimo para filtrar y sumar: categoría, fecha, monto en
  CLP y si está rechazado. Descripción, comercio y documento se piden recién al exportar.
- **La exportación** sigue pasando por `getPettyCashItemsForReport`, que recibe los
  mismos chips y la lista de fondos que quedaron a la vista. Así la carga histórica sigue
  saliendo del servidor, como hoy. Cambian dos cosas respecto de hoy, por las reglas del
  §3: **deja fuera los gastos rechazados** (hoy se elegía con «Estado del ítem») y, en la
  carga histórica, **lo que no es gasto** (adelantos, devoluciones y traspasos). Esos
  movimientos siguen en `/informes`, que los separa por tipo, y en la exportación a
  Defontana.

### El filtro en la dirección

`?proyecto=…&tipo=…&fecha=este-anio&estado=en-curso` (con `desde`/`hasta` para «Elegir
fechas»). Recargar, volver atrás o compartir el enlace conserva el filtro. Un valor que ya
no existe (un proyecto borrado) se ignora sin romper la pantalla.

### Materiales

Chips y hojas viven **sobre hoja blanca**: no hace falta tocar el selector de legibilidad
de `globals.css`. Chip activo con el relleno `--anod` corregido de la fe de erratas
(`#199C90 → #12807C → #0B4448`). Piso tipográfico de 11 px; objetivos táctiles de 44 px.
Íconos de Lucide.

---

## 5. Pruebas

- **Vitest, escritas antes que el código**, sobre `filtro-documentos.ts` y `mis-gastos.ts`:
  - cada chip por separado y combinados (Y entre chips, O dentro de uno);
  - un gasto rechazado de la categoría elegida no hace entrar al documento ni suma;
  - Tipo de gasto + Fecha exigen que el **mismo** gasto cumpla las dos;
  - un borrador sin gastos con filtro de fecha usa su fecha de creación;
  - «Sin proyecto» combinado con Tipo de gasto;
  - los cuatro grupos de estado salen de `FAMILIA_REPORTE` / `FAMILIA_FONDO`;
  - `rangoDeFecha` en el borde de mes y de año;
  - «Mis gastos» no cuenta adelantos ni devoluciones, ni pedidos de fondo ni gastos de un
    fondo activo como pendientes.
- **Línea base visual:** cambian **todas las capturas del teléfono** (la barra de abajo),
  más `reembolsos`, `caja-chica` y `mis-gastos` en las dos anchuras. Se revisan una por una
  antes de recapturar. `npm run audit:materiales` en verde.
- **Prueba de humo con un usuario que no sea admin** (Daniel): filtrar sus rendiciones y
  su caja chica, y ver «Mis gastos». La parte de administrador la cubre el arnés.

## 6. Fuera de alcance

- Los filtros de `/admin/reports` y de `/informes`.
- Filtrar en pantalla la sección de carga histórica de caja chica.
- Cambiar qué ve cada uno por RLS: el «solo los míos» del empleado es de la pantalla.
- El gasto rápido (`/quick`), que sigue oculto para empleados.
