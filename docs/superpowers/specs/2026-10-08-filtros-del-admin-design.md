# Filtros del admin — diseño

**Fecha:** 2026-10-08
**Pedido por:** Daniel — «reestructuremos los filtros, como hicimos antes, pero
desde la sección admin. Aplica a todos los módulos del admin que actualmente
contengan filtros.»
**Diseños:** https://claude.ai/artifact/BzqGbLQfrNKmo5wMcaruLC — Daniel eligió
**B + C**, y que Informes también responda al instante.
**Antecedente:** `docs/superpowers/specs/2026-10-07-filtro-del-empleado-design.md`
(el filtro del empleado, desplegado el 2026-10-08). Esta spec lo extiende; no lo
reemplaza ni lo rompe.

---

## 1. Qué hay hoy (medido el 2026-10-08, no recordado)

| Pantalla | Qué filtra | Forma | Dónde corre |
|---|---|---|---|
| `/admin/reports` | Desde/Hasta (**fecha de envío**) · Estado · Empleado · Departamento · Reembolso · Contabilización | Panel `.hoja` siempre abierto, ~90 líneas | navegador |
| `/informes` | Fuente · Datos · Período · Departamento · Empleados · Categorías · Estado del informe · Movimiento · Estado del ítem · Reembolso · Contabilización | Panel de **378 líneas**, 7 bloques, + botón «Buscar» | **servidor** |
| `/admin/auditoria` | Buscar texto · Tipo de entidad · Acción · Desde · Hasta | Fila de 5 controles | servidor (debounce) |
| `/admin/employees` | Buscar texto (nombre, correo, RUT, depto) | Un campo | navegador |
| `/admin/trash` | Pestañas por tipo | **Navegación, no filtro** | — |
| `/petty-cash` · `/reimbursements` | Proyecto · Tipo de gasto · Fecha · Estado · Empleado | ✅ ya es la barra de chips | navegador |
| `/admin/fondos` · `/admin/analisis` · `/banco` · `/admin/carga-historica` | sin filtros | — | — |

Los dos defectos que esto tiene:

1. **El panel ocupa la pantalla.** En Informes son 378 líneas de controles antes
   de ver un solo dato — el mismo problema que Daniel señaló en caja chica («tiene
   mucho protagonismo») y que el filtro del empleado ya resolvió.
2. **No hay dos iguales.** Cuatro pantallas con cuatro formas de filtrar, y
   ninguna se parece a la que el empleado ya aprendió.

---

## 2. La decisión

**B + C**, y las dos partes son una sola cosa:

- **B — Barra de chips con «Más filtros».** Los tres o cuatro chips de cada
  pantalla a la vista; el resto detrás de un botón que lleva **el número de los
  que están puestos**. La barra mide lo mismo con 4 dimensiones que con 11.
- **C — Vistas guardadas.** Las combinaciones que se repiten quedan como
  pestañas con su cuenta al lado. **Son de la empresa, no personales**
  (decisión de Daniel, 2026-10-08): un solo juego que ven todos los admins y
  que edita el admin.
- **Informes responde al instante**, como el resto: trae los datos una vez y
  filtra en el navegador.

### Por qué no A

A era la misma barra del empleado con más chips. Es lo más consistente y lo
descartamos por una razón medible: el filtro del empleado tiene **4
dimensiones**, Informes tiene **11**. Once chips ocupan dos o tres líneas y hay
que leerlos todos para saber qué está puesto.

---

## 3. El modelo

### 3.1 La barra se generaliza; el filtro no

`BarraFiltros` hoy sabe de `Filtro` (el del empleado: proyectos, categorías,
fecha, estados, empleados). Esa unión no sirve para Informes (que filtra
**ítems**, no documentos), ni para Auditoría (que filtra registros de bitácora),
ni para Empleados (que filtra personas).

**La barra pasa a ser genérica sobre un juego de claves; lo que pasa el filtro
sigue siendo de cada dominio.**

```ts
// src/lib/filtros/dimensiones.ts  (módulo común, sin 'use server')

export type Opcion = { id: string; etiqueta: string; detalle?: string }

export type Dimension =
  | { clave: string; nombre: string; destacada: boolean; tipo: 'multi';  opciones: Opcion[] }
  | { clave: string; nombre: string; destacada: boolean; tipo: 'unico';  opciones: Opcion[] }
  | { clave: string; nombre: string; destacada: boolean; tipo: 'fecha';  rotuloFecha: string }
  | { clave: string; nombre: string; destacada: boolean; tipo: 'texto';  marcador: string }

/** Lo elegido. `multi` guarda ids; `unico` un id o null; `fecha` el preset y su
 *  rango; `texto` lo escrito. */
export type Valores = Record<string, ValorDimension>
```

- `destacada: true` → chip en la barra. `false` → va a «Más filtros».
- **Cada pantalla define sus dimensiones y su predicado**, en su propio módulo
  puro con pruebas. La barra no sabe qué significa ninguna.

### 3.2 Qué NO cambia

- **`src/lib/filtro-documentos.ts` se queda como está.** Es el predicado de
  rendiciones y caja chica del empleado, con sus reglas ganadas a pulso (la
  fecha es la del gasto; tipo de gasto y fecha los cumple el mismo gasto; un
  gasto rechazado no suma nunca). Se adapta a la `Valores` genérica, no se
  reescribe.
- **El empleado no ve «Más filtros»**: con 4 ó 5 dimensiones todas van
  destacadas. La barra solo muestra el botón cuando hay alguna sin destacar.
- **La papelera no se toca.** Sus pestañas son navegación entre tres tipos de
  cosa, no un filtro sobre una lista.
- Las cuatro familias de estado (`FAMILIA_REPORTE` / `FAMILIA_FONDO`) siguen
  siendo las de siempre.

### 3.3 La fecha no significa lo mismo en todas partes

Hoy `/admin/reports` filtra por **fecha de envío** y el empleado e Informes por
**fecha del gasto**. Las dos están bien y la diferencia importa: una rendición
enviada el 2 de septiembre puede traer gastos de agosto.

**El chip lo dice en su nombre**, siempre: «Fecha de envío» en Rendiciones,
«Fecha del gasto» en Informes y en las pantallas del empleado. Nunca «Fecha» a
secas.

---

## 4. Informes al instante

### 4.1 Lo medido

| Año | Ítems de rendición | Ítems de caja chica | Total |
|---|---:|---:|---:|
| 2022 | 1 | 0 | 1 |
| 2025 | 13 | 0 | 13 |
| 2026 | 483 | 5 | 488 |

**502 ítems en total.** Todo el histórico de PENTA entra en el navegador sin
esfuerzo. Con los 57 usuarios en marcha, la proyección es ~6.000 ítems al año
(≈1,5 MB de JSON), que sigue siendo razonable para un año y deja de serlo para
«todo el histórico» dentro de unos años.

### 4.2 Cómo queda

`UnifiedReportItem` **ya trae todo** lo que las once dimensiones necesitan:
`source`, `item_type`, `employee_id`, `department`, `parent_status`,
`item_status`, `category_id`, `date`, `amount_clp`, `reimbursed_at`,
`defontana_exported_at`. No hace falta pedir un solo dato nuevo.

- **El servidor recibe un período y nada más.** `getUnifiedReportItems` pierde
  nueve de sus once filtros: devuelve los ítems de las cuatro fuentes en ese
  rango.
- **El navegador filtra las once dimensiones** y recalcula los KPIs con
  `computeUnifiedKpis`, que ya es una función pura sobre la lista.
- **El botón «Buscar» desaparece.** Cada chip responde al instante, como en el
  resto de la app.
- **Por defecto se trae el año en curso.** Arriba, junto al chip de período, un
  control explícito: «Trayendo 2026 · [todo el histórico]». Elegir un rango
  anterior o el histórico completo vuelve a pedir al servidor, con su espera a
  la vista.

**Por qué el período es lo único que viaja:** es la única dimensión que decide
*cuántas* filas se traen. Las otras diez solo descartan de lo traído, así que
resolverlas en el servidor obliga a un viaje por cada clic y no ahorra nada.

### 4.3 El riesgo, dicho

Si un día el histórico no entra en memoria, lo que falla es «todo el
histórico», no el uso diario. La salida está pensada y no se construye ahora:
el período acotado sigue funcionando, y la exportación completa es un trabajo
del servidor, no de la pantalla.

---

## 5. Las vistas guardadas

### 5.1 Qué son

Una combinación de filtros con nombre, sobre una pantalla. Se muestran como
pestañas **sobre el degradado** (son navegación, no datos), cada una con la
cuenta de lo que contiene.

### 5.2 De la empresa

Decisión de Daniel (2026-10-08): **un solo juego por organización**, que ven
todos los admins y que edita el admin. El razonamiento: lo que se arma para
exportar a Defontana sirve a cualquiera que tenga que hacerlo, y si entra otro
administrador encuentra el trabajo hecho.

### 5.3 La tabla

```sql
create table public.vistas_filtro (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null references public.organizations(id) on delete cascade,
  pantalla    text not null,        -- 'rendiciones' | 'informes' | 'auditoria' | 'empleados'
  nombre      text not null,
  filtro      jsonb not null,       -- los Valores de esa pantalla
  orden       int  not null default 0,
  de_fabrica  boolean not null default false,
  creada_por  uuid references auth.users(id) on delete set null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (org_id, pantalla, nombre)
);
```

- **RLS**: la lee cualquier miembro de la organización; la escribe solo el admin
  de esa organización (`is_admin() and org_id = get_my_org_id()`), igual que
  `cost_centers`.
- `de_fabrica` marca las que siembra la migración. **Se pueden renombrar y
  borrar**: son de la empresa, y la empresa decide. La marca existe para poder
  distinguirlas en la auditoría y para no volver a sembrarlas si se borran.
- El `filtro` guarda los `Valores`, no una consulta. Al leerlo se **depura**
  igual que el filtro de la dirección: un empleado, una categoría o un centro de
  costo que ya no existe se descarta en silencio en vez de romper la vista.

### 5.4 Las de fábrica

Sembradas por la migración para las organizaciones que existan:

| Pantalla | Vista | Qué trae |
|---|---|---|
| Rendiciones | **Por pagar** | estados `pending_bank_load` + `pending_bank_auth` |
| Rendiciones | **Sin contabilizar** | aprobadas o reembolsadas, sin marca de Defontana |
| Rendiciones | **Más de 5 días** | enviadas hace más de 5 días y todavía sin resolver |
| Informes | **Gastos del año** | año en curso, solo movimiento `expense` |
| Informes | **Sin contabilizar** | año en curso, sin marca de Defontana |
| Auditoría | **Borrados** | acciones `deleted` + `permanently_deleted` |
| Auditoría | **Cambios de configuración** | acción `config_changed` |
| Empleados | **Sin datos bancarios** | activos sin banco o sin número de cuenta |

«Todas» no es una vista guardada: es el estado sin filtro, siempre primero.

### 5.5 Cuando tocás los chips sobre una vista

La vista no se modifica sola. Aparece una línea bajo la barra: *«cambiaste
Contabilización sobre la vista Por pagar»*, con **Guardar como vista** y
**Descartar**. Guardar sobre la misma vista es una acción aparte dentro de ese
menú, nunca el comportamiento por omisión: una vista de la empresa no se cambia
por accidente mientras alguien revisa.

---

## 6. Pantalla por pantalla

### 6.0 Proyecto: el dato todavía no llega

Desde la migración 039 las rendiciones y los fondos tienen obra
(`expense_reports.proyecto_id`, `petty_cash_funds.proyecto_id`), pero
**ninguna de las dos consultas del admin la trae** — verificado el 2026-10-08:

- `getAdminReports` selecciona dieciocho columnas y `proyecto_id` no está.
- Los cuatro fetchers de `/informes` tampoco, y `UnifiedReportItem` no tiene
  dónde ponerla: la palabra «proyecto» no aparece una sola vez en
  `src/actions/reports.ts` ni en `src/lib/report-helpers.ts`.

Así que el chip de Proyecto **no es solo un chip**: hay que llevar el dato
hasta la pantalla.

- `getAdminReports`: sumar `proyecto_id` al select y resolver número y nombre
  contra `proyectos`, como ya se resuelve el nombre del empleado.
- `/informes`: sumar `proyecto_id` a los tres selects de cabecera
  (`expense_reports` nuevas, `expense_reports` históricas, `petty_cash_funds`) y
  dos campos a `UnifiedReportItem` — `proyecto_id` y `proyecto_numero` —
  rellenados por los cuatro fetchers contra un mapa de `proyectos` de la
  organización.
- **Una carga histórica no tiene obra.** Entra como `SIN_PROYECTO`, el mismo
  centinela que ya usa el filtro del empleado, y el chip lo muestra como «Sin
  proyecto» en vez de esconderla.

### 6.1 `/admin/reports` — Rendiciones

| | Dimensiones |
|---|---|
| **Chips** | Empleado · Estado · Fecha de envío · **Proyecto** |
| **Más filtros** | Departamento · Reembolso · Contabilización |
| **Vistas** | Por pagar · Sin contabilizar · Más de 5 días |
| **Búsqueda de texto** | no tiene hoy; no se agrega |

El panel de filtros actual (~90 líneas) se borra.

### 6.2 `/informes` — Informes

| | Dimensiones |
|---|---|
| **Chips** | Período · **Proyecto** · Empleado · Categoría |
| **Más filtros** | Estado del informe · Fuente · Datos (nuevos/históricos) · Departamento · Movimiento · Estado del ítem · Reembolso · Contabilización |
| **Vistas** | Gastos del año · Sin contabilizar |
| **Búsqueda de texto** | no tiene hoy; no se agrega |

El panel de 378 líneas y el botón «Buscar» se borran. «Estado del informe» baja
a «Más filtros» para dejarle el lugar a Proyecto: PENTA trabaja por obras, y la
obra es lo que se pregunta antes que el estado.

### 6.3 `/admin/auditoria` — Auditoría

| | Dimensiones |
|---|---|
| **Buscador** | fijo a la izquierda de la barra (actor, entidad, notas) |
| **Chips** | Fecha · Tipo de entidad · Acción |
| **Más filtros** | ninguno — tres dimensiones no lo justifican |
| **Vistas** | Borrados · Cambios de configuración |

Sigue filtrando en el servidor: la bitácora crece sin techo y se pagina. El
buscador conserva su debounce.

### 6.4 `/admin/employees` — Empleados

| | Dimensiones |
|---|---|
| **Buscador** | el de hoy (nombre, correo, RUT, departamento) |
| **Chips** | Estado (activo · inactivo · en la papelera · bloqueado) · Departamento |
| **Más filtros** | ninguno |
| **Vistas** | Sin datos bancarios |

**Esto suma dos chips que la pantalla no tenía.** Es un agregado deliberado y
chico: con 57 personas, «mostrame solo los activos» es la pregunta que el
buscador no sabe contestar, y la vista «Sin datos bancarios» cierra el hueco
que quedó a la vista cargando la planilla (56 de 57 sin banco).

### 6.5 Lo que ya está y no se rehace

`/petty-cash` y `/reimbursements` conservan su barra. Cambian solo por dentro,
al adoptar la `Dimension` genérica. **La línea base visual de esas dos pantallas
no debe moverse**: si se mueve, algo se rompió.

---

## 7. Decisiones que NO se cambian sin volver a hablarlas

1. **Las vistas son de la empresa**, no personales.
2. **El botón «Buscar» de Informes desaparece.** Un filtro que no responde al
   instante no se usa; esa fue la razón de todo el rediseño del empleado.
3. **Solo el período viaja al servidor** en Informes. Las otras diez dimensiones
   no reducen cuántas filas se traen.
4. **Guardar sobre una vista existente nunca es el comportamiento por omisión.**
5. **El chip de fecha dice de qué fecha habla.** Nunca «Fecha» a secas.
6. **La papelera no entra**: sus pestañas son navegación.
7. **Nada de esto toca lo que el empleado ve.** Su barra cambia por dentro y
   tiene que verse igual.

---

## 8. Lo que queda afuera a propósito

- **Vistas personales** además de las de la empresa.
- **Exportar desde una vista** sin abrirla.
- **Filtros en `/admin/fondos`, `/admin/analisis` y `/banco`**, que hoy no
  tienen ninguno.

---

## 9. Riesgos

| Riesgo | Mitigación |
|---|---|
| Informes trae demasiado el día que PENTA lleve años de uso | El período por defecto es el año en curso; el histórico completo es una acción explícita con su espera a la vista |
| Una vista guardada apunta a un empleado o una categoría que ya no existe | `depurarFiltro` al leerla, igual que el filtro de la dirección |
| La barra del empleado se rompe al generalizarse | La línea base visual de `/petty-cash` y `/reimbursements` no se puede mover; son dos capturas que ya existen |
| Dos admins editan la misma vista | `updated_at` y la auditoría dejan el rastro; no se construye bloqueo |
| «Más filtros» esconde un filtro puesto y alguien lee mal una lista | El botón lleva el número de los puestos, y la línea de resumen bajo la barra los nombra todos |
