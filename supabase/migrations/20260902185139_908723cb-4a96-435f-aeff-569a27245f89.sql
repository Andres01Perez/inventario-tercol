DELETE FROM public.inventory_counts ic
USING public.inventory_counts newer
WHERE ic.location_id = newer.location_id
  AND ic.audit_round = newer.audit_round
  AND (newer.created_at, newer.id) > (ic.created_at, ic.id);

ALTER TABLE public.inventory_counts
  ADD CONSTRAINT inventory_counts_unique UNIQUE (location_id, audit_round);