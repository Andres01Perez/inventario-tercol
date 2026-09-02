# Superadmin puede editar conteos aunque estén auditados

Hoy, cuando una ubicación queda validada, un trigger de base de datos bloquea cualquier
INSERT o UPDATE de conteos sobre ella (mensaje "La ubicación ya fue validada..."). Esa
protección se creó para evitar conteos duplicados de los supervisores, pero también deja
al superadmin sin poder corregir ni reabrir nada.

La solución mantiene el bloqueo para supervisores y admins, y abre una excepción
controlada para el superadmin.

## Qué cambia

### 1. Excepción para superadmin en el bloqueo
Los dos triggers (`inventory_counts` y `pt_counts`) dejan pasar la operación cuando el
usuario autenticado es superadmin. Para todos los demás roles el bloqueo sigue igual.

### 2. Acción "Reabrir conteo" en Auditoría Almacén, Planta y PT
Nueva opción en el menú de acciones de cada referencia, visible solo para superadmin y
solo si el inventario está activo:

- Pide confirmación con un motivo escrito.
- Borra la validación guardada de esa referencia (cantidades validadas de sus ubicaciones).
- Limpia en cada ubicación la cantidad validada, la ronda de validación y la marca de
  terminado, dejándola disponible para volver a contar.
- Devuelve la referencia al estado "pendiente" en la ronda que corresponda.
- Registra el motivo en el historial de la referencia y en la bitácora de auditoría.

Tras reabrir, la referencia vuelve a aparecer en la vista de conteo del supervisor
asignado y el flujo normal C1–C4 se reanuda.

### 3. Editar conteos sobre referencias auditadas
El diálogo "Editar conteos" deja de fallar para el superadmin: al guardar, actualiza los
conteos y vuelve a ejecutar la validación de la referencia, recalculando estado, ronda y
cantidad validada. Si el resultado ya no coincide, la referencia pasa a conflicto/C3
automáticamente en vez de quedar auditada con datos viejos.

## Detalles técnicos

- Migración que reemplaza `block_count_on_validated_location()` y
  `pt_block_count_on_validated_location()` con `IF public.is_superadmin(auth.uid()) THEN RETURN NEW; END IF;`
  antes de la comprobación.
- Función `reopen_reference(_inventory_id, _reference, _bodega, _reason, _user_id)` y
  `pt_reopen_reference(_inventory_id, _referencia, _reason, _user_id)`, ambas
  SECURITY DEFINER con verificación interna de superadmin; borran de
  `validated_counts` / `pt_validated_counts`, limpian `locations` / `pt_locations`
  (`validated_quantity`, `validated_at_round`, `terminado`), reinician
  `status_alm` / `status_pl` / `status_slug` y `audit_round`, y añaden la entrada al
  `count_history` más un registro en `audit_logs`.
- UI: nueva entrada de menú y diálogo de motivo en
  `src/components/superadmin/AuditoriaBodegaTable.tsx` y
  `src/components/superadmin/AuditoriaPtTable.tsx`, condicionada a `role === 'superadmin'`
  y `!isReadOnly`; tras el RPC se invalidan las queries de auditoría y KPI.
- El guardado de conteos editados sigue usando upsert con
  `onConflict: 'location_id,audit_round'`, así que la unicidad anti-duplicados se mantiene.

## Verificación

- Con usuario superadmin: editar un conteo de una referencia auditada guarda sin error y
  la referencia se revalida.
- Reabrir una referencia auditada la deja pendiente, sin cantidad validada, y visible de
  nuevo para el supervisor.
- Con usuario supervisor: intentar contar una ubicación validada sigue mostrando el
  mensaje de bloqueo.
- Typecheck y build.
