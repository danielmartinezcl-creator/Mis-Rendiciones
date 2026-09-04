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

### Lo que ya se auditó a mano — no repetir la investigación (2026-09-03)

Después del rediseño Tornasol se revisó cada categoría del punto ciego, buscando
el defecto que el chasis oscuro pudo haber introducido: texto oscuro que antes
estaba sobre una página clara y ahora quedó sobre el degradado. **Las cuatro
salieron limpias, y el motivo importa más que el resultado:**

- **Modales — limpios POR CONSTRUCCIÓN.** Las 6 superposiciones de la app
  (`FundModals.tsx` ×4, `RevertDefontanaDialog`, `admin/reports`) tienen todas un
  panel `bg-white` adentro del `fixed inset-0`. El contenido nunca toca el
  degradado. Mientras un modal nuevo siga ese patrón, no hace falta auditarlo.
  La séptima, `MobileNav`, es una hoja deslizante y usa `tor-glass-bar`.
- **Estados de error — limpios.** De los 21 mensajes condicionales, 13 traen su
  propio `bg-danger-50` y los otros 8 viven dentro de una `.hoja` o de un
  `<form className="bg-white">`. Ninguno queda apoyado sobre el degradado.
- **Hover — el patrón peligroso no existe.** El riesgo sería texto claro con un
  fondo claro al pasar el mouse (blanco sobre blanco). Cero apariciones. El
  único `hover:bg-white/*` es al 10%, que sobre el degradado sigue siendo oscuro.
- **Estados vacíos — limpios.** Los de `/admin/trash` y `/admin/fondos`, que son
  los más expuestos por ser de página y no de tabla, están dentro de
  `bg-white rounded-card`.

**Las pestañas secundarias YA se cubren** (2026-09-03). `materiales.spec.ts` las
abre por su mapa `PANELES` y las audita como una pantalla más: de 24 pasó a 31.

Y el punto ciego era real. Las 7 pestañas de `/admin/settings` que nunca se
habían visto tenían **7 defectos, todos el mismo**: el texto introductorio de
cada una, apoyado directo sobre el degradado. El de la pestaña «Categorías» —la
única visible en reposo— ya se había arreglado, y las otras siete quedaron rotas
con el arnés diciendo «limpio». Es el caso de manual: **un defecto arreglado en
1 de 8 lugares y una herramienta que informa verde.**

> ⛔ **Antes de agregar una entrada a `PANELES`:** ese mapa solo puede contener
> controles que ABREN o CAMBIAN DE VISTA. Nada que confirme, envíe, guarde o
> elimine. La auditoría corre contra la base real y recorre 31 pantallas sin que
> nadie mire — un clic equivocado ahí borra datos de verdad. Las pestañas de
> settings entraron porque son `onClick={() => setActiveTab(id)}`, estado local
> puro, verificado leyendo el componente.

**Lo que sigue sin cubrir:** el contenido plegado (las filas expandibles de
`HistoricalSection`, donde vive un `ItemAttachmentZone`), los formularios que
arrancan cerrados (`AddFundItemForm`, `ExpenseItemForm`) y los modales. Los
modales importan menos — ver arriba: son limpios por construcción.

Para la regla de materiales en el estado de reposo ya no hace falta mirar a ojo:
está `npm run audit:materiales`, que la verifica en las 24 pantallas. Ver
«Auditoría de materiales» abajo.

- **`Aprobación · detalle` se salta** si no hay ninguna rendición esperando aprobación
  para la cuenta configurada. `/approvals/[id]` es de las pantallas más densas del
  sistema (análisis IA, toggles por ítem), así que conviene dejar una rendición enviada
  antes de correr la base.
- **`/admin/settings` tiene pestañas** y solo se captura la primera. Políticas, Viáticos
  y Defontana quedan sin cubrir; si la etapa 1 toca esos paneles, mirarlos a mano.

## ⚠ Corridas fantasma — leer el MENSAJE, no el número

Dos veces el 3–4 de septiembre la línea base dio muchas fallas y, repitiendo sin
tocar nada, dio verde. Las fallas duraban 577 ms – 2,8 s, y ahí está la pista:
**`toHaveScreenshot` reintenta hasta 15 s, así que nada que falle en medio
segundo es una diferencia de píxeles.** Son las dos aserciones que corren ANTES
de la captura:

```ts
expect(respuesta?.status(), '… respondió con error HTTP').toBeLessThan(400)
expect(page.url(),  '… redirigió al login — sesión perdida').not.toContain('/login')
```

**El arnés ya diagnostica esto correctamente.** El error dice literalmente
«sesión perdida». Lo que falló fue leer solo el conteo: `... | tail -3` corta el
resumen de Playwright justo donde está el motivo. **Nunca truncar la salida de
una corrida en rojo.**

### EL MECANISMO, ya identificado: **se muere el servidor**

```
Error: page.goto: net::ERR_CONNECTION_REFUSED at http://localhost:3100/admin/analisis
```

Eso es lo que dice `test-results/*/error-context.md` en una corrida fantasma. El
`next start` del `webServer` se cae a mitad de corrida, y a partir de ahí falla
todo lo que sigue, al instante, porque no hay a quién conectarse.

Explica las cuatro señales: fallas de medio segundo (una conexión rechazada no
espera), consecutivas desde un punto en adelante, transitorias, y verdes al
repetir porque arranca un servidor nuevo.

> **Una hipótesis anterior decía que era la sesión de Supabase** —el refresh
> token rotando y invalidando la cookie compartida entre contextos—. **Era
> falsa.** La descartó un dato simple: entre las fallas está `Login`, que corre
> con `storageState` vacío y no necesita sesión ninguna. La rotación existe
> (`auth.refresh_tokens` la muestra) pero no es esto.

**Lo que sigue sin saberse es por qué se muere el servidor.** No se pudo
reproducir: 3 veces en ~25 corridas el mismo día, y los intentos deliberados
—encadenar corridas, repetir la verificación— dieron verde. También se descartó
con medición la colisión de puerto: tras terminar una corrida el 3100 queda
libre en el segundo 0 y no sobrevive ningún proceso node.

**Qué hacer cuando pase:**

1. **No truncar la salida.** Un `| tail -3` corta el resumen de Playwright justo
   donde está el motivo, y fue lo que hizo perder las dos primeras veces.
2. Mirar el mensaje de la PRIMERA falla, no el conteo. Si dice
   `ERR_CONNECTION_REFUSED`, es esto: volver a correr y listo.
3. Si dice otra cosa, **guardar `test-results/` antes de repetir** — la corrida
   siguiente lo borra, que es como se perdió la evidencia las dos primeras veces.
4. Para cazar la causa hace falta la salida COMPLETA de una corrida fallida:
   `npm run baseline:verificar > /tmp/full.log 2>&1`. El `webServer` está
   configurado con `stderr: 'pipe'`, así que si el servidor muere con un mensaje
   —memoria agotada, excepción sin atrapar— va a estar en ese archivo.

## Auditoría de materiales — `npm run audit:materiales`

Verifica la regla que sostiene Tornasol: **un dato apoyado directo sobre el
degradado está mal.** Recorre cada nodo de texto de las 24 pantallas, sube por el
árbol hasta el primer ancestro que pinte fondo y, si llega al `body` sin
encontrarlo, ese texto está sobre el degradado. Si además es oscuro, es oscuro
sobre oscuro y no hay nada que opinar.

Vive en `e2e/materiales.spec.ts`, como proyecto propio de Playwright. **Es una
pregunta distinta a la de la línea base**: aquélla dice «esto cambió», ésta dice
«esto está mal». Un rediseño legítimo pone la línea base en rojo y esta auditoría
en verde; un error de material hace lo contrario. Mezclarlas haría que los dos
casos se vean iguales.

El informe se escribe en `e2e/reporte-materiales.md` (gitignoreado, se regenera
en cada corrida) y es la lista de trabajo: ruta, texto, etiqueta, luminancia y
clases de cada hallazgo.

### Por qué el informe publica «pantallas recorridas» y «textos evaluados»

Porque este archivo mintió dos veces antes de funcionar, y las dos de forma
convincente:

1. La primera versión informó **0 hallazgos** — parecía que la app estaba
   impecable. No parseaba `oklch(...)`, que es como Chrome computa toda la
   paleta desde la etapa 2, así que salteaba cada texto en silencio.
2. La segunda informó **191 hallazgos**, 163 en una sola pantalla — parecía que
   la app estaba rota. El mismo bug de `oklch`, ahora en la detección de
   FONDOS: las cabeceras con `bg-info-50` se daban por transparentes.

Por eso los colores ya no se parsean a mano: se pintan en un canvas y se lee el
píxel, que convierte cualquier espacio de color sin tener que saber en cuál venía
escrito. Y por eso el test **afirma** que se hayan recorrido más de 20 pantallas
y evaluado más de 500 textos: sin esas dos aserciones, «cero hallazgos» y «no
miré nada» se ven idénticos.

**Si tocás este archivo, verificalo en las dos direcciones antes de confiar:**
sacale la superficie a algo que sepas que está bien (tiene que aparecer) y
confirmá que lo que ya estaba bien sigue sin aparecer. Un detector que solo se
probó en verde no prueba nada.

## Cuando agregues una ruta a la app

Agregala a `rutas.ts`. Una ruta que falta acá es una ruta que se puede romper sin
que nadie se entere.
