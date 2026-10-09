// Los bancos y los tipos de cuenta, en un solo lugar.
//
// Antes esta lista vivía suelta dentro de `profile/page.tsx` y nadie más la
// veía, así que la planilla escribía su propio vocabulario. Medido en la base
// el 2026-10-09, sobre 58 personas con banco cargado:
//
//   banco              →  «Falabella», «Itau», «Mercadopago Emisora S.A.»
//                         (la lista decía «Banco Falabella», «Itaú», «Mercado Pago»)
//   tipo de cuenta     →  «Corriente» / «Vista» en TODAS,
//                         y el perfil del empleado guarda 'corriente' / 'vista'
//
// O sea: cero coincidencias en el tipo de cuenta y tres bancos de ocho sin
// coincidir. Un `<select>` alimentado con eso se dibuja vacío, y guardar con
// un campo vacío borra el dato. De ahí las dos piezas de este módulo: una
// lista canónica y un normalizador que acepta cómo lo escribió la gente.
//
// Hoy nadie ramifica sobre estas columnas —son de registro, no de lógica—,
// pero el día que salga un archivo de pago al banco van a importar.

/** Los bancos que se ofrecen. «Otro» al final, a propósito. */
export const BANCOS = [
  'Banco Estado',
  'Banco de Chile',
  'Santander',
  'BCI',
  'Scotiabank',
  'Itaú',
  'BICE',
  'Security',
  'Banco Falabella',
  'Banco Ripley',
  'Global66',
  'Mercado Pago',
  'HSBC',
  'Banco Internacional',
  'Otro',
] as const

export const TIPOS_DE_CUENTA = [
  { valor: 'corriente', etiqueta: 'Cuenta Corriente' },
  { valor: 'vista',     etiqueta: 'Cuenta Vista' },
  { valor: 'ahorro',    etiqueta: 'Cuenta de Ahorro' },
] as const

export type TipoDeCuenta = (typeof TIPOS_DE_CUENTA)[number]['valor']

/**
 * La parte del nombre que de verdad identifica al banco: sin tildes, sin
 * mayúsculas, sin nada que no sea una letra o un número, y sin el «banco de»
 * del principio, que algunos escriben y otros no.
 */
function clave(nombre: string): string {
  return nombre
    .normalize('NFD').replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '')
    .replace(/^banco/, '')
    .replace(/^de/, '')
}

/**
 * Devuelve el nombre de la lista que corresponde a lo escrito, o lo escrito
 * tal cual si no reconoce ninguno.
 *
 * **Nunca devuelve vacío cuando entró algo.** Perder el banco de alguien por
 * no haberlo reconocido es peor que guardarlo con un nombre raro: el dato lo
 * cargó una persona y se puede corregir, pero solo si sigue ahí.
 */
export function normalizarBanco(nombre: string | null | undefined): string | null {
  const limpio = (nombre ?? '').trim()
  if (!limpio) return null

  const k = clave(limpio)
  if (!k) return limpio

  const exacto = BANCOS.find(b => clave(b) === k)
  if (exacto) return exacto

  /* «Mercadopago Emisora S.A.» es Mercado Pago, y «Falabella» es Banco
     Falabella. Se aceptan por prefijo, pero desde cuatro letras: con menos,
     claves cortas como «bci» empezarían a pisar a cualquiera. */
  const porPrefijo = BANCOS.find(b => {
    const kb = clave(b)
    if (kb.length < 4 || k.length < 4) return false
    return kb.startsWith(k) || k.startsWith(kb)
  })

  return porPrefijo ?? limpio
}

/**
 * «Corriente», «Cuenta Corriente», «Cta Cte» y 'corriente' son lo mismo.
 * Lo que no reconoce devuelve null: acá sí, porque el tipo de cuenta es un
 * conjunto cerrado de tres y guardar un cuarto valor no le sirve a nadie.
 */
export function normalizarTipoCuenta(tipo: string | null | undefined): TipoDeCuenta | null {
  const k = clave(tipo ?? '')
  if (!k) return null
  if (k.includes('corr') || k === 'cte' || k === 'ctacte') return 'corriente'
  if (k.includes('vista')) return 'vista'
  if (k.includes('ahorr')) return 'ahorro'
  return null
}

/** Para mostrar: 'corriente' → «Cuenta Corriente». */
export function etiquetaTipoCuenta(tipo: string | null | undefined): string | null {
  const v = normalizarTipoCuenta(tipo)
  return TIPOS_DE_CUENTA.find(t => t.valor === v)?.etiqueta ?? null
}

/**
 * Las opciones que mostrar en el desplegable, con lo que la persona YA tiene
 * guardado incluido aunque no esté en la lista.
 *
 * Es la red de seguridad de verdad, más que el normalizador: un `<select>`
 * cuyo `value` no figura entre sus opciones se dibuja en blanco, y el
 * siguiente «Guardar» escribe ese blanco. Mientras el valor actual sea una
 * opción, abrir el panel y guardar no puede borrar nada.
 */
export function opcionesDeBanco(actual: string | null | undefined): string[] {
  const v = (actual ?? '').trim()
  if (!v || BANCOS.some(b => b === v)) return [...BANCOS]
  return [v, ...BANCOS]
}
