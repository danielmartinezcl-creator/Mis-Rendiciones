# Guion de prueba — permisos por asignación

Lo corren Katherine, Francisco Hagar (FH), Roberto Hagar (RH) y Daniel, cada uno con
su usuario. «Daniel Martinez Prueba» hace de Francisco Díaz (el rendidor). Antes de
empezar, acordar con Daniel si prefiere otra persona para ese papel.

## Configuración previa (la hace Daniel en /admin/employees)

| Persona | Permisos | Cadena |
|---|---|---|
| Daniel Martinez Prueba | Puede rendir | N1 Katherine · N2 FH |
| Katherine | Puede aprobar · EFF · Carga banco | N1 FH |
| FH | Puede aprobar · EFF · Carga banco + **Suplente de carga** · Autorizador banco | N1 RH |
| RH | Puede aprobar · EFF · Carga banco + Suplente de carga · Autorizador banco + **Suplente de autorización** | N1 FH |
| Daniel | Puede aprobar · EFF · Carga banco + Suplente de carga | N1 FH |

**Antes de desplegar, fuera de la prueba:** toda persona que tenga que rendir necesita un
aprobador N1 (y activo). Hoy la mayoría no lo tiene: el 2026-09-25, 50 de las 57 personas
activas con «Puede rendir» estaban sin N1. Sin él, la app bloquea su envío («No tienes
aprobador asignado…») y le avisa al administrador.

## Escenarios

Después de cada paso, anotar **quién recibió correo** (debe ser solo quien se indica).

1. **Flujo normal.** «Prueba» envía una rendición → correo solo a Katherine. Katherine
   aprueba → solo FH. FH aprueba → Katherine recibe «Cargar reembolso» y, en el mismo
   momento, «Prueba» recibe «Rendición aprobada». Katherine carga → solo FH.
   FH autoriza → «Prueba» recibe «Reembolso procesado».
2. **FH no decide el nivel 1.** Con una rendición recién enviada, FH abre el link
   `/approvals/<id>` → ve el motivo y ningún botón.
3. **Katherine no está.** Otra rendición hasta «Carga bancaria pendiente». Carga FH
   (desde /banco) → el correo de autorizar le llega **solo a RH**. FH no la ve en su
   etapa de autorizar.
4. **Rendición de FH.** FH rinde → correo solo a RH. RH aprueba → Katherine carga →
   el correo de autorizar va **solo a RH**. FH no la ve para autorizar.
5. **Nunca trabado.** Otra rendición de FH en carga: RH intenta cargarla → el sistema
   dice que después nadie podría autorizarla y nombra a quién sí puede.
6. **Fondo propio.** Katherine crea un fondo a su nombre y lo envía → correo solo a FH.
   Katherine no ve botones para aprobarlo.
7. **Fondo con dos niveles.** Katherine crea un fondo para «Prueba» → Katherine aprueba
   (N1) → FH aprueba (N2) → Katherine carga → FH autoriza → **solo «Prueba»** recibe
   «Fondos enviados» (Katherine no: el aviso es para quien recibe la plata). «Prueba»
   liquida → Katherine → FH → «Liquidado» (este sí les llega a «Prueba» y a Katherine).
8. **El admin no opera.** Daniel, en /banco, no ve la etapa de autorizar. En
   /admin/reports no hay «Iniciar proceso bancario», y «Marcar reembolsado» solo
   aparece en cargas históricas. **Tampoco agrega gastos al fondo de otra persona:**
   con el fondo de «Prueba» en «Fondos enviados», Daniel lo abre y no ve cómo agregar,
   editar ni borrar gastos, y en Gasto rápido (/quick) solo aparecen sus propios fondos.
   Lo mismo en un borrador de «Prueba»: lo ve, pero sin «Agregar ítem» ni basurero.
9. **Sin aprobador.** Quitarle el N1 a «Prueba» e intentar enviar → mensaje «No tienes
   aprobador asignado…», y Daniel recibe el aviso de configuración.
