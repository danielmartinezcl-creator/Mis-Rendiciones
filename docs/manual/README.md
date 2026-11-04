# Manual de uso

La guía que leen los trabajadores. Se sirve **dentro de la app**, en
`https://www.mi-rendicion.com/manual`, sin sesión: se abre desde el login
(«¿Primera vez? Lee la guía de uso»), desde **Más → Manual de uso** en el
celular y desde el pie del riel en el computador.

| Archivo | Qué es |
|---|---|
| `manual.html` | **El texto.** Es lo único que se edita a mano |
| `img/*.png` | Las capturas de origen. Fuera de git: se regeneran |
| `datos-demo.sql` / `datos-demo-revertir.sql` | Los documentos de ejemplo que aparecen en las capturas |
| `../../public/manual/` | Lo que la app sirve: `index.html`, las imágenes en WebP y el PDF. Lo genera el script, no se toca |

## Regenerar después de un cambio en la app

1. **Sacar los datos de ejemplo de la papelera** — `datos-demo.sql`, con la
   llave de servicio (o el MCP de Supabase). Escribe en producción: va con el
   visto bueno de Daniel. Solo toca la cuenta demo «Daniel Martinez Prueba» y
   documentos con ids fijos `aaaa0001-…` / `bbbb0001-…`.
2. **Capturar** — `node e2e/manual/capturar.mjs --guardar-sesiones`, una vez, y
   luego `node e2e/manual/capturar.mjs`. Entra con dos cuentas de
   `e2e/.env.e2e`: la demo de empleado (`MANUAL_*`) y la del admin (`E2E_*`),
   que es el N1 de la demo y por eso ve la bandeja. **`--guardar-sesiones` lo corre Daniel**: el
   guion escribe contraseñas en el login de producción y deja las dos sesiones
   en `e2e/.auth/`. Después `node e2e/manual/capturar.mjs` saca las fotos sin
   ninguna clave, y al terminar se borran las sesiones.
3. **Devolver los datos a la papelera** — `datos-demo-revertir.sql`, apenas
   terminan las capturas. Mientras están vivos aparecen en los informes, en
   Fondos por Rendir y en la bandeja de Daniel.
4. **Publicar** — `node scripts/publicar-manual.mjs`. Pasa las capturas a WebP
   (de 9 MB a menos de 1), arma `public/manual/index.html` y genera el PDF.
5. Commit de `docs/manual/manual.html` y `public/manual/`, y desplegar.

Si solo cambió el texto, alcanza con los pasos 4 y 5.

## Qué tener en cuenta al editar

- **El trato es de tú**, no de vos: la app usa voseo en algunos textos, pero el
  manual se escribió para Chile y se mantiene así.
- **Los botones se nombran tal como dicen en pantalla**, con `<span class="boton">`.
  Si cambia el texto de un botón en la app, cambia acá.
- El archivo no trae `<html>` ni `<head>`: los pone `publicar-manual.mjs`, con
  `<base href="/manual/">` para que las rutas relativas resuelvan.
- Las reglas `@media print` y `@page` deciden la paginación del PDF.
