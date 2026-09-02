CREATE OR REPLACE FUNCTION public.pt_block_count_on_validated_location()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
BEGIN
  IF EXISTS (SELECT 1 FROM public.pt_locations WHERE id = NEW.location_id AND validated_at_round IS NOT NULL) THEN
    RAISE EXCEPTION 'La ubicación ya fue validada: no se pueden guardar nuevos conteos sobre una referencia cerrada';
  END IF;
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS pt_block_count_on_validated_trg ON public.pt_counts;
CREATE TRIGGER pt_block_count_on_validated_trg
BEFORE INSERT OR UPDATE ON public.pt_counts
FOR EACH ROW EXECUTE FUNCTION public.pt_block_count_on_validated_location();