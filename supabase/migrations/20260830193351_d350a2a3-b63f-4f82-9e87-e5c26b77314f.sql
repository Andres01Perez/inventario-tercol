CREATE TABLE public.validated_counts (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  inventory_id uuid NOT NULL,
  master_reference text NOT NULL,
  location_id uuid NOT NULL,
  validated_quantity numeric NOT NULL DEFAULT 0,
  audit_round integer NOT NULL,
  reason text NOT NULL,
  validated_by uuid,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT validated_counts_pkey PRIMARY KEY (id),
  CONSTRAINT validated_counts_inventory_location_unique UNIQUE (inventory_id, location_id),
  CONSTRAINT validated_counts_inventory_fk FOREIGN KEY (inventory_id) REFERENCES public.inventories(id) ON DELETE CASCADE,
  CONSTRAINT validated_counts_location_fk FOREIGN KEY (location_id) REFERENCES public.locations(id) ON DELETE CASCADE
);

GRANT SELECT ON public.validated_counts TO authenticated;
GRANT ALL ON public.validated_counts TO service_role;

ALTER TABLE public.validated_counts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read validated_counts"
  ON public.validated_counts
  FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Superadmins can manage validated_counts"
  ON public.validated_counts
  FOR ALL
  TO authenticated
  USING (public.is_superadmin(auth.uid()))
  WITH CHECK (public.is_superadmin(auth.uid()));

CREATE INDEX idx_validated_counts_inventory_reference
  ON public.validated_counts (inventory_id, master_reference);

CREATE INDEX idx_validated_counts_inventory_location
  ON public.validated_counts (inventory_id, location_id);

CREATE TRIGGER update_validated_counts_updated_at
  BEFORE UPDATE ON public.validated_counts
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER block_closed_inventory_validated_counts_trg
  BEFORE INSERT OR UPDATE OR DELETE ON public.validated_counts
  FOR EACH ROW
  EXECUTE FUNCTION public.block_closed_inventory();

CREATE OR REPLACE FUNCTION public.upsert_validated_count(
  _inventory_id uuid,
  _master_reference text,
  _location_id uuid,
  _quantity numeric,
  _round integer,
  _reason text,
  _validated_by uuid
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
BEGIN
  INSERT INTO public.validated_counts (
    inventory_id, master_reference, location_id, validated_quantity, audit_round, reason, validated_by
  ) VALUES (
    _inventory_id, _master_reference, _location_id, _quantity, _round, _reason, _validated_by
  )
  ON CONFLICT (inventory_id, location_id)
  DO UPDATE SET
    master_reference = EXCLUDED.master_reference,
    validated_quantity = EXCLUDED.validated_quantity,
    audit_round = EXCLUDED.audit_round,
    reason = EXCLUDED.reason,
    validated_by = EXCLUDED.validated_by,
    updated_at = now();
END;
$$;

GRANT EXECUTE ON FUNCTION public.upsert_validated_count(uuid, text, uuid, numeric, integer, text, uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.validate_and_close_round(_reference text, _admin_id uuid, _inventory_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path = 'public'
AS $function$
DECLARE
  v_inv uuid;
  v_inv_status text;
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
  v_sum_c1 NUMERIC;
  v_sum_s2 NUMERIC;
  v_sum_c3 NUMERIC;
  v_sum_c4 NUMERIC;
  v_matched_round TEXT := NULL;
  v_matched_total NUMERIC := NULL;
  v_location_quantity NUMERIC;
  v_location_round INTEGER;
  v_location_reason TEXT;
  v_sum_to_save NUMERIC := 0;
BEGIN
  v_inv := COALESCE(_inventory_id, public.get_active_inventory());

  SELECT status INTO v_inv_status FROM inventories WHERE id = v_inv;
  IF v_inv_status IS DISTINCT FROM 'abierto' THEN
    RETURN jsonb_build_object('success', false, 'error', 'El inventario está cerrado: no se permiten validaciones');
  END IF;

  SELECT * INTO v_master FROM inventory_master WHERE referencia = _reference AND inventory_id = v_inv;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Referencia no encontrada');
  END IF;

  v_erp := COALESCE(v_master.cant_total_erp, 0);

  SELECT COALESCE(SUM(ic.quantity_counted), 0) INTO v_sum_c1
  FROM inventory_counts ic JOIN locations l ON l.id = ic.location_id
  WHERE l.master_reference = _reference AND l.inventory_id = v_inv AND ic.audit_round = 1;

  SELECT COALESCE(SUM(ic.quantity_counted), 0) INTO v_sum_s2
  FROM inventory_counts ic JOIN locations l ON l.id = ic.location_id
  WHERE l.master_reference = _reference AND l.inventory_id = v_inv AND ic.audit_round = 2;

  SELECT COALESCE(SUM(ic.quantity_counted), 0) INTO v_sum_c3
  FROM inventory_counts ic JOIN locations l ON l.id = ic.location_id
  WHERE l.master_reference = _reference AND l.inventory_id = v_inv AND ic.audit_round = 3;

  SELECT COALESCE(SUM(ic.quantity_counted), 0) INTO v_sum_c4
  FROM inventory_counts ic JOIN locations l ON l.id = ic.location_id
  WHERE l.master_reference = _reference AND l.inventory_id = v_inv AND ic.audit_round = 4;

  IF v_master.audit_round = 3 AND v_sum_c3 = 0 THEN
    RETURN jsonb_build_object('success', false, 'action', 'waiting_for_counts', 'round', 3, 'message', 'Esperando conteos de ronda 3');
  END IF;

  IF v_master.audit_round = 4 AND v_sum_c4 = 0 THEN
    RETURN jsonb_build_object('success', false, 'action', 'waiting_for_counts', 'round', 4, 'message', 'Esperando conteos de ronda 4');
  END IF;

  IF v_master.audit_round = 1 THEN
    IF v_sum_c1 = v_erp AND v_sum_c1 > 0 THEN
      v_matched_round := 'C1=ERP';
      v_matched_total := v_sum_c1;
    ELSIF v_sum_s2 = v_erp AND v_sum_s2 > 0 THEN
      v_matched_round := 'C2=ERP';
      v_matched_total := v_sum_s2;
    ELSIF v_sum_c1 = v_sum_s2 AND v_sum_c1 > 0 THEN
      v_matched_round := 'C1=C2';
      v_matched_total := v_sum_c1;
    END IF;
  ELSIF v_master.audit_round = 3 THEN
    IF v_sum_c3 = v_erp AND v_sum_c3 > 0 THEN
      v_matched_round := 'C3=ERP';
      v_matched_total := v_sum_c3;
    ELSIF v_sum_c3 = v_sum_c1 AND v_sum_c3 > 0 THEN
      v_matched_round := 'C3=C1';
      v_matched_total := v_sum_c3;
    ELSIF v_sum_c3 = v_sum_s2 AND v_sum_c3 > 0 THEN
      v_matched_round := 'C3=C2';
      v_matched_total := v_sum_c3;
    END IF;
  ELSIF v_master.audit_round = 4 THEN
    IF v_sum_c4 = v_erp AND v_sum_c4 > 0 THEN
      v_matched_round := 'C4=ERP';
      v_matched_total := v_sum_c4;
    ELSIF v_sum_c4 = v_sum_c3 AND v_sum_c4 > 0 THEN
      v_matched_round := 'C4=C3';
      v_matched_total := v_sum_c4;
    ELSIF v_sum_c4 = v_sum_s2 AND v_sum_c4 > 0 THEN
      v_matched_round := 'C4=C2';
      v_matched_total := v_sum_c4;
    ELSIF v_sum_c4 = v_sum_c1 AND v_sum_c4 > 0 THEN
      v_matched_round := 'C4=C1';
      v_matched_total := v_sum_c4;
    END IF;
  END IF;

  IF v_matched_round IS NOT NULL THEN
    v_sum_to_save := 0;

    FOR v_location IN
      SELECT l.id FROM locations l
      WHERE l.master_reference = _reference AND l.inventory_id = v_inv AND l.validated_at_round IS NULL
    LOOP
      v_location_quantity := NULL;
      v_location_round := v_master.audit_round;

      IF v_matched_round IN ('C1=ERP', 'C1=C2') THEN
        SELECT quantity_counted INTO v_location_quantity
        FROM inventory_counts
        WHERE location_id = v_location.id AND audit_round = 1;
        v_location_round := 1;
        v_location_reason := CASE WHEN v_matched_round = 'C1=ERP' THEN 'C1=ERP' ELSE 'C1=C2' END;
      ELSIF v_matched_round = 'C2=ERP' THEN
        SELECT quantity_counted INTO v_location_quantity
        FROM inventory_counts
        WHERE location_id = v_location.id AND audit_round = 2;
        v_location_round := 2;
        v_location_reason := 'C2=ERP';
      ELSIF v_matched_round IN ('C3=ERP', 'C3=C1', 'C3=C2') THEN
        SELECT quantity_counted INTO v_location_quantity
        FROM inventory_counts
        WHERE location_id = v_location.id AND audit_round = 3;
        v_location_round := 3;
        v_location_reason := CASE
          WHEN v_matched_round = 'C3=ERP' THEN 'C3=ERP'
          WHEN v_matched_round = 'C3=C1' THEN 'C3=C1'
          ELSE 'C3=C2'
        END;
      ELSIF v_matched_round IN ('C4=ERP', 'C4=C3', 'C4=C2', 'C4=C1') THEN
        SELECT quantity_counted INTO v_location_quantity
        FROM inventory_counts
        WHERE location_id = v_location.id AND audit_round = 4;
        v_location_round := 4;
        v_location_reason := CASE
          WHEN v_matched_round = 'C4=ERP' THEN 'C4=ERP'
          WHEN v_matched_round = 'C4=C3' THEN 'C4=C3'
          WHEN v_matched_round = 'C4=C2' THEN 'C4=C2'
          ELSE 'C4=C1'
        END;
      END IF;

      IF v_location_quantity IS NULL THEN
        v_location_quantity := 0;
      END IF;

      v_sum_to_save := v_sum_to_save + v_location_quantity;

      UPDATE locations SET
        validated_at_round = v_location_round,
        validated_quantity = v_location_quantity
      WHERE id = v_location.id;

      PERFORM public.upsert_validated_count(
        v_inv, _reference, v_location.id, v_location_quantity, v_location_round, v_location_reason, _admin_id
      );
    END LOOP;

    IF v_sum_to_save <> v_matched_total THEN
      RAISE EXCEPTION 'Inconsistencia en validación por total: la suma de ubicaciones (%) no coincide con el total que hizo match (%)', v_sum_to_save, v_matched_total;
    END IF;

    SELECT COALESCE(SUM(validated_quantity), 0) INTO v_sum_validated
    FROM locations WHERE master_reference = _reference AND inventory_id = v_inv;

    v_history_array := COALESCE(v_master.count_history, '[]'::jsonb) || jsonb_build_object(
      'round', v_master.audit_round,
      'sum_validated', v_sum_validated,
      'reason', v_matched_round,
      'sum_c1', v_sum_c1, 'sum_c2', v_sum_s2, 'sum_c3', v_sum_c3, 'sum_c4', v_sum_c4,
      'erp', v_erp, 'timestamp', now()
    );

    UPDATE inventory_master SET status_slug = 'auditado', count_history = v_history_array
    WHERE referencia = _reference AND inventory_id = v_inv;

    INSERT INTO audit_logs (master_reference, user_id, action_type, round_number, new_data)
    VALUES (_reference, _admin_id, 'closed_by_total_sum', v_master.audit_round,
            jsonb_build_object('sum', v_sum_validated, 'reason', v_matched_round, 'inventory_id', v_inv));

    RETURN jsonb_build_object('success', true, 'action', 'closed', 'reason', v_matched_round, 'total', v_sum_validated);
  END IF;

  FOR v_location IN
    SELECT l.id, l.location_name, l.validated_at_round, l.validated_quantity, l.discovered_at_round
    FROM locations l
    WHERE l.master_reference = _reference AND l.inventory_id = v_inv
  LOOP
    IF v_location.validated_at_round IS NOT NULL THEN
      v_sum_validated := v_sum_validated + COALESCE(v_location.validated_quantity, 0);
      v_validated_locations := v_validated_locations + 1;
      CONTINUE;
    END IF;

    v_discovered_round := v_location.discovered_at_round;

    SELECT quantity_counted INTO v_count_c1 FROM inventory_counts WHERE location_id = v_location.id AND audit_round = 1;
    SELECT quantity_counted INTO v_count_c2 FROM inventory_counts WHERE location_id = v_location.id AND audit_round = 2;
    SELECT quantity_counted INTO v_count_c3 FROM inventory_counts WHERE location_id = v_location.id AND audit_round = 3;
    SELECT quantity_counted INTO v_count_c4 FROM inventory_counts WHERE location_id = v_location.id AND audit_round = 4;

    IF v_master.audit_round = 1 THEN
      IF v_discovered_round = 2 THEN
        IF v_count_c2 IS NOT NULL THEN
          UPDATE locations SET validated_at_round = 2, validated_quantity = v_count_c2 WHERE id = v_location.id;
          PERFORM public.upsert_validated_count(v_inv, _reference, v_location.id, v_count_c2, 2, 'discovered_at_C2', _admin_id);
          v_sum_validated := v_sum_validated + v_count_c2;
          v_any_validated_this_round := TRUE;
          v_validated_locations := v_validated_locations + 1;
          v_validation_details := v_validation_details || jsonb_build_object('location_id', v_location.id, 'validated_round', 2, 'quantity', v_count_c2, 'reason', 'discovered_at_C2');
        ELSE
          v_all_validated := FALSE;
          v_pending_locations := v_pending_locations + 1;
        END IF;
        CONTINUE;
      END IF;

      IF v_count_c1 IS NULL OR v_count_c2 IS NULL THEN
        v_all_validated := FALSE;
        v_pending_locations := v_pending_locations + 1;
        CONTINUE;
      END IF;

      IF v_count_c1 = v_count_c2 THEN
        UPDATE locations SET validated_at_round = 1, validated_quantity = v_count_c1 WHERE id = v_location.id;
        PERFORM public.upsert_validated_count(v_inv, _reference, v_location.id, v_count_c1, 1, 'C1=C2', _admin_id);
        v_sum_validated := v_sum_validated + v_count_c1;
        v_any_validated_this_round := TRUE;
        v_validated_locations := v_validated_locations + 1;
        v_validation_details := v_validation_details || jsonb_build_object('location_id', v_location.id, 'validated_round', 1, 'quantity', v_count_c1, 'reason', 'C1=C2');
      ELSE
        v_all_validated := FALSE;
        v_pending_locations := v_pending_locations + 1;
      END IF;

    ELSIF v_master.audit_round = 3 THEN
      IF v_count_c3 IS NULL THEN
        v_all_validated := FALSE;
        v_pending_locations := v_pending_locations + 1;
        CONTINUE;
      END IF;

      IF v_discovered_round = 2 THEN
        IF v_count_c3 = v_count_c2 THEN
          UPDATE locations SET validated_at_round = 3, validated_quantity = v_count_c3 WHERE id = v_location.id;
          PERFORM public.upsert_validated_count(v_inv, _reference, v_location.id, v_count_c3, 3, 'C3=C2 (discovered_at_C2)', _admin_id);
          v_sum_validated := v_sum_validated + v_count_c3;
          v_any_validated_this_round := TRUE;
          v_validated_locations := v_validated_locations + 1;
          v_validation_details := v_validation_details || jsonb_build_object('location_id', v_location.id, 'validated_round', 3, 'quantity', v_count_c3, 'reason', 'C3=C2 (discovered_at_C2)');
        ELSE
          v_all_validated := FALSE;
          v_pending_locations := v_pending_locations + 1;
        END IF;
        CONTINUE;
      END IF;

      IF v_discovered_round = 3 THEN
        UPDATE locations SET validated_at_round = 3, validated_quantity = v_count_c3 WHERE id = v_location.id;
        PERFORM public.upsert_validated_count(v_inv, _reference, v_location.id, v_count_c3, 3, 'discovered_at_C3', _admin_id);
        v_sum_validated := v_sum_validated + v_count_c3;
        v_any_validated_this_round := TRUE;
        v_validated_locations := v_validated_locations + 1;
        v_validation_details := v_validation_details || jsonb_build_object('location_id', v_location.id, 'validated_round', 3, 'quantity', v_count_c3, 'reason', 'discovered_at_C3');
        CONTINUE;
      END IF;

      IF v_count_c3 = v_count_c1 OR v_count_c3 = v_count_c2 THEN
        UPDATE locations SET validated_at_round = 3, validated_quantity = v_count_c3 WHERE id = v_location.id;
        PERFORM public.upsert_validated_count(v_inv, _reference, v_location.id, v_count_c3, 3, CASE WHEN v_count_c3 = v_count_c1 THEN 'C3=C1' ELSE 'C3=C2' END, _admin_id);
        v_sum_validated := v_sum_validated + v_count_c3;
        v_any_validated_this_round := TRUE;
        v_validated_locations := v_validated_locations + 1;
        v_validation_details := v_validation_details || jsonb_build_object('location_id', v_location.id, 'validated_round', 3, 'quantity', v_count_c3, 'reason', CASE WHEN v_count_c3 = v_count_c1 THEN 'C3=C1' ELSE 'C3=C2' END);
      ELSE
        v_all_validated := FALSE;
        v_pending_locations := v_pending_locations + 1;
      END IF;

    ELSIF v_master.audit_round = 4 THEN
      IF v_count_c4 IS NULL THEN
        v_all_validated := FALSE;
        v_pending_locations := v_pending_locations + 1;
        CONTINUE;
      END IF;

      IF v_discovered_round = 4 THEN
        UPDATE locations SET validated_at_round = 4, validated_quantity = v_count_c4 WHERE id = v_location.id;
        PERFORM public.upsert_validated_count(v_inv, _reference, v_location.id, v_count_c4, 4, 'discovered_at_C4', _admin_id);
        v_sum_validated := v_sum_validated + v_count_c4;
        v_any_validated_this_round := TRUE;
        v_validated_locations := v_validated_locations + 1;
        v_validation_details := v_validation_details || jsonb_build_object('location_id', v_location.id, 'validated_round', 4, 'quantity', v_count_c4, 'reason', 'discovered_at_C4');
        CONTINUE;
      END IF;

      IF v_discovered_round = 3 THEN
        IF v_count_c4 = v_count_c3 THEN
          UPDATE locations SET validated_at_round = 4, validated_quantity = v_count_c4 WHERE id = v_location.id;
          PERFORM public.upsert_validated_count(v_inv, _reference, v_location.id, v_count_c4, 4, 'C4=C3 (discovered_at_C3)', _admin_id);
          v_sum_validated := v_sum_validated + v_count_c4;
          v_any_validated_this_round := TRUE;
          v_validated_locations := v_validated_locations + 1;
          v_validation_details := v_validation_details || jsonb_build_object('location_id', v_location.id, 'validated_round', 4, 'quantity', v_count_c4, 'reason', 'C4=C3 (discovered_at_C3)');
        ELSE
          v_all_validated := FALSE;
          v_pending_locations := v_pending_locations + 1;
        END IF;
        CONTINUE;
      END IF;

      IF v_discovered_round = 2 THEN
        IF v_count_c4 = v_count_c2 OR v_count_c4 = v_count_c3 THEN
          UPDATE locations SET validated_at_round = 4, validated_quantity = v_count_c4 WHERE id = v_location.id;
          PERFORM public.upsert_validated_count(v_inv, _reference, v_location.id, v_count_c4, 4, CASE WHEN v_count_c4 = v_count_c2 THEN 'C4=C2' ELSE 'C4=C3' END || ' (discovered_at_C2)', _admin_id);
          v_sum_validated := v_sum_validated + v_count_c4;
          v_any_validated_this_round := TRUE;
          v_validated_locations := v_validated_locations + 1;
          v_validation_details := v_validation_details || jsonb_build_object('location_id', v_location.id, 'validated_round', 4, 'quantity', v_count_c4, 'reason', CASE WHEN v_count_c4 = v_count_c2 THEN 'C4=C2' ELSE 'C4=C3' END || ' (discovered_at_C2)');
        ELSE
          v_all_validated := FALSE;
          v_pending_locations := v_pending_locations + 1;
        END IF;
        CONTINUE;
      END IF;

      IF v_count_c4 = v_count_c1 OR v_count_c4 = v_count_c2 OR v_count_c4 = v_count_c3 THEN
        UPDATE locations SET validated_at_round = 4, validated_quantity = v_count_c4 WHERE id = v_location.id;
        PERFORM public.upsert_validated_count(v_inv, _reference, v_location.id, v_count_c4, 4, CASE WHEN v_count_c4 = v_count_c1 THEN 'C4=C1' WHEN v_count_c4 = v_count_c2 THEN 'C4=C2' ELSE 'C4=C3' END, _admin_id);
        v_sum_validated := v_sum_validated + v_count_c4;
        v_any_validated_this_round := TRUE;
        v_validated_locations := v_validated_locations + 1;
        v_validation_details := v_validation_details || jsonb_build_object('location_id', v_location.id, 'validated_round', 4, 'quantity', v_count_c4,
          'reason', CASE WHEN v_count_c4 = v_count_c1 THEN 'C4=C1' WHEN v_count_c4 = v_count_c2 THEN 'C4=C2' ELSE 'C4=C3' END);
      ELSE
        v_all_validated := FALSE;
        v_pending_locations := v_pending_locations + 1;
      END IF;

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
      PERFORM public.upsert_validated_count(v_inv, _reference, v_location.id, v_count_current, 5, 'superadmin_forced', _admin_id);
      v_sum_validated := v_sum_validated + v_count_current;
      v_any_validated_this_round := TRUE;
      v_validated_locations := v_validated_locations + 1;
      v_validation_details := v_validation_details || jsonb_build_object('location_id', v_location.id, 'validated_round', 5, 'quantity', v_count_current, 'reason', 'superadmin_forced');
    END IF;
  END LOOP;

  v_history_array := COALESCE(v_master.count_history, '[]'::jsonb) || jsonb_build_object(
    'round', v_master.audit_round,
    'sum_validated', v_sum_validated,
    'validated_locations', v_validated_locations,
    'pending_locations', v_pending_locations,
    'validation_details', v_validation_details,
    'timestamp', now()
  );

  IF v_all_validated AND v_validated_locations > 0 THEN
    IF v_sum_validated = v_erp THEN
      UPDATE inventory_master SET status_slug = 'auditado', count_history = v_history_array WHERE referencia = _reference AND inventory_id = v_inv;
      v_result := jsonb_build_object('success', true, 'action', 'closed', 'reason', 'all_locations_validated_matches_erp', 'total', v_sum_validated);
    ELSIF v_master.audit_round = 5 THEN
      UPDATE inventory_master SET status_slug = 'cerrado_forzado', count_history = v_history_array WHERE referencia = _reference AND inventory_id = v_inv;
      v_result := jsonb_build_object('success', true, 'action', 'forced_close_superadmin', 'total', v_sum_validated);
    ELSE
      UPDATE inventory_master SET status_slug = 'auditado', count_history = v_history_array WHERE referencia = _reference AND inventory_id = v_inv;
      v_result := jsonb_build_object('success', true, 'action', 'closed', 'reason', 'all_locations_validated', 'total', v_sum_validated);
    END IF;

  ELSIF v_pending_locations > 0 THEN
    IF v_master.audit_round = 1 THEN
      UPDATE inventory_master SET audit_round = 3, status_slug = 'conflicto', count_history = v_history_array WHERE referencia = _reference AND inventory_id = v_inv;
      v_result := jsonb_build_object('success', true, 'action', 'next_round', 'new_round', 3, 'pending_locations', v_pending_locations, 'validated_locations', v_validated_locations);
    ELSIF v_master.audit_round = 3 THEN
      UPDATE inventory_master SET audit_round = 4, status_slug = 'conflicto', count_history = v_history_array WHERE referencia = _reference AND inventory_id = v_inv;
      v_result := jsonb_build_object('success', true, 'action', 'next_round', 'new_round', 4, 'pending_locations', v_pending_locations, 'validated_locations', v_validated_locations);
    ELSIF v_master.audit_round = 4 THEN
      UPDATE inventory_master SET audit_round = 5, status_slug = 'critico', count_history = v_history_array WHERE referencia = _reference AND inventory_id = v_inv;
      v_result := jsonb_build_object('success', true, 'action', 'escalate_to_superadmin', 'new_round', 5, 'pending_locations', v_pending_locations, 'validated_locations', v_validated_locations);
    ELSE
      v_result := jsonb_build_object('success', false, 'error', 'Estado de ronda inválido', 'round', v_master.audit_round);
    END IF;
  ELSE
    v_result := jsonb_build_object('success', false, 'error', 'No hay ubicaciones para validar');
  END IF;

  INSERT INTO audit_logs (master_reference, user_id, action_type, round_number, new_data)
  VALUES (_reference, _admin_id, v_result->>'action', v_master.audit_round, v_result || jsonb_build_object('inventory_id', v_inv));

  RETURN v_result;
END;
$function$;
