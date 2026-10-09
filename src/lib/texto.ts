// Comparar texto escrito por personas.
//
// Módulo propio y no parte de `planilla-alta`, donde vivía: lo necesitan
// también las vistas de filtro, para que «Más de 5 días» y «Mas de 5 dias» no
// convivan como dos vistas distintas. Comparar nombres no es de ninguna
// pantalla en particular.

// `\p{Diacritic}` y no un rango de caracteres combinantes escrito a mano: un
// rango literal se ve como basura en el editor y cualquier normalización del
// archivo lo rompe en silencio.
export function normalizarNombre(nombre: string): string {
  return nombre
    .normalize('NFD').replace(/\p{Diacritic}/gu, '')
    .toLowerCase().trim().replace(/\s+/g, ' ')
}

/**
 * Para BUSCAR: sin acentos y en minúsculas, pero conservando los espacios tal
 * como están — al revés que `normalizarNombre`, que los colapsa porque compara
 * nombres enteros.
 *
 * `\p{Diacritic}` y no un rango de caracteres combinantes escrito a mano: así
 * estaba en la nómina, y un rango literal se ve como basura en el editor y
 * cualquier normalización del archivo lo rompe sin que nadie se entere.
 */
export function sinTildes(texto: string): string {
  return texto.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase()
}
