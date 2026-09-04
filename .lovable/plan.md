# Backup y eliminación de las ubicaciones de Bodega 3 (Paola - Mario B - Danna)

## Qué se verificó

- 156 ubicaciones en `locations` con líder de conteo **Paola - Mario B - Danna (Bodega 3)** (`bodega3@tercol.com.co`), todas del inventario activo.
- Esas ubicaciones tienen **195 conteos** y **61 validaciones** asociadas.
- Cubren **135 referencias**; **134 de ellas también tienen ubicaciones en otros lugares**, así que la referencia NO desaparece del inventario: solo se borran sus ubicaciones de Bodega 3.
- Las llaves foráneas de `inventory_counts` y `validated_counts` hacia `locations` están en **borrado en cascada**, por lo que los conteos y validaciones se eliminan junto con las ubicaciones.

## Paso 1 — Backup (antes de borrar nada)

Se genera un archivo Excel de respaldo con tres hojas:

1. **Ubicaciones** — las 156 filas en el mismo formato de importación (Referencia | Bodega | Subcategoría | Observaciones | Ubicación | Ubicación Detallada | Punto Referencia | Método Conteo | Activo | Terminado).
2. **Conteos** — los 195 conteos: referencia, ubicación, detalle, ronda (C1–C4), cantidad, supervisor y fecha.
3. **Validaciones** — las 61 validaciones: referencia, ubicación, cantidad validada, ronda y motivo.

Se entrega como adjunto descargable antes de ejecutar cualquier borrado.

## Paso 2 — Eliminación (solo Bodega 3 de ese líder)

1. Borrar únicamente esas 156 ubicaciones del inventario activo (filtro: líder de conteo = perfil `bodega3@tercol.com.co`). Sus conteos y validaciones se eliminan en cascada.
2. Re-validar las 135 referencias afectadas en Almacén y Planta con la lógica actual, para que el estado y la ronda queden coherentes con los conteos que quedan.
3. Dejar registro en `audit_logs` de la eliminación (referencia, motivo "reimportación Bodega 3").

Después quedas libre para volver a importar las ubicaciones de Bodega 3 desde cero con la plantilla.

## Notas importantes

- La eliminación es irreversible en base de datos; el respaldo Excel es la única copia de esos conteos, guárdalo.
- No se toca nada de PT, ni las maestras (`inventory_master`), ni ubicaciones de otros líderes o de otras bodegas.

## Detalle técnico

- Filtro: `locations.assigned_supervisor_id = (perfil bodega3@tercol.com.co)` en el inventario abierto.
- Orden: exportar backup → capturar referencias afectadas → `DELETE FROM locations` (cascada) → `revalidate_reference(inventario, referencia, 'almacen'|'planta', usuario)` por cada referencia afectada.
- Sin cambios de esquema ni de código de la aplicación.
