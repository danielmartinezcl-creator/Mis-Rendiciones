# Línea base visual — etapa 0 del rediseño Tornasol

## Para qué existe

La etapa 1 del rediseño mueve **~1.420 clases de color de Tailwind** escritas a mano
en **55 de los 90 archivos `.tsx`** hacia familias semánticas (`success`, `warning`,
`danger`, `accent`, `ink`, `brand`). Ese cambio tiene que ser **mecánico**: los valores
no cambian todavía, solo el nombre por el que se los llama.

Un cambio mecánico correcto no altera ni un píxel. Estas capturas lo demuestran.

- Si después del codemod `npm run baseline:verificar` pasa → el codemod está limpio.
- Si falla → hay un mapeo mal hecho, y el reporte HTML muestra exactamente en qué
  ruta, en qué ancho y en qué zona de la pantalla.

Sin esto, mover 1.420 clases es cambiar a ciegas.

## Configuración por única vez

**1. Credenciales.** Creá `e2e/.env.e2e` (no se commitea, el `.gitignore` cubre `.env*`):

```
E2E_EMAIL=tu-admin@penta.cl
E2E_PASSWORD=...
```

Usá una cuenta **admin**: es el rol que ve las 24 rutas. Con un empleado se capturan 9.

**2. Navegador.** Playwright está en `devDependencies` pero los binarios se bajan aparte:

```bash
npx playwright install chromium
```

**3. El servidor.** No hay nada que preparar: Playwright hace `next build` y levanta
`next start` en el puerto **3100** él mismo, y lo apaga al terminar. El 3100 evita chocar
con el `next dev` que suele estar en el 3000. Para moverlo: `BASELINE_PORT=3200 npm run baseline:crear`.

## Uso

**Antes de tocar una sola línea de la etapa 1**, generá la base:

```bash
npm run baseline:crear
```

Después del codemod, verificá:

```bash
npm run baseline:verificar
```

Y si algo falla, mirá el diff lado a lado:

```bash
npm run baseline:reporte
```

## Qué se captura

25 pantallas × 2 anchos = **50 capturas**.

| Ancho | Proyecto | Detalle |
|---|---|---|
| 390 × 844 | `movil` | iPhone 14/15, con `isMobile` y `hasTouch` |
| 1440 × 900 | `escritorio` | El ancho donde vive el riel de navegación |

Las 21 rutas estáticas están en `rutas.ts`. Las 3 de detalle (`/expenses/[id]`,
`/approvals/[id]`, `/petty-cash/[id]`) resuelven un id real entrando al listado y
tomando el primer enlace — si el listado está vacío, la captura se salta y queda
registrada como `skipped`, que es información, no un fallo.

`/login` se captura sin sesión, en su propio contexto.

## Por qué corre contra producción y no contra `next dev`

Esto no es preferencia, es la conclusión de haberlo intentado al revés. La primera
versión usaba `next dev` y era **imposible de reproducir**: dos corridas seguidas sin
cambiar una línea daban cuatro diferencias. Los diffs mostraban la página 99% idéntica
y lo que cambiaba era, literalmente, el indicador **«Compiling»** de Turbopack y el badge
**«1 Issue»** del dev overlay, dibujados encima de la app.

Las cuatro fuentes de ruido, todas exclusivas de dev:

1. El indicador «Compiling» aparece encima de la página.
2. El badge «N Issues» del overlay va y viene.
3. El websocket de HMR impide que `networkidle` llegue nunca.
4. Next bloquea los recursos de desarrollo entre orígenes (`127.0.0.1` y `localhost`
   son orígenes distintos para él, aunque apunten a la misma máquina).

El modo dev está hecho para ser informativo, no reproducible: te dibuja encima lo que
está haciendo. Es lo contrario de lo que necesita una captura de referencia.

**El `next build` va dentro del comando del webServer a propósito.** Con un build viejo,
la etapa 1 compararía el bundle anterior contra sí mismo y pasaría en verde sin haber
verificado nada — el peor fallo posible en una red de seguridad.

## Determinismo — leer antes de confiar en un diff

Tolerancia de **0,05% de píxeles** con un umbral por píxel de 0.001 — ver la
sección anterior. Lo que la tolerancia **no** absorbe:

1. **Datos que cambian.** Corren contra la base real. Si entre el "antes" y el
   "después" alguien crea una rendición, esa pantalla va a diferir de verdad.
   → Corré las dos pasadas el mismo día y avisá que no toquen la app mientras tanto.

2. **Fechas relativas.** Un "hace 3 días" se vuelve "hace 4 días" al cruzar la
   medianoche. No hay forma de arreglarlo desde el navegador porque se renderizan en
   el servidor. → Misma solución: mismo día.

3. **Páginas a medio cargar.** `esperarDomQuieto()` espera a que la altura y el tamaño
   del árbol DOM no cambien en tres muestras seguidas. Sin eso se capturó una vez
   `/admin/employees` con 844 px de alto y otra con **28.880 px** — el mismo listado,
   antes y después de que llegaran los datos.

4. **Fuentes.** Bricolage, Hanken y Manrope ya son LOCALES (`src/app/fonts/`), así
   que no dependen de la red. `estabilizar()` igual espera a `document.fonts.ready`:
   una fuente que todavía no se aplicó cambia todas las métricas de la página.

## El umbral por píxel: el ajuste que hace o rompe esta línea base

`threshold` es la distancia de color **por píxel** a partir de la cual Playwright
considera que un píxel cambió. Su valor por defecto es **0.2**, medido en espacio
YIQ, que pondera fuertemente la luminancia.

**Ese default deja ciega la comparación justo al tipo de cambio que hace un
sistema de diseño**: mover el matiz dejando la luminancia parecida. Medido en
esta app:

| Cambio | Distancia YIQ |
|---|---|
| relleno de insignia `warning-100` → `flare-100` | 0.0083 |
| relleno de insignia `info-100` → `success-100` | 0.0026 |
| texto de insignia `warning-700` → `flare-700` | 0.0428 |

Entre 15 y 75 veces por debajo del umbral. Por eso la etapa 2 cambió la paleta
**entera** de violeta a teal y `baseline:verificar` reportó **7 diferencias de
50**; borrando la base y regenerando, diferían **48**. Nunca fue un bug del
arnés: era este número.

Ahora `threshold: 0.001` y `maxDiffPixelRatio: 0.0005`. Verificado en las dos
direcciones, que es lo que hay que exigirle a un detector:

- **No da falsos positivos** — tres corridas seguidas sin cambios, 51 verdes.
- **Detecta lo mínimo** — un `success-100` → `success-200` (distancia 0.0066,
  imperceptible a ojo) falla como corresponde.

Si alguna vez subís `threshold` para «que deje de molestar», estás apagando
exactamente la señal para la que existe esta línea base.

## ⚠ El punto ciego: solo se captura el estado de reposo

**Un run verde no significa «nada cambió». Significa «no vi que cambiara algo».**

Las 48 capturas son de páginas en reposo, recién cargadas. Lo que NO se captura:

- **Estados de error** — `{emailError && <p className="text-danger-600">…}` solo
  existe en el DOM cuando hay un error.
- **Estados hover** — `hover:bg-danger-50` nunca se dispara sin un mouse encima.
- **Modales y diálogos** — `FundModals.tsx` son 522 líneas que arrancan cerradas.
- **Pestañas secundarias** — `/admin/settings` tiene cuatro y se captura la primera.

Esto se descubrió en la etapa 1b: se consolidaron 161 clases de color (rose→danger,
sky/cyan/indigo→info, purple→flare, orange/yellow→warning, green→success), cambios
que **sí alteran el color**, y la línea base dio 49 verdes y cero diffs.

En su momento se atribuyó todo al punto ciego. **Era la explicación incompleta**:
después se encontró que el `threshold` por defecto también estaba enmascarando
esos cambios, porque son desplazamientos de matiz a luminancia parecida. Las dos
causas eran reales y actuaban a la vez. Con `threshold: 0.001` la segunda está
resuelta; el punto ciego de abajo sigue vigente.

**Regla práctica:** si un cambio toca colores de error, hover o modal, el run verde
no es evidencia. Hay que mirarlo a mano o extender la cobertura.

- **`Aprobación · detalle` se salta** si no hay ninguna rendición esperando aprobación
  para la cuenta configurada. `/approvals/[id]` es de las pantallas más densas del
  sistema (análisis IA, toggles por ítem), así que conviene dejar una rendición enviada
  antes de correr la base.
- **`/admin/settings` tiene pestañas** y solo se captura la primera. Políticas, Viáticos
  y Defontana quedan sin cubrir; si la etapa 1 toca esos paneles, mirarlos a mano.

## Cuando agregues una ruta a la app

Agregala a `rutas.ts`. Una ruta que falta acá es una ruta que se puede romper sin
que nadie se entere.
