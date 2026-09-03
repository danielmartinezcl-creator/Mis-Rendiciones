# Piloto Tornasol — la tarjeta de caja chica

> Documento de traspaso. Escrito para que una sesión que no vivió el rediseño
> pueda arrancar sin releer nada más. Estado al 2026-09-02.

---

## 1. Qué es el piloto y por qué esta pantalla

`/petty-cash/[id]` — el detalle de un fondo de caja chica.

Se eligió como pantalla piloto porque **valida el sistema entero de una sola
vez**: vidrio sobre el degradado, hoja blanca para los datos, línea de tiempo,
medidor de arco, y los diez estados del fondo. Si esta funciona, el sistema
funciona.

Y porque tiene la idea más fuerte de la spec, la sección 7: **la tarjeta cambia
de significado según el tramo del fondo**. No muestra siempre lo mismo.

| Tramo | Estados | Qué muestra la cifra grande |
|---|---|---|
| **Antes del dinero** | `draft` → `pending_bank_auth` | El monto **aprobado**, con etiqueta explícita. **Sin medidor**: no hay nada que medir. Manda la línea de tiempo del trámite bancario. |
| **Con el dinero** | `funds_sent` → `pending_liquidation_approval` | **Disponible = aprobado − rendido**, con el arco de consumo. Abajo, una línea de contexto: cuánto se usó del total y desde cuándo. Bajo el 25% disponible, el arco pasa a coral. |
| **Cerrado** | `settled` | Total del período, sin medidor, tarjeta al 60% de opacidad. Está archivado y debe verse archivado. |
| **Rechazado** | `rejected` | Coral, con el motivo visible. |

Es el estado más común el segundo: es donde están los fondos activos.

**El diseño acordado y aprobado por Daniel está en este artifact:**
https://claude.ai/code/artifact/4e0b71b1-72ce-4b3e-8091-fc21f5290dee

Ahí se ve la pantalla armada en móvil y escritorio, con conmutadores de estado.
No es una propuesta: es la referencia aprobada. Antes de escribir código,
abrilo.

---

## 2. Decisiones ya tomadas — no reabrir

| Decisión | Estado |
|---|---|
| Modo oscuro | **Eliminado.** Tornasol es el modo oscuro. |
| Escala tipográfica | **Piso de 11 px**, no la escala de la spec §3. Se midió el costo: una fila menos por pantalla en móvil y ~7 caracteres de razón social. En escritorio, cero. |
| Tipografía | **Bricolage** en títulos, **Hanken** en cuerpo, **Manrope** en montos. Las tres locales. |
| Marca | **Reemplazable.** A futuro otra empresa puede traer su identidad. Por eso `success` NO comparte color con `brand`, aunque la spec §9 lo pida. |
| Vidrio | **Oscuro**, no blanco. El blanco translúcido baja el contraste en vez de subirlo (medido: 4.77 → 3.72 sobre el tramo teal). |

---

## 3. Con qué se construye — lo que ya existe

### Materiales (clases CSS en `globals.css`, `@layer components`)

```
.hoja            blanco sólido + radio + sombra. Para lo que se LEE.
.campo           campo de formulario. `.campo-compacto` para celdas de tabla.
.btn-primario    botón primario. Color, radio, peso y estados.
.tor-glass       vidrio oscuro translúcido. Para lo que se MIRA.
.tor-glass-rail  variante para el riel lateral.
.tor-glass-bar   variante para barras (nav móvil, encabezado).
```

**Van en `@layer components` a propósito**: así cualquier utilidad de Tailwind
en el markup les gana. Un `py-2.5` suelto sigue funcionando como override.

**Ninguna fija `display`.** Es deliberado: la clase aporta color, radio y
estados; la disposición se queda en el markup, donde quien la escribe sabe qué
necesita (`flex-1`, `w-full`, etc.).

### Componentes React (`src/components/ui/`)

```
InsigniaEstado   la píldora de estado. `tipo="fondo"` o `tipo="reporte"`.
Button           variantes/tallas/forwardRef. Su `primary` usa `.btn-primario`.
CurrencyAmount   montos con escala y `fit` para columnas angostas.
VerticalTimeline, CompactStepper, AdminKpiHero, ItemAttachmentZone
```

### Tokens

`globals.css` está partido en **ZONA 1 · identidad** (brand, accent, sidebar,
degradados de CTA — lo único que cambia si otro cliente trae su marca) y
**ZONA 2 · semánticos** (success, warning, danger, flare, info, ink).

Para JS que no puede leer CSS —gráficos SVG, emails, metadata de la PWA— está
`src/lib/design-tokens.ts`, que **debe moverse en paralelo** con `globals.css`.

### Estados → color

`FAMILIA_FONDO` en `src/lib/constants.ts` mapea los 10 estados del fondo a
cuatro familias: `neutro`, `en-curso`, `atencion`, `resuelto`. Ocho de los diez
son `en-curso` a propósito — el color dice la categoría, la etiqueta dice el
estado exacto, y la línea de tiempo el paso concreto.

**Hay un test que impide que aparezca una quinta familia.** Es lo que evita
volver a los 19 colores.

---

## 4. Los archivos que toca

```
src/app/(app)/petty-cash/[id]/client.tsx     619 líneas  ← la pantalla
src/components/petty-cash/FundTimeline.tsx    94         ← la línea de tiempo actual
src/components/petty-cash/FundDefontanaPanel.tsx  282
src/components/petty-cash/AddFundItemForm.tsx     265
src/lib/petty-cash-helpers.ts                            ← calculateFundBalance
```

`calculateFundBalance(approvedAmount, items)` ya calcula el saldo. No hace falta
recalcularlo en la vista.

### Componentes que nacen acá

`TarjetaVidrio`, el **medidor de arco** y la **línea de tiempo** de Tornasol
tienen 3, 0 y 1 uso hoy. **No se construyeron antes a propósito**: hacerlo sin
un consumidor real habría sido especular sobre una API, que es exactamente
cómo nació el `ui/Card` que nadie usó. Nacen en esta pantalla, con un caso real
que valida su forma, y recién después se generalizan si aparece un segundo uso.

---

## 5. Cómo se verifica

```bash
npm run baseline:crear      # regenera las 50 capturas (borra antes)
npm run baseline:verificar  # compara
npm run baseline:reporte    # diffs lado a lado
```

Requiere `e2e/.env.e2e` con credenciales de una cuenta admin. Leer
`e2e/README.md` completo antes de confiar en un resultado.

### Lo que la línea base NO te dice

**Es un detector de cambio, no de corrección.** En esta pantalla va a marcar
todo en rojo por diseño. Sirve para dos cosas: confirmar que no rompiste otras
pantallas, y ver que el cambio se limita a donde debía.

Tres puntos ciegos vigentes:

1. **Solo captura el estado de reposo.** Estados de error, hover, modales y
   pestañas secundarias no se ven. `FundModals.tsx` son 522 líneas que arrancan
   cerradas.
2. **`/approvals/[id]` no se compara** (`comparar: false` en `rutas.ts`): su
   análisis IA da texto distinto en cada carga.
3. **Los datos son reales.** Si alguien usa la app entre corridas, los diffs
   mezclan causas. Para aislar código de datos: guardar los cambios en un stash,
   recapturar con el código anterior y los datos de ahora, restaurar y verificar.

---

## 6. Trampas encontradas — no volver a pisarlas

**Cascada y capas**

- Las utilidades de Tailwind viven en `@layer utilities`. **CSS plano, sin capa,
  les gana siempre.** Había 24 «clases de respaldo» que por eso anulaban el
  tema entero en silencio.
- **Un fondo en `body` tapa una capa fija en `body::before`**: dentro de un
  contexto de apilamiento, el fondo del bloque se pinta DESPUÉS de los
  descendientes con z-index negativo. Sin error ni aviso.

**Tailwind**

- `text-sm` fija `font-size` **y** `line-height`. Al absorber una clase `text-*`
  en una clase propia, llevate las dos: los textarea cambian de alto y corren
  todo lo de abajo.
- `@theme` solo emite las variables cuya *utilidad* detecta en uso. Una variable
  referenciada solo desde un `var()` inline no se emite. Por eso los degradados
  de CTA viven en un `:root` plano.

**El selector de legibilidad**

`globals.css` tiene una regla que aclara encabezados sobre el degradado:

```css
.content-area :is(h2,h3,.section-title):not(.hoja *):not(.bg-white *):not(.tor-glass *)
```

**Excluye superficies por nombre de clase, así que está acoplada a ellas.** Si
creás una superficie nueva (`TarjetaVidrio` con su propia clase, por ejemplo),
**agregala a esa lista** o los encabezados dentro se van a volver blancos sobre
blanco. Ya pasó una vez.

**Entorno**

- `pkill -f "next start"` **no funciona** en Windows para estos procesos. Usar
  PowerShell con `Get-NetTCPConnection -LocalPort 3100`.
- Los archivos del repo tienen saltos **CRLF**. Un regex con `\n}` no matchea.

---

## 7. Sugerencia de orden

1. **Abrir el artifact** y mirar la pantalla en los tres estados.
2. Capturar el estado actual de `/petty-cash/[id]` como referencia
   (`e2e/baseline/*/caja-chica-detalle.png` ya lo tiene).
3. Construir la **tarjeta héroe** primero: es la que carga la idea de la §7 y la
   que valida vidrio + medidor + estados. El resto de la pantalla puede seguir
   como está mientras tanto.
4. La **línea de tiempo** después: hoy es `FundTimeline.tsx`, con puntos e
   íconos. Tornasol la quiere vertical con puntos rellenos / halo / huecos.
5. La lista de gastos ya está sobre hoja blanca y probablemente no necesite
   cambios estructurales.
6. Recién al final, generalizar lo que haya nacido acá.

**Y una decisión pendiente que conviene tomar temprano:** los modales de
`FundModals.tsx` (522 líneas) no se ven en la línea base. Si el piloto los toca,
hay que revisarlos a ojo.
