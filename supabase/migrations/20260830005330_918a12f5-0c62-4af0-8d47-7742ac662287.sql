REVOKE SELECT ON public.inventories FROM anon;
REVOKE EXECUTE ON FUNCTION public.get_active_inventory() FROM anon;