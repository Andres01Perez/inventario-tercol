-- 1. Trigger: marcar pt_locations.status_cX = 'contado'
CREATE OR REPLACE FUNCTION public.pt_update_location_status_on_count()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
BEGIN
  IF NEW.audit_round = 1 THEN
    UPDATE pt_locations SET status_c1 = 'contado' WHERE id = NEW.location_id AND status_c1 <> 'contado';
  ELSIF NEW.audit_round = 2 THEN
    UPDATE pt_locations SET status_c2 = 'contado' WHERE id = NEW.location_id AND status_c2 <> 'contado';
  ELSIF NEW.audit_round = 3 THEN
    UPDATE pt_locations SET status_c3 = 'contado' WHERE id = NEW.location_id AND status_c3 <> 'contado';
  ELSIF NEW.audit_round = 4 THEN
    UPDATE pt_locations SET status_c4 = 'contado' WHERE id = NEW.location_id AND status_c4 <> 'contado';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_pt_count_status ON public.pt_counts;
CREATE TRIGGER trg_pt_count_status
AFTER INSERT ON public.pt_counts
FOR EACH ROW EXECUTE FUNCTION public.pt_update_location_status_on_count();

-- 2. Trigger: propagar supervisor del piso a las ubicaciones
CREATE OR REPLACE FUNCTION public.pt_sync_floor_supervisor()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    UPDATE pt_locations SET assigned_supervisor_id = NULL
    WHERE inventory_id = OLD.inventory_id AND piso = OLD.piso;
    RETURN OLD;
  END IF;

  UPDATE pt_locations SET assigned_supervisor_id = NEW.supervisor_id
  WHERE inventory_id = NEW.inventory_id AND piso = NEW.piso
    AND assigned_supervisor_id IS DISTINCT FROM NEW.supervisor_id;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_pt_floor_supervisor ON public.pt_floor_assignments;
CREATE TRIGGER trg_pt_floor_supervisor
AFTER INSERT OR UPDATE OR DELETE ON public.pt_floor_assignments
FOR EACH ROW EXECUTE FUNCTION public.pt_sync_floor_supervisor();

-- 3. Upsert de validaciones PT
CREATE OR REPLACE FUNCTION public.pt_upsert_validated_count(
  _inventory_id uuid, _referencia text, _location_id uuid,
  _quantity numeric, _round integer, _reason text, _validated_by uuid
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  INSERT INTO public.pt_validated_counts (
    inventory_id, referencia, location_id, validated_quantity, audit_round, reason, validated_by
  ) VALUES (
    _inventory_id, _referencia, _location_id, _quantity, _round, _reason, _validated_by
  )
  ON CONFLICT (inventory_id, location_id)
  DO UPDATE SET
    referencia = EXCLUDED.referencia,
    validated_quantity = EXCLUDED.validated_quantity,
    audit_round = EXCLUDED.audit_round,
    reason = EXCLUDED.reason,
    validated_by = EXCLUDED.validated_by,
    updated_at = now();
END;
$$;

-- índice único requerido para el upsert (si no existe)
CREATE UNIQUE INDEX IF NOT EXISTS pt_validated_counts_inv_loc_key
  ON public.pt_validated_counts (inventory_id, location_id);

-- 4. Validación y cierre de ronda PT
CREATE OR REPLACE FUNCTION public.pt_validate_and_close_round(
  _inventory_id uuid, _referencia text, _user_id uuid
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_inv uuid;
  v_inv_status text;
  v_master RECORD;
  v_round integer;
  v_erp numeric;
  v_loc_count integer;
  v_missing integer;
  v_sum_c1 numeric; v_sum_c2 numeric; v_sum_c3 numeric; v_sum_c4 numeric;
  v_matched text := NULL;
  v_matched_total numeric := NULL;
  v_location RECORD;
  v_qty numeric;
  v_loc_round integer;
  v_reason text;
  v_sum_to_save numeric := 0;
  v_sum_validated numeric := 0;
  v_pending integer := 0;
  v_validated integer := 0;
  v_all boolean := TRUE;
  v_c1 numeric; v_c2 numeric; v_c3 numeric; v_c4 numeric;
  v_disc integer;
  v_new_round integer;
  v_new_status text;
  v_result jsonb;
BEGIN
  v_inv := COALESCE(_inventory_id, public.get_active_inventory());

  SELECT status INTO v_inv_status FROM inventories WHERE id = v_inv;
  IF v_inv_status IS DISTINCT FROM 'abierto' THEN
    RETURN jsonb_build_object('success', false, 'error', 'El inventario está cerrado');
  END IF;

  SELECT * INTO v_master FROM pt_master WHERE inventory_id = v_inv AND referencia = _referencia;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Referencia PT no encontrada');
  END IF;

  v_round := v_master.audit_round;
  v_erp := COALESCE(v_master.cant_erp, 0);

  IF v_master.status_slug IN ('auditado', 'cerrado_forzado', 'n/a') THEN
    RETURN jsonb_build_object('success', true, 'action', 'skipped', 'reason', 'referencia_cerrada');
  END IF;

  SELECT COUNT(*) INTO v_loc_count
  FROM pt_locations l
  WHERE l.inventory_id = v_inv AND l.referencia = _referencia AND l.activo;

  IF v_loc_count = 0 THEN
    IF v_erp = 0 THEN
      UPDATE pt_master SET status_slug = 'n/a' WHERE inventory_id = v_inv AND referencia = _referencia;
      RETURN jsonb_build_object('success', true, 'action', 'skipped', 'reason', 'sin_erp_ni_ubicaciones');
    END IF;
    UPDATE pt_master SET status_slug = 'critico' WHERE inventory_id = v_inv AND referencia = _referencia;
    RETURN jsonb_build_object('success', true, 'action', 'descuadre_sin_ubicaciones', 'erp', v_erp);
  END IF;

  -- Esperar a que todas las ubicaciones activas tengan conteo de la ronda vigente
  SELECT COUNT(*) INTO v_missing
  FROM pt_locations l
  WHERE l.inventory_id = v_inv AND l.referencia = _referencia AND l.activo
    AND l.validated_at_round IS NULL
    AND (
      CASE
        WHEN v_round = 1 AND COALESCE(l.discovered_at_round, 1) = 2 THEN
          NOT EXISTS (SELECT 1 FROM pt_counts c WHERE c.location_id = l.id AND c.audit_round = 2)
        WHEN v_round = 1 THEN
          NOT EXISTS (SELECT 1 FROM pt_counts c WHERE c.location_id = l.id AND c.audit_round = 1)
          OR NOT EXISTS (SELECT 1 FROM pt_counts c WHERE c.location_id = l.id AND c.audit_round = 2)
        ELSE
          NOT EXISTS (SELECT 1 FROM pt_counts c WHERE c.location_id = l.id AND c.audit_round = v_round)
      END
    );

  IF v_missing > 0 THEN
    RETURN jsonb_build_object('success', false, 'action', 'waiting_for_counts', 'round', v_round, 'missing_locations', v_missing);
  END IF;

  SELECT
    COALESCE(SUM(CASE WHEN c.audit_round = 1 THEN c.quantity_counted END), 0),
    COALESCE(SUM(CASE WHEN c.audit_round = 2 THEN c.quantity_counted END), 0),
    COALESCE(SUM(CASE WHEN c.audit_round = 3 THEN c.quantity_counted END), 0),
    COALESCE(SUM(CASE WHEN c.audit_round = 4 THEN c.quantity_counted END), 0)
  INTO v_sum_c1, v_sum_c2, v_sum_c3, v_sum_c4
  FROM pt_counts c
  JOIN pt_locations l ON l.id = c.location_id
  WHERE l.inventory_id = v_inv AND l.referencia = _referencia AND l.activo;

  IF v_round = 1 THEN
    IF v_sum_c1 = v_erp AND v_sum_c1 > 0 THEN v_matched := 'C1=ERP'; v_matched_total := v_sum_c1;
    ELSIF v_sum_c2 = v_erp AND v_sum_c2 > 0 THEN v_matched := 'C2=ERP'; v_matched_total := v_sum_c2;
    ELSIF v_sum_c1 = v_sum_c2 AND v_sum_c1 > 0 THEN v_matched := 'C1=C2'; v_matched_total := v_sum_c1;
    END IF;
  ELSIF v_round = 3 THEN
    IF v_sum_c3 = v_erp AND v_sum_c3 > 0 THEN v_matched := 'C3=ERP'; v_matched_total := v_sum_c3;
    ELSIF v_sum_c3 = v_sum_c1 AND v_sum_c3 > 0 THEN v_matched := 'C3=C1'; v_matched_total := v_sum_c3;
    ELSIF v_sum_c3 = v_sum_c2 AND v_sum_c3 > 0 THEN v_matched := 'C3=C2'; v_matched_total := v_sum_c3;
    END IF;
  ELSIF v_round = 4 THEN
    IF v_sum_c4 = v_erp AND v_sum_c4 > 0 THEN v_matched := 'C4=ERP'; v_matched_total := v_sum_c4;
    ELSIF v_sum_c4 = v_sum_c3 AND v_sum_c4 > 0 THEN v_matched := 'C4=C3'; v_matched_total := v_sum_c4;
    ELSIF v_sum_c4 = v_sum_c2 AND v_sum_c4 > 0 THEN v_matched := 'C4=C2'; v_matched_total := v_sum_c4;
    ELSIF v_sum_c4 = v_sum_c1 AND v_sum_c4 > 0 THEN v_matched := 'C4=C1'; v_matched_total := v_sum_c4;
    END IF;
  END IF;

  IF v_matched IS NOT NULL THEN
    v_loc_round := CASE
      WHEN v_matched IN ('C1=ERP','C1=C2') THEN 1
      WHEN v_matched = 'C2=ERP' THEN 2
      WHEN v_matched IN ('C3=ERP','C3=C1','C3=C2') THEN 3
      ELSE 4 END;

    FOR v_location IN
      SELECT l.id FROM pt_locations l
      WHERE l.inventory_id = v_inv AND l.referencia = _referencia AND l.activo
        AND l.validated_at_round IS NULL
    LOOP
      SELECT quantity_counted INTO v_qty
      FROM pt_counts WHERE location_id = v_location.id AND audit_round = v_loc_round;
      IF v_qty IS NULL THEN v_qty := 0; END IF;
      v_sum_to_save := v_sum_to_save + v_qty;

      UPDATE pt_locations
      SET validated_at_round = v_loc_round, validated_quantity = v_qty, terminado = TRUE
      WHERE id = v_location.id;

      PERFORM public.pt_upsert_validated_count(v_inv, _referencia, v_location.id, v_qty, v_loc_round, v_matched, _user_id);
    END LOOP;

    IF v_sum_to_save <> v_matched_total THEN
      RAISE EXCEPTION 'Inconsistencia PT: la suma por ubicación (%) no coincide con el total validado (%)', v_sum_to_save, v_matched_total;
    END IF;

    SELECT COALESCE(SUM(validated_quantity), 0) INTO v_sum_validated
    FROM pt_validated_counts WHERE inventory_id = v_inv AND referencia = _referencia;

    UPDATE pt_master
    SET status_slug = 'auditado',
        count_history = COALESCE(count_history, '[]'::jsonb) || jsonb_build_object(
          'timestamp', now(), 'action', 'closed', 'reason', v_matched,
          'total', v_sum_validated, 'erp', v_erp, 'round', v_round)
    WHERE inventory_id = v_inv AND referencia = _referencia;

    RETURN jsonb_build_object('success', true, 'action', 'closed', 'reason', v_matched,
      'total', v_sum_validated, 'erp', v_erp, 'round', v_round);
  END IF;

  -- Sin match por total: evaluar ubicación por ubicación
  FOR v_location IN
    SELECT l.id, l.validated_at_round, l.validated_quantity, l.discovered_at_round
    FROM pt_locations l
    WHERE l.inventory_id = v_inv AND l.referencia = _referencia AND l.activo
  LOOP
    IF v_location.validated_at_round IS NOT NULL THEN
      v_sum_validated := v_sum_validated + COALESCE(v_location.validated_quantity, 0);
      v_validated := v_validated + 1;
      CONTINUE;
    END IF;

    v_disc := COALESCE(v_location.discovered_at_round, 1);

    SELECT quantity_counted INTO v_c1 FROM pt_counts WHERE location_id = v_location.id AND audit_round = 1;
    SELECT quantity_counted INTO v_c2 FROM pt_counts WHERE location_id = v_location.id AND audit_round = 2;
    SELECT quantity_counted INTO v_c3 FROM pt_counts WHERE location_id = v_location.id AND audit_round = 3;
    SELECT quantity_counted INTO v_c4 FROM pt_counts WHERE location_id = v_location.id AND audit_round = 4;

    v_qty := NULL; v_loc_round := NULL; v_reason := NULL;

    IF v_round = 1 THEN
      IF v_disc = 2 THEN
        IF v_c2 IS NOT NULL THEN v_qty := v_c2; v_loc_round := 2; v_reason := 'discovered_at_C2'; END IF;
      ELSIF v_c1 IS NOT NULL AND v_c2 IS NOT NULL AND v_c1 = v_c2 THEN
        v_qty := v_c1; v_loc_round := 1; v_reason := 'C1=C2';
      END IF;
    ELSIF v_round = 3 THEN
      IF v_c3 IS NOT NULL THEN
        IF v_disc = 3 THEN
          v_qty := v_c3; v_loc_round := 3; v_reason := 'discovered_at_C3';
        ELSIF v_disc = 2 THEN
          IF v_c3 = v_c2 THEN v_qty := v_c3; v_loc_round := 3; v_reason := 'C3=C2 (discovered_at_C2)'; END IF;
        ELSIF v_c3 = v_c1 OR v_c3 = v_c2 THEN
          v_qty := v_c3; v_loc_round := 3;
          v_reason := CASE WHEN v_c3 = v_c1 THEN 'C3=C1' ELSE 'C3=C2' END;
        END IF;
      END IF;
    ELSIF v_round = 4 THEN
      IF v_c4 IS NOT NULL THEN
        IF v_disc = 4 THEN
          v_qty := v_c4; v_loc_round := 4; v_reason := 'discovered_at_C4';
        ELSIF v_disc = 3 THEN
          IF v_c4 = v_c3 THEN v_qty := v_c4; v_loc_round := 4; v_reason := 'C4=C3 (discovered_at_C3)'; END IF;
        ELSIF v_c4 = v_c1 OR v_c4 = v_c2 OR v_c4 = v_c3 THEN
          v_qty := v_c4; v_loc_round := 4;
          v_reason := CASE WHEN v_c4 = v_c1 THEN 'C4=C1' WHEN v_c4 = v_c2 THEN 'C4=C2' ELSE 'C4=C3' END;
        END IF;
      END IF;
    END IF;

    IF v_qty IS NULL THEN
      v_all := FALSE;
      v_pending := v_pending + 1;
      CONTINUE;
    END IF;

    UPDATE pt_locations
    SET validated_at_round = v_loc_round, validated_quantity = v_qty, terminado = TRUE
    WHERE id = v_location.id;
    PERFORM public.pt_upsert_validated_count(v_inv, _referencia, v_location.id, v_qty, v_loc_round, v_reason, _user_id);
    v_sum_validated := v_sum_validated + v_qty;
    v_validated := v_validated + 1;
  END LOOP;

  IF v_all AND v_validated > 0 THEN
    UPDATE pt_master
    SET status_slug = 'auditado',
        count_history = COALESCE(count_history, '[]'::jsonb) || jsonb_build_object(
          'timestamp', now(), 'action', 'closed', 'reason', 'all_locations_validated',
          'total', v_sum_validated, 'erp', v_erp, 'round', v_round)
    WHERE inventory_id = v_inv AND referencia = _referencia;
    v_result := jsonb_build_object('success', true, 'action', 'closed', 'reason', 'all_locations_validated',
      'total', v_sum_validated, 'erp', v_erp, 'round', v_round);
  ELSIF v_pending > 0 THEN
    v_new_round := CASE v_round WHEN 1 THEN 3 WHEN 3 THEN 4 ELSE 5 END;
    v_new_status := CASE WHEN v_new_round = 5 THEN 'critico' ELSE 'conflicto' END;
    UPDATE pt_master
    SET audit_round = v_new_round, status_slug = v_new_status,
        count_history = COALESCE(count_history, '[]'::jsonb) || jsonb_build_object(
          'timestamp', now(), 'action', 'next_round', 'new_round', v_new_round,
          'pending_locations', v_pending, 'erp', v_erp)
    WHERE inventory_id = v_inv AND referencia = _referencia;
    v_result := jsonb_build_object('success', true,
      'action', CASE WHEN v_new_round = 5 THEN 'escalate_to_superadmin' ELSE 'next_round' END,
      'new_round', v_new_round, 'pending_locations', v_pending, 'validated_locations', v_validated, 'erp', v_erp);
  ELSE
    v_result := jsonb_build_object('success', false, 'error', 'No hay ubicaciones para validar');
  END IF;

  RETURN v_result;
END;
$$;

GRANT EXECUTE ON FUNCTION public.pt_validate_and_close_round(uuid, text, uuid) TO authenticated;

-- 5. Realtime
ALTER TABLE public.pt_counts REPLICA IDENTITY FULL;
DO $$
BEGIN
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.pt_counts;
  EXCEPTION WHEN duplicate_object THEN NULL;
  END;
END $$;