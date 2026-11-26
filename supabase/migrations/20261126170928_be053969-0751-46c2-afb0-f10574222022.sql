REVOKE ALL ON public.ajustes_cierre, public.ajustes_cierre_lotes FROM anon, authenticated;
GRANT SELECT ON public.ajustes_cierre, public.ajustes_cierre_lotes TO authenticated;
GRANT ALL ON public.ajustes_cierre, public.ajustes_cierre_lotes TO service_role;
DO $$ BEGIN
 IF has_table_privilege('anon','public.ajustes_cierre','SELECT') OR has_table_privilege('authenticated','public.ajustes_cierre','INSERT') OR has_table_privilege('authenticated','public.ajustes_cierre','UPDATE') OR has_table_privilege('authenticated','public.ajustes_cierre','DELETE') OR has_table_privilege('anon','public.ajustes_cierre_lotes','SELECT') OR has_table_privilege('authenticated','public.ajustes_cierre_lotes','INSERT') OR has_table_privilege('authenticated','public.ajustes_cierre_lotes','UPDATE') OR has_table_privilege('authenticated','public.ajustes_cierre_lotes','DELETE') THEN RAISE EXCEPTION 'Unexpected direct privileges'; END IF;
END $$;