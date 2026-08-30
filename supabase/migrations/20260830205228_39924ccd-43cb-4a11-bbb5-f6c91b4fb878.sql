-- 1. Estado por bodega en la maestra
ALTER TABLE public.inventory_master
  ADD COLUMN IF NOT EXISTS audit_round_alm integer NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS status_alm text NOT NULL DEFAULT 'pendiente',
  ADD COLUMN IF NOT EXISTS audit_round_pl integer NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS status_pl text NOT NULL DEFAULT 'pendiente';

UPDATE public.inventory_master
SET audit_round_alm = COALESCE(audit_round, 1),
    audit_round_pl  = COALESCE(audit_round, 1),
    status_alm      = COALESCE(status_slug, 'pendiente'),
    status_pl       = COALESCE(status_slug, 'pendiente');

-- 2. Bodega de una ubicación según el rol del admin dueño
CREATE OR REPLACE FUNCTION public.location_bodega(_assigned_admin_id uuid)
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT CASE
    WHEN _assigned_admin_id IS NULL THEN NULL
    WHEN public.has_role(_assigned_admin_id, 'admin_mp') THEN 'almacen'
    WHEN public.has_role(_assigned_admin_id, 'admin_pp') THEN 'planta'
    ELSE NULL
  END
$$;

-- ERP por bodega
CREATE OR REPLACE FUNCTION public.erp_bodega(_material_type material_type, _cant_alm_mp numeric, _cant_alm_pp numeric, _cant_pld numeric, _cant_plr numeric, _bodega text)
RETURNS numeric
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE
    WHEN _bodega = 'almacen' THEN
      CASE WHEN _material_type = 'MP'::material_type THEN COALESCE(_cant_alm_mp, 0) ELSE COALESCE(_cant_alm_pp, 0) END
    ELSE COALESCE(_cant_pld, 0) + COALESCE(_cant_plr, 0)
  END
$$;

-- 3. Vista de ubicaciones con bodega y ronda del bloque
DROP VIEW IF EXISTS public.locations_bodega_view;
CREATE VIEW public.locations_bodega_view
WITH (security_invoker = true) AS
SELECT
  l.id,
  l.inventory_id,
  l.master_reference,
  l.location_name,
  l.location_detail,
  l.punto_referencia,
  l.metodo_conteo,
  l.subcategoria,
  l.observaciones,
  l.assigned_supervisor_id,
  l.assigned_admin_id,
  l.status_c1,
  l.status_c2,
  l.status_c3,
  l.status_c4,
  l.validated_at_round,
  l.validated_quantity,
  l.discovered_at_round,
  l.created_at,
  l.updated_at,
  im.material_type,
  im.control,
  im.cant_total_erp,
  public.location_bodega(l.assigned_admin_id) AS bodega,
  CASE WHEN public.location_bodega(l.assigned_admin_id) = 'planta'
       THEN im.audit_round_pl ELSE im.audit_round_alm END AS bodega_round,
  CASE WHEN public.location_bodega(l.assigned_admin_id) = 'planta'
       THEN im.status_pl ELSE im.status_alm END AS bodega_status,
  public.erp_bodega(im.material_type, im.cant_alm_mp, im.cant_alm_pp, im.cant_pld, im.cant_plr,
                    COALESCE(public.location_bodega(l.assigned_admin_id), 'almacen')) AS bodega_erp
FROM public.locations l
JOIN public.inventory_master im
  ON im.referencia = l.master_reference AND im.inventory_id = l.inventory_id;

GRANT SELECT ON public.locations_bodega_view TO authenticated;
GRANT SELECT ON public.locations_bodega_view TO service_role;

-- 4. Validación por bloque
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

  IF v_round = 3 AND v_sum_c3 = 0 THEN
    RETURN jsonb_build_object('success', false, 'action', 'waiting_for_counts', 'round', 3);
  END IF;
  IF v_round = 4 AND v_sum_c4 = 0 THEN
    RETURN jsonb_build_object('success', false, 'action', 'waiting_for_counts', 'round', 4);
  END IF;

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

  -- Camino A: coincidencia por total del bloque
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

  -- Camino B: validación ubicación por ubicación dentro del bloque
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

REVOKE EXECUTE ON FUNCTION public.validate_bucket(uuid, text, text, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.validate_bucket(uuid, text, text, uuid) TO service_role;

-- 5. Orquestador público
CREATE OR REPLACE FUNCTION public.validate_and_close_round(_reference text, _admin_id uuid, _inventory_id uuid DEFAULT NULL::uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_inv uuid;
  v_inv_status text;
  v_master RECORD;
  v_unassigned INTEGER;
  v_res_alm JSONB;
  v_res_pl JSONB;
  v_status_alm TEXT;
  v_status_pl TEXT;
  v_round_alm INTEGER;
  v_round_pl INTEGER;
  v_ref_status TEXT;
  v_ref_round INTEGER;
  v_history JSONB;
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

  SELECT COUNT(*) INTO v_unassigned
  FROM locations l
  WHERE l.master_reference = _reference AND l.inventory_id = v_inv
    AND public.location_bodega(l.assigned_admin_id) IS NULL;

  IF v_unassigned > 0 THEN
    RETURN jsonb_build_object('success', false, 'error',
      'Hay ' || v_unassigned || ' ubicación(es) sin bodega: no tienen un admin de almacén o planta asignado');
  END IF;

  v_res_alm := public.validate_bucket(v_inv, _reference, 'almacen', _admin_id);
  v_res_pl  := public.validate_bucket(v_inv, _reference, 'planta', _admin_id);

  SELECT status_alm, status_pl, audit_round_alm, audit_round_pl
  INTO v_status_alm, v_status_pl, v_round_alm, v_round_pl
  FROM inventory_master WHERE referencia = _reference AND inventory_id = v_inv;

  -- Estado resumen de la referencia
  IF v_status_alm IN ('auditado','cerrado_forzado','n/a') AND v_status_pl IN ('auditado','cerrado_forzado','n/a') THEN
    IF v_status_alm = 'cerrado_forzado' OR v_status_pl = 'cerrado_forzado' THEN
      v_ref_status := 'cerrado_forzado';
    ELSE
      v_ref_status := 'auditado';
    END IF;
  ELSIF v_status_alm = 'critico' OR v_status_pl = 'critico' THEN
    v_ref_status := 'critico';
  ELSIF v_status_alm = 'conflicto' OR v_status_pl = 'conflicto' THEN
    v_ref_status := 'conflicto';
  ELSE
    v_ref_status := 'pendiente';
  END IF;

  -- Ronda resumen: la menor entre los bloques abiertos
  v_ref_round := LEAST(
    CASE WHEN v_status_alm IN ('auditado','cerrado_forzado','n/a') THEN 99 ELSE v_round_alm END,
    CASE WHEN v_status_pl  IN ('auditado','cerrado_forzado','n/a') THEN 99 ELSE v_round_pl  END
  );
  IF v_ref_round = 99 THEN
    v_ref_round := GREATEST(v_round_alm, v_round_pl);
  END IF;

  v_history := COALESCE(v_master.count_history, '[]'::jsonb) || jsonb_build_object(
    'timestamp', now(),
    'almacen', v_res_alm,
    'planta', v_res_pl,
    'status_alm', v_status_alm,
    'status_pl', v_status_pl,
    'round_alm', v_round_alm,
    'round_pl', v_round_pl
  );

  UPDATE inventory_master
  SET status_slug = v_ref_status, audit_round = v_ref_round, count_history = v_history
  WHERE referencia = _reference AND inventory_id = v_inv;

  INSERT INTO audit_logs (master_reference, user_id, action_type, round_number, new_data)
  VALUES (_reference, _admin_id, 'validate_by_bodega', v_ref_round,
    jsonb_build_object('inventory_id', v_inv, 'almacen', v_res_alm, 'planta', v_res_pl, 'reference_status', v_ref_status));

  RETURN jsonb_build_object(
    'success', COALESCE((v_res_alm->>'success')::boolean, false) OR COALESCE((v_res_pl->>'success')::boolean, false),
    'almacen', v_res_alm,
    'planta', v_res_pl,
    'reference_status', v_ref_status,
    'reference_round', v_ref_round
  );
END;
$function$;