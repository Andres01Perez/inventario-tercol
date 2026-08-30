CREATE OR REPLACE FUNCTION public.get_active_inventory()
 RETURNS uuid
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT id FROM public.inventories
  WHERE status = 'abierto'
  ORDER BY created_at ASC, id ASC
  LIMIT 1
$function$;