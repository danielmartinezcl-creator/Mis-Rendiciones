// Piezas puras de los avisos (src/lib/avisos.ts), separadas para poder testearlas.

// Todo texto que escribe una persona —su nombre, el título de una rendición, el
// nombre de un fondo— entra al HTML del correo escapado. Sin esto, un título como
// `<a href="https://otro-sitio">Revisar</a>` llegaba como un link de verdad dentro
// de un correo con nuestro remitente.
export function escaparHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

// Clave de «ya avisamos hoy» del aviso de configuración. La base tiene un índice
// único en (org_id, dedup_key), así que la clave lleva al admin: con una sola
// clave para todos, solo el primer admin de la organización recibiría el aviso.
// `dedup_key` es varchar(150): el nombre se recorta para que siempre quepa.
export function claveAvisoSinAprobador(empleadoNombre: string, fecha: string, adminId: string): string {
  return `config_missing:${empleadoNombre.trim().slice(0, 60)}:${fecha}:${adminId}`
}
