CREATE INDEX ajustes_cierre_lote_idx ON public.ajustes_cierre(lote_id);
CREATE INDEX ajustes_cierre_lotes_inventory_idx ON public.ajustes_cierre_lotes(inventory_id,created_at DESC);
ALTER FUNCTION public.valorizacion_resumen(uuid) SECURITY INVOKER;