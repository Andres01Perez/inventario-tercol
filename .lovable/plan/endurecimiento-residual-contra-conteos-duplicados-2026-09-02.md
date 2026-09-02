# Endurecimiento residual contra conteos duplicados

## Contexto

Las causas raíz de los duplicados ya fueron corregidas: restricción única `(location_id, audit_round)` en `inventory_counts`, guardados cambiados de `insert` a `upsert`, trigger que bloquea conteos sobre ubicaciones ya validadas, y botones de guardar que se deshabilitan durante el envío (verificado en `GroupedTranscriptionTab` y `PtTranscriptionTab`).

Este plan cubre solo los riesgos residuales menores.

## Cambios

1. **Mensaje claro ante conflicto de guardado**: si el trigger "ubicación ya validada" rechaza un guardado, mostrar al supervisor un aviso entendible ("Esta ubicación ya fue validada y cerrada, no se puede volver a contar") en lugar de un error técnico genérico. Archivos: `GroupedTranscriptionTab.tsx`, `AddLocationDialog.tsx`, `PtTranscriptionTab.tsx` (PT usa su propio flujo pero el mensaje aplica si se agrega el mismo trigger a `pt_counts`).

2. **Misma protección post-cierre en PT**: agregar trigger equivalente sobre `pt_counts` que impida conteos nuevos en ubicaciones PT ya validadas (hoy solo existe en MP/PP).

3. **Verificación final**: typecheck + prueba de guardado duplicado simulado confirmando que el segundo intento actualiza en vez de duplicar.

## Notas técnicas

- Trigger nuevo: `pt_block_count_on_validated_location()` sobre `pt_counts`, replicando `block_count_on_validated_location()` (sin SECURITY DEFINER, igual que el de MP/PP).
- Sin cambios en datos existentes ni en la lógica de validación de rondas.
