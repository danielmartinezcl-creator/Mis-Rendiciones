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
  { slug: 'admin-papelera',      path: '/admin/trash',            nombre: 'Admin · papelera',             rol: 'admin' },
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
     * NO se compara. Esta pantalla muestra el análisis IA de la rendición, y
     * el texto sale distinto en cada carga: frases diferentes, y con ellas un
     * alto de bloque diferente que corre todo lo que está debajo. Medido: dos
     * corridas seguidas dan 8-9% de píxeles distintos sin que nadie toque
     * código.
     *
     * Enmascarar el bloque no alcanza — una máscara tapa, pero no evita el
     * desplazamiento vertical de lo que sigue.
     *
     * (Que el texto cambie en cada carga es en sí un problema: existe un caché
     *  en `expense_reports.ai_analysis` justamente para evitarlo. Ver
     *  `generateApprovalAnalysis` en src/actions/approvals.ts.)
     */
    comparar: false,
  },
  {
    slug: 'caja-chica-detalle',
    nombre: 'Caja chica · detalle del fondo',
    listas: ['/petty-cash'],
    prefijo: '/petty-cash/',
    ignorar: ['/petty-cash/new'],
  },
]
