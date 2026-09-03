# Recuperar datos de PT y evitar que vuelva a pasar

## Qué pasó (verificado en la base de datos)

- Hoy quedan **15 ubicaciones PT**, **0 conteos PT** y **0 validaciones PT**. La maestra PT sigue completa (408 referencias).
- La importación de ubicaciones PT tiene marcada por defecto la casilla "Reemplazar todas las ubicaciones PT existentes": eso hace un `DELETE` de todas las ubicaciones del inventario.
- `pt_counts` y `pt_validated_counts` tienen llave foránea a `pt_locations` con **ON DELETE CASCADE**, así que al borrar las ubicaciones se borraron en cascada todos los conteos y validaciones.

## Lo que SÍ sobrevivió

`pt_master` conserva el historial por referencia: **393 referencias con historial** y 15 en ronda avanzada. Cada registro guarda ronda, cantidad total validada, ERP y motivo (ej. `C1=ERP`, total 71100). Es decir, **la cantidad validada consolidada por referencia se puede recuperar**; lo que no se puede reconstruir desde ahí es el detalle por ubicación/piso ni quién contó.

## Plan de recuperación (en este orden)

### 1. Restauración del respaldo de Supabase (mejor opción, la haces tú)
En el panel de Supabase → Database → Backups. Si el proyecto tiene PITR, se puede restaurar a un punto justo **antes de las 18:31 UTC de hoy**; si solo hay respaldo diario, se restaura el del día anterior (se perdería lo contado hoy). Recomendación: restaurar a una **rama/proyecto de restauración**, no encima del actual, para extraer solo las tablas `pt_locations`, `pt_counts` y `pt_validated_counts` y volver a insertarlas. Yo te guío con las consultas de extracción e inserción cuando tengas la restauración lista.

### 2. Reconstrucción parcial desde `pt_master` (si no hay respaldo utilizable)
Generar un Excel con: referencia, estado, ronda, cantidad validada, ERP y motivo, tomados de `count_history`. Sirve como respaldo documental y para volver a montar las validaciones a nivel de referencia. El conteo por ubicación habría que volver a levantarlo.

### 3. Blindaje para que no se repita (cambios en la app)
- Quitar la casilla "Reemplazar todo" como valor por defecto; pasar a modo **agregar/actualizar** por defecto.
- Antes de cualquier borrado, contar los conteos existentes; si hay conteos, mostrar un diálogo destructivo que exige escribir **BORRAR** y que informa exactamente cuántos conteos y validaciones se perderán.
- Cambiar el reemplazo para que **no borre ubicaciones que ya tienen conteos**: se actualizan en lugar de eliminarse (upsert por inventario + referencia + piso + ubicación), y solo se eliminan las que quedaron sin uso y sin conteos.
- Opcional recomendado: cambiar la cascada de `pt_counts`/`pt_validated_counts` a `ON DELETE RESTRICT`, de modo que la base de datos impida borrar una ubicación con conteos.

## Detalles técnicos

- Archivos: `src/components/pt/PtLocationsImport.tsx` (flujo de reemplazo y confirmación), y una migración para las llaves foráneas si aprobamos el punto RESTRICT.
- El respaldo/restauración de Supabase no lo puedo ejecutar yo: el proyecto es externo y esa acción se hace desde su panel.

## Decisión que necesito

¿Intentas primero la restauración del respaldo en Supabase (te acompaño con las consultas), o arranco ya con el blindaje y el Excel de reconstrucción desde `pt_master`?
