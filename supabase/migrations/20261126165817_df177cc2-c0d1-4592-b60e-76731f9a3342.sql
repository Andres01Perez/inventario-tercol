CREATE TABLE public.ajustes_cierre_lotes (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), inventory_id uuid NOT NULL REFERENCES public.inventories(id), nombre_archivo text NOT NULL, total_filas integer NOT NULL, aplicadas integer NOT NULL DEFAULT 0, creado_por uuid NOT NULL, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(), revertido_por uuid, revertido_at timestamptz, motivo_reversion text, estado text NOT NULL DEFAULT 'aplicado'
);
GRANT SELECT ON public.ajustes_cierre_lotes TO authenticated;
GRANT ALL ON public.ajustes_cierre_lotes TO service_role;
ALTER TABLE public.ajustes_cierre_lotes ENABLE ROW LEVEL SECURITY;
CREATE POLICY ajustes_lotes_read ON public.ajustes_cierre_lotes FOR SELECT TO authenticated USING (public.is_superadmin(auth.uid()) OR public.is_viewer(auth.uid()));
CREATE TRIGGER ajustes_lotes_updated BEFORE UPDATE ON public.ajustes_cierre_lotes FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TABLE public.ajustes_cierre (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), lote_id uuid NOT NULL REFERENCES public.ajustes_cierre_lotes(id), inventory_id uuid NOT NULL REFERENCES public.inventories(id), referencia text NOT NULL, material_type public.material_type NOT NULL, bodega text NOT NULL, cantidad_final numeric NOT NULL, cantidad_anterior numeric NOT NULL, estado_anterior text NOT NULL, motivo text NOT NULL, soporte text NOT NULL, observacion text, ubicaciones jsonb NOT NULL, snapshot_anterior jsonb NOT NULL, snapshot_posterior jsonb NOT NULL, costo_u numeric NOT NULL, impacto_valor numeric NOT NULL, creado_por uuid NOT NULL, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.ajustes_cierre TO authenticated;
GRANT ALL ON public.ajustes_cierre TO service_role;
ALTER TABLE public.ajustes_cierre ENABLE ROW LEVEL SECURITY;
CREATE POLICY ajustes_read ON public.ajustes_cierre FOR SELECT TO authenticated USING (public.is_superadmin(auth.uid()) OR public.is_viewer(auth.uid()));
CREATE INDEX ajustes_cierre_reference_idx ON public.ajustes_cierre(inventory_id, referencia, bodega, created_at DESC);
CREATE TRIGGER ajustes_updated BEFORE UPDATE ON public.ajustes_cierre FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
ALTER TABLE public.audit_logs ADD COLUMN IF NOT EXISTS old_data jsonb;

CREATE FUNCTION public.ajuste_cierre_snapshot(_inv uuid, _ref text, _bod text) RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
 SELECT jsonb_build_object('estado', CASE WHEN _bod='almacen' THEN m.status_alm ELSE m.status_pl END,
 'ronda',CASE WHEN _bod='almacen' THEN m.audit_round_alm ELSE m.audit_round_pl END,
 'ubicaciones',COALESCE((SELECT jsonb_agg(jsonb_build_object('location_id',l.id,'location',to_jsonb(l)-'updated_at',
 'validated', (SELECT to_jsonb(v)-'updated_at' FROM public.validated_counts v WHERE v.inventory_id=_inv AND v.location_id=l.id),
 'counts',COALESCE((SELECT jsonb_agg(to_jsonb(c)-'updated_at' ORDER BY c.audit_round,c.id) FROM public.inventory_counts c WHERE c.inventory_id=_inv AND c.location_id=l.id),'[]'::jsonb)) ORDER BY l.id)
 FROM public.locations l WHERE l.inventory_id=_inv AND l.master_reference=_ref AND l.activo AND public.location_bodega(l.assigned_admin_id)=_bod),'[]'::jsonb))
 FROM public.inventory_master m WHERE m.inventory_id=_inv AND m.referencia=_ref
$$;
REVOKE ALL ON FUNCTION public.ajuste_cierre_snapshot(uuid,text,text) FROM PUBLIC, anon, authenticated;

CREATE FUNCTION public.previsualizar_ajustes_cierre(_inventory_id uuid, _filas jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE f jsonb; m public.inventory_master%ROWTYPE; errs jsonb; warns jsonb; result jsonb:='[]'; sn jsonb; ref text; bod text; fam text; q numeric; prev numeric; cu numeric; n integer; match_count integer; status_inv text; idx integer:=0;
BEGIN
 IF NOT public.is_superadmin(auth.uid()) THEN RAISE EXCEPTION 'Solo superadmin'; END IF;
 SELECT status INTO status_inv FROM public.inventories WHERE id=_inventory_id;
 IF status_inv IS DISTINCT FROM 'abierto' THEN RAISE EXCEPTION 'Inventario cerrado/histórico: solo lectura'; END IF;
 IF jsonb_typeof(_filas) IS DISTINCT FROM 'array' THEN RAISE EXCEPTION 'Archivo inválido'; END IF;
 IF jsonb_array_length(_filas)=0 OR jsonb_array_length(_filas)>5000 THEN RAISE EXCEPTION 'Se admiten entre 1 y 5000 filas'; END IF;
 FOR f IN SELECT value FROM jsonb_array_elements(_filas) LOOP
  idx:=idx+1; errs:='[]'; warns:='[]'; q:=NULL; sn:=NULL; prev:=0; cu:=0; n:=0; m:=NULL;
  ref:=upper(btrim(COALESCE(f->>'referencia',''))); bod:=f->>'bodega'; fam:=f->>'familia';
  IF bod IS NULL OR bod NOT IN ('almacen','planta') THEN errs:=errs||jsonb_build_array('Bodega inválida'); END IF;
  IF fam IS NULL OR fam NOT IN ('MP','PP') THEN errs:=errs||jsonb_build_array('Familia inválida'); END IF;
  IF jsonb_typeof(f->'cantidad_final')='number' THEN q:=(f->>'cantidad_final')::numeric; END IF;
  IF q IS NULL OR q<0 THEN errs:=errs||jsonb_build_array('Cantidad vacía, inválida o negativa'); END IF;
  IF btrim(COALESCE(f->>'motivo',''))='' THEN errs:=errs||jsonb_build_array('Motivo obligatorio'); END IF;
  IF btrim(COALESCE(f->>'soporte',''))='' THEN errs:=errs||jsonb_build_array('Soporte obligatorio'); END IF;
  IF (SELECT count(*) FROM jsonb_array_elements(_filas) x WHERE upper(btrim(x->>'referencia'))=ref AND x->>'bodega'=bod)>1 THEN errs:=errs||jsonb_build_array('Duplicada: referencia + bodega'); END IF;
  SELECT count(*) INTO match_count FROM public.inventory_master WHERE inventory_id=_inventory_id AND upper(btrim(referencia))=ref;
  IF match_count=0 THEN errs:=errs||jsonb_build_array('Referencia inexistente');
  ELSIF match_count>1 THEN errs:=errs||jsonb_build_array('Referencia ambigua en la maestra');
  ELSE
   SELECT * INTO m FROM public.inventory_master WHERE inventory_id=_inventory_id AND upper(btrim(referencia))=ref;
   IF m.material_type::text IS DISTINCT FROM fam THEN errs:=errs||jsonb_build_array('Familia distinta a la maestra'); END IF;
   IF m.material_type='PP' AND bod IS DISTINCT FROM (CASE WHEN m.control IS NULL THEN 'planta' ELSE 'almacen' END) THEN errs:=errs||jsonb_build_array('PP asignada por Control a '||CASE WHEN m.control IS NULL THEN 'planta' ELSE 'almacen' END||'; corrija el Control o la bodega'); END IF;
   sn:=public.ajuste_cierre_snapshot(_inventory_id,m.referencia,bod);
   n:=jsonb_array_length(sn->'ubicaciones');
   SELECT COALESCE(sum((x->'validated'->>'validated_quantity')::numeric),0) INTO prev FROM jsonb_array_elements(sn->'ubicaciones') x;
   cu:=COALESCE(CASE WHEN m.material_type='MP' THEN m.costo_u_mp ELSE m.costo_u_pp END,0);
   IF sn->>'estado' IN ('pendiente','conflicto') THEN warns:=warns||jsonb_build_array('Referencia '||(sn->>'estado')); END IF;
   IF (prev=0 AND COALESCE(q,0)<>0) OR (prev<>0 AND abs(q-prev)/abs(prev)>0.2) THEN warns:=warns||jsonb_build_array('Diferencia mayor al 20 %'); END IF;
   IF n=0 AND public.get_bodega_admin(bod) IS NULL THEN errs:=errs||jsonb_build_array('No existe responsable de bodega para crear ubicación'); END IF;
  END IF;
  result:=result||jsonb_build_array(f||jsonb_build_object('fila',COALESCE((f->>'fila')::integer,idx+1),'referencia',COALESCE(m.referencia,ref),'estado_actual',sn->>'estado','cantidad_anterior',prev,'diferencia',q-prev,'costo_u',cu,'impacto_valor',(q-prev)*cu,'num_ubicaciones',n,'creara_ubicacion',n=0,'errores',errs,'advertencias',warns,'snapshot',sn,'revision',md5(COALESCE(sn::text,'')||COALESCE(m.control,'')||cu::text||COALESCE(m.material_type::text,''))));
 END LOOP;
 RETURN result;
END $$;
REVOKE ALL ON FUNCTION public.previsualizar_ajustes_cierre(uuid,jsonb) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.previsualizar_ajustes_cierre(uuid,jsonb) TO authenticated;

CREATE FUNCTION public.aplicar_ajustes_cierre(_inventory_id uuid, _nombre_archivo text, _filas jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE previews jsonb; f jsonb; src jsonb; m public.inventory_master%ROWTYPE; lote uuid; before_sn jsonb; after_sn jsonb; details jsonb; r record; cnt int; total numeric; acc numeric; q numeric; pos int; rnd int; admin_id uuid; created_id uuid; result jsonb:='[]'; ref text; bod text; hist jsonb; invstatus text;
BEGIN
 IF NOT public.is_superadmin(auth.uid()) THEN RAISE EXCEPTION 'Solo superadmin'; END IF;
 SELECT status INTO invstatus FROM public.inventories WHERE id=_inventory_id FOR UPDATE;
 IF invstatus IS DISTINCT FROM 'abierto' THEN RAISE EXCEPTION 'Inventario cerrado/histórico'; END IF;
 IF btrim(COALESCE(_nombre_archivo,''))='' THEN RAISE EXCEPTION 'Nombre de archivo obligatorio'; END IF;
 PERFORM 1 FROM public.inventory_master WHERE inventory_id=_inventory_id AND upper(btrim(referencia)) IN (SELECT upper(btrim(x->>'referencia')) FROM jsonb_array_elements(_filas) x) ORDER BY referencia FOR UPDATE;
 PERFORM 1 FROM public.locations WHERE inventory_id=_inventory_id AND master_reference IN (SELECT referencia FROM public.inventory_master WHERE inventory_id=_inventory_id AND upper(btrim(referencia)) IN (SELECT upper(btrim(x->>'referencia')) FROM jsonb_array_elements(_filas) x)) ORDER BY id FOR UPDATE;
 PERFORM 1 FROM public.inventory_counts WHERE inventory_id=_inventory_id AND location_id IN (SELECT id FROM public.locations WHERE inventory_id=_inventory_id AND master_reference IN (SELECT referencia FROM public.inventory_master WHERE inventory_id=_inventory_id AND upper(btrim(referencia)) IN (SELECT upper(btrim(x->>'referencia')) FROM jsonb_array_elements(_filas) x))) ORDER BY id FOR UPDATE;
 PERFORM 1 FROM public.validated_counts WHERE inventory_id=_inventory_id ORDER BY id FOR UPDATE;
 previews:=public.previsualizar_ajustes_cierre(_inventory_id,_filas);
 FOR f IN SELECT value FROM jsonb_array_elements(previews) LOOP
  IF jsonb_array_length(f->'errores')>0 THEN RAISE EXCEPTION 'Fila % (%): %; no se aplicó ninguna fila',f->>'fila',f->>'referencia',f->'errores'; END IF;
  SELECT x INTO src FROM jsonb_array_elements(_filas) x WHERE upper(btrim(x->>'referencia'))=upper(btrim(f->>'referencia')) AND x->>'bodega'=f->>'bodega';
  IF src->>'revision' IS DISTINCT FROM f->>'revision' THEN RAISE EXCEPTION 'Fila % cambió desde la revisión; vuelva a previsualizar. No se aplicó ninguna fila',f->>'fila'; END IF;
 END LOOP;
 INSERT INTO public.ajustes_cierre_lotes(inventory_id,nombre_archivo,total_filas,creado_por) VALUES(_inventory_id,_nombre_archivo,jsonb_array_length(previews),auth.uid()) RETURNING id INTO lote;
 FOR f IN SELECT value FROM jsonb_array_elements(previews) LOOP
  ref:=f->>'referencia'; bod:=f->>'bodega'; before_sn:=f->'snapshot'; details:='[]'; created_id:=NULL;
  SELECT * INTO m FROM public.inventory_master WHERE inventory_id=_inventory_id AND referencia=ref;
  IF (f->>'num_ubicaciones')::int=0 THEN
   admin_id:=public.get_bodega_admin(bod);
   INSERT INTO public.locations(inventory_id,master_reference,location_name,punto_referencia,activo,terminado,assigned_admin_id)
    VALUES(_inventory_id,ref,'AJUSTE DE CIERRE','AJUSTE',true,true,admin_id) RETURNING id INTO created_id;
  END IF;
  SELECT count(*),COALESCE(sum(GREATEST(COALESCE(c.quantity_counted,0),0)),0) INTO cnt,total FROM public.locations l LEFT JOIN LATERAL (SELECT quantity_counted FROM public.inventory_counts WHERE inventory_id=_inventory_id AND location_id=l.id ORDER BY audit_round DESC LIMIT 1) c ON true WHERE l.inventory_id=_inventory_id AND l.master_reference=ref AND l.activo AND public.location_bodega(l.assigned_admin_id)=bod;
  acc:=0;pos:=0;
  FOR r IN SELECT l.id,c.quantity_counted,c.audit_round FROM public.locations l LEFT JOIN LATERAL (SELECT quantity_counted,audit_round FROM public.inventory_counts WHERE inventory_id=_inventory_id AND location_id=l.id ORDER BY audit_round DESC LIMIT 1) c ON true WHERE l.inventory_id=_inventory_id AND l.master_reference=ref AND l.activo AND public.location_bodega(l.assigned_admin_id)=bod ORDER BY l.id LOOP
   pos:=pos+1;
   q:=CASE WHEN pos=cnt THEN (f->>'cantidad_final')::numeric-acc ELSE trunc((f->>'cantidad_final')::numeric*CASE WHEN total>0 THEN GREATEST(COALESCE(r.quantity_counted,0),0)/total ELSE 1::numeric/cnt END,6) END;
   acc:=acc+q; rnd:=COALESCE(r.audit_round,CASE WHEN bod='almacen' THEN m.audit_round_alm ELSE m.audit_round_pl END);
   details:=details||jsonb_build_array(jsonb_build_object('location_id',r.id,'cantidad_nueva',q,'creada_por_ajuste',r.id=created_id,'anterior',(SELECT x FROM jsonb_array_elements(before_sn->'ubicaciones') x WHERE x->>'location_id'=r.id::text)));
   PERFORM public.upsert_validated_count(_inventory_id,ref,r.id,q,rnd,CASE WHEN bod='almacen' THEN 'ALM' ELSE 'PL' END||':ajuste_cierre: '||btrim(f->>'motivo'),auth.uid());
   UPDATE public.locations SET validated_quantity=q,validated_at_round=rnd,terminado=true WHERE id=r.id;
  END LOOP;
  IF acc IS DISTINCT FROM (f->>'cantidad_final')::numeric THEN RAISE EXCEPTION 'Reparto inconsistente'; END IF;
  hist:=jsonb_build_object('action','ajuste_cierre','bodega',bod,'cantidad_anterior',f->'cantidad_anterior','cantidad_final',f->'cantidad_final','motivo',f->>'motivo','soporte',f->>'soporte','observacion',f->>'observacion','lote_id',lote,'user_id',auth.uid(),'timestamp',now());
  UPDATE public.inventory_master SET status_alm=CASE WHEN bod='almacen' THEN 'auditado' ELSE status_alm END,status_pl=CASE WHEN bod='planta' THEN 'auditado' ELSE status_pl END,count_history=COALESCE(count_history,'[]')||hist WHERE inventory_id=_inventory_id AND referencia=ref;
  after_sn:=public.ajuste_cierre_snapshot(_inventory_id,ref,bod);
  INSERT INTO public.ajustes_cierre(lote_id,inventory_id,referencia,material_type,bodega,cantidad_final,cantidad_anterior,estado_anterior,motivo,soporte,observacion,ubicaciones,snapshot_anterior,snapshot_posterior,costo_u,impacto_valor,creado_por)
   VALUES(lote,_inventory_id,ref,m.material_type,bod,(f->>'cantidad_final')::numeric,(f->>'cantidad_anterior')::numeric,before_sn->>'estado',btrim(f->>'motivo'),btrim(f->>'soporte'),f->>'observacion',details,before_sn,after_sn,(f->>'costo_u')::numeric,(f->>'impacto_valor')::numeric,auth.uid());
  INSERT INTO public.audit_logs(master_reference,user_id,action_type,new_data,old_data) VALUES(ref,auth.uid(),'ajuste_cierre',hist||jsonb_build_object('inventory_id',_inventory_id,'snapshot',after_sn),before_sn);
  result:=result||jsonb_build_array(jsonb_build_object('referencia',ref,'bodega',bod,'ok',true,'ubicaciones_afectadas',cnt,'ubicaciones_creadas',CASE WHEN created_id IS NULL THEN 0 ELSE 1 END,'impacto_valor',f->'impacto_valor'));
 END LOOP;
 UPDATE public.ajustes_cierre_lotes SET aplicadas=jsonb_array_length(previews) WHERE id=lote;
 RETURN jsonb_build_object('lote_id',lote,'aplicadas',jsonb_array_length(previews),'filas',result);
END $$;
REVOKE ALL ON FUNCTION public.aplicar_ajustes_cierre(uuid,text,jsonb) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.aplicar_ajustes_cierre(uuid,text,jsonb) TO authenticated;

CREATE FUNCTION public.ajustes_cierre_vigentes(_inventory_id uuid) RETURNS SETOF public.ajustes_cierre
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
BEGIN
 IF NOT (public.is_superadmin(auth.uid()) OR public.is_viewer(auth.uid())) THEN RAISE EXCEPTION 'Solo superadmin o visualizador'; END IF;
 RETURN QUERY SELECT a.* FROM public.ajustes_cierre a JOIN public.ajustes_cierre_lotes b ON b.id=a.lote_id WHERE a.inventory_id=_inventory_id AND b.estado='aplicado' AND a.snapshot_posterior=public.ajuste_cierre_snapshot(a.inventory_id,a.referencia,a.bodega) AND NOT EXISTS(SELECT 1 FROM public.ajustes_cierre newer JOIN public.ajustes_cierre_lotes nb ON nb.id=newer.lote_id WHERE newer.inventory_id=a.inventory_id AND newer.referencia=a.referencia AND newer.bodega=a.bodega AND nb.estado='aplicado' AND (newer.created_at,newer.id)>(a.created_at,a.id)) ORDER BY a.referencia,a.bodega;
END $$;
REVOKE ALL ON FUNCTION public.ajustes_cierre_vigentes(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.ajustes_cierre_vigentes(uuid) TO authenticated;

CREATE FUNCTION public.revertir_ajustes_cierre(_lote_id uuid, _motivo text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE batch public.ajustes_cierre_lotes%ROWTYPE; a public.ajustes_cierre%ROWTYPE; x jsonb; vc public.validated_counts%ROWTYPE; lid uuid; invstatus text; hist jsonb;
BEGIN
 IF NOT public.is_superadmin(auth.uid()) THEN RAISE EXCEPTION 'Solo superadmin'; END IF;
 IF btrim(COALESCE(_motivo,''))='' THEN RAISE EXCEPTION 'Motivo obligatorio'; END IF;
 SELECT * INTO batch FROM public.ajustes_cierre_lotes WHERE id=_lote_id;
 IF batch.id IS NULL THEN RAISE EXCEPTION 'Lote inexistente'; END IF;
 SELECT status INTO invstatus FROM public.inventories WHERE id=batch.inventory_id FOR UPDATE;
 SELECT * INTO batch FROM public.ajustes_cierre_lotes WHERE id=_lote_id FOR UPDATE;
 IF invstatus IS DISTINCT FROM 'abierto' OR batch.estado<>'aplicado' THEN RAISE EXCEPTION 'Inventario cerrado o lote ya revertido'; END IF;
 PERFORM 1 FROM public.inventory_master WHERE inventory_id=batch.inventory_id AND referencia IN (SELECT referencia FROM public.ajustes_cierre WHERE lote_id=_lote_id) ORDER BY referencia FOR UPDATE;
 PERFORM 1 FROM public.locations WHERE inventory_id=batch.inventory_id AND master_reference IN (SELECT referencia FROM public.ajustes_cierre WHERE lote_id=_lote_id) ORDER BY id FOR UPDATE;
 PERFORM 1 FROM public.inventory_counts WHERE inventory_id=batch.inventory_id ORDER BY id FOR UPDATE;
 PERFORM 1 FROM public.validated_counts WHERE inventory_id=batch.inventory_id ORDER BY id FOR UPDATE;
 FOR a IN SELECT * FROM public.ajustes_cierre WHERE lote_id=_lote_id ORDER BY referencia,bodega LOOP
  IF EXISTS(SELECT 1 FROM public.ajustes_cierre newer JOIN public.ajustes_cierre_lotes nb ON nb.id=newer.lote_id WHERE newer.inventory_id=a.inventory_id AND newer.referencia=a.referencia AND newer.bodega=a.bodega AND nb.estado='aplicado' AND (newer.created_at,newer.id)>(a.created_at,a.id)) OR a.snapshot_posterior IS DISTINCT FROM public.ajuste_cierre_snapshot(a.inventory_id,a.referencia,a.bodega) THEN RAISE EXCEPTION '% (%): existen cambios posteriores; reversión bloqueada para no sobrescribirlos',a.referencia,a.bodega; END IF;
 END LOOP;
 FOR a IN SELECT * FROM public.ajustes_cierre WHERE lote_id=_lote_id ORDER BY referencia,bodega LOOP
  FOR x IN SELECT value FROM jsonb_array_elements(a.ubicaciones) LOOP
   lid:=(x->>'location_id')::uuid;
   IF COALESCE((x->>'creada_por_ajuste')::boolean,false) THEN
    IF EXISTS(SELECT 1 FROM public.inventory_counts WHERE location_id=lid) THEN RAISE EXCEPTION 'La ubicación creada tiene conteos; no se puede eliminar'; END IF;
    DELETE FROM public.locations WHERE id=lid AND inventory_id=a.inventory_id;
   ELSE
    IF x->'anterior'->'validated'='null'::jsonb THEN DELETE FROM public.validated_counts WHERE inventory_id=a.inventory_id AND location_id=lid;
    ELSE
     vc:=jsonb_populate_record(NULL::public.validated_counts,x->'anterior'->'validated');
     INSERT INTO public.validated_counts(id,inventory_id,master_reference,location_id,validated_quantity,audit_round,reason,validated_by,created_at)
      VALUES(vc.id,vc.inventory_id,vc.master_reference,vc.location_id,vc.validated_quantity,vc.audit_round,vc.reason,vc.validated_by,vc.created_at)
      ON CONFLICT(inventory_id,location_id) DO UPDATE SET id=EXCLUDED.id,master_reference=EXCLUDED.master_reference,validated_quantity=EXCLUDED.validated_quantity,audit_round=EXCLUDED.audit_round,reason=EXCLUDED.reason,validated_by=EXCLUDED.validated_by,created_at=EXCLUDED.created_at;
    END IF;
    UPDATE public.locations SET validated_quantity=(x->'anterior'->'location'->>'validated_quantity')::numeric,validated_at_round=(x->'anterior'->'location'->>'validated_at_round')::int,terminado=(x->'anterior'->'location'->>'terminado')::boolean WHERE id=lid;
   END IF;
  END LOOP;
  hist:=jsonb_build_object('action','revertir_ajuste_cierre','bodega',a.bodega,'lote_id',_lote_id,'motivo',_motivo,'user_id',auth.uid(),'timestamp',now());
  UPDATE public.inventory_master SET status_alm=CASE WHEN a.bodega='almacen' THEN a.snapshot_anterior->>'estado' ELSE status_alm END,status_pl=CASE WHEN a.bodega='planta' THEN a.snapshot_anterior->>'estado' ELSE status_pl END,audit_round_alm=CASE WHEN a.bodega='almacen' THEN (a.snapshot_anterior->>'ronda')::int ELSE audit_round_alm END,audit_round_pl=CASE WHEN a.bodega='planta' THEN (a.snapshot_anterior->>'ronda')::int ELSE audit_round_pl END,count_history=COALESCE(count_history,'[]')||hist WHERE inventory_id=a.inventory_id AND referencia=a.referencia;
  INSERT INTO public.audit_logs(master_reference,user_id,action_type,new_data,old_data) VALUES(a.referencia,auth.uid(),'revertir_ajuste_cierre',hist||jsonb_build_object('inventory_id',a.inventory_id,'snapshot',a.snapshot_anterior),a.snapshot_posterior);
 END LOOP;
 UPDATE public.ajustes_cierre_lotes SET estado='revertido',revertido_por=auth.uid(),revertido_at=now(),motivo_reversion=btrim(_motivo) WHERE id=_lote_id;
 RETURN jsonb_build_object('lote_id',_lote_id,'revertidas',batch.aplicadas);
END $$;
REVOKE ALL ON FUNCTION public.revertir_ajustes_cierre(uuid,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.revertir_ajustes_cierre(uuid,text) TO authenticated;

ALTER FUNCTION public.valorizacion_bodega(uuid) RENAME TO valorizacion_bodega_base;
REVOKE ALL ON FUNCTION public.valorizacion_bodega_base(uuid) FROM PUBLIC,anon,authenticated;
DROP FUNCTION public.valorizacion_resumen(uuid);
CREATE FUNCTION public.valorizacion_bodega(_inventory_id uuid) RETURNS TABLE(referencia text,familia public.material_type,bodega text,control text,erp_bodega numeric,costo_u numeric,sin_costo boolean,cant_a_montar numeric,estado text,num_ubicaciones integer,valor_inicial numeric,valor_a_montar numeric,dif_valor numeric,cant_validada_inactivas numeric,origen text,motivo_ajuste text,soporte_ajuste text)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
BEGIN
 IF NOT(public.is_superadmin(auth.uid()) OR public.is_viewer(auth.uid())) THEN RAISE EXCEPTION 'Solo superadmin o visualizador'; END IF;
 RETURN QUERY WITH ajustes AS MATERIALIZED (SELECT * FROM public.ajustes_cierre_vigentes(_inventory_id)) SELECT v.*,CASE WHEN a.id IS NULL THEN 'validado' ELSE 'ajuste_cierre' END,a.motivo,a.soporte FROM public.valorizacion_bodega_base(_inventory_id) v LEFT JOIN ajustes a ON a.referencia=v.referencia AND a.bodega=v.bodega ORDER BY v.referencia,v.bodega;
END $$;
REVOKE ALL ON FUNCTION public.valorizacion_bodega(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.valorizacion_bodega(uuid) TO authenticated;
CREATE FUNCTION public.valorizacion_resumen(_inventory_id uuid) RETURNS TABLE(familia public.material_type,bodega text,referencias bigint,total_inv_inicial numeric,total_inv_a_montar numeric,costo_dif_negativa numeric,costo_dif_positiva numeric,valor_ajustes_cierre numeric)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
BEGIN
 IF NOT(public.is_superadmin(auth.uid()) OR public.is_viewer(auth.uid())) THEN RAISE EXCEPTION 'Solo superadmin o visualizador'; END IF;
 RETURN QUERY SELECT v.familia,v.bodega,count(*)::bigint,COALESCE(sum(v.valor_inicial),0),COALESCE(sum(v.valor_a_montar),0),COALESCE(sum(v.dif_valor) FILTER(WHERE v.dif_valor<0),0),COALESCE(sum(v.dif_valor) FILTER(WHERE v.dif_valor>0),0),COALESCE(sum(v.valor_a_montar) FILTER(WHERE v.origen='ajuste_cierre'),0) FROM public.valorizacion_bodega(_inventory_id) v GROUP BY v.familia,v.bodega ORDER BY v.familia,v.bodega;
END $$;
REVOKE ALL ON FUNCTION public.valorizacion_resumen(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.valorizacion_resumen(uuid) TO authenticated;