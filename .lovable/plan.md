# Re-validar referencias atascadas en conflicto (Planta)

## Diagnóstico (ya confirmado en base de datos)

En la vista de Auditoría Planta hay referencias en "Conflicto" cuyos conteos C1 y C2 sí coinciden. Cada una tiene dos ubicaciones: una de Planta (Bodega 2, admin_pp) y una de Almacén (admin_mp). El bloque Almacén ya cerró auditado; el conflicto es solo del bloque Planta.

- **CAJA18RTG.v2**: Planta ERP=1, C1=0, C2=0 → coinciden, pero fue evaluada antes de la corrección que acepta coincidencias en cero con ERP positivo. Atascada.
- **CAJA8-95G**: Planta ERP=10, C1=0, C2=0 → mismo caso. Atascada.
- **CAJA6-125G**: Planta ERP=0, C1=16, C2=15 → conflicto legítimo (los conteos no coinciden). No se toca; sigue su ciclo normal en C3.

## Acción

1. Buscar todas las referencias del inventario activo con `status_pl = 'conflicto'` (o `status_alm`) cuyos C1 y C2 del bloque sean iguales, y ejecutar `revalidate_reference` para cada bloque afectado — no solo las dos vistas en pantalla, por si hay más atascadas del mismo período.
2. Resultado esperado: las que tengan C1=C2 quedan `auditado` con la cantidad coincidente y su descuadre contra ERP visible; las que realmente no coinciden (como CAJA6-125G) permanecen en conflicto sin cambios.
3. Cada re-validación queda registrada en el historial de la referencia y en la bitácora.

## Detalles técnicos

- Consulta de detección: bloques en conflicto donde `SUM(C1) = SUM(C2)` por bodega en el inventario activo.
- Se usa el RPC existente `revalidate_reference(_inventory_id, _reference, _bodega, _user_id)` por cada caso; sin cambios de esquema ni de código.
- Verificación: consulta de control confirmando 0 bloques en conflicto con C1=C2.
