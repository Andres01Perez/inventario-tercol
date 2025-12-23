-- Add discovered_at_round column to locations table
-- NULL = original location from C1
-- 2, 3, 4, 5 = location discovered in that round
ALTER TABLE public.locations 
ADD COLUMN discovered_at_round INTEGER NULL;

-- Add comment for documentation
COMMENT ON COLUMN public.locations.discovered_at_round IS 'Round number where this location was first discovered. NULL means original C1 location.';