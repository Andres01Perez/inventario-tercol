CREATE OR REPLACE FUNCTION public.is_viewer(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND role = 'visualizador'::app_role
  )
$$;

REVOKE EXECUTE ON FUNCTION public.is_viewer(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_viewer(uuid) TO authenticated, service_role;

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'inventories','inventory_master','locations','inventory_counts','validated_counts',
    'pt_master','pt_locations','pt_counts','pt_validated_counts','pt_floor_assignments',
    'profiles','task_statuses'
  ] LOOP
    EXECUTE format('DROP POLICY IF EXISTS "Visualizador puede ver %1$s" ON public.%1$I', t);
    EXECUTE format(
      'CREATE POLICY "Visualizador puede ver %1$s" ON public.%1$I FOR SELECT TO authenticated USING (public.is_viewer(auth.uid()))', t);
    EXECUTE format('GRANT SELECT ON public.%1$I TO authenticated', t);
  END LOOP;
END $$;