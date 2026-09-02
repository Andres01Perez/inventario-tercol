# NEUTRO18T en conflicto: conteos duplicados en la misma ubicación

## Qué está pasando (confirmado en la base de datos)

NEUTRO18T tiene **una sola ubicación** de almacén (ALMACEN - BODEGA 2) con estos conteos guardados:

| Ronda | Cantidad guardada | Hora |
|---|---|---|
| C1 | 269 | 17:06 |
| C2 | **2290** | 17:06:39 |
| C2 | **269** | 17:06:49 |

Hay **dos registros de C2** para la misma ubicación: primero se guardó 2290 (aparentemente un error de digitación) y 10 segundos después se guardó 269. El sistema no reemplazó el primero, guardó los dos.

Como la validación suma todos los conteos de la ronda, para el sistema C2 = 2290 + 269 = **2559**, que no coincide ni con C1 (269) ni con el ERP (268). Por eso quedó en Conflicto y pasó a C3. La tabla de auditoría muestra "269" en C2 porque ahí se ve el último valor, no la suma — de ahí la confusión.

Causa raíz: la tabla `inventory_counts` **no tiene restricción de unicidad** por (ubicación, ronda) y el guardado hace `insert` en vez de `upsert`. La tabla equivalente de PT (`pt_counts`) sí la tiene, por eso PT no sufre este problema.

## Alcance del problema hoy

Hay **9 ubicaciones con conteos duplicados** en el inventario actual. Dos afectan resultados reales:

- **NEUTRO18T** (C2: 2290 + 269) → conflicto indebido, ronda C3
- **T3162CM** (C1: 20326 + 60975) → conflicto indebido, ronda C3

Las otras 7 son duplicados con valor 0 o repetido que ya cerraron como "auditado" (incluye TIERRA6RT, con C2 440 y 46, que sí conviene revisar).

## Plan de corrección

1. **Limpiar duplicados existentes**: conservar el registro más reciente por (ubicación, ronda) y borrar los anteriores.
2. **Impedir que vuelva a ocurrir**: agregar restricción única `(location_id, audit_round)` en `inventory_counts`, igual que en `pt_counts`.
3. **Cambiar el guardado a upsert**: en todas las rutas que escriben conteos (transcripción agrupada, alta de ubicación, referencias críticas y edición desde auditoría), guardar con `onConflict: 'location_id,audit_round'` para que reescribir un conteo lo actualice en lugar de duplicarlo.
4. **Reabrir y revalidar los bloques afectados**: devolver NEUTRO18T y T3162CM a la ronda correcta y correr la validación de nuevo con los datos limpios.
   - NEUTRO18T: con C1 = C2 = 269 quedará **auditado** con 269 validadas. Seguirá mostrando descuadre de +1 unidad frente al ERP (268), que es un descuadre real de inventario, no un error del sistema.
   - T3162CM: se revalidará con el valor correcto de C1; si sigue sin coincidir, continuará su ciclo normal.
5. **Revisar TIERRA6RT** y las demás referencias con duplicados ya cerradas, para confirmar que la cantidad validada quedó con el valor correcto y corregirla si no.

## Detalles técnicos

- Migración: `DELETE` de duplicados por `created_at` + `ALTER TABLE public.inventory_counts ADD CONSTRAINT inventory_counts_unique UNIQUE (location_id, audit_round)`.
- Archivos a ajustar: `src/components/supervisor/GroupedTranscriptionTab.tsx`, `src/components/supervisor/AddLocationDialog.tsx`, `src/components/superadmin/CriticalReferenceCard.tsx`, `src/components/superadmin/AuditoriaBodegaTable.tsx`.
- Reapertura puntual: poner `audit_round_alm = 1` y `status_alm = 'pendiente'` para las dos referencias y ejecutar `validate_and_close_round`; sin cambios en la lógica de la función.
