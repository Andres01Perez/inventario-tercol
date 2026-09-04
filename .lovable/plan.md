# Cerrar como AUDITADO los pendientes de Planta

## Situación actual (verificada en la base de datos)

Inventario activo Semestral 2026-1:

- **Planta: 964 referencias en estado "pendiente"** (único bloque con pendientes).
  - 832 sin ningún conteo registrado (880 de las 964 tienen ERP = 0).
  - 47 con solo Conteo 1.
  - 85 con Conteo 1 y Conteo 2 (pendientes porque alguna ubicación quedó sin contar).
- Almacén no tiene pendientes: 1.423 auditadas con control, 15 en conflicto, 6 críticas, 3 cerradas forzadas.
- Planta conserva además 18 en conflicto y 97 críticas, que **no** se tocan.

## Respaldo (ya generado)

Se descargó el respaldo previo con las 964 referencias pendientes, su ERP de Planta, los totales de Conteo 1 a 4, número de ubicaciones y la cantidad que se va a montar según la regla de proximidad:

`backup_planta_pendientes_2026-09-04.xlsx`

## Cierre a aplicar

Dejar las 964 referencias pendientes de Planta en estado **auditado**, con cantidad a montar guardada de forma permanente (visible en auditoría y en exportaciones).

Regla por referencia:

1. Se comparan los totales físicos de cada conteo (C1, C2, C3, C4) contra el ERP de Planta (Cant.PLd + Cant.PLr).
2. Gana el conteo cuyo total quede **más cerca del ERP**; en empate, el conteo más avanzado.
3. Si C1 y C2 están en cero, queda auditado en **cero**.
4. Si no hay ningún conteo, la cantidad a montar queda en **0**.

Cada ubicación de Planta de la referencia recibe la cantidad de la ronda elegida (0 si esa ubicación no fue contada), de modo que la suma coincide con el total elegido.

Motivo registrado en todas: **"cierre forzado superadmin"**, con el usuario superadmin como responsable.

## Verificación posterior

- Confirmar que Planta queda con 0 referencias en "pendiente".
- Revisar tres casos representativos: sin conteos (0), solo C1, y C1+C2 con distinto valor.
- Comprobar que la exportación de Planta trae la cantidad a montar y el motivo llenos.

## Detalle técnico

- Se actualiza `inventory_master` (bloque Planta) y se escriben validaciones con `upsert_validated_count` por ubicación.
- Ubicaciones de Planta identificadas por `assigned_admin_id` con rol `admin_pp`.
- `status_pl = 'auditado'` y `audit_round_pl` = la ronda elegida.
- No se borra ni modifica ningún registro de `inventory_counts`; las referencias se pueden reabrir o re-validar después desde el panel de superadmin.
