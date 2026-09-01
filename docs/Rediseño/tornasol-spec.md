# Sistema de diseño "Tornasol" — especificación

Documento de referencia para implementar la identidad visual de **Mi Rendición**.
Va en `docs/rediseno/`. Es la fuente de verdad de la etapa 2 del rediseño.

---

## 1. La regla que sostiene todo el sistema

> **El degradado es el contenedor. Nunca la superficie de trabajo.**

Hay exactamente **dos materiales**:

| Material | Qué es | Para qué |
|---|---|---|
| **Vidrio** (`glass`) | Blanco translúcido sobre el degradado, con desenfoque | Resúmenes, KPIs, totales, encabezados. Cosas que se *miran*. |
| **Hoja** (`sheet`) | Blanco sólido, texto oscuro, sombra profunda | Tablas, listas, formularios, detalle. Cosas que se *leen, comparan o deciden*. |

Si el usuario tiene que comparar cifras, revisar 40 filas o llenar campos, va en hoja blanca. Sin excepciones. Esto es lo que hace que un degradado saturado sea viable en una herramienta de uso diario: el color enmarca, el blanco trabaja.

Romper esta regla es el error que arruina el diseño. Una tabla de aprobaciones sobre el degradado es ilegible a los diez minutos.

---

## 2. Tokens de color

### Rampa del degradado

```css
--tor-1:  #03191C;   /* abismo — arranque */
--tor-2:  #0B4448;   /* petróleo */
--tor-3:  #12807C;   /* teal medio — color de acción */
--tor-4:  #2FC9B6;   /* aqua brillante */
--flare:  #7E77DE;   /* lila — el tono ajeno */
```

**El lila no es decorativo.** El metal iridiscente —titanio anodizado, una mancha de aceite— siempre tiene un tono extraño en el borde. Sin él, el degradado teal se ve plano y barato. Va **solo arriba a la derecha**. Centrado, el resultado parece chicle.

### Superficies y texto

```css
--sheet:   #FFFFFF;   /* hoja de trabajo */
--ink:     #062A2E;   /* texto principal sobre hoja */
--muted:   #6F8F8C;   /* texto secundario sobre hoja */
--line:    #E9F3F1;   /* divisor interno */
--line-2:  #D9E9E6;   /* borde de campo y encabezado de tabla */
```

### Semánticos

```css
--ok:    #12807C;   /* correcto, aprobado, listo */
--warn:  #DE603C;   /* coral — atención, falta respaldo */
--flare: #7E77DE;   /* lila — caja chica, segundo nivel */
```

Solo tres. Cualquier estado nuevo se resuelve con intensidad o ícono, no inventando un color más.

### Degradados compuestos

```css
--anod: linear-gradient(150deg, #2FC9B6 0%, #12807C 55%, #0B4448 100%);
```

`--anod` es el relleno de todo elemento activo: botón primario, chip seleccionado, avatar, ícono de fila, pestaña activa, checkbox marcado.

### Fondo de la aplicación

```css
/* capa base */
background: linear-gradient(155deg,
  #03191C 0%, #0B4448 26%, #12807C 50%, #2FC9B6 76%, #7E77DE 100%);

/* capa de destellos, encima, pointer-events:none */
background:
  radial-gradient(560px 340px at 90% 4%,  rgba(126,119,222,.5),  transparent 62%),
  radial-gradient(460px 300px at 2% 92%,  rgba(234,252,248,.16), transparent 60%);
```

Va fijo al viewport (`position:fixed; inset:0`), no scrollea con el contenido. En la app actual esto reemplaza a `.content-area`.

---

## 3. Tipografía

| Uso | Fuente | Peso |
|---|---|---|
| Toda la interfaz, títulos, etiquetas | **Bricolage Grotesque** | 400–800 |
| **Montos y cifras** | **Manrope** | 700–800 |

Manrope reemplaza a Geist Mono en `.font-mono-amount`. Es decisión tomada: el cero de Manrope no lleva barra ni punto, que es la regla del proyecto.

Los montos llevan siempre `letter-spacing: -.04em` y `font-variant-numeric: tabular-nums`. El tracking negativo es lo que les da densidad de cifra financiera; sin él parecen texto.

Escala de referencia:

- Monto héroe: `clamp(38px, 6vw, 52px)`, peso 800
- Monto de tarjeta secundaria: 22px, peso 800
- Monto en fila de tabla: 13px, peso 700
- Título de pantalla: 26px, peso 800, `letter-spacing: -.035em`
- Antetítulo (`kick`): 9.5px, `letter-spacing: .22em`, mayúsculas, opacidad .65
- Cuerpo: 12–13px

---

## 4. Forma y movimiento

```css
--r:    20px;                         /* radio de tarjeta */
--ease: cubic-bezier(.16, 1, .3, 1);  /* la curva del sistema */
```

Radios: 20px tarjeta · 14px campo grande · 12px campo normal · 11px fila de menú · 99px píldora y botón.

**Movimiento.** Sobrio y con propósito:

- Entrada de pantalla: `opacity 0→1` + `translateY(12px→0)`, 600 ms
- Botón primario al pasar el cursor: `translateY(-2px)` y sombra más profunda
- Acciones masivas (aprobar todos): cascada con 90–130 ms de retardo entre filas. Esto no es adorno: hace visible que se ejecutaron N acciones y no una.
- Medidor de caja chica: el arco se dibuja en 1,6 s al entrar
- Cajón de detalle: entra desde la derecha en 450 ms

Todo dentro de `@media (prefers-reduced-motion: reduce)` se desactiva. Ya existe esa regla en `globals.css`; hay que respetarla.

---

## 5. Componentes

### Riel de navegación
Vidrio, 212 px, altura completa. Ítem activo: fondo **blanco sólido** con texto oscuro —el contraste invertido es lo que lo hace inconfundible. Contadores en píldora; en el ítem activo la píldora usa `--anod`.

En móvil (<900px) se convierte en barra horizontal con scroll lateral.

### Tarjeta héroe (vidrio)
Etiqueta en mayúsculas pequeñas → monto gigante → barra segmentada → leyenda con cuadraditos de color → botón.

La barra segmentada usa **opacidades del blanco**, no colores distintos: 100% / 50% / 22%. Sobre el degradado, tres colores compiten; tres opacidades se leen de inmediato.

### Hoja de trabajo
Blanco, radio 20, `box-shadow: 0 14px 40px rgba(3,25,28,.2)`. Encabezado de sección de 11 px en peso 700, con un dato secundario alineado a la derecha en `--muted`.

### Fila de lista
Ícono circular con `--anod` · título y submarca · monto en Manrope · insignia de estado. Divisores de 1px en `--line`, sin borde en la primera.

### Insignias de estado
Píldora de 9px, peso 700:

```css
.st        { background:#E7F7F4; color:#12807C }  /* teal — listo */
.st.warn   { background:#FDEEE9; color:#DE603C }  /* coral — atención */
.st.flare  { background:#F0EEFA; color:#5B52B8 }  /* lila — caja chica */
```

### Tabla
Encabezado de 9px en mayúsculas con `letter-spacing: .14em`, color `--muted`. Filas con hover `#F7FCFB`. Montos alineados a la derecha, tabulares. Filas ya resueltas al 42% de opacidad —siguen visibles pero se apagan.

### Campos
Borde `--line-2`, radio 12. Al foco: borde `--tor-3` y halo `0 0 0 3px rgba(18,128,124,.13)`.

El campo de monto es especial: 30px, Manrope 800, con el símbolo `$` fijo a la izquierda en `--muted`. Formateo en vivo con separador de miles chileno mientras se escribe.

### Chips
Píldora con borde. Seleccionado: `--anod`, texto blanco, sin borde.

### Zona de respaldo
Borde punteado 1.5px. Al adjuntar pasa a borde sólido teal con fondo `#F1FAF8`.

**Corrección respecto al prototipo original:** el texto decía *"sin respaldo el gasto no puede enviarse"*. La regla cambió. Ahora debe decir que el gasto se puede enviar igual, pero queda marcado. El aviso es una **advertencia coral, no un bloqueo**. Los botones de aprobar y enviar no se deshabilitan por falta de respaldo.

### Cajón de detalle
Panel blanco derecho de 430px máximo, con velo oscuro y desenfoque detrás. El monto del encabezado usa `background-clip: text` con degradado teal.

Incluye una **línea de tiempo vertical** del recorrido del documento: puntos rellenos para lo cumplido, punto con halo para el paso actual, huecos para lo pendiente. Este componente resuelve los nueve estados de rendición sin necesidad de nueve colores.

### Aviso flotante
Píldora blanca centrada abajo, con punto aqua. 2,6 s.

---

## 6. Los estados reales de la app

La app tiene **9 estados de rendición** y **10 de fondo**. Tornasol los resuelve con **cuatro familias visuales**, no diecinueve colores:

| Familia | Estados | Tratamiento |
|---|---|---|
| **Neutro** | draft | Gris `--muted`, sin énfasis |
| **En curso** | submitted, pending_l2, pending_bank_load, pending_bank_auth, pending_approval, pending_liquidation_approval, funds_sent | Lila `--flare` + la línea de tiempo indica el paso exacto |
| **Atención** | rejected, partially_approved | Coral `--warn` |
| **Resuelto** | approved, reimbursed, settled | Teal `--ok` |

**La línea de tiempo hace el trabajo que el color no puede.** Siete estados "en curso" con siete colores son imposibles de memorizar; siete pasos en una barra de progreso se entienden sin explicación.

---

## 7. Tarjeta de caja chica según su estado

El fondo tiene diez estados y la tarjeta **cambia de significado** en cada tramo. No muestra siempre lo mismo:

**Antes de que llegue el dinero** (`draft` → `pending_bank_auth`)
Todavía no hay saldo. La cifra grande es el **monto solicitado o aprobado**, con etiqueta explícita. Lo que manda visualmente es el paso del trámite bancario en la línea de tiempo. Sin medidor: no hay nada que medir.

**Con el dinero disponible** (`funds_sent` → `pending_liquidation_approval`)
Este es el estado donde están hoy los fondos activos y el que más se va a ver. La cifra grande es **disponible = aprobado − rendido**, con el arco de consumo. Debajo, una línea de contexto: cuánto se usó del total y desde cuándo. Cuando el disponible baja del 25%, el arco pasa a coral.

**Cerrado** (`settled`)
Total del período, sin medidor, tarjeta al 60% de opacidad. Está archivado y debe verse archivado.

**Rechazado** (`rejected`)
Coral, con el motivo visible.

---

## 8. Advertencias técnicas

1. **`backdrop-filter` cuesta caro.** Úsalo solo en el riel y en las tarjetas de resumen. Nunca en filas de lista ni en elementos que se repiten decenas de veces: en una tabla de 40 filas hunde el rendimiento en móvil.

2. **`background-clip: text` solo en cifras grandes.** En párrafos rompe la selección de texto y complica los lectores de pantalla. Permitido en: monto del cajón de detalle. Prohibido en cualquier texto corrido.

3. **Contraste sobre el degradado.** El tramo aqua (`#2FC9B6`) es claro. Texto blanco encima queda por debajo del mínimo AA. Por eso los datos van sobre vidrio o sobre hoja, nunca directo sobre el degradado. Sirve como comprobación: si escribiste texto directo sobre el fondo, probablemente esté mal.

4. **Foco visible.** `outline: 2px solid #fff; outline-offset: 2px` sobre el degradado. No se elimina nunca.

5. **La app es PWA.** El `themeColor` del viewport pasa de `#4A50A0` a `#03191C`, y el `manifest.json` debe acompañar.

---

## 9. Traducción a Tailwind v4

La etapa 1 del rediseño crea las familias semánticas `success`, `warning`, `danger`, `info`, `accent` con valores neutros. La etapa 2 solo cambia esos valores:

| Familia semántica | Pasa a ser |
|---|---|
| `brand-*` | Rampa teal: 600 = `#12807C`, 500 = `#2FC9B6`, 700 = `#0B4448` |
| `success-*` | Teal `--ok` (en Tornasol, correcto y marca son el mismo color) |
| `warning-*` | Coral `#DE603C` |
| `danger-*` | Coral más profundo |
| `accent-*` | Lila `#7E77DE` |
| `info-*` | Se pliega a lila — no hay azul en este sistema |
| `ink-*` | Se reancla a `#062A2E` con matiz verde-azulado, no gris neutro |

Los tokens propios de Tornasol (`--tor-1..4`, `--flare`, `--anod`, `--sheet`, `--line`) se agregan al mismo bloque `@theme {}` de `globals.css`.

**Toda la paleta vive en un solo archivo.** Si algún componente vuelve a escribir un hexadecimal a mano, el sistema se rompe otra vez.
