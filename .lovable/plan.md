# Limpieza de datos de prueba y eliminación de la vista intermedia de Auditoría

## 1. Borrar los datos de prueba

Eliminar del inventario abierto (`Semestral 2026-1`) todo lo creado para la Fase 6 con prefijo `QA-`:

- validaciones persistidas de esas referencias,
- conteos C1–C4 de sus ubicaciones,
- las 1.310 ubicaciones `QA-`,
- las 6 referencias `QA-` de la maestra.

Las 2.551 referencias reales importadas (MP y PP) no se tocan. Al terminar, el inventario queda con 0 ubicaciones, 0 conteos y 0 validaciones, listo para arrancar limpio.

## 2. Eliminar la vista intermedia `/superadmin/auditoria`

Se mantienen los dos botones del dashboard (Auditoría Almacén y Auditoría Planta) y se elimina la pantalla selectora intermedia:

- Borrar `src/pages/superadmin/Auditoria.tsx`.
- Quitar su import y su ruta `/superadmin/auditoria` en `src/App.tsx` (las rutas `/almacen` y `/planta` se conservan).
- Cambiar el botón "Volver" de Auditoría Almacén y Auditoría Planta para que regrese al dashboard (`/dashboard`) en lugar de la vista eliminada.

Los botones del dashboard ya navegan directamente a cada bodega, así que no hay cambios en `UnifiedDashboard.tsx`.

## Detalles técnicos

- El borrado se hace con sentencias de datos filtrando por `inventory_id` del inventario abierto y `master_reference LIKE 'QA-%'`, respetando el orden de dependencias (validaciones → conteos → ubicaciones → maestra).
- Tras los cambios de código se ejecutan typecheck y build.
