DROP FUNCTION IF EXISTS public.valorizacion_bodega(uuid);

CREATE FUNCTION public.valorizacion_bodega(_inventory_id uuid)
RETURNS TABLE (
  referencia text,
  familia public.material_type,
  bodega text,
  control text,
  erp_bodega numeric,
  costo_u numeric,
  sin_costo boolean,
  cant_a_montar numeric,
  estado text,
  num_ubicaciones integer,
  valor_inicial numeric,
  valor_a_montar numeric,
  dif_valor numeric,
  cant_validada_inactivas numeric
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT (public.is_superadmin(auth.uid()) OR public.is_viewer(auth.uid())) THEN
    RAISE EXCEPTION 'No autorizado';
  END IF;

  RETURN QUERY
  WITH b(bodega) AS (VALUES ('almacen'::text), ('planta'::text)),
  loc AS (
    SELECT l.master_reference AS ref,
           public.location_bodega(l.assigned_admin_id) AS bodega,
           l.id
    FROM public.locations l
    WHERE l.inventory_id = _inventory_id AND l.activo
  ),
  agg AS (
    SELECT loc.ref,
           loc.bodega,
           COUNT(*)::int AS n_ubic,
           COALESCE(SUM(vc.validated_quantity), 0) AS cant
    FROM loc
    LEFT JOIN public.validated_counts vc
      ON vc.location_id = loc.id AND vc.inventory_id = _inventory_id
    GROUP BY loc.ref, loc.bodega
  ),
  inact AS (
    SELECT l.master_reference AS ref,
           public.location_bodega(l.assigned_admin_id) AS bodega,
           COALESCE(SUM(vc.validated_quantity), 0) AS cant_inact
    FROM public.locations l
    JOIN public.validated_counts vc
      ON vc.location_id = l.id AND vc.inventory_id = _inventory_id
    WHERE l.inventory_id = _inventory_id AND NOT l.activo
    GROUP BY l.master_reference, public.location_bodega(l.assigned_admin_id)
  ),
  base AS (
    SELECT m.referencia,
           m.material_type,
           b.bodega,
           m.control,
           public.erp_bodega_ctl(
             m.material_type,
             m.control,
             m.cant_alm_mp,
             m.cant_alm_pp,
             m.cant_pld,
             m.cant_plr,
             b.bodega
           ) AS erp,
           CASE WHEN m.material_type = 'MP' THEN m.costo_u_mp ELSE m.costo_u_pp END AS cu,
           COALESCE(a.cant, 0) AS cant,
           CASE WHEN b.bodega = 'almacen' THEN m.status_alm ELSE m.status_pl END AS est,
           COALESCE(a.n_ubic, 0) AS n_ubic,
           COALESCE(i.cant_inact, 0) AS cant_inact
    FROM public.inventory_master m
    CROSS JOIN b
    LEFT JOIN agg a ON a.ref = m.referencia AND a.bodega = b.bodega
    LEFT JOIN inact i ON i.ref = m.referencia AND i.bodega = b.bodega
    WHERE m.inventory_id = _inventory_id
      AND m.material_type IN ('MP', 'PP')
  )
  SELECT base.referencia,
         base.material_type,
         base.bodega,
         base.control,
         COALESCE(base.erp, 0),
         COALESCE(base.cu, 0),
         (base.cu IS NULL),
         base.cant,
         base.est,
         base.n_ubic,
         COALESCE(base.erp, 0) * COALESCE(base.cu, 0),
         base.cant * COALESCE(base.cu, 0),
         base.cant * COALESCE(base.cu, 0) - COALESCE(base.erp, 0) * COALESCE(base.cu, 0),
         base.cant_inact
  FROM base
  WHERE NOT (COALESCE(base.erp, 0) = 0 AND base.n_ubic = 0)
  ORDER BY base.referencia, base.bodega;
END;
$$;

REVOKE ALL ON FUNCTION public.valorizacion_bodega(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.valorizacion_bodega(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.valorizacion_bodega(uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.valorizacion_resumen(_inventory_id uuid)
RETURNS TABLE (
  familia public.material_type,
  bodega text,
  referencias bigint,
  total_inv_inicial numeric,
  total_inv_a_montar numeric,
  costo_dif_negativa numeric,
  costo_dif_positiva numeric
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT (public.is_superadmin(auth.uid()) OR public.is_viewer(auth.uid())) THEN
    RAISE EXCEPTION 'No autorizado';
  END IF;

  RETURN QUERY
  SELECT v.familia,
         v.bodega,
         COUNT(*)::bigint AS referencias,
         COALESCE(SUM(v.valor_inicial), 0) AS total_inv_inicial,
         COALESCE(SUM(v.valor_a_montar), 0) AS total_inv_a_montar,
         COALESCE(SUM(CASE WHEN v.dif_valor < 0 THEN v.dif_valor ELSE 0 END), 0) AS costo_dif_negativa,
         COALESCE(SUM(CASE WHEN v.dif_valor > 0 THEN v.dif_valor ELSE 0 END), 0) AS costo_dif_positiva
  FROM public.valorizacion_bodega(_inventory_id) v
  GROUP BY v.familia, v.bodega
  ORDER BY v.familia, v.bodega;
END;
$$;

REVOKE ALL ON FUNCTION public.valorizacion_resumen(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.valorizacion_resumen(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.valorizacion_resumen(uuid) TO service_role;