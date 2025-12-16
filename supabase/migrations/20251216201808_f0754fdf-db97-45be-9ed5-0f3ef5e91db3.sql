-- Crear tabla audit_logs para registrar acciones de validación
CREATE TABLE public.audit_logs (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  master_reference TEXT NOT NULL,
  user_id UUID,
  action_type TEXT NOT NULL,
  round_number INTEGER,
  new_data JSONB,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Habilitar RLS
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;

-- Políticas RLS
CREATE POLICY "Superadmins can view audit logs"
  ON public.audit_logs FOR SELECT
  USING (is_superadmin(auth.uid()));

CREATE POLICY "Admins can view audit logs"
  ON public.audit_logs FOR SELECT
  USING (is_any_admin(auth.uid()));

CREATE POLICY "System can insert audit logs"
  ON public.audit_logs FOR INSERT
  WITH CHECK (true);

-- Actualizar función validate_and_close_round con todas las reglas
CREATE OR REPLACE FUNCTION public.validate_and_close_round(
  _reference TEXT,
  _admin_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_master RECORD;
  v_sum_c1 NUMERIC;
  v_sum_c2 NUMERIC;
  v_sum_c3 NUMERIC;
  v_sum_c4 NUMERIC;
  v_sum_current NUMERIC;
  v_missing_c1 BOOLEAN;
  v_missing_c2 BOOLEAN;
  v_missing_current BOOLEAN;
  v_result JSONB;
  v_history_array JSONB;
  v_erp NUMERIC;
BEGIN
  -- 1. Obtener datos de la maestra
  SELECT * INTO v_master FROM inventory_master WHERE referencia = _reference;
  
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Referencia no encontrada');
  END IF;

  v_erp := COALESCE(v_master.cant_total_erp, 0);

  -- ==============================================================================
  -- FASE INICIAL: CONTEO 1 Y CONTEO 2 (OBLIGATORIOS)
  -- ==============================================================================
  IF v_master.audit_round = 1 THEN
    -- A. Verificar que TODAS las ubicaciones tengan C1 y C2
    SELECT EXISTS (
      SELECT 1 FROM locations l 
      WHERE l.master_reference = _reference 
      AND NOT EXISTS (SELECT 1 FROM inventory_counts ic WHERE ic.location_id = l.id AND ic.audit_round = 1)
    ) INTO v_missing_c1;

    SELECT EXISTS (
      SELECT 1 FROM locations l 
      WHERE l.master_reference = _reference 
      AND NOT EXISTS (SELECT 1 FROM inventory_counts ic WHERE ic.location_id = l.id AND ic.audit_round = 2)
    ) INTO v_missing_c2;

    IF v_missing_c1 OR v_missing_c2 THEN
      RETURN jsonb_build_object(
        'success', false, 
        'error', 'Faltan conteos obligatorios. C1 faltante: ' || v_missing_c1::text || ', C2 faltante: ' || v_missing_c2::text
      );
    END IF;

    -- B. Calcular Sumas de C1 y C2
    SELECT COALESCE(SUM(quantity_counted), 0) INTO v_sum_c1 
    FROM inventory_counts ic JOIN locations l ON ic.location_id = l.id 
    WHERE l.master_reference = _reference AND ic.audit_round = 1;
    
    SELECT COALESCE(SUM(quantity_counted), 0) INTO v_sum_c2 
    FROM inventory_counts ic JOIN locations l ON ic.location_id = l.id 
    WHERE l.master_reference = _reference AND ic.audit_round = 2;

    v_history_array := COALESCE(v_master.count_history, '[]'::jsonb) || 
      jsonb_build_object('round', 1, 'sum_c1', v_sum_c1, 'sum_c2', v_sum_c2, 'erp', v_erp);

    -- C. VALIDACIÓN FASE INICIAL
    -- Regla 1: Si C1 = ERP O C2 = ERP → Auditado
    IF v_sum_c1 = v_erp OR v_sum_c2 = v_erp THEN
      UPDATE inventory_master SET status_slug = 'auditado', count_history = v_history_array WHERE referencia = _reference;
      v_result := jsonb_build_object('success', true, 'action', 'closed', 'reason', 'matches_erp', 'sum_c1', v_sum_c1, 'sum_c2', v_sum_c2);
    
    -- Regla 2: Si C1 = C2 (consistencia física) → Auditado
    ELSIF v_sum_c1 = v_sum_c2 THEN
      UPDATE inventory_master SET status_slug = 'auditado', count_history = v_history_array WHERE referencia = _reference;
      v_result := jsonb_build_object('success', true, 'action', 'closed', 'reason', 'physical_consistency', 'sum_c1', v_sum_c1, 'sum_c2', v_sum_c2);
    
    -- Ninguna coincidencia → Pasa a Conteo 3
    ELSE
      UPDATE inventory_master SET audit_round = 3, status_slug = 'conflicto', count_history = v_history_array WHERE referencia = _reference;
      v_result := jsonb_build_object('success', true, 'action', 'next_round', 'new_round', 3, 'sum_c1', v_sum_c1, 'sum_c2', v_sum_c2);
    END IF;

  -- ==============================================================================
  -- CONTEO 3 (DESEMPATE)
  -- ==============================================================================
  ELSIF v_master.audit_round = 3 THEN
    -- Verificar completitud
    SELECT EXISTS (
      SELECT 1 FROM locations l 
      WHERE l.master_reference = _reference 
      AND NOT EXISTS (SELECT 1 FROM inventory_counts ic WHERE ic.location_id = l.id AND ic.audit_round = 3)
    ) INTO v_missing_current;

    IF v_missing_current THEN
      RETURN jsonb_build_object('success', false, 'error', 'Faltan conteos para el Conteo 3');
    END IF;

    -- Calcular sumas
    SELECT COALESCE(SUM(quantity_counted), 0) INTO v_sum_current 
    FROM inventory_counts ic JOIN locations l ON ic.location_id = l.id 
    WHERE l.master_reference = _reference AND ic.audit_round = 3;

    -- Obtener C1 y C2 del historial
    v_sum_c1 := (v_master.count_history->0->>'sum_c1')::numeric;
    v_sum_c2 := (v_master.count_history->0->>'sum_c2')::numeric;

    v_history_array := COALESCE(v_master.count_history, '[]'::jsonb) || 
      jsonb_build_object('round', 3, 'sum', v_sum_current);

    -- VALIDACIÓN CONTEO 3
    -- Si C3 = ERP → Auditado
    IF v_sum_current = v_erp THEN
      UPDATE inventory_master SET status_slug = 'auditado', count_history = v_history_array WHERE referencia = _reference;
      v_result := jsonb_build_object('success', true, 'action', 'closed', 'reason', 'matches_erp', 'sum_c3', v_sum_current);
    
    -- Si C3 = C1 O C3 = C2 → Auditado (consistencia)
    ELSIF v_sum_current = v_sum_c1 OR v_sum_current = v_sum_c2 THEN
      UPDATE inventory_master SET status_slug = 'auditado', count_history = v_history_array WHERE referencia = _reference;
      v_result := jsonb_build_object('success', true, 'action', 'closed', 'reason', 'consistency_with_previous', 'sum_c3', v_sum_current, 'matched_with', CASE WHEN v_sum_current = v_sum_c1 THEN 'C1' ELSE 'C2' END);
    
    -- Ninguna coincidencia → Pasa a Conteo 4
    ELSE
      UPDATE inventory_master SET audit_round = 4, status_slug = 'conflicto', count_history = v_history_array WHERE referencia = _reference;
      v_result := jsonb_build_object('success', true, 'action', 'next_round', 'new_round', 4, 'sum_c3', v_sum_current);
    END IF;

  -- ==============================================================================
  -- CONTEO 4 (ÚLTIMO INTENTO)
  -- ==============================================================================
  ELSIF v_master.audit_round = 4 THEN
    -- Verificar completitud
    SELECT EXISTS (
      SELECT 1 FROM locations l 
      WHERE l.master_reference = _reference 
      AND NOT EXISTS (SELECT 1 FROM inventory_counts ic WHERE ic.location_id = l.id AND ic.audit_round = 4)
    ) INTO v_missing_current;

    IF v_missing_current THEN
      RETURN jsonb_build_object('success', false, 'error', 'Faltan conteos para el Conteo 4');
    END IF;

    -- Calcular sumas
    SELECT COALESCE(SUM(quantity_counted), 0) INTO v_sum_current 
    FROM inventory_counts ic JOIN locations l ON ic.location_id = l.id 
    WHERE l.master_reference = _reference AND ic.audit_round = 4;

    -- Obtener conteos anteriores del historial
    v_sum_c1 := (v_master.count_history->0->>'sum_c1')::numeric;
    v_sum_c2 := (v_master.count_history->0->>'sum_c2')::numeric;
    v_sum_c3 := (v_master.count_history->1->>'sum')::numeric;

    v_history_array := COALESCE(v_master.count_history, '[]'::jsonb) || 
      jsonb_build_object('round', 4, 'sum', v_sum_current);

    -- VALIDACIÓN CONTEO 4
    -- Si C4 = ERP → Auditado
    IF v_sum_current = v_erp THEN
      UPDATE inventory_master SET status_slug = 'auditado', count_history = v_history_array WHERE referencia = _reference;
      v_result := jsonb_build_object('success', true, 'action', 'closed', 'reason', 'matches_erp', 'sum_c4', v_sum_current);
    
    -- Si C4 = C1 O C4 = C2 O C4 = C3 → Auditado (consistencia)
    ELSIF v_sum_current = v_sum_c1 OR v_sum_current = v_sum_c2 OR v_sum_current = v_sum_c3 THEN
      UPDATE inventory_master SET status_slug = 'auditado', count_history = v_history_array WHERE referencia = _reference;
      v_result := jsonb_build_object('success', true, 'action', 'closed', 'reason', 'consistency_with_previous', 'sum_c4', v_sum_current);
    
    -- Ninguna coincidencia → Pasa a Conteo 5 (CRÍTICO - SUPERADMIN)
    ELSE
      UPDATE inventory_master SET audit_round = 5, status_slug = 'critico', count_history = v_history_array WHERE referencia = _reference;
      v_result := jsonb_build_object('success', true, 'action', 'escalate_to_superadmin', 'new_round', 5, 'sum_c4', v_sum_current);
    END IF;

  -- ==============================================================================
  -- CONTEO 5 (CRÍTICO - SOLO SUPERADMIN)
  -- ==============================================================================
  ELSIF v_master.audit_round = 5 THEN
    -- Verificar que es superadmin
    IF NOT is_superadmin(_admin_id) THEN
      RETURN jsonb_build_object('success', false, 'error', 'Solo superadmins pueden cerrar referencias en Conteo 5');
    END IF;

    -- Verificar completitud
    SELECT EXISTS (
      SELECT 1 FROM locations l 
      WHERE l.master_reference = _reference 
      AND NOT EXISTS (SELECT 1 FROM inventory_counts ic WHERE ic.location_id = l.id AND ic.audit_round = 5)
    ) INTO v_missing_current;

    IF v_missing_current THEN
      RETURN jsonb_build_object('success', false, 'error', 'Faltan conteos para el Conteo 5');
    END IF;

    -- Calcular suma final del superadmin
    SELECT COALESCE(SUM(quantity_counted), 0) INTO v_sum_current 
    FROM inventory_counts ic JOIN locations l ON ic.location_id = l.id 
    WHERE l.master_reference = _reference AND ic.audit_round = 5;

    v_history_array := COALESCE(v_master.count_history, '[]'::jsonb) || 
      jsonb_build_object('round', 5, 'sum', v_sum_current, 'closed_by_superadmin', true);

    -- CIERRE FORZADO POR SUPERADMIN
    UPDATE inventory_master SET status_slug = 'cerrado_forzado', count_history = v_history_array WHERE referencia = _reference;
    v_result := jsonb_build_object('success', true, 'action', 'forced_close_superadmin', 'sum_c5', v_sum_current);

  ELSE
    RETURN jsonb_build_object('success', false, 'error', 'Estado de ronda inválido: ' || v_master.audit_round);
  END IF;

  -- Registrar en audit_logs
  INSERT INTO audit_logs (master_reference, user_id, action_type, round_number, new_data)
  VALUES (_reference, _admin_id, v_result->>'action', v_master.audit_round, v_result);

  RETURN v_result;
END;
$$;