# Editar la Referencia en Ubicaciones PT

## Objetivo
En la vista **Ubicaciones PT**, el diálogo de edición de cada ubicación hoy solo permite cambiar la U.E y el Líder de conteo. Se agrega la posibilidad de corregir la **Referencia**, para casos de errores de digitación en la importación.

## Punto clave
La columna `referencia` de `pt_locations` tiene una llave foránea hacia `pt_master.referencia`. Esto significa que la nueva referencia **debe existir en la maestra PT**; si no existe, la base de datos rechazaría el cambio. Por eso el diálogo validará contra la maestra antes de guardar.

## Cambios

### `src/pages/pt/UbicacionesPT.tsx`
1. **Nuevo campo "Referencia"** en el diálogo de edición, prellenado con la referencia actual.
2. **Validación al guardar:**
   - No puede quedar vacía.
   - Se verifica contra la maestra PT (`pt_master`) del inventario seleccionado: si la referencia escrita no existe, se muestra un mensaje claro ("La referencia no existe en la maestra PT") y no se guarda.
   - Se normaliza con trim y se compara sin importar mayúsculas/minúsculas.
3. **Guardado**: el update a `pt_locations` incluye `referencia` además de `ue` y `assigned_supervisor_id`.
4. Los conteos ya registrados para esa ubicación se conservan, porque están amarrados al `id` de la ubicación, no al texto de la referencia.

## Verificación
- Typecheck sin errores.
- Prueba manual en la vista: cambiar una referencia por otra existente en la maestra y confirmar que se guarda; intentar con una inexistente y confirmar que se bloquea con mensaje.
