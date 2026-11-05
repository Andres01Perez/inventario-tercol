CREATE OR REPLACE FUNCTION public.normalize_location_name(_n text)
RETURNS text LANGUAGE sql IMMUTABLE SET search_path = public AS $$
  SELECT CASE WHEN _n IS NULL THEN NULL
    WHEN btrim(_n) ~ '^\d+$' THEN 'Bodega ' || btrim(_n)
    WHEN btrim(_n) ~* '^bodega\s*\d+$' THEN 'Bodega ' || substring(btrim(_n) from '\d+')
    WHEN btrim(_n) ~* '^almac[eé]n\s*(-|y)\s*bodega\s*\d+$' THEN 'Almacén - bodega ' || substring(btrim(_n) from '\d+')
    ELSE regexp_replace(btrim(_n), '\s+', ' ', 'g') END
$$;

UPDATE public.locations l SET location_name = public.normalize_location_name(l.location_name)
FROM public.inventories i
WHERE i.id = l.inventory_id AND i.status = 'abierto'
  AND l.location_name IS DISTINCT FROM public.normalize_location_name(l.location_name);

WITH f AS (
  SELECT DISTINCT ON (l.inventory_id, l.master_reference, l.location_name)
    l.inventory_id, l.master_reference, l.location_name, l.punto_referencia
  FROM public.locations l JOIN public.inventories i ON i.id=l.inventory_id AND i.status='abierto'
  WHERE l.location_name IN ('Bodega 2') OR l.location_name LIKE 'Almacén - bodega %'
  AND l.punto_referencia IS NOT NULL AND btrim(l.punto_referencia) <> ''
  ORDER BY l.inventory_id, l.master_reference, l.location_name, l.created_at, l.id
)
UPDATE public.locations l SET punto_referencia = f.punto_referencia
FROM f WHERE l.inventory_id=f.inventory_id AND l.master_reference=f.master_reference
  AND l.location_name=f.location_name AND f.punto_referencia IS NOT NULL
  AND l.punto_referencia IS DISTINCT FROM f.punto_referencia;