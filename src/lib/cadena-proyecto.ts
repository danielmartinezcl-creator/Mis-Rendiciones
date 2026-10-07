// Las reglas de quién aprueba un documento, sin tocar la base.
//
// Las usa `cargarCadena()` al congelar la cadena en el envío, y también la
// pantalla para mostrar la previsualización («esto va a Juan Pérez»). Que sea la
// MISMA función en los dos lados es el punto: lo que el empleado ve antes de
// enviar es exactamente lo que va a pasar, no una segunda implementación que se
// desincroniza con la primera al tercer cambio.
//
// Spec: docs/superpowers/specs/2026-10-07-aprobador-por-proyecto-design.md

export type OrigenCadena = 'proyecto' | 'jefe-propio' | 'organizacion' | 'ninguno'

export interface EntradaCadena {
  /** El jefe elegido, cuando el documento es de un proyecto */
  jefeProyecto:    string | null
  /** `users.approver_l1_id` — desde la 039 es una excepción, ya no una obligación */
  jefePropio:      string | null
  /** `organizations.aprobador_defecto_id` */
  defectoOrg:      string | null
  n2Propio:        string | null
  n2Org:           string | null
  umbralPropio:    number | null
  umbralOrg:       number | null
  totalSolicitado: number
}

export interface CadenaResuelta {
  l1:     string | null
  l2:     string | null
  origen: OrigenCadena
  /** Desde cuánto firma el N2; `null` = firma siempre */
  umbral: number | null
}

/**
 * Desde cuánto firma el N2, o `null` si firma siempre.
 *
 * **Un N2 sin monto firma siempre** (Daniel, 2026-10-07): es lo que hacía la
 * ficha antes de la 039. Con «sin monto = nunca», quien ya tenía un N2
 * configurado lo perdía en silencio al desplegar.
 *
 * El monto de la ficha vale para cualquiera de los dos N2 —así, ponerle un
 * monto a una persona no le borra el N2 de la organización—. El de la
 * organización, en cambio, acompaña solo a SU N2: si valiera también para el de
 * la ficha, poner un monto general le quitaría la segunda firma a quien la
 * tiene configurada a mano.
 */
export function umbralAplicable(
  e: Pick<EntradaCadena, 'n2Propio' | 'umbralPropio' | 'umbralOrg'>,
): number | null {
  if (e.umbralPropio !== null) return e.umbralPropio
  return e.n2Propio ? null : e.umbralOrg
}

/** Si el total alcanza el umbral. Es `>=`, así que un umbral de 0 es lo mismo que ninguno. */
export function requiereN2(total: number, umbral: number | null): boolean {
  return umbral === null || total >= umbral
}

export function resolverCadena(e: EntradaCadena): CadenaResuelta {
  const l1 = e.jefeProyecto ?? e.jefePropio ?? e.defectoOrg ?? null

  const origen: OrigenCadena =
    e.jefeProyecto ? 'proyecto'
    : e.jefePropio ? 'jefe-propio'
    : e.defectoOrg ? 'organizacion'
    : 'ninguno'

  const n2     = e.n2Propio ?? e.n2Org ?? null
  const umbral = umbralAplicable(e)
  let l2 = n2 !== null && requiereN2(e.totalSolicitado, umbral) ? n2 : null

  // Nadie decide dos veces el mismo documento. Pasa de verdad cuando el jefe de
  // un proyecto es, además, el N2 por defecto de la organización.
  if (l2 !== null && l2 === l1) l2 = null

  return { l1, l2, origen, umbral }
}

/**
 * La forma canónica de un número de proyecto, para que `2991`, ` 02991 ` y
 * `2991a` no terminen creando tres obras distintas.
 *
 * El número es lo que identifica al proyecto —el nombre es decorativo—, así que
 * esta función es la que decide qué significa «el mismo proyecto».
 */
export function normalizarNumeroProyecto(valor: string): string {
  const limpio = valor.trim().toUpperCase()
  if (limpio === '') return ''
  // Solo dígitos: se quitan los ceros a la izquierda. BigInt y no parseInt
  // porque un número de obra largo pierde precisión como Number.
  if (/^\d+$/.test(limpio)) return String(BigInt(limpio))
  return limpio
}

/** Las filas que hacen falta para resolver una cadena, tal como vienen de la base. */
export interface FilasParaCadena {
  proyecto: { jefe_id: string | null } | null
  persona:  { approver_l1_id: string | null; approver_l2_id: string | null; umbral_n2_clp: number | null }
  org:      { aprobador_defecto_id: string | null; aprobador_n2_defecto_id: string | null; umbral_n2_clp: number | null }
  total:    number
}

/**
 * Arma la entrada desde las filas. Existe para que los tres sitios que congelan
 * una cadena —rendición, fondo y liquidación— no repitan el mapeo y se les
 * olvide un campo a alguno.
 */
export function entradaDesdeFilas(f: FilasParaCadena): EntradaCadena {
  return {
    jefeProyecto:    f.proyecto?.jefe_id ?? null,
    jefePropio:      f.persona.approver_l1_id,
    defectoOrg:      f.org.aprobador_defecto_id,
    n2Propio:        f.persona.approver_l2_id,
    n2Org:           f.org.aprobador_n2_defecto_id,
    umbralPropio:    f.persona.umbral_n2_clp,
    umbralOrg:       f.org.umbral_n2_clp,
    totalSolicitado: f.total,
  }
}
