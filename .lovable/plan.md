# Simplificar modal "Agregar Nuevo Item" en la vista de conteo

## Objetivo
Reducir el modal de agregar referencia (desde la zona de conteo) a solo 5 campos: **Bodega** (predeterminada en Planta, cambiable), **Referencia**, **Ubicación**, **Punto de Referencia** y **Cantidad Encontrada**. La ubicación creada queda asignada al usuario que la crea y con la bodega correctamente asignada (para que las validaciones Almacén/Planta funcionen).

## Cambios en `src/components/supervisor/AddLocationDialog.tsx`

1. **Nuevo campo Bodega** (selector Almacén / Planta):
   - Valor predeterminado: **Planta**.
   - El usuario puede cambiarlo a Almacén antes de guardar.
   - Al guardar, se resuelve `assigned_admin_id` consultando `user_roles` con el rol correspondiente (`admin_pp` para Planta, `admin_mp` para Almacén), igual que ya lo hace `CreateLocationDialog`. Esto evita que las ubicaciones creadas manualmente queden "sin bodega" y bloqueen la validación (el problema que pasó con RESORTE).

2. **Campos que se quedan**:
   - **Referencia**: combobox con búsqueda que solo permite elegir referencias existentes en la maestra del inventario activo (ya valida contra `inventory_master`; no permite escribir referencias libres). Sin cambios.
   - **Ubicación**: texto obligatorio, en mayúsculas (ej: BODEGA3). Sin cambios.
   - **Punto de Referencia**: texto obligatorio (ej: AB, V, S). Sin cambios.
   - **Cantidad Encontrada**: numérica opcional; si se diligencia, guarda el conteo inicial en la ronda actual con `supervisor_id = usuario actual`. Sin cambios.

3. **Campos que se eliminan del formulario**: Subcategoría, Observaciones, Ubicación Detallada y Método de Conteo. Se insertan como `null`.

4. **Asignación al creador** (ya existe, se conserva): `assigned_supervisor_id = user.id`, de modo que el item aparezca de inmediato en la vista de conteo del usuario que lo creó.

5. Al abrir el modal, el formulario se reinicia con Bodega = Planta y los demás campos vacíos.

## Notas técnicas
- No hay cambios de base de datos ni de RLS: `locations` ya tiene todas las columnas y las políticas ya permiten al supervisor insertar.
- Se reutiliza el patrón de resolución de bodega de `CreateLocationDialog` (consulta a `user_roles` + `profiles`).
- El flujo de `discovered_at_round` se mantiene igual (si se agrega en ronda > 1, se marca la ronda de descubrimiento).

## Verificación
- Typecheck sin errores.
- Crear un item desde la vista de conteo con Bodega = Planta y confirmar que: aparece en la lista del supervisor, queda con `assigned_admin_id` del admin de planta y participa en la validación Planta vs Planta.
