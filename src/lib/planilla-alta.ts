// Carga de empleados desde un Excel: crea a quien no está y completa a quien sí.
// Helpers puros: los usa la vista previa en el navegador Y la acción del
// servidor, que vuelve a resolver todo antes de escribir — el navegador no es
// fuente de verdad. Módulo común, SIN 'use server'.
//
// Spec: docs/superpowers/specs/2026-10-01-planilla-de-alta-design.md

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

export function normalizarNombre(nombre: string): string {
  return nombre
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase().trim().replace(/\s+/g, ' ')
}
