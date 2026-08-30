# Fase 2 — Validaciones persistidas

Hoy la cantidad validada vive únicamente en `locations.validated_quantity` / `validated_at_round`. Esa columna se sobrescribe y fue la causa del caso CCE125TG (se guardó 0 en una ubicación aunque el total sí coincidía). La Fase 2 crea una tabla dedicada, la vuelve la única fuente de verdad para exportar y agrega una verificación que impide guardar un total incoherente.

## 1. Nueva tabla `validated_counts`

Campos: inventario, referencia, ubicación, cantidad validada, ronda en que se validó, motivo de la validación (C1=C2, C3=ERP, total, superadmin, edición manual) y quién la validó.

- Una sola fila por ubicación dentro de un inventario (clave única `inventory_id + location_id`), de modo que revalidar actualiza en lugar de duplicar.
- Índices por `(inventory_id, master_reference)` para exportaciones y auditoría.
- GRANTs: lectura para usuarios autenticados; escritura para superadmins y `service_role`; la función de validación escribe con privilegios elevados.
- RLS activa: todos los autenticados pueden leer; solo superadmins pueden editar/borrar manualmente.
- Trigger de inventario cerrado (mismo `block_closed_inventory`) para que un inventario histórico no se pueda tocar.

### Representación visual de `validated_counts`

```text
+----+-------------+-------------+-------------+-------------------+----------+----------------+---------------------+---------------------+
| id | inventory_id| master_ref  | location_id | validated_quantity| round    | reason         | validated_by        | created_at          |
+----+-------------+-------------+-------------+-------------------+----------+----------------+---------------------+---------------------+
| 1  | inv-001     | AL324IE     | loc-A       | 400               | 3        | C3=ERP         | admin-uuid          | 2026-08-30 10:15:00 |
| 2  | inv-001     | AL324IE     | loc-B       | 253               | 3        | C3=ERP         | admin-uuid          | 2026-08-30 10:15:00 |
| 3  | inv-001     | CCE125TG    | loc-X       | 1855              | 2        | C2=ERP         | admin-uuid          | 2026-08-30 11:02:00 |
| 4  | inv-001     | CCE125TG    | loc-Y       | 0                 | 2        | C2=ERP         | admin-uuid          | 2026-08-30 11:02:00 |
| 5  | inv-001     | ALTOIMPACTO | loc-Z       | 1200              | 5        | superadmin     | superadmin-uuid     | 2026-08-30 12:30:00 |
+----+-------------+-------------+-------------+-------------------+----------+----------------+---------------------+---------------------+
```

- `inventory_id + location_id` es único. Si la misma ubicación se revalida, se actualiza la fila existente.
- `reason` indica por qué se validó: `C1=C2`, `C1=ERP`, `C2=ERP`, `C3=C1`, `C3=C2`, `C3=ERP`, `C4=C1`, `C4=C2`, `C4=C3`, `C4=ERP`, `discovered_at_C2`, `discovered_at_C3`, `discovered_at_C4`, `superadmin_forced`, `manual_edit`.
- `validated_by` guarda el UUID del usuario que ejecutó la acción.

## 2. `validate_and_close_round` escribe en `validated_counts`

Cada vez que la función marca una ubicación como validada (en cualquiera de sus caminos: coincidencia por ubicación, coincidencia por total, descubierta en ronda posterior, cierre forzado de superadmin) además de actualizar `locations` inserta/actualiza la fila correspondiente en `validated_counts` con cantidad, ronda y motivo.

Se mantiene `locations.validated_quantity` sincronizada para no romper la vista de auditoría actual, pero deja de ser la fuente para exportar.

### Blindaje contra el caso CCE125TG

En el camino de "coincidencia por total" la función tomará, para cada ubicación, el conteo real de la ronda que produjo la coincidencia (no el de la ronda actual ni el último disponible). Antes de cerrar la referencia se compara la suma de lo que se va a guardar contra el total que hizo match:

- Si coinciden, se cierra y se persisten las filas.
- Si no coinciden, no se cierra: la referencia queda en conflicto con un motivo explícito, en vez de guardar cantidades que no suman.

Esto hace imposible que quede una referencia "auditada" cuyas cantidades por ubicación no sumen el total validado.

## 3. Edición manual en Auditoría

Cuando un superadmin edita conteos y fija la cantidad validada desde `/superadmin/auditoria`, esa corrección también se guarda en `validated_counts` con motivo `manual_edit` y el usuario que la hizo, para que la exportación refleje siempre lo último aprobado.

## 4. Exportaciones leen de `validated_counts`

- `ExportarConteos.tsx` (pestaña "Validados"): suma por referencia desde `validated_counts` en lugar de `locations`.
- `ExportarConteos.tsx` (pestaña "Por Ubicación") y `useExportToExcel.ts`: la columna de cantidad validada sale de `validated_counts` cruzada por `location_id`.
- Se conserva la carga por lotes existente para no toparse con el límite de 1.000 filas.

### Representación visual del Excel exportado (pestaña "Validados")

```text
+------+-------------+----------------+---------------+---------------------+
| Tipo | Referencia  | Cant. Validada | Ronda Cierre  | Motivo              |
+------+-------------+----------------+---------------+---------------------+
| MP   | AL324IE     | 653            | 3             | C3=ERP              |
| PP   | CCE125TG    | 1855           | 2             | C2=ERP              |
| MP   | ALTOIMPACTO | 1200           | 5             | superadmin_forced   |
| PT   | NEUTRO6ALET | 200            | 1             | C1=C2               |
+------+-------------+----------------+---------------+---------------------+
```

### Representación visual del Excel exportado (pestaña "Por Ubicación")

```text
+------+-------------+-------------------+--------+--------+--------+--------+--------+----------+
| Tipo | Referencia  | Ubicación         | C1     | C2     | C3     | C4     | Validado | Motivo   |
+------+-------------+-------------------+--------+--------+--------+--------+----------+----------+
| MP   | AL324IE     | Bodega A - Rack 1 | 300    | 300    | 400    |        | 400      | C3=ERP   |
| MP   | AL324IE     | Planta - Línea 2  | 353    | 353    | 253    |        | 253      | C3=ERP   |
| PP   | CCE125TG    | Almacén PT        | 1850   | 1855   | 1855   |        | 1855     | C2=ERP   |
| PP   | CCE125TG    | Planta - Servicio | 5      | 0      | 0      |        | 0        | C2=ERP   |
+------+-------------+-------------------+--------+--------+--------+--------+----------+----------+
```

- La columna "Validado" siempre viene de `validated_counts`.
- La suma de "Validado" por referencia es igual a la "Cant. Validada" de la pestaña anterior.
- En el caso CCE125TG la ubicación "Planta - Servicio" queda con 0, pero el total sigue siendo 1855 porque eso fue lo que coincidió con el ERP.

## 5. Verificación

- Consulta de control: ninguna referencia auditada puede tener suma de `validated_counts` distinta del total registrado en su historial.
- Prueba funcional en el inventario abierto: validar una referencia con 2 ubicaciones por coincidencia de total y confirmar que ambas filas quedan con la cantidad correcta y que la exportación muestra el mismo número.
- Typecheck y build.

## Notas técnicas

- Migración: `CREATE TABLE public.validated_counts` + GRANTs + RLS + políticas + índices + trigger, y `CREATE OR REPLACE FUNCTION public.validate_and_close_round` con la escritura y la verificación de suma.
- No hay datos que migrar: hoy `locations` está vacío en el inventario activo, así que la tabla arranca limpia.
- Archivos frontend a tocar: `src/pages/superadmin/ExportarConteos.tsx`, `src/hooks/useExportToExcel.ts`, `src/pages/superadmin/Auditoria.tsx`.
