# Importador masivo de Ajustes de cierre (MP/PP)

Plantilla revisada: hoja "Ajustes", 180 filas, columnas Referencia | Bodega | Familia | Cantidad_final | Motivo | Soporte | Observacion (incluye casos de "0 ubic.", que crearán ubicación AJUSTE DE CIERRE).

Solo superadmin, solo inventario abierto. No se tocan validate_bucket, erp_bodega_ctl, auto_close_c4 ni la validación manual existente.

## 1. Base de datos (una migración)
- `ajustes_cierre_lotes` y `ajustes_cierre` con los campos pedidos (+ `old_data` en audit_logs vía columna nueva `old_data jsonb`).
- GRANT SELECT a authenticated, ALL a service_role; RLS: lectura `is_superadmin OR is_viewer`; sin políticas de escritura (solo RPC).
- Índice `ajustes_cierre(inventory_id, referencia, bodega)`.

## 2. RPC `aplicar_ajustes_cierre` (SECURITY DEFINER, transacción única)
```sql
CREATE FUNCTION public.aplicar_ajustes_cierre(_inventory_id uuid, _nombre_archivo text, _filas jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE f jsonb; m inventory_master%ROWTYPE; _bod text; _lote uuid; _locs jsonb;
  _tot numeric; _n int; _acc numeric; l record; _q numeric; _round int; _res jsonb := '[]';
  _pref text; _errs jsonb := '[]';
BEGIN
  IF NOT is_superadmin(auth.uid()) THEN RAISE EXCEPTION 'Solo superadmin'; END IF;
  IF (SELECT status FROM inventories WHERE id=_inventory_id) <> 'abierto' THEN
    RAISE EXCEPTION 'Inventario cerrado/histórico'; END IF;
  -- Pasada 1: validar TODO (existencia, familia, regla Control PP, cantidad >=0,
  -- motivo/soporte, duplicados ref+bodega). Si hay errores -> RAISE con lista.
  INSERT INTO ajustes_cierre_lotes(...) VALUES (...) RETURNING id INTO _lote;
  FOR f IN SELECT * FROM jsonb_array_elements(_filas) LOOP
    _bod := f->>'bodega'; _pref := CASE _bod WHEN 'almacen' THEN 'ALM' ELSE 'PL' END;
    -- ubicaciones activas de la bodega con último conteo (C5->C1) y validado previo
    -- si no hay: INSERT locations('AJUSTE DE CIERRE','AJUSTE',activo,terminado,get_bodega_admin(_bod))
    -- reparto proporcional al último conteo; iguales si suma 0; residuo a la última
    -- snapshot anterior -> _locs; upsert validated_counts
    --   reason = _pref||':ajuste_cierre: '||motivo, validated_by = auth.uid(), audit_round
    -- UPDATE locations SET validated_quantity, validated_at_round
    -- UPDATE inventory_master status_alm|status_pl='auditado', count_history || {...}
    -- INSERT ajustes_cierre(...), audit_logs('ajuste_cierre', new_data, old_data)
  END LOOP;
  UPDATE ajustes_cierre_lotes SET aplicadas=... WHERE id=_lote;
  RETURN jsonb_build_object('lote_id',_lote,'filas',_res);
END $$;
```
Las escrituras usan el bypass de superadmin ya existente en los triggers de bloqueo.

## 3. RPC `revertir_ajustes_cierre(_lote_id, _motivo)`
- Motivo obligatorio, superadmin, inventario abierto, lote en estado 'aplicado'.
- Por cada fila (orden inverso): restaurar validated_counts (borrar si no existía antes), locations.validated_quantity/validated_at_round y status_alm/pl anterior; borrar ubicaciones `creada_por_ajuste` solo si no tienen conteos; count_history + audit_logs 'revertir_ajuste_cierre'; lote → 'revertido'.
- Si una referencia tuvo cambios posteriores (otro lote vigente más nuevo), se rechaza indicándolo.

## 4. Pantalla
- Botón "Importar ajustes de cierre" en Dashboard Auditoría (superadmin), diálogo con: plantilla descargable, lectura de primera hoja (encabezados normalizados, coma/punto decimal), previsualización con todas las columnas pedidas, errores que bloquean, advertencias (conflicto/pendiente, >20 %), totales por familia × bodega, confirmación escribiendo "APLICAR".
- Pestaña "Lotes de ajustes": lista, detalle por fila, Revertir con motivo, Exportar a Excel.

## 5. Protección posterior
- Badge "Ajuste de cierre" y motivo/soporte en Ver Historial (AuditoriaBodegaTable).
- Alerta de confirmación antes de Re-validar, Reabrir o Editar conteo si hay ajuste vigente.
- Valorización: `valorizacion_bodega` añade `origen`, `motivo_ajuste`, `soporte_ajuste`; `valorizacion_resumen` añade `valor_ajustes_cierre`; Excel y panel lo muestran.

## Detalles técnicos
- Validación de filas compartida en `src/lib/ajustesCierre.ts` con tests (familia distinta, PP vs Control, duplicados, negativos, reparto exacto con redondeo).
- Antes de aplicar el lote real, se genera respaldo Excel de validated_counts/estados de las referencias afectadas.
- Se probará con tu plantilla de 180 filas en la previsualización.
