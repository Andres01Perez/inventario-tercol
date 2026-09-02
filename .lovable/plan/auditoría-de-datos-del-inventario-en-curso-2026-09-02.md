# Auditoría de datos del inventario en curso

Revisé los datos reales del inventario activo (2.903 ubicaciones, 606 conteos, 31 validaciones consolidadas). El motor de validación está funcionando bien; hay **un solo problema real** y afecta a 15 referencias del lado Planta.

## Lo que está correcto (verificado)

| Verificación | Resultado |
|---|---|
| Almacén y Planta se comparan por separado | Correcto: ERP Almacén usa `Cant.Alm`; ERP Planta usa `Cant.PLd + Cant.PLr` |
| Referencias cerradas sin fila en `validated_counts` | 0 |
| Cantidad validada de la ubicación vs. la persistida | 0 desalineadas |
| Conteos duplicados en la misma ronda/ubicación | 0 |
| Ubicaciones sin bodega (bloquearían la validación) | 0 |
| Referencias con C1 y C2 completos que quedaron sin evaluar | 0 |
| Escalamiento a C3 | Correcto en los 4 casos existentes |

Ejemplos de escalamiento verificados (Almacén, pasaron a Conteo 3 como debe ser):

| Referencia | ERP | C1 | C2 | Resultado |
|---|---|---|---|---|
| ABS | 0 | 0 | 3 | → C3 (conflicto) |
| ALE8DE | 1.214 | 1.220 | 1.210 | → C3 (conflicto) |
| ALE8IE | 1.234 | 1.241 | 1.239 | → C3 (conflicto) |
| BISAGRAG | 27.925 | 25.122 | 25.120 | → C3 (conflicto) |

También es correcto que varias referencias cerraran por `C1=C2` con diferencia frente al ERP (ej. ALE12DE: ERP 1.676, contado 1.806): ese es el descuadre que el inventario debe reportar, no un error.

## El problema encontrado: 15 bloques de Planta cerrados antes de tiempo

Cuando se validó por primera vez esas referencias, **todavía no tenían ubicaciones asignadas a Planta**. La función marcó el bloque como:

- `n/a` (ERP planta = 0 y sin ubicaciones) → 3 referencias
- `critico` (ERP planta > 0 y sin ubicaciones) → 12 referencias

Después se les asignaron ubicaciones de Planta, pero esos estados son "bloque cerrado": la validación los salta y **nunca volverá a evaluarlos**. Ya hay **8 ubicaciones con conteo cargado que nunca se van a validar ni a exportar**.

Referencias afectadas: AESTRIADAT, ALTOIMPACTO, Antillama, Carbonato de Calcio, CCGRANDE, MBBLANCO, MBNEGRO, PC-ORIGINAL, PP-GRIS, PP-VERDE, R2TPEM-H, TTP04-G-BOX, R4TPEM-H, TE04-COVER, TTP04-BOX.

Del lado Almacén el mismo chequeo dio 0 casos.

## Corrección propuesta

1. **Reabrir los 15 bloques de Planta**: poner `status_pl = 'pendiente'` y `audit_round_pl = 1` solo en las referencias que hoy están en `n/a`/`critico` en ronda 1 y que sí tienen ubicaciones de Planta activas sin validar. No se toca ninguna referencia auditada ni ningún conteo ya guardado.
2. **Evitar que vuelva a pasar**: ajustar `validate_bucket` para que los estados `n/a` y `critico` en ronda 1 no se traten como bloque cerrado — si al validar aparecen ubicaciones activas sin validar, el bloque se reevalúa normalmente. Los cierres reales (`auditado`, `cerrado_forzado`) siguen intactos.
3. **Reejecutar la validación** de esas 15 referencias para que los 8 conteos existentes entren al flujo normal (cierre si coinciden, o paso a C3).

## Detalle técnico

- Migración con un `UPDATE` acotado sobre `inventory_master` (filtrado por `inventory_id` activo, `status_pl in ('n/a','critico')`, `audit_round_pl = 1` y existencia de ubicación de Planta activa con `validated_at_round is null`).
- `CREATE OR REPLACE FUNCTION public.validate_bucket(...)`: el early-return por bloque cerrado deja de incluir `n/a`/`critico` cuando quedan ubicaciones activas sin validar en ese bloque.
- Sin cambios de frontend y sin tocar el flujo PT.

## Verificación posterior

- Contar de nuevo bloques cerrados con ubicaciones pendientes: debe dar 0 en Almacén y en Planta.
- Confirmar que las 31 referencias auditadas y sus `validated_counts` quedan idénticas.
- Confirmar que las 4 referencias en C3 siguen en C3.
