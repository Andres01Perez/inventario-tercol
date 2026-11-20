
CREATE OR REPLACE FUNCTION public.auto_close_c4(_inv uuid, _reference text, _bodega text, _user uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_m RECORD; v_erp numeric; v_val numeric; v_best int := 4; v_bestdiff numeric := NULL; r int; v_tot numeric; v_loc RECORD; v_q numeric;
BEGIN
  SELECT * INTO v_m FROM inventory_master WHERE referencia=_reference AND inventory_id=_inv;
  v_erp := public.erp_bodega_ctl(v_m.material_type, v_m.control, v_m.cant_alm_mp, v_m.cant_alm_pp, v_m.cant_pld, v_m.cant_plr, _bodega);
  SELECT COALESCE(SUM(validated_quantity),0) INTO v_val FROM locations l WHERE l.master_reference=_reference AND l.inventory_id=_inv AND public.location_bodega(l.assigned_admin_id)=_bodega AND l.validated_at_round IS NOT NULL;
  FOR r IN 1..4 LOOP
    SELECT COALESCE(SUM(c.quantity_counted),0) INTO v_tot FROM inventory_counts c JOIN locations l ON l.id=c.location_id
    WHERE l.master_reference=_reference AND l.inventory_id=_inv AND public.location_bodega(l.assigned_admin_id)=_bodega AND l.validated_at_round IS NULL AND c.audit_round=r;
    IF v_bestdiff IS NULL OR abs(v_tot+v_val-v_erp) <= v_bestdiff THEN v_bestdiff := abs(v_tot+v_val-v_erp); v_best := r; END IF;
  END LOOP;
  FOR v_loc IN SELECT l.id FROM locations l WHERE l.master_reference=_reference AND l.inventory_id=_inv AND public.location_bodega(l.assigned_admin_id)=_bodega AND l.validated_at_round IS NULL LOOP
    SELECT quantity_counted INTO v_q FROM inventory_counts WHERE location_id=v_loc.id AND audit_round=v_best;
    v_q := COALESCE(v_q,0);
    UPDATE locations SET validated_at_round=v_best, validated_quantity=v_q, terminado=true WHERE id=v_loc.id;
    PERFORM public.upsert_validated_count(_inv,_reference,v_loc.id,v_q,v_best,(CASE WHEN _bodega='planta' THEN 'PL:' ELSE 'ALM:' END)||'cierre automático C4',_user);
  END LOOP;
  IF _bodega='planta' THEN UPDATE inventory_master SET status_pl='auditado', audit_round_pl=4 WHERE referencia=_reference AND inventory_id=_inv;
  ELSE UPDATE inventory_master SET status_alm='auditado', audit_round_alm=4 WHERE referencia=_reference AND inventory_id=_inv; END IF;
  RETURN jsonb_build_object('success',true,'action','closed','reason','cierre automático C4','round',v_best);
END $$;

CREATE OR REPLACE FUNCTION public.pt_auto_close_c4(_inv uuid, _referencia text, _user uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_erp numeric; v_val numeric; v_best int := 4; v_bestdiff numeric := NULL; r int; v_tot numeric; v_loc RECORD; v_q numeric;
BEGIN
  SELECT COALESCE(cant_erp,0) INTO v_erp FROM pt_master WHERE inventory_id=_inv AND referencia=_referencia;
  SELECT COALESCE(SUM(validated_quantity),0) INTO v_val FROM pt_locations WHERE inventory_id=_inv AND referencia=_referencia AND activo AND validated_at_round IS NOT NULL;
  FOR r IN 1..4 LOOP
    SELECT COALESCE(SUM(c.quantity_counted),0) INTO v_tot FROM pt_counts c JOIN pt_locations l ON l.id=c.location_id
    WHERE l.inventory_id=_inv AND l.referencia=_referencia AND l.activo AND l.validated_at_round IS NULL AND c.audit_round=r;
    IF v_bestdiff IS NULL OR abs(v_tot+v_val-v_erp) <= v_bestdiff THEN v_bestdiff := abs(v_tot+v_val-v_erp); v_best := r; END IF;
  END LOOP;
  FOR v_loc IN SELECT id FROM pt_locations WHERE inventory_id=_inv AND referencia=_referencia AND activo AND validated_at_round IS NULL LOOP
    SELECT quantity_counted INTO v_q FROM pt_counts WHERE location_id=v_loc.id AND audit_round=v_best;
    v_q := COALESCE(v_q,0);
    UPDATE pt_locations SET validated_at_round=v_best, validated_quantity=v_q, terminado=true WHERE id=v_loc.id;
    PERFORM public.pt_upsert_validated_count(_inv,_referencia,v_loc.id,v_q,v_best,'cierre automático C4',_user);
  END LOOP;
  UPDATE pt_master SET status_slug='auditado', audit_round=4 WHERE inventory_id=_inv AND referencia=_referencia;
  RETURN jsonb_build_object('success',true,'action','closed','reason','cierre automático C4','round',v_best);
END $$;

DO $mig$
DECLARE d text;
BEGIN
  d := pg_get_functiondef('public.validate_bucket(uuid,text,text,uuid)'::regprocedure);
  d := replace(d, 'SET status_pl = ''critico''', 'SET status_pl = ''auditado''');
  d := replace(d, 'SET status_alm = ''critico''', 'SET status_alm = ''auditado''');
  d := replace(d, 'THEN ''critico'' ELSE ''conflicto''', 'THEN ''conflicto'' ELSE ''conflicto''');
  d := regexp_replace(d, 'RETURN v_result;\s*END;\s*\$function\$\s*$', 'IF v_new_round = 5 THEN v_result := public.auto_close_c4(_inv, _reference, _bodega, _admin_id); END IF; RETURN v_result; END; $function$');
  EXECUTE d;

  d := pg_get_functiondef('public.pt_validate_and_close_round(uuid,text,uuid)'::regprocedure);
  d := replace(d, 'SET status_slug = ''critico''', 'SET status_slug = ''auditado''');
  d := replace(d, 'THEN ''critico'' ELSE ''conflicto''', 'THEN ''conflicto'' ELSE ''conflicto''');
  d := regexp_replace(d, 'RETURN v_result;\s*END;\s*\$function\$\s*$', 'IF v_new_round = 5 THEN v_result := public.pt_auto_close_c4(v_inv, _referencia, _user_id); END IF; RETURN v_result; END; $function$');
  EXECUTE d;
END $mig$;

-- Datos existentes
DO $d$
DECLARE r RECORD; v_inv uuid := public.get_active_inventory(); v_sa uuid;
BEGIN
  SELECT user_id INTO v_sa FROM user_roles WHERE role='superadmin' ORDER BY created_at LIMIT 1;
  FOR r IN SELECT referencia, status_pl, status_alm, audit_round_pl, audit_round_alm FROM inventory_master WHERE inventory_id=v_inv AND (status_pl='critico' OR status_alm='critico') LOOP
    IF r.status_pl='critico' THEN
      IF r.audit_round_pl>=5 THEN PERFORM public.auto_close_c4(v_inv, r.referencia, 'planta', v_sa);
      ELSE UPDATE inventory_master SET status_pl='auditado' WHERE inventory_id=v_inv AND referencia=r.referencia; END IF;
    END IF;
    IF r.status_alm='critico' THEN
      IF r.audit_round_alm>=5 THEN PERFORM public.auto_close_c4(v_inv, r.referencia, 'almacen', v_sa);
      ELSE UPDATE inventory_master SET status_alm='auditado' WHERE inventory_id=v_inv AND referencia=r.referencia; END IF;
    END IF;
    UPDATE inventory_master SET status_slug = CASE WHEN status_alm='cerrado_forzado' OR status_pl='cerrado_forzado' THEN 'cerrado_forzado' WHEN status_alm IN ('auditado','n/a') AND status_pl IN ('auditado','n/a') THEN 'auditado' WHEN 'conflicto' IN (status_alm,status_pl) THEN 'conflicto' ELSE 'pendiente' END
    WHERE inventory_id=v_inv AND referencia=r.referencia;
  END LOOP;
  FOR r IN SELECT referencia, audit_round FROM pt_master WHERE inventory_id=v_inv AND status_slug='critico' LOOP
    IF r.audit_round>=5 THEN PERFORM public.pt_auto_close_c4(v_inv, r.referencia, v_sa);
    ELSE UPDATE pt_master SET status_slug='auditado' WHERE inventory_id=v_inv AND referencia=r.referencia; END IF;
  END LOOP;
  UPDATE inventory_master SET status_slug = CASE WHEN status_alm IN ('auditado','n/a') AND status_pl IN ('auditado','n/a') THEN 'auditado' ELSE 'conflicto' END WHERE inventory_id=v_inv AND status_slug='critico';
END $d$;
