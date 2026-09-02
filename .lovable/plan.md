# Re-validar referencias en las vistas de auditoría

Hoy, cuando una referencia ya quedó validada (por ejemplo con C3=C2), editar un conteo
no vuelve a calcular la validación desde cero: la función de validación ignora las
referencias con estado `auditado`, `cerrado_forzado` o `n/a`, y cuando sí corre, solo
evalúa la ronda vigente. Resultado: si al corregir C1 ese conteo coincide con el ERP,
el sistema sigue mostrando el validado antiguo en lugar del correcto.

## Qué se agrega

Una acción **Re-validar** en el menú de acciones de cada referencia, en las tres vistas
de auditoría (Almacén, Planta y PT), visible para superadmin con el inventario abierto.

Al usarla, el sistema:

1. Borra la validación guardada de esa referencia (cantidades validadas de sus ubicaciones).
2. Vuelve a evaluar la referencia **desde cero** con los conteos que ya existen, sin pedir
   que nadie vuelva a contar.
3. Aplica el orden de prioridad correcto: primero se busca coincidencia con el ERP en la
   ronda más temprana disponible, y solo si no la hay se buscan coincidencias entre
   conteos.
4. Guarda el nuevo validado, la ronda con la que coincidió y el motivo, o deja la
   referencia en conflicto/ronda siguiente si nada coincide.
5. Registra el movimiento en el historial de la referencia y en la bitácora de auditoría.

Diferencia con **Reabrir conteo** (ya existente): reabrir borra la validación y deja la
referencia pendiente para que la vuelvan a contar; re-validar no pide recontar, solo
recalcula con lo que ya está registrado.

### Orden de prioridad al re-validar

1. C1 = ERP
2. C2 = ERP
3. C3 = ERP
4. C4 = ERP
5. C1 = C2
6. C3 = C1 o C3 = C2
7. C4 = C3 o C4 con cualquier otro conteo coincidente

Si ninguna coincide, la referencia queda en conflicto y avanza a la ronda que corresponda
según los conteos existentes (C3 si ya hay C1 y C2, C4 si ya hay C3).

## Detalles técnicos

- Nuevas funciones SECURITY DEFINER: `revalidate_reference(_inventory_id, _reference, _bodega, _user_id)`
  y `pt_revalidate_reference(_inventory_id, _referencia, _user_id)`. Verifican superadmin
  internamente e inventario abierto.
- Cada una: borra filas de `validated_counts` / `pt_validated_counts` de la referencia,
  limpia `validated_quantity` / `validated_at_round` / `terminado` en `locations` /
  `pt_locations`, recalcula sumas por ronda a partir de `inventory_counts` / `pt_counts`
  y aplica el orden de prioridad anterior, escribiendo de nuevo el validado por ubicación
  (proporcional al conteo de la ronda ganadora, igual que hoy hace la validación normal).
- Actualizan `status_alm`/`audit_round_alm` o `status_pl`/`audit_round_pl` en
  `inventory_master`, y `status_slug`/`audit_round` en `pt_master`, más `count_history`
  y `audit_logs` con la acción `revalidacion`.
- UI: entrada de menú `Re-validar` con icono `RefreshCw` y diálogo de confirmación que
  muestra el resultado (ronda ganadora y cantidad validada) en
  `src/components/superadmin/AuditoriaBodegaTable.tsx` y
  `src/components/superadmin/AuditoriaPtTable.tsx`, condicionada a
  `role === 'superadmin' && !isReadOnly`. Tras el RPC se invalidan las queries de
  auditoría y KPI.
- Además, al guardar una edición de conteos desde auditoría se llamará a la nueva función
  de re-validación en lugar de la validación normal, para que la corrección se refleje
  aunque la referencia ya esté auditada.

## Verificación

- Referencia auditada con C3=C2: editar C1 para que coincida con el ERP y re-validar debe
  dejar el validado igual al ERP con ronda C1.
- Referencia sin ninguna coincidencia: re-validar la deja en conflicto en la ronda que
  corresponde, sin validado.
- Un supervisor no ve la acción; un visualizador tampoco.
- Typecheck y build.
