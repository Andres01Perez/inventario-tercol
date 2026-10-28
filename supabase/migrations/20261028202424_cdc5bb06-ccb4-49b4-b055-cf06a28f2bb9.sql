CREATE OR REPLACE FUNCTION public.normalize_location_name(_n text)
RETURNS text LANGUAGE sql IMMUTABLE SET search_path = public AS $$
  SELECT CASE WHEN _n IS NULL THEN NULL
    WHEN btrim(_n) ~* '^bodega\s*\d+$' THEN 'Bodega ' || substring(btrim(_n) from '\d+')
    ELSE regexp_replace(btrim(_n), '\s+', ' ', 'g') END
$$;

CREATE OR REPLACE FUNCTION public.locations_normalize()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
DECLARE v_p text;
BEGIN
  NEW.location_name := public.normalize_location_name(NEW.location_name);
  IF NEW.location_name IS NOT NULL THEN
    SELECT punto_referencia INTO v_p FROM public.locations
    WHERE inventory_id = NEW.inventory_id AND master_reference = NEW.master_reference
      AND location_name = NEW.location_name AND id <> NEW.id
      AND punto_referencia IS NOT NULL AND btrim(punto_referencia) <> ''
    ORDER BY created_at, id LIMIT 1;
    IF v_p IS NOT NULL THEN NEW.punto_referencia := v_p; END IF;
  END IF;
  RETURN NEW;
END $$;

-- Data fix (open inventories only)
UPDATE public.locations l SET location_name = public.normalize_location_name(l.location_name)
FROM public.inventories i
WHERE i.id = l.inventory_id AND i.status = 'abierto'
  AND l.location_name IS DISTINCT FROM public.normalize_location_name(l.location_name);

WITH f AS (
  SELECT DISTINCT ON (inventory_id, master_reference, location_name) inventory_id, master_reference, location_name, punto_referencia p
  FROM public.locations
  WHERE punto_referencia IS NOT NULL AND btrim(punto_referencia) <> '' AND location_name IS NOT NULL
  ORDER BY inventory_id, master_reference, location_name, created_at, id)
UPDATE public.locations l SET punto_referencia = f.p
FROM f, public.inventories i
WHERE l.inventory_id = f.inventory_id AND l.master_reference = f.master_reference AND l.location_name = f.location_name
  AND i.id = l.inventory_id AND i.status = 'abierto'
  AND l.punto_referencia IS DISTINCT FROM f.p;

DROP TRIGGER IF EXISTS trg_locations_normalize ON public.locations;
CREATE TRIGGER trg_locations_normalize BEFORE INSERT OR UPDATE OF location_name, punto_referencia, master_reference
ON public.locations FOR EACH ROW EXECUTE FUNCTION public.locations_normalize();