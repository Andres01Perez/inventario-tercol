-- Drop the trigger first with CASCADE
DROP TRIGGER IF EXISTS trg_location_operario_status ON public.locations;
DROP FUNCTION IF EXISTS public.update_location_status_on_operario() CASCADE;

-- Remove operario columns from locations
ALTER TABLE public.locations 
  DROP COLUMN IF EXISTS operario_c1_id,
  DROP COLUMN IF EXISTS operario_c2_id,
  DROP COLUMN IF EXISTS operario_c3_id,
  DROP COLUMN IF EXISTS operario_c4_id;

-- Remove operario_id from inventory_counts
ALTER TABLE public.inventory_counts 
  DROP COLUMN IF EXISTS operario_id;

-- Add index for grouping by punto_referencia
CREATE INDEX IF NOT EXISTS idx_locations_punto_referencia 
ON public.locations(punto_referencia);