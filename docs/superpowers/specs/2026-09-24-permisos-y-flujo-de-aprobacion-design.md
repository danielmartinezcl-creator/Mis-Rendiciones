# Diseño: Permisos por asignación, segregación de funciones y avisos a quien actúa

> Fecha: 2026-09-24
> Estado: Aprobado por Daniel Martínez en sesión (pendiente revisión de este documento)
> Proyecto 1 de 3 de la gestión de permisos. Los otros dos están al final, en «Fuera de alcance».

---

## Contexto

Al probar con personas reales de PENTA (Katherine Corvalán, Francisco Hagar, Roberto Hagar
y Daniel) aparecieron tres problemas:

1. **Tener un permiso equivale a poder usarlo sobre cualquier documento.** «Aprueba» deja
   aprobar cualquier fondo de la empresa, incluido el propio. Pasó de verdad: el
   *fondo n°193 of ing* lo creó Katherine, a nombre de ella, y ella misma lo aprobó
   el 2026-09-24 a las 15:45.
2. **Los correos van a todos los que tienen el permiso**, no a quien le toca actuar.
3. **El admin se salta las reglas del banco**: en los datos hay fondos que Daniel aprobó,
   cargó y autorizó sin que nadie más interviniera.

Además, en la revisión del código y de la base aparecieron:

- Los fondos tienen **un solo nivel** de aprobación y **no mandan ningún aviso**.
- Un aprobador que no es admin ni encargado del fondo «aprueba» un fondo, el historial
  lo registra, y el estado no cambia: no existe una política UPDATE para aprobadores en
  `petty_cash_funds` (misma trampa que arregló la migración `030` para rendiciones).
- `petty_cash_approvals` acepta inserciones de **cualquier usuario autenticado, con
  cualquier `actor_id`**. La regla «no operar el pago propio» (`puedeOperarPago`) se
  decide leyendo ese historial, así que una entrada falsa la destraba.
- «Pago listo» existe como paso manual: la aprobación final le manda a los encargados
  de carga un correo «Cargar reembolso», pero la rendición queda en `approved` hasta
  que un admin aprieta «Iniciar proceso bancario». En fondos, lo mismo con el EFF.
- `submitApprovalDecision` y `bulkApproveItems` solo revisan `can_approve`: un L2 puede
  decidir el nivel 1 entrando por link directo.
- `recordFundDisbursement` deja al encargado de un fondo pasarlo de `approved` a
  `funds_sent` saltándose el banco. No lo usa ninguna pantalla.
- Los correos del banco apuntan a `/admin/reports`, que los operadores no pueden abrir.

---

## Decisiones tomadas

| # | Decisión |
|---|---|
| D1 | **El admin configura, no opera.** No tiene ningún permiso operativo por ser admin |
| D2 | **Sin interruptor de pruebas**: desde hoy cada uno opera con su configuración real, también durante las pruebas |
| D3 | **«Lo propio» es lo que recibe uno mismo.** En un fondo, el beneficiario (`employee_id`); quien lo creó no cuenta |
| D4 | La aprobación final lleva **directo a la carga bancaria**. Se eliminan «Iniciar proceso bancario» y «Enviar a proceso bancario» |
| D5 | Los fondos y su liquidación pasan por la **cadena L1 → L2 del beneficiario**, igual que una rendición |
| D6 | Se elimina el paso **«elevar liquidación»** del EFF |
| D7 | **«Marcar reembolsado» solo para cargas históricas.** «Autorizado» significa que la plata salió de la empresa |
| D8 | Mientras un **suplente L1 está vigente**, el aviso le llega solo a él |
| D9 | Las reglas viven **una sola vez, en `src/lib/permisos.ts`**; la base no las repite, solo impide saltarse el servidor |

---

## 1. Las reglas

1. **Nadie aprueba lo propio** (rendición, fondo o liquidación).
2. **Nadie autoriza el pago de lo propio.** Reemplaza la excepción vigente hasta hoy
   (`puedeOperarPago`: se podía si otra persona había aprobado). Lo de FH lo autoriza RH.
3. **Quien cargó un pago no lo autoriza** (*maker–checker*).
4. **Aprobar en L2 y autorizar el mismo pago está permitido.** Es el caso normal de FH.
5. **Cargar el pago propio está permitido**: la autorización la da otra persona (regla 2).

### Casos de referencia (se convierten en tests)

| Caso | Aprueba | Carga | Autoriza |
|---|---|---|---|
| Rendición de Francisco Díaz | Katherine → FH | Katherine | FH |
| Katherine no está | Katherine → FH | FH | RH (regla 3) |
| Rendición de FH | RH | Katherine | RH (regla 2) |
| Rendición de Katherine | FH | Katherine | FH |
| Rendición de FH, Katherine ausente, RH quiere cargar | RH | **bloqueado para RH** | — (nadie podría autorizar) |

---

## 2. Recorrido de estados

### Rendiciones

```
draft → submitted → pending_l2 → pending_bank_load → pending_bank_auth → reimbursed
             └── sin L2 ──────┘
```

- La **decisión final** (aprobación total o parcial) con **monto a pagar > 0** deja la
  rendición en `pending_bank_load` en la misma escritura, y el aviso sale en ese momento.
  «Monto a pagar» es `approved_amount` tal como lo calcula `computeApprovedAmount`
  (gastos aprobados, neto de adelantos y devoluciones).
- Con monto a pagar 0 queda en `approved` / `partially_approved` como estado final.
- Rechazo en cualquier nivel → `rejected`, como hoy.
- La información de «parcial» no se pierde: queda en la acción del historial, en los
  ítems rechazados y en el correo al rendidor.
- `approved` / `partially_approved` con monto dejan de llevar a algún lado: las
  existentes se tratan en «Datos existentes».

### Fondos

```
draft → pending_approval → pending_approval_l2 → pending_bank_load → pending_bank_auth → funds_sent
      → submitted → pending_liquidation_approval → pending_liquidation_l2 → settled
```

- **Estados nuevos**: `pending_approval_l2` y `pending_liquidation_l2`. Si el beneficiario
  no tiene L2, se saltan.
- `approved` deja de usarse en el flujo nuevo (queda en el catálogo por los registros viejos).
- El empleado envía la liquidación (`submitted`) y ésta pasa **directo** a
  `pending_liquidation_approval` para su L1 (D6).
- Rechazo en cualquier nivel → `rejected`.

### Datos existentes

| Qué | Cantidad | Acción |
|---|---|---|
| Cargas históricas en `approved` | 78 (37 con monto) | **No se tocan**: son pagos del pasado |
| Rendiciones normales en `approved` | 2 (pruebas) | → `pending_bank_load` |
| Fondo n°193 (autoaprobado) | 1 | → `draft`, con entrada `returned_to_draft` en el historial |

---

## 3. Quién puede dar cada paso

**Principio:** los permisos (`can_*`) habilitan; lo que autoriza a actuar sobre **un**
documento es el lugar en su cadena. `can_approve` pasa a significar «se puede elegir
como aprobador»; por sí solo no deja aprobar nada.

| Paso | Quién puede | Nunca |
|---|---|---|
| Enviar rendición | `can_submit` (hoy solo lo mira el menú) y tener L1 configurado | — |
| Crear / enviar fondo | `can_manage_petty_cash` y que el beneficiario tenga L1 | — |
| Decidir nivel 1 | L1 del beneficiario, o su suplente L1 vigente | el beneficiario |
| Decidir nivel 2 | L2 del beneficiario | el beneficiario |
| Enviar liquidación | el beneficiario del fondo | — |
| Cargar pago | `can_load_bank_transfer`, si después queda alguien que pueda autorizar | — |
| Autorizar pago | `can_authorize_bank_transfer` | el beneficiario; quien lo cargó |
| Marcar reembolsado | admin, **solo cargas históricas** | cualquier rendición no histórica |
| Revertir reembolso | admin; vuelve a `pending_bank_load` | — |

### Reglas derivadas

- **Cada nivel es de su dueño**: el L2 no decide el nivel 1 aunque entre por link directo.
- **Sin L1 no se envía.** El empleado ve «No tienes aprobador asignado; ya le avisamos al
  administrador» y el admin recibe el aviso de configuración. Se elimina el fallback
  «visible a todos los `can_approve`» de `getPendingApprovals`.
- **Configuración válida** (se valida en `/admin/employees`, en `settings` y al importar):
  - nadie es su propio L1, L2 ni suplente L1;
  - L1 ≠ L2;
  - L1, L2 y suplente deben tener `can_approve`.
- **Nunca trabado**: antes de cargar se verifica que exista al menos una persona activa con
  `can_authorize_bank_transfer` que no sea el beneficiario ni quien carga. Si no existe,
  se bloquea la carga con un mensaje que dice quién sí puede cargar.
- **Ver no es actuar.** Un usuario ve: lo suyo, lo que creó, lo de su cadena y lo que está
  en su paso bancario. El admin ve todo, solo lectura. Se elimina la regla «cualquier
  `can_approve` ve todos los fondos pendientes» (`listPettyCashFunds` y la política RLS
  `approver sees funds pending approval`).
- **El admin pierde**: el comodín de `requireAdminOrBankPerm`, `getBankQueue` con
  `isAdmin → canLoad/canAuth`, «Marcar reembolsado» sobre no históricas, y la
  aprobación de lo que no le está asignado.
- Se elimina `recordFundDisbursement` (salto del banco, sin uso en pantallas).

### Interfaz del módulo

`src/lib/permisos.ts` — funciones puras, sin Supabase, testeables con Vitest:

```typescript
type Paso =
  | 'decidir_l1' | 'decidir_l2'
  | 'cargar_pago' | 'autorizar_pago'

interface Persona {
  id: string
  activo: boolean
  can_approve: boolean
  can_load_bank_transfer: boolean
  can_authorize_bank_transfer: boolean
  bank_is_backup: boolean
}

interface Documento {
  tipo: 'rendicion' | 'fondo' | 'liquidacion'
  beneficiarioId: string
  cadena: { l1: string | null; l2: string | null; suplenteL1Vigente: string | null }
  historial: { actorId: string; accion: string; nivel: number | null }[]
}

// ¿Puede esta persona dar este paso sobre este documento?
// Devuelve el motivo cuando no, para mostrarlo tal cual.
function puedeActuar(persona: Persona, paso: Paso, doc: Documento, personas: Persona[]):
  { ok: true } | { ok: false; motivo: string }

// ¿A quién se le avisa que le toca este paso?
function destinatarios(paso: Paso, doc: Documento, personas: Persona[]): string[]

// ¿Es válida esta cadena para este empleado?
function validarCadena(empleadoId: string, cadena: Documento['cadena'], personas: Persona[]):
  string[]  // lista de errores; vacía = válida
```

`destinatarios` **usa `puedeActuar`**: el aviso nunca le llega a alguien que no puede
dar el paso. `destinatariosBancarios` y `puedeOperarPago` de `bank-helpers.ts` se
absorben aquí y se eliminan.

---

## 4. Avisos

**Regla:** el aviso le llega a quien puede dar el siguiente paso sobre ese documento; los
avisos informativos, solo a quien envió y al beneficiario. «Quien envió» es el rendidor
en una rendición, el EFF que envió el fondo en un fondo, y el beneficiario en una liquidación.

| Momento | Aviso a |
|---|---|
| Envío (rendición, fondo o liquidación) | L1 del beneficiario; **solo el suplente** si está vigente (D8) |
| L1 aprueba y hay L2 | L2 |
| Decisión final con monto | titulares de carga; si no hay, suplentes |
| Carga confirmada | titulares de autorización **que pueden autorizar ese pago**; si no queda ninguno, suplentes que sí puedan |
| Autorizado | beneficiario («reembolso procesado» / «fondos enviados») |
| Rechazo / aprobación parcial / final sin monto | quien envió y el beneficiario, si son distintos |
| Liquidación aprobada (`settled`) — no tiene paso bancario | el beneficiario y el EFF que creó el fondo |
| Intento de envío sin L1 | admins de la org (aviso de configuración) |

- **Nunca se avisa a quien acaba de actuar.**
- Correos del banco → `/banco`; de fondos → `/petty-cash/[id]`.
- Las notificaciones in-app usan **los mismos destinatarios** que el correo.
- `notifications` gana `fund_id` (nullable) y los tipos `bank_load`, `bank_auth`,
  `funds_sent`, `config_missing`.

---

## 5. Protección de la base

### Transiciones solo desde el servidor

Disparador `BEFORE INSERT OR UPDATE` en `expense_reports` y `petty_cash_funds`:

- En **UPDATE**, si cambia `status`, `approved_amount` / `amount_approved`, `approved_at`,
  `reimbursed_*` o `payment_reference` **y la sesión tiene `auth.uid()`** → error.
- En **INSERT** con sesión de usuario, `status` tiene que ser `draft`.
- Con la llave de servicio (el servidor) o SQL manual, `auth.uid()` es null y pasa.

Mismo disparador sobre `status` de `expense_items` y `petty_cash_items` en UPDATE.

Consecuencia: **toda** transición pasa por una acción del servidor que primero consulta
`puedeActuar` y después escribe con `createAdminClient()`. Hay ~25 escrituras de estado
hoy (`approvals.ts`, `expenses.ts`, `petty-cash.ts`); el plan las inventaría una por una.
Toda escritura encadena `.select('id')` y lanza si vuelve vacía.

### Historial de fondos confiable

- Política INSERT de `petty_cash_approvals`: `actor_id = auth.uid()` (como en
  `expense_report_approvals`). El servidor, que escribe con la llave de servicio, pone
  el `actor_id` del usuario autenticado.
- `petty_cash_approvals` pasa a **append-only** con disparador, como `026`.
- Columna nueva `level smallint` (1/2, null en pasos no de aprobación).
- Acción nueva `returned_to_draft` en el catálogo.

### Catálogos

- `petty_cash_funds.status` + `pending_approval_l2`, `pending_liquidation_l2`.
- `constants.ts`: etiquetas y familia (`en-curso`) de los dos estados nuevos; `FUND_STEPS`
  con los pasos L2 y sin «Enviar a proceso bancario».
- `types.ts`: los mismos cambios.

---

## 6. Errores visibles

- El botón de un paso se muestra solo si `puedeActuar` da `ok`.
- Si se llega por link directo, el servidor devuelve `motivo` tal cual:
  «Esta rendición la autoriza Roberto Hagar: tú la cargaste».
- Mensajes en español, con el nombre de quién sí puede cuando se conoce.

---

## 7. Pruebas

- **`src/tests/permisos.test.ts`**: todos los casos de la tabla de la sección 1, suplente
  vigente y vencido, L2 intentando decidir nivel 1, «nunca trabado», `validarCadena`,
  y `destinatarios` para cada fila de la tabla de avisos.
- **Base, con usuarios no admin**: Katherine cambiando el estado de su fondo por la API
  directa → error; insertando historial con otro `actor_id` → error; admin cambiando
  `status` con su sesión → error.
- **Aceptación con los cuatro**: guion paso a paso en `docs/`, cada uno con su rol real.
  Las cadenas de prueba se acuerdan con Daniel antes de empezar (hoy Francisco Díaz tiene
  L1 = Daniel a propósito, para que Daniel vea el flujo). Daniel queda con
  `can_load_bank_transfer` + `bank_is_backup`, que es su configuración real (D2).
- La suite existente (Vitest) sigue verde; `bank-helpers.test.ts` se migra a `permisos.test.ts`.

---

## Ajustes al escribir el plan (2026-09-24)

Aparecieron al leer el código en detalle. El plan
(`docs/superpowers/plans/2026-09-24-permisos-por-asignacion.md`) ya los incluye.

1. **Suplencia bancaria por función.** `bank_is_backup` es uno solo por persona, y FH
   es titular para autorizar pero suplente para cargar. Se reemplaza por
   `bank_load_backup` y `bank_auth_backup` (032 los copia, 033 borra el viejo). Sin
   esto, la tabla de avisos de la sección 4 no se podía cumplir.
2. **El N1 que aprueba parcialmente ya no salta al N2.** Hoy una aprobación parcial del
   N1 cierra la rendición aunque haya N2. Ahora toda decisión del N1 que no sea
   rechazo total pasa al N2; lo que el N1 rechazó llega al N2 ya rechazado, con su
   motivo a la vista. *Confirmado por Daniel el 2026-09-24.*
3. **`FUND_STEPS` no crece.** Los estados N2 se muestran como el mismo paso que su N1
   (`pasoVisibleDelFondo`); la etiqueta del estado ya dice «N2».
4. **`validarCadena` corre en un solo lugar**, la acción nueva `setEmployeeApprovalChain`.
   Ni `settings` ni el importador de empleados asignan cadenas.
5. **La 033 deja entrar cargas históricas aprobadas**, solo si las crea un admin: el
   importador histórico inserta con la sesión del admin.
6. De paso, se reemplaza un `window.confirm` que quedaba en la pantalla del fondo.

---

## Fuera de alcance

- **Proyecto 2 — filas por función y ausencias**: titular / respaldo / último recurso por
  función, entidad «Ausencia» que reemplaza a `approver_l1_backup_*`, motivo obligatorio
  cuando actúa un respaldo, escalamiento por tiempo en el cron.
- **Proyecto 3 — plantillas de rol y simulador de flujo** en la ficha del empleado.
- `recordSettlement` (transferencia de la diferencia al cerrar un fondo): sigue como hoy.
- El rol `approver` sigue afectando solo el menú; `approval_policies` (legacy) no se toca.
