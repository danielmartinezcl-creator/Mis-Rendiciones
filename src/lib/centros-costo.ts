// El catálogo de centros de costo: sus reglas, sin pantalla ni base.
//
// Lo que hay que saber antes de tocar esto: **el código ES el centro de
// negocios de Defontana**. Se exporta tal cual, con tres ceros al final
// (`toSheetCostCenter`: EMPGESINGING → EMPGESINGING000), así que no es un
// nombre interno que se pueda elegir con comodidad — tiene que coincidir con
// Defontana letra por letra o la importación del comprobante falla.
//
// Y el código no es plano: se lee **de tres en tres letras**, y cada tramo es
// un nivel del árbol. Los 46 de PENTA lo cumplen sin excepción:
//
//     EMP            EMPRESA                 agrupa
//     └ EMPGES       AREAS DE GESTION        agrupa
//       └ EMPGESING  INGENIERIA              agrupa
//         └ EMPGESINGELE  ELECTRICIDAD       imputable
//
// Por eso el alta pide el padre y las tres letras nuevas, en vez del código
// completo: así sale bien armado y colgado de donde corresponde. Un código
// escrito a mano entero es la forma de inventar una rama que Defontana no tiene.
//
// `imputable` es otra cosa y no se deduce del nivel: dice si el centro recibe
// asientos. Los que agrupan no reciben; una hoja sí. Puede haber una hoja a
// cualquier altura (EMPPRU, CENTRO PRUEBA, es imputable en el nivel 2).

/** Cada tramo del código es un nivel. No es una preferencia: es cómo están
 *  escritos los 46 centros y cómo los lee Defontana. */
export const LARGO_SEGMENTO = 3

/** El largo de `cost_centers.id` (varchar(50)). */
export const LARGO_MAXIMO = 50

export type CentroExistente = { id: string; descripcion: string }

export type AltaCentro = {
  /** El código del padre, o vacío para una rama nueva en el primer nivel. */
  padre: string
  /** Las tres letras que se suman al padre. */
  sufijo: string
  descripcion: string
}

export type FilaArbol<T extends CentroExistente = CentroExistente> = T & {
  /** 1 para la raíz. Es la sangría de la fila. */
  nivel: number
  /** El padre que el código nombra no está en la lista: la fila se muestra
   *  igual, arriba, pero conviene que se note. */
  sinPadre: boolean
}

/**
 * El código como lo quiere Defontana: mayúsculas, sin acentos y solo letras y
 * números. Lo que el admin copia y pega suele traer puntos, espacios o guiones.
 */
export function normalizarCodigo(valor: string): string {
  return valor
    .normalize('NFD').replace(/\p{Diacritic}/gu, '')
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '')
}

/** Cuántos tramos tiene el código. Uno que no sea múltiplo de tres no lo creó
 *  esta pantalla: se trata como del primer nivel en vez de inventarle tramos. */
export function profundidad(codigo: string): number {
  return codigo.length % LARGO_SEGMENTO === 0 ? codigo.length / LARGO_SEGMENTO : 1
}

/** El código del padre: el propio sin su último tramo. */
export function codigoDePadre(codigo: string): string | null {
  if (codigo.length <= LARGO_SEGMENTO) return null
  if (codigo.length % LARGO_SEGMENTO !== 0) return null
  return codigo.slice(0, -LARGO_SEGMENTO)
}

export function armarCodigo(padre: string, sufijo: string): string {
  return normalizarCodigo(padre) + normalizarCodigo(sufijo)
}

/**
 * Lo que impide crear un centro. Devuelve todos los motivos juntos: el admin
 * corrige una vez, no una por intento.
 */
export function erroresDeAlta(alta: AltaCentro, existentes: CentroExistente[]): string[] {
  const errores: string[] = []
  const sufijo = normalizarCodigo(alta.sufijo)
  const padre  = normalizarCodigo(alta.padre)

  if (!sufijo) {
    errores.push('Faltan las tres letras del código nuevo')
  } else if (sufijo.length !== LARGO_SEGMENTO) {
    errores.push(
      `El código va de tres en tres letras y «${sufijo}» tiene ${sufijo.length}. ` +
      'Así es como están escritos los centros en Defontana.',
    )
  }

  if (padre && !existentes.some(c => c.id === padre)) {
    errores.push(`El centro de arriba (${padre}) no existe`)
  }

  const codigo = padre + sufijo
  if (codigo.length > LARGO_MAXIMO) {
    errores.push(`El código no puede pasar de ${LARGO_MAXIMO} caracteres`)
  }

  const repetido = sufijo ? existentes.find(c => c.id === codigo) : undefined
  if (repetido) {
    errores.push(`El código ${codigo} ya es de «${repetido.descripcion}»`)
  }

  if (!alta.descripcion.trim()) {
    errores.push('Falta el nombre del centro de costo')
  }

  return errores
}

/**
 * Ordenados por código, que es exactamente el orden del árbol, con el nivel de
 * cada fila para la sangría. Nada se esconde: un hijo cuyo padre no está en la
 * lista aparece igual, marcado.
 */
export function ordenarEnArbol<T extends CentroExistente>(centros: T[]): FilaArbol<T>[] {
  const codigos = new Set(centros.map(c => c.id))
  return [...centros]
    .sort((a, b) => a.id.localeCompare(b.id))
    .map(c => {
      const padre = codigoDePadre(c.id)
      return {
        ...c,
        nivel:    profundidad(c.id),
        sinPadre: padre !== null && !codigos.has(padre),
      }
    })
}

/**
 * Un centro se borra de verdad solo si nada lo nombra. Es para arreglar un
 * código recién escrito mal; para retirar uno que ya se usó está `activo`, que
 * lo saca de los desplegables sin tocar lo que ya se imputó.
 */
export function sePuedeBorrar(usos: { personas: number; gastos: number; hijos: number }): boolean {
  return usos.personas === 0 && usos.gastos === 0 && usos.hijos === 0
}

/**
 * El centro de negocios como lo escribe el comprobante de Defontana: con tres
 * ceros al final (EMPGESINGING → EMPGESINGING000). Vacío se deja vacío — «000»
 * solo no es un centro válido.
 *
 * Vive acá y no en `lib/export/defontana`, que es su único usuario de verdad,
 * porque la pantalla del catálogo lo muestra antes de crear un centro y ese
 * archivo importa xlsx: no puede entrar al bundle del navegador. El export lo
 * re-exporta, así que para el resto del código sigue estando ahí.
 */
export function toSheetCostCenter(costCenter: string): string {
  return costCenter ? `${costCenter}000` : ''
}
