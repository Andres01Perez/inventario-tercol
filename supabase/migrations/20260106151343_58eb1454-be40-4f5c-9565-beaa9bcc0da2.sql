CREATE OR REPLACE FUNCTION public.validate_and_close_round(_reference text, _admin_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_master RECORD;
  v_location RECORD;
  v_sum_validated NUMERIC := 0;
  v_all_validated BOOLEAN := TRUE;
  v_any_validated_this_round BOOLEAN := FALSE;
  v_count_c1 NUMERIC;
  v_count_c2 NUMERIC;
  v_count_c3 NUMERIC;
  v_count_c4 NUMERIC;
  v_count_current NUMERIC;
  v_result JSONB;
  v_history_array JSONB;
  v_erp NUMERIC;
  v_validation_details JSONB := '[]'::JSONB;
  v_pending_locations INTEGER := 0;
  v_validated_locations INTEGER := 0;
  v_discovered_round INTEGER;
  -- Variables para sumas totales
  v_sum_c1 NUMERIC;
  v_sum_c2 NUMERIC;
  v_sum_c3 NUMERIC;
  v_sum_c4 NUMERIC;
  v_matched_round TEXT := NULL;
BEGIN
  -- 1. Obtener datos de la maestra
  SELECT * INTO v_master FROM inventory_master WHERE referencia = _reference;
  
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Referencia no encontrada');
  END IF;

  v_erp := COALESCE(v_master.cant_total_erp, 0);

  -- ==============================================================================
  -- FASE 0: Calcular TODAS las sumas totales y verificar match antes de ubicaciones
  -- ==============================================================================
  
  -- Calcular sumas de todos los conteos
  SELECT COALESCE(SUM(ic.quantity_counted), 0) INTO v_sum_c1
  FROM inventory_counts ic JOIN locations l ON l.id = ic.location_id
  WHERE l.master_reference = _reference AND ic.audit_round = 1;

  SELECT COALESCE(SUM(ic.quantity_counted), 0) INTO v_sum_c2
  FROM inventory_counts ic JOIN locations l ON l.id = ic.location_id
  WHERE l.master_reference = _reference AND ic.audit_round = 2;

  SELECT COALESCE(SUM(ic.quantity_counted), 0) INTO v_sum_c3
  FROM inventory_counts ic JOIN locations l ON l.id = ic.location_id
  WHERE l.master_reference = _reference AND ic.audit_round = 3;

  SELECT COALESCE(SUM(ic.quantity_counted), 0) INTO v_sum_c4
  FROM inventory_counts ic JOIN locations l ON l.id = ic.location_id
  WHERE l.master_reference = _reference AND ic.audit_round = 4;

  -- Verificar match por suma total según la ronda actual
  IF v_master.audit_round = 1 THEN
    -- C1/C2: SUM(C1) = ERP, SUM(C2) = ERP, o SUM(C1) = SUM(C2)
    IF v_sum_c1 = v_erp AND v_sum_c1 > 0 THEN
      v_matched_round := 'C1=ERP';
    ELSIF v_sum_c2 = v_erp AND v_sum_c2 > 0 THEN
      v_matched_round := 'C2=ERP';
    ELSIF v_sum_c1 = v_sum_c2 AND v_sum_c1 > 0 THEN
      v_matched_round := 'C1=C2';
    END IF;
    
  ELSIF v_master.audit_round = 3 THEN
    -- C3: vs ERP, vs C1, vs C2
    IF v_sum_c3 = v_erp AND v_sum_c3 > 0 THEN
      v_matched_round := 'C3=ERP';
    ELSIF v_sum_c3 = v_sum_c1 AND v_sum_c3 > 0 THEN
      v_matched_round := 'C3=C1';
    ELSIF v_sum_c3 = v_sum_c2 AND v_sum_c3 > 0 THEN
      v_matched_round := 'C3=C2';
    END IF;
    
  ELSIF v_master.audit_round = 4 THEN
    -- C4: vs ERP, vs C3, vs C2, vs C1
    IF v_sum_c4 = v_erp AND v_sum_c4 > 0 THEN
      v_matched_round := 'C4=ERP';
    ELSIF v_sum_c4 = v_sum_c3 AND v_sum_c4 > 0 THEN
      v_matched_round := 'C4=C3';
    ELSIF v_sum_c4 = v_sum_c2 AND v_sum_c4 > 0 THEN
      v_matched_round := 'C4=C2';
    ELSIF v_sum_c4 = v_sum_c1 AND v_sum_c4 > 0 THEN
      v_matched_round := 'C4=C1';
    END IF;
  END IF;

  -- Si hubo match por suma total, validar todas las ubicaciones y cerrar
  IF v_matched_round IS NOT NULL THEN
    FOR v_location IN 
      SELECT l.id FROM locations l 
      WHERE l.master_reference = _reference AND l.validated_at_round IS NULL
    LOOP
      -- Obtener el conteo de la ronda actual
      SELECT quantity_counted INTO v_count_current 
      FROM inventory_counts 
      WHERE location_id = v_location.id AND audit_round = v_master.audit_round;
      
      -- Si no tiene conteo de la ronda actual, usar el más reciente
      IF v_count_current IS NULL THEN
        SELECT quantity_counted INTO v_count_current 
        FROM inventory_counts 
        WHERE location_id = v_location.id 
        ORDER BY audit_round DESC LIMIT 1;
      END IF;
      
      UPDATE locations SET 
        validated_at_round = v_master.audit_round,
        validated_quantity = COALESCE(v_count_current, 0)
      WHERE id = v_location.id;
    END LOOP;
    
    -- Calcular suma total validada
    SELECT COALESCE(SUM(validated_quantity), 0) INTO v_sum_validated 
    FROM locations WHERE master_reference = _reference;
    
    v_history_array := COALESCE(v_master.count_history, '[]'::jsonb) || jsonb_build_object(
      'round', v_master.audit_round,
      'sum_validated', v_sum_validated,
      'reason', v_matched_round,
      'sum_c1', v_sum_c1,
      'sum_c2', v_sum_c2,
      'sum_c3', v_sum_c3,
      'sum_c4', v_sum_c4,
      'erp', v_erp,
      'timestamp', now()
    );
    
    UPDATE inventory_master SET status_slug = 'auditado', count_history = v_history_array 
    WHERE referencia = _reference;
    
    INSERT INTO audit_logs (master_reference, user_id, action_type, round_number, new_data)
    VALUES (_reference, _admin_id, 'closed_by_total_sum', v_master.audit_round, 
            jsonb_build_object('sum', v_sum_validated, 'reason', v_matched_round));
    
    RETURN jsonb_build_object(
      'success', true, 
      'action', 'closed', 
      'reason', v_matched_round, 
      'total', v_sum_validated
    );
  END IF;

  -- ==============================================================================
  -- FASE 1: Validar cada ubicación INDIVIDUALMENTE (si no hubo match por suma)
  -- ==============================================================================
  
  FOR v_location IN 
    SELECT l.id, l.location_name, l.validated_at_round, l.validated_quantity, l.discovered_at_round
    FROM locations l 
    WHERE l.master_reference = _reference
  LOOP
    -- Si la ubicación ya está validada, sumar su cantidad y continuar
    IF v_location.validated_at_round IS NOT NULL THEN
      v_sum_validated := v_sum_validated + COALESCE(v_location.validated_quantity, 0);
      v_validated_locations := v_validated_locations + 1;
      CONTINUE;
    END IF;
    
    -- Guardar discovered_at_round para esta ubicación
    v_discovered_round := v_location.discovered_at_round;

    -- Obtener conteos de esta ubicación específica
    SELECT quantity_counted INTO v_count_c1 FROM inventory_counts WHERE location_id = v_location.id AND audit_round = 1;
    SELECT quantity_counted INTO v_count_c2 FROM inventory_counts WHERE location_id = v_location.id AND audit_round = 2;
    SELECT quantity_counted INTO v_count_c3 FROM inventory_counts WHERE location_id = v_location.id AND audit_round = 3;
    SELECT quantity_counted INTO v_count_c4 FROM inventory_counts WHERE location_id = v_location.id AND audit_round = 4;

    -- ==============================================================================
    -- FASE INICIAL (audit_round = 1): Verificar C1 y C2
    -- ==============================================================================
    IF v_master.audit_round = 1 THEN
      -- Para ubicaciones descubiertas en C2, solo necesitan C2
      IF v_discovered_round = 2 THEN
        IF v_count_c2 IS NOT NULL THEN
          UPDATE locations SET validated_at_round = 2, validated_quantity = v_count_c2 WHERE id = v_location.id;
          v_sum_validated := v_sum_validated + v_count_c2;
          v_any_validated_this_round := TRUE;
          v_validated_locations := v_validated_locations + 1;
          v_validation_details := v_validation_details || jsonb_build_object(
            'location_id', v_location.id,
            'validated_round', 2,
            'quantity', v_count_c2,
            'reason', 'discovered_at_C2'
          );
        ELSE
          v_all_validated := FALSE;
          v_pending_locations := v_pending_locations + 1;
        END IF;
        CONTINUE;
      END IF;
      
      -- Ubicaciones originales: verificar que tenga ambos conteos
      IF v_count_c1 IS NULL OR v_count_c2 IS NULL THEN
        v_all_validated := FALSE;
        v_pending_locations := v_pending_locations + 1;
        CONTINUE;
      END IF;

      -- Si C1 = C2 → Ubicación validada
      IF v_count_c1 = v_count_c2 THEN
        UPDATE locations SET validated_at_round = 1, validated_quantity = v_count_c1 WHERE id = v_location.id;
        v_sum_validated := v_sum_validated + v_count_c1;
        v_any_validated_this_round := TRUE;
        v_validated_locations := v_validated_locations + 1;
        v_validation_details := v_validation_details || jsonb_build_object(
          'location_id', v_location.id,
          'validated_round', 1,
          'quantity', v_count_c1,
          'reason', 'C1=C2'
        );
      ELSE
        v_all_validated := FALSE;
        v_pending_locations := v_pending_locations + 1;
      END IF;

    -- ==============================================================================
    -- CONTEO 3: Verificar C3 contra C1 o C2
    -- ==============================================================================
    ELSIF v_master.audit_round = 3 THEN
      IF v_count_c3 IS NULL THEN
        v_all_validated := FALSE;
        v_pending_locations := v_pending_locations + 1;
        CONTINUE;
      END IF;

      -- Si ubicación descubierta en C2, comparar C3 vs C2
      IF v_discovered_round = 2 THEN
        IF v_count_c3 = v_count_c2 THEN
          UPDATE locations SET validated_at_round = 3, validated_quantity = v_count_c3 WHERE id = v_location.id;
          v_sum_validated := v_sum_validated + v_count_c3;
          v_any_validated_this_round := TRUE;
          v_validated_locations := v_validated_locations + 1;
          v_validation_details := v_validation_details || jsonb_build_object(
            'location_id', v_location.id,
            'validated_round', 3,
            'quantity', v_count_c3,
            'reason', 'C3=C2 (discovered_at_C2)'
          );
        ELSE
          v_all_validated := FALSE;
          v_pending_locations := v_pending_locations + 1;
        END IF;
        CONTINUE;
      END IF;
      
      -- Si ubicación descubierta en C3, se valida automáticamente
      IF v_discovered_round = 3 THEN
        UPDATE locations SET validated_at_round = 3, validated_quantity = v_count_c3 WHERE id = v_location.id;
        v_sum_validated := v_sum_validated + v_count_c3;
        v_any_validated_this_round := TRUE;
        v_validated_locations := v_validated_locations + 1;
        v_validation_details := v_validation_details || jsonb_build_object(
          'location_id', v_location.id,
          'validated_round', 3,
          'quantity', v_count_c3,
          'reason', 'discovered_at_C3'
        );
        CONTINUE;
      END IF;

      -- Si C3 = C1 o C3 = C2 → Ubicación validada
      IF v_count_c3 = v_count_c1 OR v_count_c3 = v_count_c2 THEN
        UPDATE locations SET validated_at_round = 3, validated_quantity = v_count_c3 WHERE id = v_location.id;
        v_sum_validated := v_sum_validated + v_count_c3;
        v_any_validated_this_round := TRUE;
        v_validated_locations := v_validated_locations + 1;
        v_validation_details := v_validation_details || jsonb_build_object(
          'location_id', v_location.id,
          'validated_round', 3,
          'quantity', v_count_c3,
          'reason', CASE WHEN v_count_c3 = v_count_c1 THEN 'C3=C1' ELSE 'C3=C2' END
        );
      ELSE
        v_all_validated := FALSE;
        v_pending_locations := v_pending_locations + 1;
      END IF;

    -- ==============================================================================
    -- CONTEO 4: Verificar C4 contra C1, C2 o C3
    -- ==============================================================================
    ELSIF v_master.audit_round = 4 THEN
      IF v_count_c4 IS NULL THEN
        v_all_validated := FALSE;
        v_pending_locations := v_pending_locations + 1;
        CONTINUE;
      END IF;

      -- Si ubicación descubierta en C4, se valida automáticamente
      IF v_discovered_round = 4 THEN
        UPDATE locations SET validated_at_round = 4, validated_quantity = v_count_c4 WHERE id = v_location.id;
        v_sum_validated := v_sum_validated + v_count_c4;
        v_any_validated_this_round := TRUE;
        v_validated_locations := v_validated_locations + 1;
        v_validation_details := v_validation_details || jsonb_build_object(
          'location_id', v_location.id,
          'validated_round', 4,
          'quantity', v_count_c4,
          'reason', 'discovered_at_C4'
        );
        CONTINUE;
      END IF;
      
      -- Si ubicación descubierta en C3, comparar C4 vs C3
      IF v_discovered_round = 3 THEN
        IF v_count_c4 = v_count_c3 THEN
          UPDATE locations SET validated_at_round = 4, validated_quantity = v_count_c4 WHERE id = v_location.id;
          v_sum_validated := v_sum_validated + v_count_c4;
          v_any_validated_this_round := TRUE;
          v_validated_locations := v_validated_locations + 1;
          v_validation_details := v_validation_details || jsonb_build_object(
            'location_id', v_location.id,
            'validated_round', 4,
            'quantity', v_count_c4,
            'reason', 'C4=C3 (discovered_at_C3)'
          );
        ELSE
          v_all_validated := FALSE;
          v_pending_locations := v_pending_locations + 1;
        END IF;
        CONTINUE;
      END IF;
      
      -- Si ubicación descubierta en C2, comparar C4 vs C2 o C3
      IF v_discovered_round = 2 THEN
        IF v_count_c4 = v_count_c2 OR v_count_c4 = v_count_c3 THEN
          UPDATE locations SET validated_at_round = 4, validated_quantity = v_count_c4 WHERE id = v_location.id;
          v_sum_validated := v_sum_validated + v_count_c4;
          v_any_validated_this_round := TRUE;
          v_validated_locations := v_validated_locations + 1;
          v_validation_details := v_validation_details || jsonb_build_object(
            'location_id', v_location.id,
            'validated_round', 4,
            'quantity', v_count_c4,
            'reason', CASE WHEN v_count_c4 = v_count_c2 THEN 'C4=C2' ELSE 'C4=C3' END || ' (discovered_at_C2)'
          );
        ELSE
          v_all_validated := FALSE;
          v_pending_locations := v_pending_locations + 1;
        END IF;
        CONTINUE;
      END IF;

      -- Si C4 = C1 o C4 = C2 o C4 = C3 → Ubicación validada
      IF v_count_c4 = v_count_c1 OR v_count_c4 = v_count_c2 OR v_count_c4 = v_count_c3 THEN
        UPDATE locations SET validated_at_round = 4, validated_quantity = v_count_c4 WHERE id = v_location.id;
        v_sum_validated := v_sum_validated + v_count_c4;
        v_any_validated_this_round := TRUE;
        v_validated_locations := v_validated_locations + 1;
        v_validation_details := v_validation_details || jsonb_build_object(
          'location_id', v_location.id,
          'validated_round', 4,
          'quantity', v_count_c4,
          'reason', CASE 
            WHEN v_count_c4 = v_count_c1 THEN 'C4=C1' 
            WHEN v_count_c4 = v_count_c2 THEN 'C4=C2' 
            ELSE 'C4=C3' 
          END
        );
      ELSE
        v_all_validated := FALSE;
        v_pending_locations := v_pending_locations + 1;
      END IF;

    -- ==============================================================================
    -- CONTEO 5 (CRÍTICO - SOLO SUPERADMIN)
    -- ==============================================================================
    ELSIF v_master.audit_round = 5 THEN
      IF NOT is_superadmin(_admin_id) THEN
        RETURN jsonb_build_object('success', false, 'error', 'Solo superadmins pueden cerrar referencias en Conteo 5');
      END IF;

      SELECT quantity_counted INTO v_count_current FROM inventory_counts WHERE location_id = v_location.id AND audit_round = 5;
      
      IF v_count_current IS NULL THEN
        v_all_validated := FALSE;
        v_pending_locations := v_pending_locations + 1;
        CONTINUE;
      END IF;

      UPDATE locations SET validated_at_round = 5, validated_quantity = v_count_current WHERE id = v_location.id;
      v_sum_validated := v_sum_validated + v_count_current;
      v_any_validated_this_round := TRUE;
      v_validated_locations := v_validated_locations + 1;
      v_validation_details := v_validation_details || jsonb_build_object(
        'location_id', v_location.id,
        'validated_round', 5,
        'quantity', v_count_current,
        'reason', 'superadmin_forced'
      );
    END IF;
  END LOOP;

  -- ==============================================================================
  -- DETERMINAR RESULTADO FINAL
  -- ==============================================================================
  
  v_history_array := COALESCE(v_master.count_history, '[]'::jsonb) || jsonb_build_object(
    'round', v_master.audit_round,
    'sum_validated', v_sum_validated,
    'validated_locations', v_validated_locations,
    'pending_locations', v_pending_locations,
    'validation_details', v_validation_details,
    'timestamp', now()
  );

  -- Si TODAS las ubicaciones están validadas → Cerrar referencia
  IF v_all_validated AND v_validated_locations > 0 THEN
    IF v_sum_validated = v_erp THEN
      UPDATE inventory_master SET status_slug = 'auditado', count_history = v_history_array WHERE referencia = _reference;
      v_result := jsonb_build_object('success', true, 'action', 'closed', 'reason', 'all_locations_validated_matches_erp', 'total', v_sum_validated);
    ELSIF v_master.audit_round = 5 THEN
      UPDATE inventory_master SET status_slug = 'cerrado_forzado', count_history = v_history_array WHERE referencia = _reference;
      v_result := jsonb_build_object('success', true, 'action', 'forced_close_superadmin', 'total', v_sum_validated);
    ELSE
      UPDATE inventory_master SET status_slug = 'auditado', count_history = v_history_array WHERE referencia = _reference;
      v_result := jsonb_build_object('success', true, 'action', 'closed', 'reason', 'all_locations_validated', 'total', v_sum_validated);
    END IF;

  ELSIF v_pending_locations > 0 THEN
    IF v_master.audit_round = 1 THEN
      UPDATE inventory_master SET audit_round = 3, status_slug = 'conflicto', count_history = v_history_array WHERE referencia = _reference;
      v_result := jsonb_build_object('success', true, 'action', 'next_round', 'new_round', 3, 'pending_locations', v_pending_locations, 'validated_locations', v_validated_locations);
    ELSIF v_master.audit_round = 3 THEN
      UPDATE inventory_master SET audit_round = 4, status_slug = 'conflicto', count_history = v_history_array WHERE referencia = _reference;
      v_result := jsonb_build_object('success', true, 'action', 'next_round', 'new_round', 4, 'pending_locations', v_pending_locations, 'validated_locations', v_validated_locations);
    ELSIF v_master.audit_round = 4 THEN
      UPDATE inventory_master SET audit_round = 5, status_slug = 'critico', count_history = v_history_array WHERE referencia = _reference;
      v_result := jsonb_build_object('success', true, 'action', 'escalate_to_superadmin', 'new_round', 5, 'pending_locations', v_pending_locations, 'validated_locations', v_validated_locations);
    ELSE
      v_result := jsonb_build_object('success', false, 'error', 'Estado de ronda inválido', 'round', v_master.audit_round);
    END IF;
  ELSE
    v_result := jsonb_build_object('success', false, 'error', 'No hay ubicaciones para validar');
  END IF;

  INSERT INTO audit_logs (master_reference, user_id, action_type, round_number, new_data)
  VALUES (_reference, _admin_id, v_result->>'action', v_master.audit_round, v_result);

  RETURN v_result;
END;
$function$;