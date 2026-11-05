CREATE OR REPLACE FUNCTION public.erp_bodega_ctl(_material_type material_type, _control text, _cant_alm_mp numeric, _cant_alm_pp numeric, _cant_pld numeric, _cant_plr numeric, _bodega text)
RETURNS numeric LANGUAGE sql IMMUTABLE SET search_path TO 'public' AS $$
  SELECT CASE
    WHEN _material_type = 'PP'::material_type THEN
      CASE WHEN _bodega = (CASE WHEN _control IS NULL THEN 'planta' ELSE 'almacen' END)
        THEN COALESCE(_cant_alm_pp,0) + COALESCE(_cant_pld,0) + COALESCE(_cant_plr,0) ELSE 0 END
    ELSE public.erp_bodega(_material_type, _cant_alm_mp, _cant_alm_pp, _cant_pld, _cant_plr, _bodega)
  END
$$;

DO $do$
DECLARE d text;
BEGIN
  d := pg_get_functiondef('public.validate_bucket(uuid,text,text,uuid)'::regprocedure);
  d := replace(d, 'public.erp_bodega(v_master.material_type, v_master.cant_alm_mp,', 'public.erp_bodega_ctl(v_master.material_type, v_master.control, v_master.cant_alm_mp,');
  IF position('erp_bodega_ctl' in d) = 0 THEN RAISE EXCEPTION 'patch failed'; END IF;
  EXECUTE d;
END $do$;

CREATE OR REPLACE VIEW public.locations_bodega_view AS
 SELECT l.id, l.inventory_id, l.master_reference, l.location_name, l.location_detail, l.punto_referencia, l.metodo_conteo, l.subcategoria, l.observaciones, l.assigned_supervisor_id, l.assigned_admin_id, l.status_c1, l.status_c2, l.status_c3, l.status_c4, l.validated_at_round, l.validated_quantity, l.discovered_at_round, l.created_at, l.updated_at, im.material_type, im.control, im.cant_total_erp,
    location_bodega(l.assigned_admin_id) AS bodega,
    CASE WHEN location_bodega(l.assigned_admin_id) = 'planta' THEN im.audit_round_pl ELSE im.audit_round_alm END AS bodega_round,
    CASE WHEN location_bodega(l.assigned_admin_id) = 'planta' THEN im.status_pl ELSE im.status_alm END AS bodega_status,
    erp_bodega_ctl(im.material_type, im.control, im.cant_alm_mp, im.cant_alm_pp, im.cant_pld, im.cant_plr, COALESCE(location_bodega(l.assigned_admin_id), 'almacen')) AS bodega_erp,
    l.activo, l.terminado
   FROM locations l JOIN inventory_master im ON im.referencia = l.master_reference AND im.inventory_id = l.inventory_id;

CREATE OR REPLACE FUNCTION public.locations_pp_bodega()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_type material_type; v_ctl text; v_found boolean;
BEGIN
  SELECT material_type, control, true INTO v_type, v_ctl, v_found FROM inventory_master
  WHERE referencia = NEW.master_reference AND inventory_id = NEW.inventory_id;
  IF v_found AND v_type = 'PP' THEN
    NEW.assigned_admin_id := public.get_bodega_admin(CASE WHEN v_ctl IS NULL THEN 'planta' ELSE 'almacen' END);
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_locations_pp_bodega ON public.locations;
CREATE TRIGGER trg_locations_pp_bodega BEFORE INSERT OR UPDATE OF assigned_admin_id, master_reference ON public.locations
FOR EACH ROW EXECUTE FUNCTION public.locations_pp_bodega();