# Restaurar los conteos de PT desde el Excel recuperado

## Estado actual (verificado en la base de datos)

- `pt_locations`: 15 ubicaciones (todas del piso 1), `pt_counts`: 0, `pt_validated_counts`: 0, `pt_master`: 408 referencias.
- Inventario abierto: uno solo. Los 5 pisos tienen supervisor asignado en `pt_floor_assignments`.

## Qué trae el Excel

- **Detalle por ubicación** (408 filas): Referencia, Descripción, Piso, Prodc, Ubic, Línea, U.E, C1, C2, C3, C4, Validado, Ronda Validación, Motivo.
- **Resumen por referencia** (414 filas): Ubicaciones, ERP, Total Validado, Descuadre, Estado, Ronda.

Con eso se puede reconstruir: ubicaciones, conteos por ronda, validaciones y el estado de cada referencia. No se puede recuperar qué usuario contó cada ubicación (ese dato no está en el archivo); los conteos quedarán con el supervisor del piso como responsable.

## Plan de restauración (una sola carga controlada, en este orden)

1. **Ubicaciones**: para cada fila del detalle se busca la ubicación existente por la clave `referencia + piso + prodc + ubic + linea`. Si existe (las 15 actuales), se reutiliza su ID y se actualiza U.E; si no existe, se crea con `orden` según el archivo, `activo = true` y el supervisor del piso tomado de `pt_floor_assignments`.
2. **Conteos**: se insertan en `pt_counts` los valores C1–C4 no vacíos de cada ubicación (una fila por ronda), con `supervisor_id` = supervisor del piso. Se respeta la unicidad ubicación+ronda: si ya existiera un conteo, se actualiza en vez de duplicar. Los ceros del archivo se cargan como cero real (no se omiten).
3. **Validaciones**: para las filas con "Validado" y "Ronda Validación", se inserta en `pt_validated_counts` la cantidad, ronda y motivo del archivo, y se marca la ubicación como validada (`validated_at_round`, `validated_quantity`, `terminado`).
4. **Estado de cada referencia**: en `pt_master` se fija `status_slug` y `audit_round` según la hoja Resumen (auditado / pendiente / la ronda correspondiente) y se registra en `count_history` un evento de restauración con la cantidad total validada y el motivo, para dejar trazabilidad de que estos datos vienen de la recuperación del 3 de septiembre.
5. **Verificación**: al terminar se compara contra el Excel el número de ubicaciones, conteos por ronda, validaciones y totales por referencia, y se reportan las diferencias si las hay.

## Consideraciones importantes

- Los triggers que bloquean conteos en ubicaciones validadas y en inventarios cerrados pueden impedir la carga; la restauración se hace en un orden que inserta primero los conteos y después las validaciones, para no chocar con ellos.
- Las referencias del Resumen con 0 ubicaciones (por ejemplo `BN-06` con ERP 1) no tienen detalle en el archivo: se les deja el estado del Resumen, pero sin ubicaciones ni conteos.
- Los estados por ronda `status_c1..c4` de cada ubicación se recalculan como "contado" donde hay conteo, para que la vista de conteo no vuelva a pedir esas ubicaciones.
- Nada de esto toca MP/PP (almacén y planta).

## Detalles técnicos

- Se ejecuta como una carga de datos SQL (no cambia el esquema): `INSERT ... ON CONFLICT` sobre `pt_locations`, `pt_counts` (clave ubicación+ronda) y `pt_validated_counts`, más `UPDATE` sobre `pt_locations` y `pt_master`.
- Los datos del Excel se convierten a sentencias SQL desde el archivo adjunto; los números se cargan como `numeric` sin decimales artificiales.
