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

Tolerancia de **0,2% de píxeles**, que absorbe el antialiasing del texto. Lo que la
tolerancia **no** absorbe:

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

4. **Fuentes.** Bricolage, Hanken y Geist Mono llegan de Google Fonts en tiempo de
   build. `estabilizar()` espera a `document.fonts.ready` por esto: sin esa espera se
   captura el fallback del sistema en una corrida y la fuente real en la otra.

## Cobertura que falta

- **`Aprobación · detalle` se salta** si no hay ninguna rendición esperando aprobación
  para la cuenta configurada. `/approvals/[id]` es de las pantallas más densas del
  sistema (análisis IA, toggles por ítem), así que conviene dejar una rendición enviada
  antes de correr la base.
- **`/admin/settings` tiene pestañas** y solo se captura la primera. Políticas, Viáticos
  y Defontana quedan sin cubrir; si la etapa 1 toca esos paneles, mirarlos a mano.

## Cuando agregues una ruta a la app

Agregala a `rutas.ts`. Una ruta que falta acá es una ruta que se puede romper sin
que nadie se entere.
