REVOKE EXECUTE ON FUNCTION public.update_master_costs(UUID, public.material_type, JSONB, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.update_master_costs(UUID, public.material_type, JSONB, TEXT) TO authenticated;

CREATE INDEX IF NOT EXISTS idx_cost_update_history_updated_by
  ON public.cost_update_history (updated_by);