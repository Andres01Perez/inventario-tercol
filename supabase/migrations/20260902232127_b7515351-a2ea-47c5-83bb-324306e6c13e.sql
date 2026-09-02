
CREATE OR REPLACE FUNCTION public.revalidate_reference(_inventory_id uuid, _reference text, _bodega text, _user_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_inv uuid;
  v_inv_status text;
  v_result jsonb;
  v_i integer;
  v_round integer;
  v_prev_round integer;
BEGIN
  IF NOT public.is_superadmin(_user_id) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Solo superadmin puede re-validar');
  END IF;

  v_inv := COALESCE(_inventory_id, public.get_active_inventory());

  SELECT status INTO v_inv_status FROM inventories WHERE id = v_inv;
  IF v_inv_status IS DISTINCT FROM 'abierto' THEN
    RETURN jsonb_build_object('success', false, 'error', 'El inventario está cerrado');
  END IF;

  IF _bodega NOT IN ('almacen', 'planta') THEN
    RETURN jsonb_build_object('success', false, 'error', 'Bodega inválida');
  END IF;

  -- 1) Limpiar validaciones persistidas del bloque
  DELETE FROM validated_counts vc
  USING locations l
  WHERE vc.location_id = l.id
    AND vc.inventory_id = v_inv
    AND vc.master_reference = _reference
    AND l.inventory_id = v_inv
    AND l.master_reference = _reference
    AND public.location_bodega(l.assigned_admin_id) = _bodega;

  UPDATE locations l
  SET validated_at_round = NULL, validated_quantity = NULL, terminado = false
  WHERE l.inventory_id = v_inv
    AND l.master_reference = _reference
    AND public.location_bodega(l.assigned_admin_id) = _bodega;

  -- 2) Reiniciar el bloque a ronda 1 / pendiente
  IF _bodega = 'planta' THEN
    UPDATE inventory_master SET audit_round_pl = 1, status_pl = 'pendiente'
    WHERE inventory_id = v_inv AND referencia = _reference;
  ELSE
    UPDATE inventory_master SET audit_round_alm = 1, status_alm = 'pendiente'
    WHERE inventory_id = v_inv AND referencia = _reference;
  END IF;

  -- 3) Re-evaluar desde C1 con los conteos existentes, avanzando de ronda mientras aplique
  FOR v_i IN 1..4 LOOP
    SELECT CASE WHEN _bodega = 'planta' THEN audit_round_pl ELSE audit_round_alm END
    INTO v_prev_round FROM inventory_master WHERE inventory_id = v_inv AND referencia = _reference;

    v_result := public.validate_bucket(v_inv, _reference, _bodega, _user_id);

    SELECT CASE WHEN _bodega = 'planta' THEN audit_round_pl ELSE audit_round_alm END
    INTO v_round FROM inventory_master WHERE inventory_id = v_inv AND referencia = _reference;

    EXIT WHEN v_round = v_prev_round OR COALESCE(v_result->>'action','') = 'closed';
  END LOOP;

  -- 4) Historial y bitácora
  UPDATE inventory_master
  SET count_history = COALESCE(count_history, '[]'::jsonb) || jsonb_build_object(
        'action', 'revalidacion',
        'bodega', _bodega,
        'result', v_result,
        'at', now(),
        'by', _user_id
      )
  WHERE inventory_id = v_inv AND referencia = _reference;

  INSERT INTO audit_logs (master_reference, user_id, action_type, new_data)
  VALUES (_reference, _user_id, 'revalidacion',
          jsonb_build_object('inventory_id', v_inv, 'bodega', _bodega, 'result', v_result));

  RETURN COALESCE(v_result, jsonb_build_object('success', true, 'action', 'revalidated'));
END;
$function$;

CREATE OR REPLACE FUNCTION public.pt_revalidate_reference(_inventory_id uuid, _referencia text, _user_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_inv uuid;
  v_inv_status text;
  v_result jsonb;
  v_i integer;
  v_round integer;
  v_prev_round integer;
BEGIN
  IF NOT public.is_superadmin(_user_id) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Solo superadmin puede re-validar');
  END IF;

  v_inv := COALESCE(_inventory_id, public.get_active_inventory());

  SELECT status INTO v_inv_status FROM inventories WHERE id = v_inv;
  IF v_inv_status IS DISTINCT FROM 'abierto' THEN
    RETURN jsonb_build_object('success', false, 'error', 'El inventario está cerrado');
  END IF;

  DELETE FROM pt_validated_counts
  WHERE inventory_id = v_inv AND referencia = _referencia;

  UPDATE pt_locations
  SET validated_at_round = NULL, validated_quantity = NULL, terminado = false
  WHERE inventory_id = v_inv AND referencia = _referencia;

  UPDATE pt_master SET audit_round = 1, status_slug = 'pendiente'
  WHERE inventory_id = v_inv AND referencia = _referencia;

  FOR v_i IN 1..4 LOOP
    SELECT audit_round INTO v_prev_round FROM pt_master WHERE inventory_id = v_inv AND referencia = _referencia;

    v_result := public.pt_validate_and_close_round(v_inv, _referencia, _user_id);

    SELECT audit_round INTO v_round FROM pt_master WHERE inventory_id = v_inv AND referencia = _referencia;

    EXIT WHEN v_round = v_prev_round OR COALESCE(v_result->>'action','') = 'closed';
  END LOOP;

  UPDATE pt_master
  SET count_history = COALESCE(count_history, '[]'::jsonb) || jsonb_build_object(
        'action', 'revalidacion',
        'result', v_result,
        'at', now(),
        'by', _user_id
      )
  WHERE inventory_id = v_inv AND referencia = _referencia;

  INSERT INTO audit_logs (master_reference, user_id, action_type, new_data)
  VALUES (_referencia, _user_id, 'revalidacion_pt',
          jsonb_build_object('inventory_id', v_inv, 'result', v_result));

  RETURN COALESCE(v_result, jsonb_build_object('success', true, 'action', 'revalidated'));
END;
$function$;

GRANT EXECUTE ON FUNCTION public.revalidate_reference(uuid, text, text, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.pt_revalidate_reference(uuid, text, uuid) TO authenticated;
