# Planilla de alta — diseño

> Tarea 3.2 de `docs/superpowers/plans/2026-09-29-hoja-de-ruta-pendientes.md`, rama (b)
> de la decisión D3. Brainstorming con Daniel el 2026-10-01.
>
> **Revisión del alcance, 2026-10-01, después de la primera versión:** la planilla pasa a
> ser **la única carga de empleados** —crea y actualiza— y absorbe a «Importar nómina».
> Eso tumbó la decisión original de «solo actualiza, nunca crea», y trajo las columnas de
> cargo, centro de costo y rol, más las alertas de segregación de funciones.

## Qué resuelve

Al 2026-10-01, de los **57 usuarios activos**: **50 no tienen aprobador N1**, así que no
pueden enviar una rendición, y **56 no tienen los datos bancarios completos**, así que no
se les puede pagar. Configurarlos de a uno en `/admin/employees` es cerca de una hora de
trabajo repetitivo, y hay que repetirla entera con el próximo cliente.

Hoy además **hay dos caminos que leen un Excel de empleados** y se solapan: «Importar
nómina» (`EmployeeImport`), que crea cuentas con nombre, correo, rol, RUT, cargo y centro
de costo, y nada que cargue las cadenas ni los datos bancarios. Cargar la nómina y después
configurar a la misma gente de a uno es trabajo doble.

**La planilla de alta es la única carga de empleados:** un Excel con todo lo que define a
una persona en el sistema, que crea a quien no está y completa a quien sí, con una vista
previa que dice fila por fila qué va a pasar antes de escribir nada.

No reemplaza a `/admin/employees`: esa pantalla sigue siendo donde se configura a una
persona puntual, se le dan permisos, se quita un aprobador o se arma una suplencia.

## Decisiones (todas de Daniel, 2026-10-01)

| # | Decisión | Por qué |
|---|---|---|
| 1 | **Crea y actualiza**, y absorbe a «Importar nómina» | Una sola planilla con toda la información del empleado. La versión anterior solo actualizaba; se revisó al ver que había dos importadores solapados |
| 2 | **El RUT identifica a la persona** | Un correo cambia; el RUT es inherente a la persona. 55 de 57 ya lo tienen cargado |
| 3 | El aprobador se nombra **por correo o por nombre** | Quien arma la planilla usa lo que tiene. Un nombre ambiguo es error de fila, no una apuesta |
| 4 | **Una celda vacía nunca borra** | La planilla completa. «Vacío» es «no sé», no «bórralo»: una planilla a medio llenar no puede dejar a nadie sin aprobador |
| 5 | El permiso «aprueba» **se señala y se ofrece dar** en bloque | `validarCadena` rechaza a un aprobador sin `can_approve`, y hoy solo 5 personas lo tienen. Sin esto, la carga es un ciclo de subir, descubrir que faltan y volver a subir |
| 6 | **Sin suplente N1** | Es puntual y temporal, con fechas desde/hasta: para cuando se suba la planilla, ya habrían cambiado. Sigue en `/admin/employees` |
| 7 | **Las filas válidas entran; las malas quedan fuera** | Con 57 filas, que una mal escrita bloquee las 56 buenas es un castigo desproporcionado |
| 8 | **Se mantiene la validación del dígito verificador** | Ahora que el RUT decide a quién se le escribe cada fila, el DV es la única red contra un error de tipeo. Los RUT **ficticios siguen sirviendo** mientras el DV cuadre: `11111111-1`, `22222222-2`, `12345678-5`, `99999990-5` |
| 9 | El correo **también actualiza el acceso** | Si RR.HH. tiene correos más nuevos, se corrigen en la misma pasada. Es la operación más delicada y la vista previa la destaca |
| 10 | **Los permisos operativos NO son columnas**, pero la planilla **alerta** sobre el resultado | En una pantalla, dar el permiso de autorizar pagos es un acto visible; en la fila 43 de un Excel no lo ve nadie, y dos celdas mal puestas rompen la segregación de funciones sin que nadie se entere. Las alertas dan la visibilidad sin dar el poder |

**Lo que la decisión 1 cuesta, y cómo se paga.** La versión anterior no creaba cuentas
justamente para que un RUT mal escrito fuera un error de fila. Al unificar, ese riesgo
vuelve: una fila con el RUT equivocado deja de ser un error y pasa a ser una cuenta nueva.
La mitigación es que **deje de ser silencioso**: la vista previa separa «se crean N
cuentas» de «se actualizan M», y la confirmación nombra las dos cifras.

## La planilla

Once columnas, en este orden. Se descarga vacía desde la misma pantalla.

| # | Columna | Obligatoria | Qué hace |
|---|---|---|---|
| 1 | Apellido y nombre | **al crear** | `users.full_name`. Al actualizar es informativa y **no se escribe** |
| 2 | RUT | **sí** | Identifica a la persona |
| 3 | Correo | **al crear** | Es el acceso. Al actualizar, lo cambia si difiere |
| 4 | Cargo | no | `users.department` |
| 5 | Centro de costo | no | `users.cost_center_id`, por código o por nombre |
| 6 | Rol | no | `admin` · `approver` · `employee`. Al crear, por omisión `employee` |
| 7 | Aprobador 1er Nivel (N1) | no | Correo o nombre |
| 8 | Aprobador 2do Nivel (N2) | no | Correo o nombre |
| 9 | Banco | no | `users.bank_name` |
| 10 | Tipo de Cuenta | no | `users.bank_account_type` |
| 11 | N° de Cuenta | no | `users.bank_account` |

Las cabeceras se reconocen con un mapeo tolerante (ignora mayúsculas, tildes y espacios),
como el `mapHeader` de `EmployeeImport`. Si falta la columna RUT, la planilla se rechaza
entera: sin ella no hay a quién escribirle.

**«Apellido y nombre» no se escribe al actualizar.** Cambiarle el nombre a alguien es otra
operación, y una planilla de RR.HH. con el nombre escrito distinto no debería renombrar a
nadie. Al **crear**, en cambio, es obligatoria: es el nombre de la cuenta nueva.

**Lo que NO lleva:** los permisos (`can_approve`, `can_manage_petty_cash`,
`can_load_bank_transfer`, `can_authorize_bank_transfer`, las dos suplencias bancarias), el
suplente N1 con sus fechas, y `is_active`. Todo eso vive en `/admin/employees`.

## Identificación de la persona

Medido en la base el 2026-10-01, y esto condiciona el código:

- Los **55 RUT guardados tienen puntos** (`11.111.111-1`).
- **5 tienen la `k` del dígito verificador en minúscula**.
- **No hay restricción de unicidad** sobre `users.rut`.

Por lo tanto:

1. **Se compara normalizado**, de los dos lados: sin puntos y con el DV en mayúscula.
2. Si el RUT normalizado coincide con **más de una persona**, la fila es un error. No se
   elige una.
3. Si **no coincide con ninguna**, se intenta por **correo**. Si el correo encuentra a
   alguien, esa persona se actualiza **y se le graba el RUT** — con lo que las 2 personas
   que hoy no lo tienen quedan identificables por RUT desde la próxima planilla.
4. **Si se encontró por correo y esa persona YA tiene un RUT distinto**, es un error:
   «está registrada con otro RUT». No se le cambia. Cambiar el RUT de alguien es cambiarle
   el identificador, y lo más probable es que sea un tipeo.
5. Si **ni el RUT ni el correo encuentran a nadie**, la fila **crea una cuenta nueva** —
   siempre que traiga nombre y correo. Si falta alguno de los dos, es error: «para crear a
   alguien hacen falta su nombre y su correo».

El RUT se guarda **normalizado con puntos** (`11.111.111-1`, DV en mayúscula), que es el
formato que ya tienen los 55 y el que el export a Defontana espera (`toSheetRut`).

## Resolución de aprobadores y centros de costo

**Aprobadores.** Para cada celda de N1 y N2:

1. Si tiene `@`, se busca por correo exacto, sin distinguir mayúsculas.
2. Si no, por nombre: sin tildes, sin mayúsculas y sin espacios de más, contra
   `full_name`, entre las personas **activas**.
3. Una coincidencia → resuelta. Varias → error con los nombres. Ninguna → error.

Los aprobadores se resuelven contra el estado **actual** de la base, nunca contra lo que
la planilla va a escribir: así el orden de las filas no cambia el resultado. **Una persona
que la planilla crea en la misma carga no puede ser aprobadora en esa carga** — hay que
subir la planilla otra vez, o configurarla en `/admin/employees`. Es una limitación
aceptada: evita que el resultado dependa del orden de las filas, que es mucho peor de
depurar.

**Centro de costo.** Se acepta el código (`45103010013`) o el nombre, con la misma
tolerancia. Si no existe, es error de fila con los primeros centros parecidos. Reutiliza
el `resolveCostCenter` de `EmployeeImport`.

## Validación por fila

Los errores no cortan en el primero: se juntan todos, para que quien corrige el Excel no
tenga que hacerlo en varias pasadas.

| Comprobación | Mensaje |
|---|---|
| RUT presente y con DV correcto | «RUT inválido — revisa el dígito verificador» |
| El RUT no coincide con dos personas | «Ese RUT lo tienen dos personas: …» |
| Al crear: nombre y correo presentes | «Para crear a alguien hacen falta su nombre y su correo» |
| Al actualizar por correo: el RUT coincide | «… está registrada con otro RUT» |
| N1 y N2 se resuelven sin ambigüedad | «El aprobador "Pérez" coincide con 2 personas: …» |
| El centro de costo existe | «No existe el centro de costo "…"» |
| El rol es uno de los tres | «Rol "…" desconocido: usa admin, approver o employee» |
| Todo lo que ya rechaza `validarCadena` | nadie es su propio aprobador; N2 exige N1; N1 ≠ N2; el aprobador existe, está activo y tiene `can_approve` |
| El correo no está repetido dentro de la planilla | «Dos filas traen el mismo correo» |
| El correo no lo usa ya **otra** cuenta | «Ese correo ya lo usa …» |
| El RUT no está repetido dentro de la planilla | «Dos filas traen el mismo RUT» |

**Sobre `can_approve`:** se evalúa contra el estado que la base tendrá *después* de
otorgar los permisos pendientes, así el botón «Darles el permiso» saca las filas del error
sin volver a subir el archivo.

## El permiso «aprueba»

La vista previa junta aparte a las personas nombradas como N1 o N2 que no tienen
`can_approve`, con sus nombres y un botón que se lo da a todas. Es un acto explícito del
admin, separado de la carga, y queda en el registro de auditoría. **La planilla nunca lo
otorga sola.**

## Alertas de segregación de funciones

Además de validar fila por fila, la planilla mira **cómo queda la organización** y avisa.
Las tres alertas **no bloquean**: en una empresa chica pueden ser deliberadas. Se muestran
en un bloque aparte, antes de confirmar.

Se calculan sobre el estado resultante: la base **más** lo que la planilla va a escribir.

| Alerta | Cuándo | Por qué importa |
|---|---|---|
| **Concentra funciones bancarias** | Alguien tiene `can_load_bank_transfer` **y** `can_authorize_bank_transfer` | La app ya impide usar ambas en el *mismo* pago (regla «quien cargó no autoriza»), pero tener las dos es lo que marca un auditor. **Hoy hay 1 caso** |
| **Se aprueban mutuamente** | X es N1 o N2 de Y, e Y lo es de X | Ninguno tiene supervisión real. `validarCadena` no lo ve, porque mira la cadena de una persona a la vez y nunca el conjunto. **Hoy hay 1 caso** |
| **Demasiada gente a cargo** | Un mismo N1 queda con más de **15** personas | No está mal, pero es un cuello de botella y un punto único de falla. Hoy el máximo es 3; con los 50 repartiéndose va a subir |

La primera mira permisos que la planilla no escribe: los lee de la base. Es la forma de
dar visibilidad sobre la segregación sin poner esos permisos en un Excel (decisión 10).

## Qué se escribe

**Al actualizar**, un `update` sobre `public.users` con **solo los campos que vienen con
valor**:

```
full_name                              ← NO se toca al actualizar
approver_l1_id, approver_l2_id         ← columnas 7 y 8
rut                                    ← columna 2, solo si la persona no lo tenía
department, cost_center_id, role       ← columnas 4, 5 y 6
bank_name, bank_account_type, bank_account  ← columnas 9, 10 y 11
```

Y si la columna 3 trae un correo distinto del actual, `auth.admin.updateUserById` con
`email` y `email_confirm: true`.

**Al crear**, lo mismo que hace hoy `importEmployees`: `auth.admin.createUser` con
`email_confirm: false`, después la fila en `public.users` con `can_submit = true` y los
demás permisos en `false`, y **rollback del usuario de Auth si la fila falla** — si no,
queda una cuenta sin perfil que nadie puede arreglar desde la app. **No se envía
invitación**: eso sigue siendo un acto aparte desde `/admin/employees`.

**Un `logAudit` por empleado**, con el valor anterior y el nuevo. Un cambio de correo y
una cuenta creada se registran como tales.

No hay transacción que abarque las filas: cada una se escribe por su cuenta y el resultado
dice cuántas entraron. Si una falla a mitad, las anteriores quedan escritas y la pantalla
lo informa. Es preferible a deshacer 54 cambios buenos por uno malo, y **cada escritura es
idempotente**: volver a subir la misma planilla deja el mismo estado (lo único que no se
repite es la creación, porque la segunda vez esa persona ya existe y se actualiza).

## Arquitectura

```
src/lib/planilla-alta.ts          ← helpers puros. Módulo común, SIN 'use server'
src/lib/cadena-aprobacion.ts      ← el núcleo extraído de setEmployeeApprovalChain
src/lib/segregacion.ts            ← las tres alertas, puras
src/actions/employees.ts          ← + personasParaPlanilla(), cargarPlanillaAlta(),
                                     otorgarPermisoAprobar()
src/components/admin/PlanillaAlta.tsx   ← lectura del Excel y vista previa
src/app/(app)/admin/employees/page.tsx  ← un panel más, junto a «Importar nómina»
src/tests/planilla-alta.test.ts   ← pruebas de los helpers
src/tests/segregacion.test.ts     ← pruebas de las alertas
```

**Por qué `src/lib/` y no dentro de la acción:** todo lo exportado desde un archivo
`'use server'` es una acción que el navegador puede invocar con los argumentos que quiera.
Los helpers son puros y los consume la vista previa en el cliente; la escritura vive en la
acción, que **vuelve a resolver y validar todo** — el navegador no es fuente de verdad.

**Por qué extraer `cadena-aprobacion.ts`:** hoy las reglas de la cadena viven dentro de
`setEmployeeApprovalChain`. Si la planilla las copia, pasan a existir en dos sitios y el
día que cambien se van a desincronizar.

**Qué pasa con `EmployeeImport`:** se queda **hasta que la carga real esté hecha y Daniel
esté conforme**. Recién entonces se borra el componente y su botón, y queda un solo camino.
No se borra antes para no quedarse sin ninguna vía si la planilla falla el día de la carga.

### Interfaces

```ts
// src/lib/planilla-alta.ts

export type FilaPlanilla = {
  nombre: string; rut: string; correo: string
  cargo: string; centroCosto: string; rol: string
  n1: string; n2: string
  banco: string; tipoCuenta: string; numeroCuenta: string
}

// Extiende la de @/lib/permisos, que es la que pide validarCadena. Escribir sus
// campos a mano no sirve: esa tiene cuatro más (can_submit,
// can_manage_petty_cash y las dos suplencias bancarias) y el typecheck lo
// rechaza. Extendiéndola, un campo nuevo allá lo avisa el compilador acá.
export type Persona = PersonaPermisos & {
  correo: string; rut: string | null
  approver_l1_id: string | null; approver_l2_id: string | null
}

export type CentroCosto = { id: string; codigo: string; nombre: string }

// Solo las claves que la fila trae con valor: lo que no está, no se toca.
// Es el tipo que hace cumplir «una celda vacía nunca borra» — una clave
// ausente y una clave en null son cosas distintas, y acá la segunda no existe.
export type ParcheEmpleado = Partial<{
  approver_l1_id: string; approver_l2_id: string
  rut: string; department: string; cost_center_id: string; role: string
  bank_name: string; bank_account_type: string; bank_account: string
}>

export type FilaResuelta = {
  fila: number                      // 1-based, como la ve el Excel
  accion: 'crear' | 'actualizar' | 'ninguna'
  persona: Persona | null           // null cuando es 'crear'
  n1: Persona | null; n2: Persona | null
  correoNuevo: string | null
  parche: ParcheEmpleado
  nuevo: { nombre: string; correo: string; rut: string } | null  // solo si 'crear'
  errores: string[]
}

export function normalizarRut(rut: string): string
export function formatearRut(rut: string): string
export function normalizarNombre(nombre: string): string
export function resolverPersona(
  valor: string, personas: Persona[], por: 'rut' | 'correo' | 'nombre',
): { persona: Persona | null; ambiguas: Persona[] }
export function resolverAprobador(
  valor: string, personas: Persona[],
): { persona: Persona | null; ambiguas: Persona[] }
export function resolverCentroCosto(
  valor: string, centros: CentroCosto[],
): { centro: CentroCosto | null; parecidos: CentroCosto[] }
export function parcheDeFila(
  fila: FilaPlanilla, persona: Persona,
  n1: Persona | null, n2: Persona | null, centro: CentroCosto | null,
): ParcheEmpleado
export function resolverPlanilla(
  filas: FilaPlanilla[], personas: Persona[], centros: CentroCosto[],
  permisosPorOtorgar?: Set<string>,
): FilaResuelta[]
export function sinPermisoAprobar(resueltas: FilaResuelta[]): Persona[]
```

```ts
// src/lib/segregacion.ts

export type Alerta = {
  tipo: 'banco' | 'circular' | 'concentracion'
  texto: string
  personas: string[]   // nombres, para mostrarlos
}

// Sobre el estado RESULTANTE: la base más lo que la planilla va a escribir.
export function alertasDeSegregacion(
  personas: Persona[], resueltas: FilaResuelta[], topeACargo?: number,
): Alerta[]
```

### Flujo

1. El admin abre el panel y suelta el `.xlsx`. SheetJS lo lee **en el navegador**: el
   archivo no se sube a ningún lado.
2. El componente pide personas y centros de costo (acciones de solo lectura) y llama a
   `resolverPlanilla` y `alertasDeSegregacion`.
3. La vista previa muestra el resumen (**se crean N · se actualizan M · quedan fuera K**),
   los permisos pendientes, las alertas y las filas con sus errores.
4. «Cargar» manda **solo las filas válidas** a `cargarPlanillaAlta`, que vuelve a resolver
   y validar en el servidor y escribe.
5. La pantalla muestra el resultado por fila y recarga la nómina.

## Pruebas

En `src/tests/planilla-alta.test.ts`:

- `normalizarRut` / `formatearRut`: con puntos y sin, `k` en los dos casos, ida y vuelta.
- `resolverPersona`: por RUT normalizado aunque la base lo tenga con puntos; por nombre sin
  tildes; devuelve las candidatas cuando hay dos; ninguna cuando no hay.
- `resolverCentroCosto`: por código y por nombre; devuelve parecidos cuando no existe.
- `parcheDeFila`: una celda vacía **no** entra en el parche; el RUT solo si no lo tenía;
  `full_name` **nunca** entra.
- `resolverPlanilla`: `accion` es `crear` cuando no está y `actualizar` cuando sí; crear
  sin nombre o sin correo es error; una fila mala no contamina a las buenas; RUT y correo
  repetidos marcan las dos filas; un aprobador sin `can_approve` da error y deja de darlo
  con `permisosPorOtorgar`.
- `sinPermisoAprobar`: junta sin repetir.

En `src/tests/segregacion.test.ts`:

- Detecta a quien tiene los dos permisos bancarios, y no a quien tiene uno.
- Detecta el par que se aprueba mutuamente, **incluyendo el caso en que la planilla lo
  crea** (uno de los dos lados viene del parche, no de la base).
- Detecta la concentración sobre el tope y no debajo.
- Sin nada que alertar, devuelve lista vacía.

La lectura del Excel y la pantalla no se prueban automáticamente, igual que
`EmployeeImport`. El control es la vista previa.

## Fuera de alcance

Los permisos operativos como columnas · el aprobador suplente · `is_active` · renombrar a
alguien al actualizar · enviar invitaciones · borrar empleados.

## Riesgos

| Riesgo | Mitigación |
|---|---|
| Una fila con el RUT mal escrito crea una cuenta en vez de dar error | La vista previa separa «se crean N» de «se actualizan M» y la confirmación nombra las dos cifras |
| Un cambio de correo deja a alguien sin poder entrar | Se destaca en ámbar con el correo anterior al lado, y el resumen cuenta cuántos son |
| Dos personas con el mismo RUT en la base (no hay constraint) | La fila queda en error con los dos nombres; nunca se elige una |
| Una cuenta de Auth queda sin perfil si falla la fila | Rollback del usuario de Auth, como ya hace `importEmployees` |
| La carga se corta a mitad | Cada escritura es idempotente: volver a subir la misma planilla deja el mismo estado |
| Quedan dos importadores pareciéndose | `EmployeeImport` se retira después de la carga real; está en el plan como paso explícito |
