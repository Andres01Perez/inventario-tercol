# Fase 3 — Validación almacén vs planta

Hoy la referencia se valida contra un único total (`cant_total_erp`) y toda la referencia avanza de ronda junta. Con este cambio la referencia se valida en **dos bloques independientes**: almacén contra almacén y planta contra planta. Quien cuadra deja de contar; solo el bloque descuadrado sigue a C3/C4.

## Reglas confirmadas

- **Bodega de una ubicación** = rol del admin dueño de la ubicación (`locations.assigned_admin_id`):
  - `admin_mp` → **Almacén**
  - `admin_pp` → **Planta**
  - No se agrega columna `bodega` ni se toca el importador de ubicaciones: se deduce en la base de datos.
- **ERP por bodega**:
  - Almacén = `Cant.Alm` (`cant_alm_mp` para MP, `cant_alm_pp` para PP)
  - Planta = `Cant.PLd` + `Cant.PLr`
  - `Cant.ZA` se ignora en la comparación por bodega (sigue existiendo en el total general).
- **Bloque sin ubicaciones pero con ERP > 0** → descuadre: ese bloque no puede cerrar solo, queda en conflicto/crítico.
- **Bloque con ERP = 0 y sin ubicaciones** → no existe, no bloquea nada.
- **Cada bodega cierra por separado**: almacén puede quedar cerrado en C2 mientras planta sigue en C3. La referencia solo se ve como auditada cuando ya no queda ningún bloque abierto.
- Las reglas de coincidencia no cambian: C1=C2, C1=ERP, C2=ERP, C3=C1/C2/ERP, C4=C1/C2/C3/ERP, C5 forzado por superadmin — pero aplicadas **dentro de cada bloque**.

## 1. Estado por bodega en la maestra

`inventory_master` gana cuatro campos: ronda y estado de almacén, ronda y estado de planta. Se conservan `audit_round` y `status_slug` como campos derivados (ronda = la del bloque más atrasado; estado = el peor de los dos) para que ninguna vista existente se rompa.

```text
+-------------+------+---------+---------+----------+-------------+------------+------------+-------------+------------+
| referencia  | tipo | ERP Alm | ERP Pl  | ERP Tot  | ronda_alm   | estado_alm | ronda_pl   | estado_pl   | status_slug|
+-------------+------+---------+---------+----------+-------------+------------+------------+-------------+------------+
| AL324IE     | MP   | 400     | 253     | 653      | cerrada     | auditado   | 3          | conflicto   | conflicto  |
| CCE125TG    | PP   | 1855    | 0       | 1855     | cerrada     | auditado   | -          | n/a         | auditado   |
| TORN-08     | MP   | 0       | 120     | 120      | -           | n/a        | 1          | pendiente   | pendiente  |
| CANDADO-X   | MP   | 500     | 300     | 800      | 1           | pendiente  | 1          | pendiente   | pendiente  |
+-------------+------+---------+---------+----------+-------------+------------+------------+-------------+------------+
```

## 2. Cómo se deduce la bodega

Una función en base de datos resuelve la bodega de cada ubicación cruzando `locations.assigned_admin_id` con `user_roles`. Además se crea una vista de solo lectura sobre `locations` que expone, para cada ubicación: su bodega, la ronda vigente de esa bodega y si ya está validada. Esa vista es lo que consultan las pantallas de conteo, para que cada ubicación muestre la ronda de **su** bloque y no la de la referencia.

Ubicaciones sin admin asignado no se pueden clasificar: se reportan explícitamente como "sin bodega" y bloquean el cierre de la referencia con un mensaje claro, en vez de asignarse a un bloque al azar.

## 3. Reescritura de `validate_and_close_round`

La función pasa a ejecutarse **dos veces internamente**, una por bloque, y devuelve el resultado de ambos:

Para cada bloque (almacén, planta):
1. Se calcula el ERP del bloque y las sumas C1–C4 **solo** de las ubicaciones de ese bloque.
2. Si el bloque ya está cerrado, se salta.
3. Si el bloque no tiene ubicaciones y su ERP es 0, se salta.
4. Si el bloque no tiene ubicaciones y su ERP es mayor que 0, se marca descuadre y el bloque queda en crítico.
5. Se espera a que **todas las ubicaciones de ese bloque** estén contadas en la ronda vigente del bloque (ya no se espera a la otra bodega).
6. Se aplica la misma cascada de coincidencias de hoy (match por total del bloque y, si no, match ubicación por ubicación), incluida la verificación de Fase 2: la suma de lo que se guarda por ubicación debe ser igual al total que hizo match.
7. Si cuadra: las ubicaciones del bloque se persisten en `validated_counts` y el bloque se cierra.
8. Si no cuadra: solo ese bloque avanza de ronda (1→3→4→5).

Los motivos guardados en `validated_counts` se prefijan con la bodega para que la exportación y la auditoría sepan de dónde viene cada cierre: `ALM:C1=C2`, `PL:C3=ERP`, `ALM:superadmin_forced`, etc.

La respuesta del RPC pasa a tener esta forma:

```text
{
  "success": true,
  "almacen": { "action": "closed",     "reason": "C1=C2", "total": 400 },
  "planta":  { "action": "next_round", "new_round": 3, "pending_locations": 2 },
  "reference_status": "conflicto"
}
```

## 4. Efecto en el conteo (C1–C4)

- Un supervisor con ubicaciones de almacén cuyo bloque ya cerró **deja de ver esas ubicaciones** en C3/C4, aunque la referencia siga abierta por planta.
- La lista de conteo filtra por la ronda del bloque de cada ubicación (vía la vista del punto 2), no por `audit_round` de la referencia.
- El resto del flujo (turnos por ronda, auto-validación al guardar, tiempo real) queda igual.

## 5. Auditoría y exportaciones

- No se agrega el desglose visual de descuadre por bodega (queda para más adelante, según lo pediste).
- La auditoría sigue funcionando con los campos derivados; solo se ajusta para no romperse con los nuevos estados.
- Las exportaciones ya leen de `validated_counts` (Fase 2), así que heredan automáticamente el motivo con prefijo de bodega.

## 6. Verificación

- Consulta de control: para cada referencia cerrada, la suma validada de almacén debe ser igual al ERP de almacén (o justificada por match entre conteos), e igual para planta.
- Typecheck y build.
- Prueba funcional con referencias multi-ubicación mixtas: la haces tú.

## Notas técnicas

- Migración: columnas `audit_round_alm`, `status_alm`, `audit_round_pl`, `status_pl` en `inventory_master` (backfill desde los valores actuales); función `get_location_bodega`; vista `locations_bodega_view` con `security_invoker`; reescritura de `public.validate_and_close_round` con bucle por bloque; helper interno para el ERP por bodega según `material_type`.
- Frontend: `GroupedTranscriptionTab.tsx` (filtro por ronda de bloque usando la vista), `Auditoria.tsx` (lectura de estados por bodega sin romper la vista actual), `Criticos.tsx` y `UnifiedDashboard.tsx` (conteos por estado derivado).
- Sin cambios en `locationsParser.ts` ni en el importador de ubicaciones.
