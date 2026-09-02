# Verificación y corrección del guardado de conteos validados

## Resultado de la auditoría (ya verificado contra la base de datos)

### Lo que está correcto
- Los triggers `block_count_on_validated_trg` (INSERT+UPDATE) impiden modificar conteos de ubicaciones ya validadas, en MP/PP y PT.
- `validated_counts` y `pt_validated_counts` tienen unicidad por (inventario, ubicación), razón siempre presente, cero cantidades nulas.
- Coherencia ubicaciones ↔ validated_counts: 0 huérfanos en ambos sentidos. PT está 100% limpio.
- Los RPC (`validate_bucket`, `pt_validate_and_close_round`) verifican que la suma por ubicación sea exactamente igual al total que hizo match antes de cerrar.

### Problemas encontrados
1. **Cierre forzado Almacén/Planta NO guarda valor físico (bug crítico para exportar).** `handleForceClose` en `AuditoriaBodegaTable.tsx` solo cambia el estado del maestro a `cerrado_forzado`: no escribe en `validated_counts` ni en `locations.validated_quantity`. Esas referencias saldrían en la exportación **sin cantidad física validada**. (El cierre forzado de PT sí lo hace bien.)
2. **Validación manual guarda la ronda equivocada.** `handleValidateManually` graba `audit_round = ronda actual del bloque`, aunque el conteo exista en una ronda anterior. Hay 4 filas así: BS225 (guardada en C4, conteos reales hasta C3), PP-ORIGINAL (C4→C3), RESORTE (C3→C1/C2), TAPA4-6RPLASTICA (C3→C1/C2). La cantidad es correcta, pero la ronda que se exportará no corresponde a ningún conteo real.
3. **TAPAKOR (Bodega 7): validado 61.659 vs conteo real 70.659 en C1** (`PL:manual_edit`). Parece una corrección manual deliberada de hoy; la exportación tomará 61.659. Hay que confirmar que fue intencional.

## Trabajo a realizar

### 1. Fix: cierre forzado Almacén/Planta escribe el valor físico
En `AuditoriaBodegaTable.tsx` → `handleForceClose`:
- Para cada ubicación del bloque no validada: tomar el mejor conteo disponible (C5→C4→C3→C2→C1, 0 si no hay) y su ronda.
- Hacer upsert en `validated_counts` con reason `cierre_forzado: <motivo>` y actualizar `locations.validated_quantity` / `validated_at_round`.
- Idéntico al patrón que ya usa el cierre forzado de PT.

### 2. Fix: validación manual usa la ronda real del conteo
En `handleValidateManually` (`AuditoriaBodegaTable.tsx`):
- Calcular por ubicación la ronda del último conteo existente y usarla en `audit_round` (en vez de la ronda actual del bloque).
- Reason se mantiene `ALM:manual_edit` / `PL:manual_edit`.

### 3. Corrección de datos existentes (migración SQL)
- BS225: `audit_round` 4 → 3. PP-ORIGINAL: 4 → 3. RESORTE: 3 → 2. TAPA4-6RPLASTICA: 3 → 2 (ronda más alta con conteo real, cantidad coincide).
- Sincronizar `locations.validated_at_round` con el mismo valor.
- TAPAKOR: **sin tocar** hasta que confirmes si 61.659 fue deliberado.

### 4. Verificación final
- Re-ejecutar las consultas de integridad: deben quedar en 0 los chequeos `vc_sin_conteo_en_ronda` y `vc_qty_distinta_del_conteo` (salvo TAPAKOR si se confirma).
- Confirmar que la exportación Excel lee `validated_counts` con cantidad, ronda y razón correctas.
- Typecheck.

## Detalles técnicos
- Archivos: `src/components/superadmin/AuditoriaBodegaTable.tsx`; 1 migración SQL correctiva.
- No se tocan RPC ni triggers (ya verificados correctos). PT no requiere cambios.
