'use server'

import { enviarRecuperacion } from '@/lib/access-email'

/** «¿Olvidaste tu contraseña?» desde el login. Sin sesión: ver `enviarRecuperacion`. */
export async function requestPasswordReset(email: string): Promise<{ ok: boolean }> {
  return enviarRecuperacion(email)
}
