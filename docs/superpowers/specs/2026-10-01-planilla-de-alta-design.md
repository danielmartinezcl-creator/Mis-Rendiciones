# Planilla de alta — diseño

> Tarea 3.2 de `docs/superpowers/plans/2026-09-29-hoja-de-ruta-pendientes.md`, rama (b)
> de la decisión D3. Brainstorming con Daniel el 2026-10-01.

## Qué resuelve

Al 2026-10-01, de los **57 usuarios activos**: **50 no tienen aprobador N1**, así que no
pueden enviar una rendición, y **56 no tienen los datos bancarios completos**, así que no
se les puede pagar. Configurarlos de a uno en `/admin/employees` es cerca de una hora de
trabajo repetitivo, y hay que repetirla entera con el próximo cliente.

La planilla carga eso de una vez desde un Excel, con una vista previa que dice fila por
fila qué va a pasar antes de escribir nada.

**No reemplaza a `/admin/employees`.** Esa pantalla sigue siendo donde se configura una
persona puntual, se quita un aprobador o se arma una suplencia. La planilla es para la
carga masiva inicial.

## Decisiones (todas de Daniel, 2026-10-01)

| # | Decisión | Por qué |
|---|---|---|
| 1 | **Solo actualiza**, nunca crea | Un correo o un RUT mal escrito es un **error de fila**, no una cuenta nueva. Crear usuarios ya lo hace «Importar nómina» |
| 2 | **El RUT identifica a la persona** | Un correo cambia; el RUT es inherente a la persona. 55 de 57 ya lo tienen cargado |
| 3 | El aprobador se nombra **por correo o por nombre** | Quien arma la planilla usa lo que tiene. Un nombre ambiguo es error de fila, no una apuesta |
| 4 | **Una celda vacía nunca borra** | La planilla solo completa. «Vacío» es «no sé», no «bórralo»: una planilla a medio llenar no puede dejar a nadie sin aprobador |
| 5 | El permiso «aprueba» **se señala y se ofrece dar** en bloque | `validarCadena` rechaza a un aprobador sin `can_approve`, y hoy solo 5 personas lo tienen. Sin esto, la carga es un ciclo de subir, descubrir que faltan y volver a subir |
| 6 | **Sin suplente N1** | Es puntual y temporal, con fechas desde/hasta: para cuando se suba la planilla, ya habrían cambiado. Sigue en `/admin/employees` |
| 7 | **Las filas válidas entran; las malas quedan fuera** | Con 57 filas, que una mal escrita bloquee las 56 buenas es un castigo desproporcionado |
| 8 | **Se mantiene la validación del dígito verificador** | Ahora que el RUT decide a quién se le escribe cada fila, el DV es la única red contra un error de tipeo. Los RUT **ficticios siguen sirviendo** mientras el DV cuadre: `11111111-1`, `22222222-2`, `12345678-5`, `99999990-5` |
| 9 | El correo **también actualiza el acceso** | Si RR.HH. tiene correos más nuevos, se corrigen en la misma pasada. Es la operación más delicada de la planilla y la vista previa la destaca |

## La planilla

Ocho columnas, en este orden. Se descarga vacía desde la misma pantalla, como ya hace
«Importar nómina».

| # | Columna | Obligatoria | Qué hace |
|---|---|---|---|
| 1 | Apellido y nombre | no | Informativa: hace legible la vista previa. **No se escribe** |
| 2 | RUT | **sí** | Identifica a la persona |
| 3 | Correo | no | Respaldo de identificación, y actualiza el acceso si difiere |
| 4 | Aprobador 1er Nivel (N1) | no | Correo o nombre |
| 5 | Aprobador 2do Nivel (N2) | no | Correo o nombre |
| 6 | Banco | no | `users.bank_name` |
| 7 | Tipo de Cuenta | no | `users.bank_account_type` |
| 8 | N° de Cuenta | no | `users.bank_account` |

Las cabeceras se reconocen con el mismo `mapHeader` tolerante que usa `EmployeeImport`
(ignora mayúsculas, tildes y espacios). Si falta la columna RUT, la planilla se rechaza
entera: sin ella no hay a quién escribirle.

**La columna «Apellido y nombre» no se escribe nunca.** Está para que quien revisa la
vista previa reconozca a la persona. Cambiar el nombre de alguien es otra operación.

## Identificación de la persona

Medido en la base el 2026-10-01, y esto condiciona el código:

- Los **55 RUT guardados tienen puntos** (`11.111.111-1`).
- **5 tienen la `k` del dígito verificador en minúscula**.
- **No hay restricción de unicidad** sobre `users.rut`. Hoy los 55 son distintos, pero
  nada lo garantiza.

Por lo tanto:

1. **Se compara normalizado**, de los dos lados: sin puntos y con el DV en mayúscula.
   `11.111.111-1`, `11111111-1` y `11111111-K` vs `11111111-k` tienen que encontrarse.
2. Si el RUT normalizado coincide con **más de una persona**, la fila es un error
   («ese RUT lo tienen dos personas»). No se elige una.
3. Si **no coincide con ninguna**, se intenta por **correo**. Si el correo encuentra a
   alguien, esa persona se actualiza **y se le graba el RUT** — con lo que las 2 personas
   que hoy no lo tienen quedan identificables por RUT desde la próxima planilla.
4. Si tampoco el correo encuentra a nadie, la fila queda fuera: la planilla no crea
   cuentas.
5. **Si se encontró por correo y esa persona YA tiene un RUT distinto** al de la fila, es
   un **error**: «esa persona está registrada con otro RUT». No se le cambia. Cambiar el
   RUT de alguien es grave —es su identificador— y lo más probable es que sea un error de
   tipeo en una de las dos puntas; si de verdad hay que corregirlo, se hace a mano y a la
   vista en `/admin/employees`.

El RUT se guarda **normalizado con puntos** (`11.111.111-1`, DV en mayúscula), que es el
formato que ya tienen los 55 y el que el export a Defontana espera (`toSheetRut`).

## Resolución de aprobadores

Para cada celda de N1 y N2, en este orden:

1. Si parece un correo (tiene `@`), se busca por correo exacto, sin distinguir mayúsculas.
2. Si no, se busca por nombre: comparación **sin tildes, sin mayúsculas y sin espacios de
   más**, contra `full_name`, entre las personas **activas** de la organización.
3. **Una sola coincidencia** → resuelta, y la vista previa muestra a quién apuntó.
   **Varias** → error de fila, con los nombres de las candidatas.
   **Ninguna** → error de fila.

Una persona puede aparecer como aprobadora de otras filas y además tener su propia fila;
los aprobadores se resuelven contra el estado **actual** de la base, no contra lo que la
planilla vaya a escribir. Eso evita que el orden de las filas cambie el resultado.

## Validación por fila

Una fila es válida cuando pasa todo esto. El primer error encontrado no corta: se juntan
todos para que quien corrige el Excel no tenga que hacerlo en varias pasadas.

| Comprobación | Mensaje |
|---|---|
| RUT presente y con DV correcto | «RUT inválido — revisa el dígito verificador» |
| El RUT (o el correo) encuentra a una persona | «Ningún empleado tiene ese RUT, y el correo tampoco está en la base» |
| El RUT no coincide con dos personas | «Ese RUT lo tienen dos personas: …» |
| N1 y N2 se resuelven sin ambigüedad | «El aprobador "Pérez" coincide con dos personas: …» |
| Todo lo que ya rechaza `validarCadena` | nadie es su propio aprobador; N2 exige N1; N1 ≠ N2; el aprobador existe, está activo y tiene `can_approve` |
| El correo no está repetido dentro de la planilla | «Dos filas traen el mismo correo» |
| El correo nuevo no lo usa ya **otra** cuenta | «Ese correo ya lo usa otra persona» |
| El RUT no está repetido dentro de la planilla | «Dos filas traen el mismo RUT» |

**Sobre `can_approve`:** la comprobación se hace contra el estado que la base tendrá
*después* de otorgar los permisos pendientes. Es decir, si el admin usa el botón «Darles
el permiso», esas filas dejan de estar en error sin tener que volver a subir el archivo.

## El permiso «aprueba»

La vista previa junta aparte a las personas nombradas como N1 o N2 que no tienen
`can_approve`, con sus nombres y un botón que se lo da a todas.

Es un acto explícito del admin, separado de la carga, y queda en el registro de
auditoría como cualquier cambio de permiso. **La planilla nunca lo otorga sola.**

## Qué se escribe

Por cada fila válida, un `update` sobre `public.users` con **solo los campos que vienen
con valor**:

```
approver_l1_id, approver_l2_id      ← de las columnas 4 y 5
rut                                 ← columna 2, normalizada (solo si la persona no lo tenía)
bank_name, bank_account_type, bank_account  ← columnas 6, 7 y 8
```

Y, si la columna 3 trae un correo distinto del actual, `auth.admin.updateUserById` con
`email` y `email_confirm: true`, para que la persona pueda entrar con el nuevo sin tener
que confirmar un enlace.

**Un `logAudit` por empleado**, con el valor anterior y el nuevo, igual que hace hoy
`setEmployeeApprovalChain`. Un cambio de correo se registra aparte, porque es el que hay
que poder rastrear.

No hay transacción que abarque las 55 filas: cada una se escribe por su cuenta y el
resultado final dice cuántas entraron. Si una falla a mitad de camino —por una condición
de carrera, por ejemplo— las anteriores quedan escritas y la pantalla lo informa. Es
preferible a deshacer 54 cambios buenos por uno malo, y cada escritura es idempotente:
volver a subir la misma planilla deja el mismo estado.

## Arquitectura

```
src/lib/planilla-alta.ts          ← helpers puros. Módulo común, SIN 'use server'
src/lib/cadena-aprobacion.ts      ← el núcleo extraído de setEmployeeApprovalChain
src/actions/employees.ts          ← + cargarPlanillaAlta(), otorgarPermisoAprobar()
src/components/admin/PlanillaAlta.tsx   ← lectura del Excel y vista previa
src/app/(app)/admin/employees/page.tsx  ← un panel más, junto a «Importar nómina»
src/tests/planilla-alta.test.ts   ← pruebas de los helpers
```

**Por qué `src/lib/` y no dentro de la acción:** todo lo exportado desde un archivo
`'use server'` es una acción que el navegador puede invocar con los argumentos que
quiera. Los helpers son puros y los consume la vista previa en el cliente; la escritura
vive en la acción.

**Por qué extraer `cadena-aprobacion.ts`:** hoy las reglas de la cadena (validar, escribir
los cinco campos, auditar) viven dentro de `setEmployeeApprovalChain`. Si la planilla las
copia, pasan a existir en dos sitios y el día que cambien se van a desincronizar. Se
extrae el núcleo —validación + parche + `logAudit`— y lo llaman los dos.

### Interfaces

```ts
// src/lib/planilla-alta.ts

export type FilaPlanilla = {
  nombre: string; rut: string; correo: string
  n1: string; n2: string
  banco: string; tipoCuenta: string; numeroCuenta: string
}

export type Persona = {
  id: string; nombre: string; correo: string; rut: string | null
  activo: boolean; can_approve: boolean
}

// Solo las claves que la fila trae con valor: lo que no está, no se toca.
// Es el tipo que hace cumplir «una celda vacía nunca borra» — una clave
// ausente y una clave en null son cosas distintas, y acá la segunda no existe.
export type ParcheEmpleado = Partial<{
  approver_l1_id: string; approver_l2_id: string
  rut: string
  bank_name: string; bank_account_type: string; bank_account: string
}>

export type FilaResuelta = {
  fila: number                      // 1-based, como la ve el Excel
  persona: Persona | null
  n1: Persona | null; n2: Persona | null
  correoNuevo: string | null        // solo si difiere del actual
  rutPorGrabar: string | null       // solo si la persona no tenía RUT
  parche: ParcheEmpleado            // lo que se va a escribir
  errores: string[]
}

// Sin puntos y DV en mayúscula, para comparar. '11.111.111-k' → '11111111-K'
export function normalizarRut(rut: string): string

// Con puntos y DV en mayúscula, para guardar. '11111111-k' → '11.111.111-K'
export function formatearRut(rut: string): string

// Sin tildes, sin mayúsculas, sin espacios de más
export function normalizarNombre(nombre: string): string

export function resolverPersona(
  valor: string, personas: Persona[], por: 'rut' | 'correo' | 'nombre',
): { persona: Persona | null; ambiguas: Persona[] }

// Vacío no borra: una celda sin valor no entra en el parche
export function parcheDeFila(fila: FilaPlanilla, persona: Persona): ParcheEmpleado

export function resolverPlanilla(
  filas: FilaPlanilla[], personas: Persona[], permisosPorOtorgar: Set<string>,
): FilaResuelta[]

export function sinPermisoAprobar(resueltas: FilaResuelta[]): Persona[]
```

### Flujo

1. El admin abre el panel y suelta el `.xlsx`. SheetJS lo lee **en el navegador**, como
   ya hace `EmployeeImport`: el archivo no se sube a ningún lado.
2. El componente pide las personas de la organización (una acción de solo lectura) y
   llama a `resolverPlanilla`.
3. La vista previa muestra el resumen, los permisos pendientes y las filas con sus
   errores.
4. «Cargar las N válidas» manda **solo las filas válidas** a `cargarPlanillaAlta`, que
   vuelve a resolver y validar **en el servidor** —el navegador no es fuente de
   verdad— y escribe.
5. La pantalla muestra el resultado por fila y recarga la nómina.

## Pruebas

En `src/tests/planilla-alta.test.ts`, sobre los helpers puros:

- `normalizarRut` y `formatearRut`: con puntos y sin, `k` minúscula y mayúscula, ida y
  vuelta. Son el corazón de la identificación.
- `resolverPersona`: encuentra por RUT normalizado aunque la base lo tenga con puntos;
  por nombre sin tildes; devuelve las candidatas cuando hay dos; no devuelve ninguna
  cuando no hay.
- `parcheDeFila`: una celda vacía **no** entra en el parche; una con valor sí; el RUT
  solo entra si la persona no lo tenía.
- `resolverPlanilla`: una fila mala no contamina a las buenas; un RUT repetido en dos
  filas marca las dos; un aprobador sin `can_approve` da error, y deja de darlo cuando
  su id está en `permisosPorOtorgar`.
- `sinPermisoAprobar`: junta a los aprobadores sin permiso, sin repetirlos.

La lectura del Excel y la pantalla no se prueban automáticamente, igual que
`EmployeeImport`. El control es la vista previa.

## Fuera de alcance

Crear usuarios · tocar el aprobador suplente · cambiar roles, centros de costo,
departamentos o el nombre de nadie · quitar un aprobador o un dato bancario (eso es
`/admin/employees`) · enviar invitaciones.

## Riesgos

| Riesgo | Mitigación |
|---|---|
| Un cambio de correo deja a alguien sin poder entrar | La vista previa lo destaca en ámbar con el correo anterior al lado, y el resumen cuenta cuántos son |
| Dos personas con el mismo RUT en la base (no hay constraint) | La fila queda en error con los dos nombres; nunca se elige una |
| El Excel trae una columna de más o con otro nombre | `mapHeader` ignora lo que no reconoce; si falta el RUT, se rechaza el archivo entero |
| La carga se corta a mitad | Cada escritura es idempotente: volver a subir la misma planilla deja el mismo estado |
