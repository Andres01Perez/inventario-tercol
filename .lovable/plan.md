# Por qué el punto AB (Bodega 3) solo muestra 22 ítems en Conteo 1

## Qué encontré

David Gomez (Bodega 5) tiene 57 ubicaciones asignadas en el inventario activo, 50 de ellas en Bodega 3 / punto AB. Ninguna tiene conteo C1 registrado, pero en la pantalla solo aparecen 22.

La razón no es la ubicación: es el estado del bloque **Planta** de la referencia.

- 22 ubicaciones pertenecen a referencias cuyo bloque Planta sigue en `pendiente`, ronda 1 → se ven en Conteo 1.
- 35 ubicaciones pertenecen a referencias cuyo bloque Planta ya está `auditado` (o pasó a ronda 3 / `conflicto`) → la pantalla de conteo las oculta, porque para esa referencia Planta ya cerró o ya no está en ronda 1.

Esto pasó porque cuando se borraron y volvieron a importar las ubicaciones de Bodega 3, las referencias cerraron su bloque de Planta con las ubicaciones que quedaban (las de otras bodegas). Al reimportar Bodega 3, la ubicación nueva llega a una referencia que ya está cerrada, así que nunca entra a la lista de C1.

Ejemplos: BN12, CN08-75PG, PUERTA-4-75P (auditado en ronda 1) y DF30R.v2, T-CE2525, LCT4020 (ronda 3, conflicto).

## Propuesta

Reabrir en ronda 1 el bloque **Planta** de las referencias que tienen ubicaciones reimportadas sin contar, para que vuelvan a aparecer en Conteo 1:

1. Identificar las referencias del inventario activo que tienen al menos una ubicación de Planta sin conteo en la ronda vigente de su bloque y cuyo bloque Planta está `auditado`, en `conflicto` o en ronda mayor a 1.
2. Para esas referencias: borrar sus validaciones de Planta (`validated_counts` del bloque Planta), poner `audit_round_pl = 1` y `status_pl = 'pendiente'`, y limpiar el estado de ronda de sus ubicaciones de Planta.
3. Conservar intactos los conteos ya digitados (`inventory_counts`) de las ubicaciones que sí se contaron: al revalidar, esos conteos se vuelven a usar.
4. Registrar la operación en `audit_logs` con el motivo "reapertura por reimportación de Bodega 3".
5. Al terminar el conteo, revalidar las referencias afectadas para que cierren con el total completo (Bodega 3 incluida).

No se toca Almacén, ni PT, ni las maestras, ni ubicaciones de otras bodegas.

## Alcance a confirmar

Puedo hacerlo de dos formas:

- **Solo las 35 ubicaciones de David Gomez** (mínimo riesgo, resuelve lo que estás viendo ahora).
- **Todas las ubicaciones reimportadas de Bodega 3** que estén en la misma situación (más completo; evita que el mismo problema aparezca con otros líderes).

## Verificación

- Conteo 1 de David Gomez debe pasar de 22 a 57 ubicaciones visibles.
- Ninguna referencia debe perder conteos ya digitados.
- Consulta de control: cero ubicaciones de Planta sin contar en referencias con bloque Planta cerrado.
