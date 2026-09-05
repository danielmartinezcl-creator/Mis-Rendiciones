import { test, expect, type Page } from '@playwright/test'
import { RUTAS_ESTATICAS, RUTAS_DETALLE } from './rutas'

/**
 * Línea base visual del rediseño Tornasol — etapa 0.
 *
 * Cada ruta se captura entera (fullPage) en móvil 390 y escritorio 1440.
 * Estas imágenes son el "antes". La etapa 1 —mover ~1.420 clases de color a
 * tokens semánticos— debe pasar este run sin un solo píxel de diferencia.
 *
 * Determinismo: ver e2e/README.md. La regla corta es que el "antes" y el
 * "después" se corran el mismo día contra la misma base de datos.
 */

/** Deja la página quieta antes de disparar la cámara. */
async function estabilizar(page: Page) {
  // Las tres fuentes (Bricolage, Hanken, Geist Mono) llegan de Google Fonts.
  // Sin esta espera se captura el fallback del sistema en la primera corrida
  // y la fuente real en la segunda: diferencia enorme y totalmente espuria.
  await page.evaluate(() => document.fonts.ready)

  /* Las páginas de admin disparan varias server actions al montar.
     El timeout propio de 8 s NO es decorativo: sin él `networkidle` hereda el
     timeout del test (90 s) y en las páginas donde la red nunca queda quieta
     —el websocket de HMR en dev basta— se come la corrida entera antes de que
     este .catch() llegue a ejecutarse. Así fallaron /mis-gastos y
     /admin/carga-historica en la primera pasada. */
  await page.waitForLoadState('networkidle', { timeout: 8_000 }).catch(() => {
    /* No llegó a estar quieta: seguimos igual, la captura sale de todos modos */
  })

  /* Espera a que el DOM deje de cambiar: mismo tamaño de árbol y misma altura
     en tres muestras seguidas. Sin esto se capturan páginas a medio poblar —
     así salió una captura de /admin/employees de 844 px de alto contra otra
     de 28.880 px del mismo listado ya cargado. */
  await esperarDomQuieto(page)
}

async function esperarDomQuieto(page: Page, limite = 15_000) {
  const inicio = Date.now()
  let previo = -1
  let estables = 0

  while (Date.now() - inicio < limite) {
    const actual = await page.evaluate(
      () => document.body.scrollHeight * 1e6 + document.body.innerHTML.length
    )
    if (actual === previo) {
      if (++estables >= 3) return
    } else {
      estables = 0
      previo = actual
    }
    await page.waitForTimeout(200)
  }
}

async function capturar(page: Page, slug: string, mascaras: string[] = []) {
  await expect(page).toHaveScreenshot(`${slug}.png`, {
    fullPage: true,
    /* Playwright pinta las máscaras de rosa antes de comparar, así lo tapado
       es idéntico entre corridas. Ver `mascaras` en rutas.ts para cuándo
       corresponde usarlas — y cuándo no. */
    mask: mascaras.map(sel => page.locator(sel)),
  })
}

/* ── Pantalla pública ──────────────────────────────────────────────────── */
test.describe('sin sesión', () => {
  test.use({ storageState: { cookies: [], origins: [] } })

  test('Login', async ({ page }) => {
    await page.goto('/login')
    await estabilizar(page)
    await capturar(page, 'login')
  })
})

/* ── Rutas autenticadas ────────────────────────────────────────────────── */
for (const ruta of RUTAS_ESTATICAS) {
  test(ruta.nombre, async ({ page }) => {
    const respuesta = await page.goto(ruta.path, { waitUntil: 'domcontentloaded' })

    if (ruta.estadoEsperado) {
      expect(respuesta?.status(), `${ruta.path} debía responder ${ruta.estadoEsperado}`).toBe(ruta.estadoEsperado)
    } else {
      expect(respuesta?.status(), `${ruta.path} respondió con error HTTP`).toBeLessThan(400)
    }
    // Si el proxy nos mandó al login, la sesión se cayó: mejor fallar fuerte
    // que guardar 24 capturas de la pantalla de login.
    expect(page.url(), `${ruta.path} redirigió al login — sesión perdida`).not.toContain('/login')

    await estabilizar(page)
    await capturar(page, ruta.slug, ruta.mascaras)
  })
}

/* ── Rutas de detalle ──────────────────────────────────────────────────── */
for (const detalle of RUTAS_DETALLE) {
  test(detalle.nombre, async ({ page }) => {
    let destino: string | undefined

    // Se prueban los listados en orden hasta que uno dé un enlace utilizable.
    for (const lista of detalle.listas) {
      await page.goto(lista, { waitUntil: 'domcontentloaded' })
      await estabilizar(page)

      const enlaces = await page
        .locator(`a[href^="${detalle.prefijo}"]`)
        .evaluateAll(nodos => nodos.map(n => n.getAttribute('href') ?? ''))

      destino = enlaces.find(
        href => href && !detalle.ignorar.includes(href) && href !== detalle.prefijo
      )
      if (destino) break
    }

    // Sin datos no hay captura, y eso NO es un fallo: es información. Queda
    // como "skipped" en el reporte para que se vea que esa ruta no tiene base.
    test.skip(!destino, `Ningún ítem para abrir en: ${detalle.listas.join(', ')}`)

    await page.goto(destino!, { waitUntil: 'domcontentloaded' })
    expect(page.url(), 'el detalle redirigió al login').not.toContain('/login')

    await estabilizar(page)

    if (detalle.comparar === false) {
      /* Pantalla no determinista: se guarda para poder mirarla, pero no se
         compara. Compararla solo produciría rojos que no significan nada, y
         un rojo que no significa nada entrena a ignorar los rojos. */
      const nombre = test.info().project.name
      await page.screenshot({
        path: `e2e/referencia/${nombre}/${detalle.slug}.png`,
        fullPage: true,
      })
      return
    }

    await capturar(page, detalle.slug)
  })
}
