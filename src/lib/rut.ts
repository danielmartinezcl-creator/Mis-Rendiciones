// El RUT, normalizado para comparar y formateado para guardar.
//
// Módulo propio y no parte de `planilla-alta`: lo necesitan la planilla Y el
// alta repetida, y si viviera en una de las dos las dos se importarían en
// círculo. Un identificador de personas no es parte de ninguna pantalla.

// Para COMPARAR. En la base los 55 RUT están con puntos y 5 con la k en
// minúscula, así que sin normalizar los dos lados no se encuentra nada.
export function normalizarRut(rut: string): string {
  const limpio = rut.trim().toUpperCase().replace(/[^0-9K]/g, '')
  if (limpio.length < 2) return ''
  return `${limpio.slice(0, -1)}-${limpio.slice(-1)}`
}

// Para GUARDAR: con puntos, el formato que ya tienen los 55 y el que espera el
// export a Defontana (toSheetRut).
export function formatearRut(rut: string): string {
  const n = normalizarRut(rut)
  if (!n) return ''
  const [cuerpo, dv] = n.split('-')
  return `${cuerpo.replace(/\B(?=(\d{3})+(?!\d))/g, '.')}-${dv}`
}
