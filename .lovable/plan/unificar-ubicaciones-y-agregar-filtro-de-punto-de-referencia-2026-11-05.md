# Unificar ubicaciones y agregar filtro de Punto de Referencia

## Qué cambia
1. **Auditoría Almacén – Materia Prima:** "ALMACEN - BODEGA 2" y "ALMACEN Y BODEGA 2" quedan como una sola ubicación: **"Almacén - bodega 2"**.
2. **Auditoría Planta – Producto en Proceso:** la ubicación "2" pasa a **"Bodega 2"**.
3. Formato: primera letra en mayúscula y el resto en minúscula para estas ubicaciones (las "Bodega N" ya cumplen).
4. **Nuevo filtro "Punto de referencia"** junto al de ubicación en las auditorías de Planta y Almacén. Muestra solo los puntos que existen para la bodega y familia abiertas, y se combina con el filtro de ubicación (al elegir una bodega, solo aparecen sus puntos).

Los conteos no se tocan; solo cambia el nombre de la ubicación. Antes de cambiar nada se descarga un respaldo en Excel con las filas afectadas (antes y después).

Al unificar, si una referencia queda en la misma bodega con dos puntos distintos, se aplica la regla ya acordada: queda el punto registrado primero.

## Detalles técnicos
- Migración: ampliar `normalize_location_name` para que `^2$` → `Bodega 2` y `ALMACEN (-|Y) BODEGA N` → `Almacén - bodega N`; el trigger existente lo aplica a nuevas ubicaciones. UPDATE de datos en el inventario abierto + reasignación de `punto_referencia` al más antiguo por (referencia, bodega).
- Primero consultar la lista real de nombres distintos para confirmar variantes (espacios, tildes) y contar filas afectadas.
- `AuditoriaBodegaTable.tsx`: estado `puntoFilter`, query de opciones distintas de `punto_referencia` (filtrada por ubicación si aplica), `.eq('punto_referencia', ...)` en las consultas de datos y conteo, incluido en la query key y en la exportación.
