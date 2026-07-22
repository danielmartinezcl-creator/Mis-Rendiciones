# Importador Histórico — Spec

**Fecha:** 2026-07-21  
**Estado:** Aprobado por usuario  
**Alcance:** Carga masiva de rendiciones y cajas chicas de períodos anteriores para exportación a Defontana e informes de año completo.

---

## Problema

La app comenzó a usarse en un período posterior al inicio del año contable. Para tener informes anuales completos y poder exportar a Defontana la totalidad del gasto del año, el admin necesita cargar datos históricos (6-12 meses, 5-10 empleados, ~50-100 rendiciones) que actualmente existen en Excel o PDF.

---

## Decisiones de diseño

### Formato fuente
Los archivos existentes (Excel y PDF) siguen la misma estructura:
- **Encabezado:** Tipo (CAJA CHICA / RENDICIÓN) + N° + Oficina/Empleado + Fecha rendición
- **Tabla:** Item | Usuario | Razón | Proyecto | Fecha | Gastos | Ingresos | Saldo
- **Resumen:** Total Gastos | Reembolso | Saldo

El campo "Proyecto" (ej: 2982, 2964) son códigos internos — **no** mapean a centros de costo Defontana.

### Centro de costo por defecto
`EMPGESINGING` (Ingeniería) aplicado a todos los ítems. Overridable por fila en la grilla de revisión.

### Tipo de documento por defecto
`boleta`. Al cambiar a `factura` o `factura_exenta`, aparecen campos adicionales (nro. doc, RUT proveedor).

### Cajas chicas multi-empleado
Una caja chica puede tener ítems de múltiples empleados (ej: ESTEBAN VARAS, CLAUDIA LOBOS, CAMILA NAVARRO en la misma Caja Chica 173). Se crea un solo fondo con el admin como responsable. El nombre del empleado se preserva en la descripción del ítem: `"ESTEBAN VARAS | TAXI CONCEPCION IDA Y VUELTA"`.

### Estado de los registros creados
- `status = 'approved'` — fluye inmediatamente al export Defontana
- `approved_at` = fecha de rendición del archivo fuente (no fecha de importación)
- `is_historical_import = true` — badge visible en admin
- `defontana_exported_at = null` — pendiente de exportar

---

## Flujo de usuario

### Path A — Excel (archivo existente)

1. Admin navega a `/admin/carga-historica`
2. Selecciona tipo: **Caja Chica** o **Rendición Individual**
3. Sube el archivo `.xlsx` existente
4. Sistema parsea automáticamente y extrae: N°, oficina/empleado, fecha rendición, ítems
5. Claude pre-categoriza cada ítem por descripción (en background, segundos)
6. Admin ve **grilla de revisión** con datos pre-llenados
7. Admin corrige/completa campos necesarios
8. Admin confirma → registros creados en DB

### Path B — Manual (PDFs)

1. Admin navega a `/admin/carga-historica` → tab "Ingreso Manual"
2. Completa encabezado (tipo, empleado/oficina, fecha, período)
3. Agrega ítems uno a uno en la grilla (con el PDF abierto al lado)
4. Mismos defaults que Path A
5. Admin confirma → registros creados en DB

---

## Grilla de revisión

Columnas por fila:

| Campo | Pre-llenado (Excel) | Default (manual/vacío) | Editable |
|-------|--------------------|-----------------------|----------|
| Empleado | Nombre del Excel | — | Sí |
| Descripción | Razón del Excel | — | Sí |
| Fecha | Convertida de serial Excel | Fecha rendición | Sí |
| Monto CLP | Gastos del Excel | — | Sí |
| Categoría | IA sugiere | Sin asignar | Sí — dropdown |
| Centro de costo | EMPGESINGING | EMPGESINGING | Sí — dropdown |
| Tipo doc | boleta | boleta | Sí — selector |
| Nro. doc | — | — | Solo si factura |
| RUT proveedor | — | — | Solo si factura |

**Empleado no reconocido** → inline resolver: mapear a usuario existente / crear empleado nuevo / "colaborador histórico" (trazabilidad sin acceso).

**Pie de grilla:** totales por categoría + advertencias (ítems sin categoría, facturas sin RUT).

---

## Cambios de base de datos

```sql
-- Migración: 007_historical_import_flag.sql
ALTER TABLE expense_reports
  ADD COLUMN is_historical_import BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE petty_cash_funds
  ADD COLUMN is_historical_import BOOLEAN NOT NULL DEFAULT false;
```

Sin tablas nuevas. Los registros históricos usan el mismo schema existente.

---

## Nuevos archivos

| Archivo | Descripción |
|---------|-------------|
| `supabase/migrations/007_historical_import_flag.sql` | Migración DB |
| `src/actions/historical-import.ts` | Server Actions: parse Excel, categorizar con IA, crear registros |
| `src/lib/historical-import/parser.ts` | Lógica de parsing del Excel (sin 'use server') |
| `src/lib/historical-import/categorizer.ts` | Lógica de pre-categorización con Claude |
| `src/app/(app)/admin/carga-historica/page.tsx` | Página Server (layout + carga inicial) |
| `src/app/(app)/admin/carga-historica/client.tsx` | Client Component (grilla interactiva) |

---

## Archivos modificados

| Archivo | Cambio |
|---------|--------|
| `src/lib/supabase/types.ts` | Agregar `is_historical_import` a `expense_reports` y `petty_cash_funds` |
| `src/components/layout/Sidebar.tsx` | Agregar enlace "Carga Histórica" en sección Admin |
| `src/components/layout/MobileNav.tsx` | Idem para mobile |

---

## Lo que NO está en scope

- Auto-parseo de PDFs (los PDFs se ingresan por Path B manual)
- Importación de documentos adjuntos/fotos de los archivos históricos
- Reversión/eliminación masiva de importaciones (usar papelera existente)
- Edición post-importación masiva (usar interfaz de admin existente)
