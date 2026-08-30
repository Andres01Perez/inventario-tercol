CREATE OR REPLACE FUNCTION public.validate_bucket(_inv uuid, _reference text, _bodega text, _admin_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_master RECORD;
  v_round INTEGER;
  v_status TEXT;
  v_erp NUMERIC;
  v_loc_count INTEGER;
  v_missing INTEGER;
  v_prefix TEXT;
  v_sum_c1 NUMERIC; v_sum_c2 NUMERIC; v_sum_c3 NUMERIC; v_sum_c4 NUMERIC;
  v_matched_round TEXT := NULL;
  v_matched_total NUMERIC := NULL;
  v_location RECORD;
  v_location_quantity NUMERIC;
  v_location_round INTEGER;
  v_location_reason TEXT;
  v_sum_to_save NUMERIC := 0;
  v_sum_validated NUMERIC := 0;
  v_all_validated BOOLEAN := TRUE;
  v_pending INTEGER := 0;
  v_validated INTEGER := 0;
  v_count_c1 NUMERIC; v_count_c2 NUMERIC; v_count_c3 NUMERIC; v_count_c4 NUMERIC; v_count_c5 NUMERIC;
  v_discovered INTEGER;
  v_new_round INTEGER;
  v_new_status TEXT;
  v_result JSONB;
BEGIN
  SELECT * INTO v_master FROM inventory_master WHERE referencia = _reference AND inventory_id = _inv;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Referencia no encontrada');
  END IF;

  v_prefix := CASE WHEN _bodega = 'planta' THEN 'PL:' ELSE 'ALM:' END;

  IF _bodega = 'planta' THEN
    v_round := v_master.audit_round_pl;
    v_status := v_master.status_pl;
  ELSE
    v_round := v_master.audit_round_alm;
    v_status := v_master.status_alm;
  END IF;

  IF v_status IN ('auditado', 'cerrado_forzado', 'n/a') THEN
    RETURN jsonb_build_object('success', true, 'action', 'skipped', 'reason', 'bloque_cerrado', 'status', v_status);
  END IF;

  v_erp := public.erp_bodega(v_master.material_type, v_master.cant_alm_mp, v_master.cant_alm_pp, v_master.cant_pld, v_master.cant_plr, _bodega);

  SELECT COUNT(*) INTO v_loc_count
  FROM locations l
  WHERE l.master_reference = _reference AND l.inventory_id = _inv
    AND public.location_bodega(l.assigned_admin_id) = _bodega;

  IF v_loc_count = 0 THEN
    IF v_erp = 0 THEN
      IF _bodega = 'planta' THEN
        UPDATE inventory_master SET status_pl = 'n/a' WHERE referencia = _reference AND inventory_id = _inv;
      ELSE
        UPDATE inventory_master SET status_alm = 'n/a' WHERE referencia = _reference AND inventory_id = _inv;
      END IF;
      RETURN jsonb_build_object('success', true, 'action', 'skipped', 'reason', 'sin_erp_ni_ubicaciones');
    ELSE
      IF _bodega = 'planta' THEN
        UPDATE inventory_master SET status_pl = 'critico' WHERE referencia = _reference AND inventory_id = _inv;
      ELSE
        UPDATE inventory_master SET status_alm = 'critico' WHERE referencia = _reference AND inventory_id = _inv;
      END IF;
      RETURN jsonb_build_object('success', true, 'action', 'descuadre_sin_ubicaciones', 'erp', v_erp);
    END IF;
  END IF;

  -- El bloque solo se evalúa cuando TODAS sus ubicaciones pendientes ya fueron contadas
  SELECT COUNT(*) INTO v_missing
  FROM locations l
  WHERE l.master_reference = _reference AND l.inventory_id = _inv
    AND public.location_bodega(l.assigned_admin_id) = _bodega
    AND l.validated_at_round IS NULL
    AND (
      CASE
        WHEN v_round = 1 AND COALESCE(l.discovered_at_round, 1) = 2 THEN
          NOT EXISTS (SELECT 1 FROM inventory_counts ic WHERE ic.location_id = l.id AND ic.audit_round = 2)
        WHEN v_round = 1 THEN
          NOT EXISTS (SELECT 1 FROM inventory_counts ic WHERE ic.location_id = l.id AND ic.audit_round = 1)
          OR NOT EXISTS (SELECT 1 FROM inventory_counts ic WHERE ic.location_id = l.id AND ic.audit_round = 2)
        ELSE
          NOT EXISTS (SELECT 1 FROM inventory_counts ic WHERE ic.location_id = l.id AND ic.audit_round = v_round)
      END
    );

  IF v_missing > 0 THEN
    RETURN jsonb_build_object('success', false, 'action', 'waiting_for_counts', 'round', v_round, 'missing_locations', v_missing);
  END IF;

  SELECT
    COALESCE(SUM(CASE WHEN ic.audit_round = 1 THEN ic.quantity_counted END), 0),
    COALESCE(SUM(CASE WHEN ic.audit_round = 2 THEN ic.quantity_counted END), 0),
    COALESCE(SUM(CASE WHEN ic.audit_round = 3 THEN ic.quantity_counted END), 0),
    COALESCE(SUM(CASE WHEN ic.audit_round = 4 THEN ic.quantity_counted END), 0)
  INTO v_sum_c1, v_sum_c2, v_sum_c3, v_sum_c4
  FROM inventory_counts ic
  JOIN locations l ON l.id = ic.location_id
  WHERE l.master_reference = _reference AND l.inventory_id = _inv
    AND public.location_bodega(l.assigned_admin_id) = _bodega;

  IF v_round = 1 THEN
    IF v_sum_c1 = v_erp AND v_sum_c1 > 0 THEN v_matched_round := 'C1=ERP'; v_matched_total := v_sum_c1;
    ELSIF v_sum_c2 = v_erp AND v_sum_c2 > 0 THEN v_matched_round := 'C2=ERP'; v_matched_total := v_sum_c2;
    ELSIF v_sum_c1 = v_sum_c2 AND v_sum_c1 > 0 THEN v_matched_round := 'C1=C2'; v_matched_total := v_sum_c1;
    END IF;
  ELSIF v_round = 3 THEN
    IF v_sum_c3 = v_erp AND v_sum_c3 > 0 THEN v_matched_round := 'C3=ERP'; v_matched_total := v_sum_c3;
    ELSIF v_sum_c3 = v_sum_c1 AND v_sum_c3 > 0 THEN v_matched_round := 'C3=C1'; v_matched_total := v_sum_c3;
    ELSIF v_sum_c3 = v_sum_c2 AND v_sum_c3 > 0 THEN v_matched_round := 'C3=C2'; v_matched_total := v_sum_c3;
    END IF;
  ELSIF v_round = 4 THEN
    IF v_sum_c4 = v_erp AND v_sum_c4 > 0 THEN v_matched_round := 'C4=ERP'; v_matched_total := v_sum_c4;
    ELSIF v_sum_c4 = v_sum_c3 AND v_sum_c4 > 0 THEN v_matched_round := 'C4=C3'; v_matched_total := v_sum_c4;
    ELSIF v_sum_c4 = v_sum_c2 AND v_sum_c4 > 0 THEN v_matched_round := 'C4=C2'; v_matched_total := v_sum_c4;
    ELSIF v_sum_c4 = v_sum_c1 AND v_sum_c4 > 0 THEN v_matched_round := 'C4=C1'; v_matched_total := v_sum_c4;
    END IF;
  END IF;

  IF v_matched_round IS NOT NULL THEN
    v_sum_to_save := 0;

    FOR v_location IN
      SELECT l.id FROM locations l
      WHERE l.master_reference = _reference AND l.inventory_id = _inv
        AND public.location_bodega(l.assigned_admin_id) = _bodega
        AND l.validated_at_round IS NULL
    LOOP
      v_location_round := CASE
        WHEN v_matched_round IN ('C1=ERP','C1=C2') THEN 1
        WHEN v_matched_round = 'C2=ERP' THEN 2
        WHEN v_matched_round IN ('C3=ERP','C3=C1','C3=C2') THEN 3
        ELSE 4 END;

      SELECT quantity_counted INTO v_location_quantity
      FROM inventory_counts WHERE location_id = v_location.id AND audit_round = v_location_round;

      IF v_location_quantity IS NULL THEN v_location_quantity := 0; END IF;
      v_location_reason := v_prefix || v_matched_round;
      v_sum_to_save := v_sum_to_save + v_location_quantity;

      UPDATE locations SET validated_at_round = v_location_round, validated_quantity = v_location_quantity
      WHERE id = v_location.id;

      PERFORM public.upsert_validated_count(_inv, _reference, v_location.id, v_location_quantity, v_location_round, v_location_reason, _admin_id);
    END LOOP;

    IF v_sum_to_save <> v_matched_total THEN
      RAISE EXCEPTION 'Inconsistencia en validación por total (%): la suma de ubicaciones (%) no coincide con el total que hizo match (%)', _bodega, v_sum_to_save, v_matched_total;
    END IF;

    SELECT COALESCE(SUM(vc.validated_quantity), 0) INTO v_sum_validated
    FROM validated_counts vc
    JOIN locations l ON l.id = vc.location_id
    WHERE vc.inventory_id = _inv AND vc.master_reference = _reference
      AND public.location_bodega(l.assigned_admin_id) = _bodega;

    IF _bodega = 'planta' THEN
      UPDATE inventory_master SET status_pl = 'auditado' WHERE referencia = _reference AND inventory_id = _inv;
    ELSE
      UPDATE inventory_master SET status_alm = 'auditado' WHERE referencia = _reference AND inventory_id = _inv;
    END IF;

    RETURN jsonb_build_object('success', true, 'action', 'closed', 'reason', v_matched_round, 'total', v_sum_validated, 'erp', v_erp, 'round', v_round);
  END IF;

  FOR v_location IN
    SELECT l.id, l.validated_at_round, l.validated_quantity, l.discovered_at_round
    FROM locations l
    WHERE l.master_reference = _reference AND l.inventory_id = _inv
      AND public.location_bodega(l.assigned_admin_id) = _bodega
  LOOP
    IF v_location.validated_at_round IS NOT NULL THEN
      v_sum_validated := v_sum_validated + COALESCE(v_location.validated_quantity, 0);
      v_validated := v_validated + 1;
      CONTINUE;
    END IF;

    v_discovered := v_location.discovered_at_round;

    SELECT quantity_counted INTO v_count_c1 FROM inventory_counts WHERE location_id = v_location.id AND audit_round = 1;
    SELECT quantity_counted INTO v_count_c2 FROM inventory_counts WHERE location_id = v_location.id AND audit_round = 2;
    SELECT quantity_counted INTO v_count_c3 FROM inventory_counts WHERE location_id = v_location.id AND audit_round = 3;
    SELECT quantity_counted INTO v_count_c4 FROM inventory_counts WHERE location_id = v_location.id AND audit_round = 4;
    SELECT quantity_counted INTO v_count_c5 FROM inventory_counts WHERE location_id = v_location.id AND audit_round = 5;

    v_location_quantity := NULL;
    v_location_round := NULL;
    v_location_reason := NULL;

    IF v_round = 1 THEN
      IF v_discovered = 2 THEN
        IF v_count_c2 IS NOT NULL THEN
          v_location_quantity := v_count_c2; v_location_round := 2; v_location_reason := v_prefix || 'discovered_at_C2';
        END IF;
      ELSIF v_count_c1 IS NOT NULL AND v_count_c2 IS NOT NULL AND v_count_c1 = v_count_c2 THEN
        v_location_quantity := v_count_c1; v_location_round := 1; v_location_reason := v_prefix || 'C1=C2';
      END IF;

    ELSIF v_round = 3 THEN
      IF v_count_c3 IS NOT NULL THEN
        IF v_discovered = 3 THEN
          v_location_quantity := v_count_c3; v_location_round := 3; v_location_reason := v_prefix || 'discovered_at_C3';
        ELSIF v_discovered = 2 THEN
          IF v_count_c3 = v_count_c2 THEN
            v_location_quantity := v_count_c3; v_location_round := 3; v_location_reason := v_prefix || 'C3=C2 (discovered_at_C2)';
          END IF;
        ELSIF v_count_c3 = v_count_c1 OR v_count_c3 = v_count_c2 THEN
          v_location_quantity := v_count_c3; v_location_round := 3;
          v_location_reason := v_prefix || CASE WHEN v_count_c3 = v_count_c1 THEN 'C3=C1' ELSE 'C3=C2' END;
        END IF;
      END IF;

    ELSIF v_round = 4 THEN
      IF v_count_c4 IS NOT NULL THEN
        IF v_discovered = 4 THEN
          v_location_quantity := v_count_c4; v_location_round := 4; v_location_reason := v_prefix || 'discovered_at_C4';
        ELSIF v_discovered = 3 THEN
          IF v_count_c4 = v_count_c3 THEN
            v_location_quantity := v_count_c4; v_location_round := 4; v_location_reason := v_prefix || 'C4=C3 (discovered_at_C3)';
          END IF;
        ELSIF v_discovered = 2 THEN
          IF v_count_c4 = v_count_c2 OR v_count_c4 = v_count_c3 THEN
            v_location_quantity := v_count_c4; v_location_round := 4;
            v_location_reason := v_prefix || CASE WHEN v_count_c4 = v_count_c2 THEN 'C4=C2' ELSE 'C4=C3' END || ' (discovered_at_C2)';
          END IF;
        ELSIF v_count_c4 = v_count_c1 OR v_count_c4 = v_count_c2 OR v_count_c4 = v_count_c3 THEN
          v_location_quantity := v_count_c4; v_location_round := 4;
          v_location_reason := v_prefix || CASE WHEN v_count_c4 = v_count_c1 THEN 'C4=C1' WHEN v_count_c4 = v_count_c2 THEN 'C4=C2' ELSE 'C4=C3' END;
        END IF;
      END IF;

    ELSIF v_round = 5 THEN
      IF NOT is_superadmin(_admin_id) THEN
        RETURN jsonb_build_object('success', false, 'error', 'Solo superadmins pueden cerrar referencias en Conteo 5');
      END IF;
      IF v_count_c5 IS NOT NULL THEN
        v_location_quantity := v_count_c5; v_location_round := 5; v_location_reason := v_prefix || 'superadmin_forced';
      END IF;
    END IF;

    IF v_location_quantity IS NULL THEN
      v_all_validated := FALSE;
      v_pending := v_pending + 1;
      CONTINUE;
    END IF;

    UPDATE locations SET validated_at_round = v_location_round, validated_quantity = v_location_quantity WHERE id = v_location.id;
    PERFORM public.upsert_validated_count(_inv, _reference, v_location.id, v_location_quantity, v_location_round, v_location_reason, _admin_id);
    v_sum_validated := v_sum_validated + v_location_quantity;
    v_validated := v_validated + 1;
  END LOOP;

  IF v_all_validated AND v_validated > 0 THEN
    v_new_status := CASE WHEN v_round = 5 AND v_sum_validated <> v_erp THEN 'cerrado_forzado' ELSE 'auditado' END;
    IF _bodega = 'planta' THEN
      UPDATE inventory_master SET status_pl = v_new_status WHERE referencia = _reference AND inventory_id = _inv;
    ELSE
      UPDATE inventory_master SET status_alm = v_new_status WHERE referencia = _reference AND inventory_id = _inv;
    END IF;
    v_result := jsonb_build_object('success', true, 'action', 'closed', 'reason', 'all_locations_validated', 'total', v_sum_validated, 'erp', v_erp, 'round', v_round, 'status', v_new_status);

  ELSIF v_pending > 0 THEN
    v_new_round := CASE v_round WHEN 1 THEN 3 WHEN 3 THEN 4 WHEN 4 THEN 5 ELSE 5 END;
    v_new_status := CASE WHEN v_new_round = 5 THEN 'critico' ELSE 'conflicto' END;
    IF _bodega = 'planta' THEN
      UPDATE inventory_master SET audit_round_pl = v_new_round, status_pl = v_new_status WHERE referencia = _reference AND inventory_id = _inv;
    ELSE
      UPDATE inventory_master SET audit_round_alm = v_new_round, status_alm = v_new_status WHERE referencia = _reference AND inventory_id = _inv;
    END IF;
    v_result := jsonb_build_object('success', true, 'action', CASE WHEN v_new_round = 5 THEN 'escalate_to_superadmin' ELSE 'next_round' END,
      'new_round', v_new_round, 'pending_locations', v_pending, 'validated_locations', v_validated, 'erp', v_erp);
  ELSE
    v_result := jsonb_build_object('success', false, 'error', 'No hay ubicaciones para validar en el bloque');
  END IF;

  RETURN v_result;
END;
$function$;