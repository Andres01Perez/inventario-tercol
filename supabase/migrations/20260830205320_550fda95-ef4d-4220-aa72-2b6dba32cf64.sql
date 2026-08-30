CREATE OR REPLACE FUNCTION public.erp_bodega(_material_type material_type, _cant_alm_mp numeric, _cant_alm_pp numeric, _cant_pld numeric, _cant_plr numeric, _bodega text)
RETURNS numeric
LANGUAGE sql
IMMUTABLE
SET search_path TO 'public'
AS $$
  SELECT CASE
    WHEN _bodega = 'almacen' THEN
      CASE WHEN _material_type = 'MP'::material_type THEN COALESCE(_cant_alm_mp, 0) ELSE COALESCE(_cant_alm_pp, 0) END
    ELSE COALESCE(_cant_pld, 0) + COALESCE(_cant_plr, 0)
  END
$$;

REVOKE EXECUTE ON FUNCTION public.location_bodega(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.location_bodega(uuid) TO authenticated, service_role;