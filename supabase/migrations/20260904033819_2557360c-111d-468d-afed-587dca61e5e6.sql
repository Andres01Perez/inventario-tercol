CREATE OR REPLACE FUNCTION public.get_bodega_admin(_bodega text)
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT ur.user_id
  FROM public.user_roles ur
  WHERE ur.role = CASE WHEN lower(_bodega) IN ('almacen','almacén','mp','admin_mp') THEN 'admin_mp'::public.app_role
                       ELSE 'admin_pp'::public.app_role END
  ORDER BY ur.created_at ASC NULLS LAST
  LIMIT 1
$$;

GRANT EXECUTE ON FUNCTION public.get_bodega_admin(text) TO authenticated;