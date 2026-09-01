import { test as setup, expect } from '@playwright/test'
import fs from 'fs'
import path from 'path'

/**
 * Ingresa una vez y guarda la sesión en disco. Los dos proyectos de captura
 * (movil y escritorio) la reutilizan, así no hacemos login 50 veces.
 *
 * Las credenciales salen de e2e/.env.e2e — ver e2e/README.md. Ese archivo
 * está cubierto por el patrón `.env*` del .gitignore y no se commitea.
 */

const SESION = path.join(__dirname, '.auth', 'admin.json')

setup('ingresar como admin', async ({ page }) => {
  const correo = process.env.E2E_EMAIL
  const clave  = process.env.E2E_PASSWORD

  if (!correo || !clave) {
    throw new Error(
      'Faltan E2E_EMAIL y E2E_PASSWORD.\n' +
      'Creá el archivo e2e/.env.e2e con:\n\n' +
      '  E2E_EMAIL=admin@ejemplo.cl\n' +
      '  E2E_PASSWORD=...\n\n' +
      'Usá una cuenta admin: es el rol que ve las 24 rutas. ' +
      'El archivo no se commitea (.gitignore cubre .env*).'
    )
  }

  /* El archivo se crea con valores de ejemplo. Si siguen ahí, el login fallaría
     con "Correo o contraseña incorrectos" y costaría entender por qué. */
  if (correo.includes('CAMBIAME') || clave.includes('CAMBIAME')) {
    throw new Error(
      'e2e/.env.e2e todavía tiene los valores de ejemplo.\n' +
      'Abrilo y reemplazá CAMBIAME por el correo y la contraseña de una cuenta admin real.'
    )
  }

  await page.goto('/login')

  await page.locator('#email').fill(correo)
  await page.locator('#password').fill(clave)
  await page.getByRole('button', { name: 'Ingresar' }).click()

  /* El login es client-side: signInWithPassword y después router.push.
     Esperamos a salir de /login en vez de a un networkidle que nunca llega. */
  await page.waitForURL(url => !url.pathname.startsWith('/login'), { timeout: 30_000 })

  /* Verificación real: que el layout autenticado haya montado. Si las
     credenciales fueran de un usuario sin perfil en `users`, el layout
     redirige de vuelta a /login y queremos enterarnos acá, no en 50 tests. */
  await expect(page).not.toHaveURL(/\/login/)

  fs.mkdirSync(path.dirname(SESION), { recursive: true })
  await page.context().storageState({ path: SESION })
})
