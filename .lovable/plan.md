# Fase 5 — Poder crear ubicaciones desde cero

## Diagnóstico (confirmado)

Consulté la base de datos y el código:

- Inventario activo `Semestral 2026-1`: **2.551 referencias** en maestras (MP + PP), **0 ubicaciones**.
- `inventory_master.assigned_admin_id` está en **null** en las 2.551 referencias.
- `GestionUbicacion.tsx` y `GestionResponsables.tsx` consultan **desde `locations`** con `inventory_master!inner(...)`.

Conclusión: **no es un bloqueo intencional ni un error de importación**. Las páginas listan ubicaciones, no referencias. Si una referencia no tiene ninguna ubicación, nunca aparece, así que es imposible crear la primera ubicación a mano. Hoy solo el import de ubicaciones por Excel puede crearlas.

Y no, **no depende de que "un admin importe las maestras"**: las maestras no asignan `assigned_admin_id`. La bodega (Almacén / Planta) se define en **cada ubicación** vía `locations.assigned_admin_id` (admin_mp = Almacén, admin_pp = Planta), tal como quedó en la Fase 3.

## Qué se va a construir

1. **Listar desde `inventory_master`, no desde `locations`**
   - La consulta principal parte de `inventory_master` filtrada por `inventory_id`, con las ubicaciones como relación opcional (left join).
   - Una referencia sin ubicaciones se muestra con la etiqueta **"Sin ubicaciones"** y un botón **"Agregar ubicación"**.
   - Se conservan los filtros actuales (tipo, subcategoría, ubicación, observación, supervisor) y la paginación; los filtros que aplican a campos de ubicación pasan a filtrar solo referencias que sí tengan ubicaciones.

2. **Alta manual de ubicación**
   - Diálogo con: nombre de ubicación, detalle, punto de referencia, método de conteo, subcategoría, observaciones, supervisor.
   - **Bodega obligatoria** cuando el usuario es superadmin: elegir Almacén o Planta. Eso fija `assigned_admin_id` al admin correspondiente (`admin_mp` → Alejandra Londoño, `admin_pp` → Edison Vallejo); si hubiera varios admins de ese tipo, se muestra un selector.
   - Si quien crea es admin_mp o admin_pp, `assigned_admin_id` se fija automáticamente a su propio id (sin preguntar).
   - Siempre se guarda `inventory_id` explícito del inventario activo.

3. **Misma corrección en Gestión de Responsables**
   - La vista parte de `inventory_master` para que las referencias sin ubicación se vean; asignar supervisor desde ahí crea/actualiza la ubicación con su bodega.

4. **Solo lectura en inventarios cerrados**
   - Los botones de crear/editar quedan deshabilitados cuando el inventario seleccionado no está abierto (respeta `ReadOnlyBanner`).

## Detalles técnicos

- Sin cambios de base de datos. `locations` ya tiene `inventory_id`, `assigned_admin_id` y las políticas RLS necesarias.
- Consulta: `from('inventory_master').select('referencia, material_type, control, locations(...)', { count: 'exact' }).eq('inventory_id', inventoryId)`, ordenada por `referencia`, con `.range()` para paginar.
- El filtro de Almacén para admin_mp sigue siendo `control is not null`, igual que hoy.
- Archivos: `src/pages/admin/GestionUbicacion.tsx`, `src/pages/admin/GestionResponsables.tsx` y, si hace falta, un diálogo nuevo reutilizable para crear ubicación.
