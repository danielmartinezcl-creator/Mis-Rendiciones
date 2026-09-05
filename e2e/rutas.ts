/**
 * Manifiesto de rutas para la línea base visual (etapa 0 del rediseño Tornasol).
 *
 * Si agregás una ruta a la app, agregala acá. La línea base es la red de
 * seguridad de la etapa 1: mover ~1.420 clases de color a tokens semánticos
 * NO debe cambiar ni un píxel. Una ruta que falta acá es una ruta que se puede
 * romper sin que nadie se entere.
 *
 * `slug` es el nombre del archivo PNG. No lo cambies sin regenerar la base:
 * Playwright no encuentra la captura anterior y la da por nueva.
 */

export type Ruta = {
  slug: string
  path: string
  nombre: string
  /** Rol mínimo. Hoy capturamos todo con admin, que es quien ve las 24. */
  rol: 'admin' | 'approver' | 'employee'
  /**
   * Selectores a tapar antes de comparar, para lo que cambia SOLO con el paso
   * del tiempo. No es una excusa para tapar diferencias molestas: es para lo
   * que es imposible que dos corridas en días distintos coincidan.
   *
   * La alternativa —marcar la ruta `comparar: false`— ya se probó con
   * `/approvals/[id]` y salió mal: costó la cobertura de la pantalla más densa
   * del sistema durante semanas. Una máscara conserva el resto.
   *
   * Solo sirve cuando el alto NO cambia. Si el texto enmascarado crece o se
   * achica, corre todo lo de abajo y la máscara no alcanza.
   */
  mascaras?: string[]
  /**
   * Código HTTP que se espera. Por omisión se exige < 400, que es lo correcto
   * para toda ruta real. La pantalla de «no existe» es la excepción legítima:
   * DEBE responder 404, y un 200 ahí sería el defecto.
   */
  estadoEsperado?: number
}

export const RUTAS_ESTATICAS: Ruta[] = [
  // ── Rendidor ──────────────────────────────────────────────────────────
  { slug: 'estado',              path: '/',                       nombre: 'Estado (dashboard rendidor)',  rol: 'employee' },
  { slug: 'mis-gastos',          path: '/mis-gastos',             nombre: 'Mis gastos',                   rol: 'employee' },
  { slug: 'gasto-rapido',        path: '/quick',                  nombre: 'Gasto rápido (3 pasos)',       rol: 'employee' },
  { slug: 'rendicion-nueva',     path: '/expenses/new',           nombre: 'Nueva rendición',              rol: 'employee' },
  { slug: 'reembolsos',          path: '/reimbursements',         nombre: 'Historial de reembolsos',      rol: 'employee' },
  { slug: 'perfil',              path: '/profile',                nombre: 'Perfil y datos bancarios',     rol: 'employee' },
  { slug: 'sugerencias',         path: '/suggestions',            nombre: 'Sugerencias',                  rol: 'employee' },

  // ── Caja chica ────────────────────────────────────────────────────────
  { slug: 'caja-chica',          path: '/petty-cash',             nombre: 'Caja chica (listado)',         rol: 'employee' },
  { slug: 'caja-chica-nueva',    path: '/petty-cash/new',         nombre: 'Caja chica · nuevo fondo',     rol: 'employee' },

  // ── Aprobador ─────────────────────────────────────────────────────────
  { slug: 'aprobaciones',        path: '/approvals',              nombre: 'Bandeja de aprobaciones',      rol: 'approver' },
  { slug: 'informes',            path: '/informes',               nombre: 'Informes unificados',          rol: 'approver' },

  // ── Operación bancaria y admin ────────────────────────────────────────
  { slug: 'banco',               path: '/banco',                  nombre: 'Cola bancaria',                rol: 'admin' },
  { slug: 'admin',               path: '/admin',                  nombre: 'Dashboard admin',              rol: 'admin' },
  { slug: 'admin-rendiciones',   path: '/admin/reports',          nombre: 'Admin · rendiciones',          rol: 'admin' },
  { slug: 'admin-empleados',     path: '/admin/employees',        nombre: 'Admin · empleados',            rol: 'admin' },
  { slug: 'admin-configuracion', path: '/admin/settings',         nombre: 'Admin · configuración',        rol: 'admin' },
  { slug: 'admin-fondos',        path: '/admin/fondos',           nombre: 'Admin · saldos de caja chica', rol: 'admin' },
  { slug: 'admin-analisis',      path: '/admin/analisis',         nombre: 'Admin · análisis por CC',      rol: 'admin' },
  { slug: 'admin-carga-hist',    path: '/admin/carga-historica',  nombre: 'Admin · carga histórica',      rol: 'admin' },
  { slug: 'admin-auditoria',     path: '/admin/auditoria',        nombre: 'Admin · auditoría',            rol: 'admin' },
  /* La papelera muestra «N días restantes» hasta el borrado definitivo. Ese
     número baja cada día, así que sin máscara esta ruta falla TODOS LOS DÍAS
     sin que nadie toque código — y un rojo que no significa nada entrena a
     ignorar los rojos. */
  { slug: 'admin-papelera',      path: '/admin/trash',            nombre: 'Admin · papelera',             rol: 'admin',
    mascaras: ['[data-cuenta-regresiva]'] },

  /* Una pantalla que la gente va a ver —enlace viejo, URL mal escrita— y que
     hasta ayer no existía: caía en la pantalla genérica de Next. Entra a la
     base como cualquier otra, porque una pantalla fuera de la base es una
     pantalla que se puede romper en silencio. */
  { slug: 'no-encontrada',       path: '/esta-ruta-no-existe',    nombre: 'Página no encontrada',         rol: 'employee',
    estadoEsperado: 404 },
]

/**
 * Rutas de detalle: el id no se puede escribir a mano porque cambia por
 * entorno. Se resuelve entrando al listado y tomando el primer enlace.
 * Si el listado está vacío, la captura se salta (queda registrado en el
 * reporte, no falla el run).
 */
export type RutaDetalle = {
  slug: string
  nombre: string
  /**
   * Listados donde buscar un id real, en orden. Se prueba uno por uno hasta
   * encontrar un enlace. Son varios porque un listado puede estar vacío o
   * enlazar al detalle solo en ciertos estados.
   */
  listas: string[]
  /** Prefijo del href a buscar */
  prefijo: string
  /** Hrefs a ignorar (páginas de creación, etc.) */
  ignorar: string[]
  /**
   * `false` cuando la pantalla no es determinista y compararla píxel a píxel
   * solo produce falsos rojos. Se captura igual, en `e2e/referencia/`, para
   * poder mirarla a ojo — pero no se compara.
   */
  comparar?: boolean
}

export const RUTAS_DETALLE: RutaDetalle[] = [
  {
    slug: 'rendicion-detalle',
    nombre: 'Rendición · detalle',
    // /admin/reports va último a propósito: su único enlace a /expenses/:id
    // está dentro de `{r.status === 'draft' && …}`, así que solo aparece si
    // hay borradores. /reimbursements y / usan ExpenseReportCard, que enlaza
    // siempre.
    listas: ['/reimbursements', '/', '/admin/reports'],
    prefijo: '/expenses/',
    ignorar: ['/expenses/new'],
  },
  {
    slug: 'aprobacion-detalle',
    nombre: 'Aprobación · detalle',
    // /admin como respaldo: PendingApprovalPanel también enlaza al detalle.
    listas: ['/approvals', '/admin'],
    prefijo: '/approvals/',
    ignorar: [],
    /**
     * VUELVE A COMPARARSE desde el 2026-09-04.
     *
     * Estuvo marcada `comparar: false` porque el análisis IA salía con texto
     * distinto en cada carga —8-9% de píxeles entre corridas sin tocar código—
     * y con él cambiaba el alto del bloque, corriendo todo lo de abajo.
     *
     * La causa no era la pantalla: el caché de `expense_reports.ai_analysis`
     * nunca acertaba. La condición era `ai_analysis_at > updated_at`, pero
     * guardar el análisis es un UPDATE sobre esa tabla y su trigger
     * `set_updated_at()` pisaba la marca contra la que se comparaba. Arreglado
     * en la migración 024, que mueve la invalidación a un trigger sobre
     * `expense_items`.
     *
     * **Que esta ruta compare es la prueba viva de que el caché funciona:** si
     * volviera a fallar, el análisis se recalcularía en cada carga y esta
     * captura empezaría a fallar sola.
     */
  },
  {
    slug: 'caja-chica-detalle',
    nombre: 'Caja chica · detalle del fondo',
    listas: ['/petty-cash'],
    prefijo: '/petty-cash/',
    ignorar: ['/petty-cash/new'],
  },
]
