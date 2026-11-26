-- Runs entirely in a rollback subtransaction: no fixture, adjustment or audit log survives.
DO $test$
DECLARE inv uuid; admin_user uuid; original_claim text; fixture text := '__AJUSTE_TEST_' || gen_random_uuid();
  l1 uuid; l2 uuid; before_sn jsonb; p jsonb; applied jsonb; batch uuid; failed boolean; baseline bigint;
BEGIN
  original_claim := current_setting('request.jwt.claim.sub', true);
  SELECT user_id INTO admin_user FROM public.user_roles WHERE role='superadmin' LIMIT 1;
  SELECT id INTO inv FROM public.inventories WHERE status='abierto' LIMIT 1;
  IF inv IS NULL OR admin_user IS NULL THEN RAISE EXCEPTION 'Test needs open inventory and superadmin'; END IF;
  BEGIN
    PERFORM set_config('request.jwt.claim.sub', '', true);
    failed := false;
    BEGIN PERFORM public.previsualizar_ajustes_cierre(inv, '[]'); EXCEPTION WHEN OTHERS THEN failed := SQLERRM='Solo superadmin'; END;
    IF NOT failed THEN RAISE EXCEPTION 'Permission test failed'; END IF;
    PERFORM set_config('request.jwt.claim.sub', admin_user::text, true);
    INSERT INTO public.inventory_master(inventory_id,referencia,material_type,cant_alm_mp,costo_u_mp) VALUES(inv,fixture,'MP',200,10);
    INSERT INTO public.locations(inventory_id,master_reference,location_name,punto_referencia,activo,assigned_admin_id) VALUES(inv,fixture,'TEST AJUSTE 1','AJUSTE',true,public.get_bodega_admin('almacen')) RETURNING id INTO l1;
    INSERT INTO public.locations(inventory_id,master_reference,location_name,punto_referencia,activo,assigned_admin_id) VALUES(inv,fixture,'TEST AJUSTE 2','AJUSTE',true,public.get_bodega_admin('almacen')) RETURNING id INTO l2;
    INSERT INTO public.inventory_counts(inventory_id,location_id,audit_round,quantity_counted,supervisor_id) VALUES(inv,l1,1,10,admin_user),(inv,l2,1,30,admin_user);
    before_sn := public.ajuste_cierre_snapshot(inv,fixture,'almacen');
    SELECT count(*) INTO baseline FROM public.ajustes_cierre_lotes;
    p := public.previsualizar_ajustes_cierre(inv,jsonb_build_array(jsonb_build_object('referencia',fixture,'bodega','almacen','familia','MP','cantidad_final',100,'motivo','test','soporte','test')));
    IF jsonb_array_length(p->0->'errores')<>0 OR (p->0->>'cantidad_anterior')::numeric<>0 THEN RAISE EXCEPTION 'Preview failed: %',p; END IF;
    failed:=false;
    BEGIN
      PERFORM public.aplicar_ajustes_cierre(inv,'test.xlsx', p||jsonb_build_array(jsonb_build_object('referencia','__NO_SUCH_REFERENCE__','bodega','almacen','familia','MP','cantidad_final',1,'motivo','test','soporte','test')));
    EXCEPTION WHEN OTHERS THEN failed := SQLERRM LIKE '%no se aplicó ninguna fila%'; END;
    IF NOT failed OR public.ajuste_cierre_snapshot(inv,fixture,'almacen') IS DISTINCT FROM before_sn OR (SELECT count(*) FROM public.ajustes_cierre_lotes)<>baseline THEN RAISE EXCEPTION 'Atomicity failed'; END IF;
    applied := public.aplicar_ajustes_cierre(inv,'test.xlsx',p); batch:=(applied->>'lote_id')::uuid;
    IF (SELECT validated_quantity FROM public.validated_counts WHERE inventory_id=inv AND location_id=l1)<>25 OR (SELECT validated_quantity FROM public.validated_counts WHERE inventory_id=inv AND location_id=l2)<>75 THEN RAISE EXCEPTION 'Proportional split failed'; END IF;
    IF NOT EXISTS(SELECT 1 FROM public.ajustes_cierre_vigentes(inv) WHERE lote_id=batch) THEN RAISE EXCEPTION 'Current snapshot visibility failed'; END IF;
    IF NOT EXISTS(SELECT 1 FROM public.valorizacion_bodega(inv) WHERE referencia=fixture AND bodega='almacen' AND origen='ajuste_cierre' AND valor_a_montar=1000) THEN RAISE EXCEPTION 'Valuation provenance failed'; END IF;
    IF (SELECT quantity_counted FROM public.inventory_counts WHERE location_id=l1 AND audit_round=1)<>10 THEN RAISE EXCEPTION 'Count changed'; END IF;
    failed:=false;
    BEGIN PERFORM public.aplicar_ajustes_cierre(inv,'stale.xlsx',p); EXCEPTION WHEN OTHERS THEN failed:=SQLERRM LIKE '%cambió desde la revisión%'; END;
    IF NOT failed THEN RAISE EXCEPTION 'Stale preview accepted'; END IF;
    failed:=false;
    BEGIN PERFORM public.revertir_ajustes_cierre(batch,''); EXCEPTION WHEN OTHERS THEN failed:=SQLERRM='Motivo obligatorio'; END;
    IF NOT failed THEN RAISE EXCEPTION 'Empty reversal reason accepted'; END IF;
    PERFORM public.revertir_ajustes_cierre(batch,'test rollback');
    IF public.ajuste_cierre_snapshot(inv,fixture,'almacen') IS DISTINCT FROM before_sn THEN RAISE EXCEPTION 'Exact reversal failed'; END IF;
    -- No locations: zero is valid; synthetic location is removed on reversal.
    p := public.previsualizar_ajustes_cierre(inv,jsonb_build_array(jsonb_build_object('referencia',fixture,'bodega','planta','familia','MP','cantidad_final',0,'motivo','test','soporte','test')));
    applied:=public.aplicar_ajustes_cierre(inv,'zero.xlsx',p); batch:=(applied->>'lote_id')::uuid;
    IF NOT EXISTS(SELECT 1 FROM public.locations WHERE inventory_id=inv AND master_reference=fixture AND location_name='AJUSTE DE CIERRE' AND punto_referencia='AJUSTE' AND activo AND terminado AND validated_quantity=0) THEN RAISE EXCEPTION 'Synthetic zero location failed'; END IF;
    PERFORM public.revertir_ajustes_cierre(batch,'test rollback');
    IF EXISTS(SELECT 1 FROM public.locations WHERE inventory_id=inv AND master_reference=fixture AND public.location_bodega(assigned_admin_id)='planta') THEN RAISE EXCEPTION 'Synthetic location not removed'; END IF;
    -- Changed counts block reversal and remove current provenance.
    p:=public.previsualizar_ajustes_cierre(inv,jsonb_build_array(jsonb_build_object('referencia',fixture,'bodega','almacen','familia','MP','cantidad_final',100,'motivo','test','soporte','test')));
    applied:=public.aplicar_ajustes_cierre(inv,'post-edit.xlsx',p); batch:=(applied->>'lote_id')::uuid;
    UPDATE public.inventory_counts SET quantity_counted=11 WHERE location_id=l1 AND audit_round=1;
    failed:=false;
    BEGIN PERFORM public.revertir_ajustes_cierre(batch,'test'); EXCEPTION WHEN OTHERS THEN failed:=SQLERRM LIKE '%cambios posteriores%'; END;
    IF NOT failed OR EXISTS(SELECT 1 FROM public.ajustes_cierre_vigentes(inv) WHERE lote_id=batch) THEN RAISE EXCEPTION 'Subsequent edits protection failed'; END IF;
    RAISE EXCEPTION USING ERRCODE='ZX001', MESSAGE='Rollback test fixtures';
  EXCEPTION WHEN SQLSTATE 'ZX001' THEN NULL;
  END;
  PERFORM set_config('request.jwt.claim.sub', COALESCE(original_claim,''), true);
  IF EXISTS(SELECT 1 FROM public.inventory_master WHERE inventory_id=inv AND referencia=fixture) THEN RAISE EXCEPTION 'Fixtures survived'; END IF;
END $test$;