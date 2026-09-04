# Eliminar las ubicaciones de Bodega 3 (Paola - Mario B - Danna)

## Qué se verificó

- 156 ubicaciones en `locations` con líder de conteo **Paola - Mario B - Danna (Bodega 3)** (`bodega3@tercol.com.co`), todas del inventario activo.
- Esas ubicaciones tienen **195 conteos** y **61 validaciones** asociadas.
- Cubren **135 referencias**; **134 de ellas también tienen ubicaciones en otros lugares**, así que la referencia NO desaparece del inventario: solo se borran sus ubicaciones de Bodega 3.
- Las llaves foráneas de `inventory_counts` y `validated_counts` hacia `locations` están en **borrado en cascada**, por lo que los conteos y validaciones de esas 156 ubicaciones se eliminan junto con ellas.

## Qué se va a hacer

1. Borrar las 156 ubicaciones de Bodega 3 (líder Paola - Mario B - Danna) del inventario activo. Sus 195 conteos y 61 validaciones se van con ellas.
2. Recalcular el estado de las 135 referencias afectadas: como se eliminan conteos/validaciones, se **re-valida** cada referencia en Almacén y Planta con la lógica actual, para que el estado y la ronda queden coherentes con los conteos que quedan.
3. Dejar registro en `audit_logs` de la eliminación (referencia, motivo "reimportación Bodega 3").

Después quedarás libre para volver a importar las ubicaciones de Bodega 3 desde cero con la plantilla.

## Notas importantes

- Es **irreversible**: los conteos hechos en esas 156 ubicaciones se pierden. Ya tienes el Excel exportado con las 156 filas en formato de importación por si quieres volver a cargarlas tal cual.
- No se toca nada de PT, ni las maestras (`inventory_master`), ni las ubicaciones de otros líderes.

## Detalle técnico

- Filtro: `locations.assigned_supervisor_id = (perfil bodega3@tercol.com.co)` en el inventario abierto.
- Orden: capturar la lista de referencias afectadas → `DELETE FROM locations` (cascada) → `revalidate_reference(inventario, referencia, 'almacen'|'planta', usuario)` por cada referencia afectada.
