/**
 * Que ningún error le llegue a una persona en inglés.
 *
 * Francisco Díaz, el 2026-10-21, intentando borrar un fondo en borrador:
 *
 * > «An error occurred in the Server Components render. The specific message is
 * > omitted in production builds to avoid leaking sensitive details. A digest
 * > property is included in this error instance…»
 *
 * **Eso no es un texto nuestro: lo pone Next.** En producción, el mensaje de
 * cualquier `throw` del servidor se reemplaza por ese párrafo antes de llegar al
 * navegador, para no filtrar detalles internos. En desarrollo se ve el mensaje
 * real, así que el problema **no aparece hasta que está desplegado**.
 *
 * Y no era de una pantalla: **90 sitios en 35 archivos** muestran `err.message`
 * al usuario. Por eso la red va en `avisar()`, el embudo por el que pasan todos
 * los avisos, y no en cada `catch`.
 *
 * La red tapa el síntoma. Lo que de verdad arregla un caso es **devolver el
 * error como dato** (`{ error: 'Solo se pueden eliminar fondos en borrador' }`)
 * en vez de lanzarlo: un valor de retorno no lo redacta nadie, y la persona lee
 * qué pasó. Esto es para todo lo demás.
 */

/* Las firmas del mensaje de Next. Van en inglés y no pueden aparecer en un
   mensaje nuestro —todos están en español—, así que no hay falso positivo
   posible. Se buscan varias porque el texto cambió entre versiones y volverá a
   cambiar: con que sobreviva una, la red sigue puesta. */
const FIRMAS = [
  'omitted in production',
  'Server Components render',
  'An unexpected response was received from the server',
  'digest property',
]

export function esErrorOpaco(mensaje: string): boolean {
  return FIRMAS.some(f => mensaje.includes(f))
}

/** Lo que se le muestra a una persona cuando el error no dice nada útil. */
export const ERROR_GENERICO =
  'No se pudo completar la acción. Probá de nuevo; si vuelve a pasar, avisale al administrador.'

/**
 * El texto de un aviso, ya legible.
 *
 * Si el mensaje es el párrafo de Next, se reemplaza. Si Next adjuntó un
 * `digest`, se agrega entre paréntesis: **es lo único que permite cruzar el
 * error con el registro de Vercel**, porque el mensaje real solo queda ahí.
 */
export function mensajeLegible(mensaje: string, digest?: string): string {
  if (!esErrorOpaco(mensaje)) return mensaje
  return digest ? `${ERROR_GENERICO} (código ${digest})` : ERROR_GENERICO
}

/**
 * El mensaje de un error atrapado, para mostrar.
 *
 * `respaldo` es lo que se dice cuando el error no trae nada legible — tiene que
 * describir la acción que falló («No se pudo eliminar el fondo»), no el error.
 */
export function mensajeDeError(err: unknown, respaldo: string): string {
  if (!(err instanceof Error)) return respaldo
  // `digest` lo agrega Next al error que cruza del servidor al navegador.
  const digest = (err as Error & { digest?: string }).digest
  if (esErrorOpaco(err.message)) return digest ? `${respaldo} (código ${digest})` : respaldo
  return err.message || respaldo
}
