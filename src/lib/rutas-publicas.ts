// Rutas que src/proxy.ts deja pasar sin sesión. Cada una se defiende sola:
//   /login, /register — formularios públicos
//   /api/auth         — canje del código OAuth
//   /set-password     — la sesión se crea dentro, al canjear el token del correo
//                       (ver src/lib/access-link.ts)
//   /api/cron         — la llama Vercel sin cookies; la protege CRON_SECRET
//   /manual           — la guía de uso (public/manual/). Se abre desde el login,
//                       antes de tener contraseña, y solo trae datos de ejemplo
// Por segmento y no por prefijo: '/api/cron' no deja pasar '/api/cronograma'.
const RUTAS_PUBLICAS = ['/login', '/register', '/api/auth', '/set-password', '/api/cron', '/manual']

export function esRutaPublica(pathname: string): boolean {
  return RUTAS_PUBLICAS.some(r => pathname === r || pathname.startsWith(`${r}/`))
}
