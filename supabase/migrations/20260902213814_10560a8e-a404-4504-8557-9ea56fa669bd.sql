-- 1) Excepción de superadmin en los bloqueos de conteo sobre ubicaciones validadas
CREATE OR REPLACE FUNCTION public.block_count_on_validated_location()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
DECLARE
  v_validated integer;
BEGIN
  IF public.is_superadmin(auth.uid()) THEN
    RETURN NEW;
  END IF;
  SELECT validated_at_round INTO v_validated FROM public.locations WHERE id = NEW.location_id;
  IF v_validated IS NOT NULL THEN
    RAISE EXCEPTION 'La ubicación ya fue validada: no se pueden guardar nuevos conteos sobre una referencia cerrada';
  END IF;
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.pt_block_count_on_validated_location()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
BEGIN
  IF public.is_superadmin(auth.uid()) THEN
    RETURN NEW;
  END IF;
  IF EXISTS (SELECT 1 FROM public.pt_locations WHERE id = NEW.location_id AND validated_at_round IS NOT NULL) THEN
    RAISE EXCEPTION 'La ubicación ya fue validada: no se pueden guardar nuevos conteos sobre una referencia cerrada';
  END IF;
  RETURN NEW;
END;
$function$;

-- 2) Reabrir referencia (Almacén / Planta)
CREATE OR REPLACE FUNCTION public.reopen_reference(
  _inventory_id uuid,
  _reference text,
  _bodega text,
  _reason text,
  _user_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_locations uuid[];
  v_deleted integer := 0;
BEGIN
  IF NOT public.is_superadmin(_user_id) THEN
    RAISE EXCEPTION 'Solo el superadministrador puede reabrir una referencia';
  END IF;
  IF _reason IS NULL OR btrim(_reason) = '' THEN
    RAISE EXCEPTION 'Debe indicar un motivo para reabrir la referencia';
  END IF;
  IF _bodega NOT IN ('almacen', 'planta') THEN
    RAISE EXCEPTION 'Bodega inválida: %', _bodega;
  END IF;

  SELECT array_agg(l.id) INTO v_locations
  FROM public.locations l
  WHERE l.inventory_id = _inventory_id
    AND l.master_reference = _reference
    AND public.location_bodega(l.assigned_admin_id) = _bodega;

  IF v_locations IS NULL THEN
    v_locations := ARRAY[]::uuid[];
  END IF;

  DELETE FROM public.validated_counts vc
  WHERE vc.inventory_id = _inventory_id
    AND vc.master_reference = _reference
    AND vc.location_id = ANY(v_locations);
  GET DIAGNOSTICS v_deleted = ROW_COUNT;

  UPDATE public.locations
  SET validated_quantity = NULL,
      validated_at_round = NULL,
      terminado = false,
      updated_at = now()
  WHERE id = ANY(v_locations);

  IF _bodega = 'almacen' THEN
    UPDATE public.inventory_master
    SET status_alm = 'pendiente',
        audit_round_alm = 1,
        count_history = COALESCE(count_history, '[]'::jsonb) || jsonb_build_object(
          'action', 'reopen',
          'bodega', 'almacen',
          'reason', _reason,
          'by', _user_id,
          'at', now()
        ),
        updated_at = now()
    WHERE inventory_id = _inventory_id AND referencia = _reference;
  ELSE
    UPDATE public.inventory_master
    SET status_pl = 'pendiente',
        audit_round_pl = 1,
        count_history = COALESCE(count_history, '[]'::jsonb) || jsonb_build_object(
          'action', 'reopen',
          'bodega', 'planta',
          'reason', _reason,
          'by', _user_id,
          'at', now()
        ),
        updated_at = now()
    WHERE inventory_id = _inventory_id AND referencia = _reference;
  END IF;

  INSERT INTO public.audit_logs (master_reference, user_id, action_type, round_number, new_data)
  VALUES (_reference, _user_id, 'reopen_reference', 1,
          jsonb_build_object('bodega', _bodega, 'reason', _reason,
                             'inventory_id', _inventory_id,
                             'locations', to_jsonb(v_locations),
                             'validated_deleted', v_deleted));

  RETURN jsonb_build_object('ok', true, 'locations', array_length(v_locations, 1), 'validated_deleted', v_deleted);
END;
$function$;

-- 3) Reabrir referencia PT
CREATE OR REPLACE FUNCTION public.pt_reopen_reference(
  _inventory_id uuid,
  _referencia text,
  _reason text,
  _user_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_locations uuid[];
  v_deleted integer := 0;
BEGIN
  IF NOT public.is_superadmin(_user_id) THEN
    RAISE EXCEPTION 'Solo el superadministrador puede reabrir una referencia';
  END IF;
  IF _reason IS NULL OR btrim(_reason) = '' THEN
    RAISE EXCEPTION 'Debe indicar un motivo para reabrir la referencia';
  END IF;

  SELECT array_agg(id) INTO v_locations
  FROM public.pt_locations
  WHERE inventory_id = _inventory_id AND referencia = _referencia;

  IF v_locations IS NULL THEN
    v_locations := ARRAY[]::uuid[];
  END IF;

  DELETE FROM public.pt_validated_counts
  WHERE inventory_id = _inventory_id AND referencia = _referencia;
  GET DIAGNOSTICS v_deleted = ROW_COUNT;

  UPDATE public.pt_locations
  SET validated_quantity = NULL,
      validated_at_round = NULL,
      terminado = false,
      updated_at = now()
  WHERE id = ANY(v_locations);

  UPDATE public.pt_master
  SET status_slug = 'pendiente',
      audit_round = 1,
      count_history = COALESCE(count_history, '[]'::jsonb) || jsonb_build_object(
        'action', 'reopen',
        'reason', _reason,
        'by', _user_id,
        'at', now()
      ),
      updated_at = now()
  WHERE inventory_id = _inventory_id AND referencia = _referencia;

  INSERT INTO public.audit_logs (master_reference, user_id, action_type, round_number, new_data)
  VALUES (_referencia, _user_id, 'pt_reopen_reference', 1,
          jsonb_build_object('reason', _reason, 'inventory_id', _inventory_id,
                             'locations', to_jsonb(v_locations),
                             'validated_deleted', v_deleted));

  RETURN jsonb_build_object('ok', true, 'locations', array_length(v_locations, 1), 'validated_deleted', v_deleted);
END;
$function$;

REVOKE ALL ON FUNCTION public.reopen_reference(uuid, text, text, text, uuid) FROM anon;
REVOKE ALL ON FUNCTION public.pt_reopen_reference(uuid, text, text, uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.reopen_reference(uuid, text, text, text, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.pt_reopen_reference(uuid, text, text, uuid) TO authenticated;