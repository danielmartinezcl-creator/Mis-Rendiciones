# Aprobador por proyecto — diseño

> Spec validada con Daniel el **2026-10-07**. Reemplaza el modelo de aprobador fijo por
> empleado en el caso de los gastos de terreno, sin desarmar el motor de permisos.
>
> Plan de implementación: `docs/superpowers/plans/2026-10-07-aprobador-por-proyecto.md`

---

## El problema

PENTA trabaja por proyectos. Cuando alguien va a terreno y rinde gastos o pide una caja
chica, **quien debe aprobar es el jefe de ese proyecto**, no un aprobador fijo de la
persona. Los jefes rotan entre obras, las obras se abren y se cierran, y hay **150
proyectos activos con unos 50 nuevos por año**.

El sistema de hoy no puede expresar eso: `users.approver_l1_id` es una sola persona, fija.

Hay dos pruebas de que el problema es real y de que la gente ya lo suple a mano:

- Los títulos de las rendiciones vivas incluyen `proyercto 2991` y `Visita a obra
  Rancagua`; los fondos, `fondo n°193 of ing`. El proyecto ya se escribe, sin estructura
  y con erratas.
- **50 de los 57 empleados no tienen N1 configurado**, y `cadenaActiva()` bloquea el
  envío sin N1. Hoy la mayoría no podría rendir nada.

### Lo que NO es el problema

Los 46 centros de costo **no sirven** para esto: son áreas funcionales (`ELECTRICIDAD`,
`PROYECTISTAS`, `LICITACIONES`) en una jerarquía `EMP > EMPGES > …`, no obras. El proyecto
es una dimensión nueva.

---

## Por qué este diseño y no un catálogo de proyectos

Se evaluaron tres caminos. Daniel eligió el tercero, y conviene registrar **por qué**,
porque el motivo que se suele dar es falso:

| | Enfoque | Resultado |
|---|---|---|
| A | Tabla de proyectos cargada por el admin, el empleado elige de la lista | descartado |
| B | A + asignaciones empleado×proyecto con vigencia | descartado |
| C | **El empleado elige al jefe de una lista corta de habilitados** | **elegido** |

**El costo de almacenamiento no fue el motivo, porque no existe.** Medido sobre la base
real: las tablas de `public` pesan 1,7 MB y la base entera 15 MB, contra 500 MB del plan
gratuito — un 3 %. Una tabla de 200 proyectos pesa lo mismo que `cost_centers` (46 filas,
80 kB), y casi todo eso es el piso que Postgres cobra por existir. Con 1.150 proyectos
—veinte años— la base llegaría al 3,1 %. **En Supabase, A y C cuestan exactamente lo
mismo: $0.**

Lo que sí difiere es el trabajo: A obliga a mantener un catálogo de 150+ y a que el
empleado elija de una lista de 150 en el teléfono, en terreno. C se configura una vez
(cinco jefes) y no se mantiene.

**El riesgo que C acepta a cambio:** el empleado elige quién lo aprueba. Se mitiga con la
lista corta, con el N2 por monto, y con que apartarse del jefe sugerido quede visible.

---

## Las decisiones (no se cambian sin volver a hablarlas)

1. **Un documento, un proyecto, un jefe.** El proyecto se declara por documento, no por
   gasto. Quien fue a dos obras hace dos rendiciones. Mantiene la cadena sin ambigüedad y
   evita tener que resolver quién aprueba un documento con tres proyectos.
2. **Selector explícito**, no un campo vacío que signifique «no es de proyecto». Un campo
   de número a la vista se lee como obligatorio, y el costo de equivocarse es que el gasto
   le llegue a la persona equivocada.
3. **Sin proyecto:** el jefe propio si lo tiene, si no el aprobador por defecto de la
   organización. `users.approver_l1_id` pasa de **obligatorio a excepción**.
4. **El umbral de N2 se mide sobre el total solicitado, al enviar.** Congelar la cadena y
   congelar la ruta son la misma decisión: el empleado sabe desde el principio por dónde
   va a pasar, y N1 no puede recortar un ítem para evitar que escale.
5. **N2 y umbral unificados.** Un N2 y un umbral por persona, heredados de la
   organización. **Un N2 sin monto firma siempre; con monto, desde ese monto** (0 es lo
   mismo que ninguno).
   > *Corregido el 2026-10-07, antes del despliegue.* Decía «sin umbral = nunca». Al
   > revisar los datos reales salió que Francisco Díaz ya tenía N2 en la ficha
   > (Katherine Corvalán → Francisco Hagar, que es justo el caso que Daniel quería
   > mantener) y que ningún umbral estaba cargado: con la regla vieja **perdía su
   > segunda firma en silencio al desplegar**. Daniel eligió «firma siempre, salvo que
   > tenga un monto», que es lo que la ficha hacía antes de la 039.
6. **El proyecto se identifica por número** (`2991`), único por organización. Tiene nombre,
   pero **el número manda**. El catálogo **se arma solo con el uso**: nadie carga los 150.
7. **El jefe se sugiere por proyecto y el empleado puede cambiarlo.** Apartarse de la
   sugerencia es la señal de que la obra cambió de manos — o de que alguien buscó otro
   aprobador.
8. **La liquidación de caja chica congela su propia cadena**, con el monto gastado. No es
   una excepción: `tipoDeFondo()` ya trata al fondo y a su liquidación como dos documentos
   distintos, y cada uno congela al enviarse.
9. **La cadena se congela al enviar.** Hoy se calcula en vivo; con proyectos que rotan,
   reasignar un jefe movería aprobaciones ya pendientes.

---

## Lo que hace viable todo esto

**`cargarCadena()` en `src/lib/contexto-permisos.ts` es el único punto donde el sistema
decide quién aprueba.** Todo el motor —`puedeActuar`, `destinatarios`, `elegibles`, los
avisos, los recordatorios, la cola bancaria— consume la interfaz
`Cadena { l1, l2, suplenteL1Vigente }` sin saber de dónde salió. Cambiar el origen del
aprobador es reescribir una función, no el motor.

Dos cosas más que se verificaron en el código y que acotan el trabajo:

- **`bloqueo()` no mira `can_approve`** para `decidir_l1` ni `decidir_l2`: solo exige estar
  en la cadena del documento. `can_approve` gobierna poder *estar* en una cadena
  (`validarCadena`) y ver la bandeja (`approvals.ts:112`).
- Los tres puntos de congelado son los tres que hoy llaman a `puedeEnviar()`:
  `submitReport` (`expenses.ts:267`), `submitFund` y `submitLiquidation`
  (`petty-cash.ts:155` y `:392`).

---

## Datos

### Tabla nueva: `proyectos`

| Columna | |
|---|---|
| `numero` | el identificador real. **Único por organización** |
| `nombre` | opcional; se escribe una vez y queda para todos |
| `jefe_id` | el N1 que se sugiere; se guarda el último usado |
| `activo` | esconde obras cerradas del autocompletado sin borrar historia |

Se puebla al enviar un documento con un número que no existe. **No hay alta manual.**

### `users`

- `es_jefe_proyecto boolean` — quién aparece en la lista que ve el empleado. Marcarlo
  **otorga `can_approve`**, porque `validarCadena` lo exige.
- `umbral_n2_clp numeric null` — `null` hereda el de la organización.
- `approver_l1_id` / `approver_l2_id` **no se borran: cambian de significado.**

### `organizations`

`aprobador_defecto_id`, `aprobador_n2_defecto_id`, `umbral_n2_clp`.

### La cadena congelada

En `expense_reports` y `petty_cash_funds`: `proyecto_id`, `cadena_l1_id`, `cadena_l2_id`,
`cadena_fijada_at`. En `petty_cash_funds`, además `liq_cadena_l1_id`, `liq_cadena_l2_id`,
`liq_cadena_fijada_at` para la liquidación.

**Van como columnas y no en una tabla aparte**: la relación es 1 a 1 con el documento y
una tabla obligaría a un join en cada lectura de permisos, que es la consulta más caliente
del sistema.

---

## Cómo se resuelve la cadena

```
¿el documento tiene cadena congelada?
  sí  → usarla
  no  → (respaldo) la cadena de la persona, como hoy

al enviar, se congela:
  N1 = el jefe elegido (si es de proyecto)
       | el jefe propio      (si lo tiene)
       | el aprobador por defecto de la organización
  N2 = el N2 propio; si es null, el N2 por defecto de la organización
       monto = el de la ficha; si es null y el N2 es el de la organización, el de la org
       firma si no hay monto, o si el total solicitado lo alcanza (>=)
       si no hay ningún N2 que usar → sin N2
```

**El monto de la ficha vale para cualquiera de los dos N2; el de la organización, solo
para el suyo** (`umbralAplicable()`). Lo primero es lo que ya decía este diseño: alguien
puede tener monto propio y N2 heredado, y configurarle un monto no le borra en silencio el
N2 de la organización. Lo segundo es nuevo (2026-10-07): si el monto de la organización
valiera también para un N2 puesto a mano en la ficha, subir el monto general le quitaría
la segunda firma a quien la tiene configurada a propósito.

**Si no queda ningún N1** —la persona no tiene jefe propio y la organización no tiene
aprobador por defecto configurado— el envío se bloquea con el mensaje de `cadenaActiva()`,
igual que hoy. Es el único caso en que sigue haciendo falta configurar algo, y se evita
dejando el aprobador por defecto puesto.

El respaldo no es decorativo: sin él, cualquier documento creado entre el despliegue y la
migración queda sin aprobador y **nadie puede moverlo**, en silencio.

---

## Lo que ve el empleado

### El selector, en los dos formularios de creación

En `/expenses/new` (después del Título) y en `/petty-cash/new` (después del Nombre del
fondo):

> **¿Para qué es?**  ( ) Un proyecto   ( ) Gastos generales / oficina

**Sin valor por defecto la primera vez**, recordando después lo último que eligió esa
persona.

- **Un proyecto** → aparece el N° de proyecto, obligatorio. Si ya se usó, el nombre y el
  jefe aparecen solos; si es nuevo, pide el nombre una vez y elegir jefe de la lista de
  habilitados.
- **Gastos generales** → ningún campo más.

### La previsualización de la cadena

En el bloque de acciones, encima del botón de enviar:

```
+ Agregar ítem
Respaldos extras de la rendición (0)
→ Esto va a Juan Pérez.
  Y como supera $500.000, después a María González.
[ Enviar a revisión — 3 ítems ]
```

Es lo que hace que el selector no sea una pregunta a ciegas: muestra el efecto de la
elección y convierte el error en algo que se nota **antes** de enviar.

### Cambiar de opinión

En el detalle, mientras sea borrador, el proyecto y el jefe se ven en una línea editable
bajo el título. Enviada, queda fijo. Si se equivocó: el aprobador rechaza, vuelve a
borrador, lo corrige, y **al reenviar se vuelve a congelar**.

### En la liquidación

La misma previsualización, recalculada sobre **lo gastado**. Quien pidió $450.000 y gastó
$900.000 ve antes de presentarla que ahora pasa también por gerencia.

### `/quick` no cambia

Registra en un fondo que ya tiene su cadena congelada desde que se pidió.

---

## Caja chica — quién pide y quién autoriza

| | |
|---|---|
| **Quién pide** | Cualquiera con `can_submit` (hoy los 57), **el suyo**. `createFund` exige hoy `can_manage_petty_cash` o ser admin (`petty-cash.ts:101`) — **6 de 57**. `can_manage_petty_cash` se conserva y pasa a significar lo único que no puede hacer cualquiera: **pedir un fondo a nombre de otra persona** |
| **Quién autoriza** | El jefe del proyecto elegido. Si hay N2 asignado, también él; si no, termina ahí |
| **El jefe del beneficiario** | **No autoriza: se entera.** Solo si es distinto del jefe de proyecto, y solo si está definido |
| **Sin jefe definido** | No se avisa a nadie; sale solo la solicitud al jefe de proyecto |

Esto **no toca el motor**: el aviso entra por `destinatariosInformativos()`, que ya existe.
Mantener que *una cadena es siempre una lista de a uno* es lo que evita tener que revisar
todo lo que la lee.

---

## Administración

| Qué | Dónde |
|---|---|
| Permiso «jefe de proyecto» | `/admin/employees`, junto a los otros permisos. **Nunca por planilla** |
| Aprobador y N2 por defecto de la organización | `/admin/settings` → pestaña **Cadenas** (ya existe) |
| Umbral global | `/admin/settings` → pestaña **Límites** (ya existe) |
| N2 y umbral de una persona | Su ficha (`ApproverConfig`), junto al N1 |
| Catálogo de proyectos | Pantalla nueva mínima: corregir nombre, cambiar jefe, marcar inactivo |

---

## Migración

Todo **aditivo y nullable**, así que **va ANTES del despliegue** — al revés que la 033, la
035 y la 037, que protegían y tenían que ir después. Se ensaya con `BEGIN`/`ROLLBACK`
contra la base real, como las anteriores.

El relleno: los documentos **que todavía esperan decisión** se rellenan con la cadena
actual de su beneficiario. Los cerrados quedan en null — ya no se evalúan.

---

## Tres cosas que quedan desalineadas y hay que arreglar

1. **`segregacion.ts`** detecta «se aprueban mutuamente» leyendo `approver_l1_id` de
   `users`. Con el aprobador saliendo del proyecto, esa alerta queda parcialmente ciega:
   tiene que mirar también los jefes de proyecto, o deja de ver justo los casos nuevos.
2. **`validarCadena`** exige `can_approve` al N1 y al N2: marcar a alguien como jefe de
   proyecto tiene que otorgárselo.
3. **La planilla de alta** conserva sus columnas N1/N2 —configuran el jefe propio— pero
   dejan de ser lo que destraba el envío. Hay que sacarles el carácter de urgente en su
   documentación.

---

## Pruebas

- **Vitest**, funciones puras en `src/lib/`: qué cadena aplica (proyecto → jefe propio →
  default), si el total supera el umbral, cómo se normaliza un número de proyecto.
- **SQL**, patrón `supabase/tests/0NN_*.sql`: que un documento enviado no pueda cambiar su
  cadena congelada, y que el catálogo de proyectos respete la organización.
- **Lo que no se puede probar así:** la previsualización de la cadena. El proyecto no tiene
  testing de componentes de React; eso va a la línea base visual.

---

## Fuera de alcance, a propósito

Informe por proyecto (la tabla queda lista; el informe se hace cuando se pida), importación
de proyectos por Excel, cierre automático de obras, y llevar el proyecto al asiento de
Defontana — hoy el centro de negocios sale de `cost_center_id` y cambiarlo es una
conversación con el contador, no una decisión de software.
