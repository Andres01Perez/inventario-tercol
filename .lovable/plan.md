# Unificar nombres de bodega y punto de referencia por bodega

## 1. Un solo "Bodega N" en el filtro
- Corregir los datos guardados: todas las ubicaciones escritas como "BODEGA 1", "bodega 1", "Bodega  1" (espacios de más) pasan a "Bodega 1" (igual para Bodega 2, 3, 5, etc.). Aplica a Almacén y Planta del inventario activo y anteriores.
- Hacia adelante: el sistema normaliza automáticamente el nombre al guardar (importación Excel, "Agregar Nuevo Item", edición), así no vuelve a aparecer duplicado.
- El filtro de ubicaciones de las auditorías mostrará cada bodega una sola vez.
- No se tocan conteos ni validaciones; solo el texto del nombre.

## 2. Un solo punto de referencia por referencia dentro de una bodega
- Para cada referencia, dentro de una misma bodega (ej. BN06.v2 en Bodega 1 con puntos V y T), todas sus filas toman el punto de referencia de la **primera ubicación registrada** (la más antigua).
- Las filas se conservan (no se borran ni fusionan), así los conteos ya guardados en cada una siguen intactos y la suma por referencia no cambia.
- Hacia adelante: si se agrega o importa una ubicación de una referencia que ya existe en esa bodega, se le asigna automáticamente el punto de referencia existente.
- Antes de aplicar, entrego un Excel de respaldo con las filas que cambian (referencia, bodega, punto anterior → punto nuevo).

## Detalles técnicos
- Migración: `UPDATE locations SET location_name = 'Bodega ' || n` normalizando con `regexp_replace(trim(...))` para nombres que coincidan `^bodega\s*(\d+)$` (insensible a mayúsculas); los demás nombres solo se recortan espacios.
- Unificación de punto: `UPDATE locations l SET punto_referencia = f.punto_referencia` desde la fila con menor `created_at` por `(inventory_id, master_reference, location_name)` con punto no nulo.
- Trigger `BEFORE INSERT OR UPDATE` en `locations`: normaliza `location_name` y, si ya existe otra fila con misma referencia/bodega/inventario, fuerza su `punto_referencia`.
- UI: `AuditoriaBodegaTable.tsx` deduplica el listado del filtro (seguridad adicional).
- Backup previo exportado a `/mnt/documents`.
