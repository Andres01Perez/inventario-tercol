ALTER TABLE public.pt_counts DROP CONSTRAINT pt_counts_location_id_fkey;
ALTER TABLE public.pt_counts
  ADD CONSTRAINT pt_counts_location_id_fkey
  FOREIGN KEY (location_id) REFERENCES public.pt_locations(id) ON DELETE RESTRICT;

ALTER TABLE public.pt_validated_counts DROP CONSTRAINT pt_validated_counts_location_id_fkey;
ALTER TABLE public.pt_validated_counts
  ADD CONSTRAINT pt_validated_counts_location_id_fkey
  FOREIGN KEY (location_id) REFERENCES public.pt_locations(id) ON DELETE RESTRICT;