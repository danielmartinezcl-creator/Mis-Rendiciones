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

const SESION          = path.join(__dirname, '.auth', 'admin.json')
const SESION_EMPLEADO = path.join(__dirname, '.auth', 'empleado.json')

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

/**
 * Segunda sesión: un EMPLEADO SIMPLE.
 *
 * Existe porque hasta el 2026-09-05 todo el rediseño se verificó con una
 * sola sesión de admin, y 53 de los 57 usuarios de PENTA son empleado
 * simple: la configuración de permisos que ellos ven no se dibujó nunca.
 *
 * La cuenta tiene que ser EMPLEADO SIMPLE de verdad —sólo `can_submit`—.
 * Las cuentas de prueba traen `can_approve` y `can_manage_petty_cash` en
 * verdadero, y con eso la corrida verificaría una cuarta configuración que
 * tampoco usa nadie.
 */
setup('ingresar como empleado', async ({ page }) => {
  const correo = process.env.E2E_EMPLEADO_EMAIL
  const clave  = process.env.E2E_EMPLEADO_PASSWORD

  /* Sin credenciales el proyecto ni se arma (ver playwright.config.ts), así
     que llegar acá sin ellas sería un error de configuración del arnés. */
  if (!correo || !clave) throw new Error('Faltan E2E_EMPLEADO_EMAIL y E2E_EMPLEADO_PASSWORD.')

  await page.goto('/login')
  await page.locator('#email').fill(correo)
  await page.locator('#password').fill(clave)
  await page.getByRole('button', { name: 'Ingresar' }).click()
  await page.waitForURL(url => !url.pathname.startsWith('/login'), { timeout: 30_000 })
  await expect(page).not.toHaveURL(/\/login/)

  fs.mkdirSync(path.dirname(SESION_EMPLEADO), { recursive: true })
  await page.context().storageState({ path: SESION_EMPLEADO })
})
