-- Add operario fields per count round to locations table
ALTER TABLE public.locations ADD COLUMN operario_c1_id UUID REFERENCES operarios(id);
ALTER TABLE public.locations ADD COLUMN operario_c2_id UUID REFERENCES operarios(id);
ALTER TABLE public.locations ADD COLUMN operario_c3_id UUID REFERENCES operarios(id);
ALTER TABLE public.locations ADD COLUMN operario_c4_id UUID REFERENCES operarios(id);

-- Create indexes for better query performance
CREATE INDEX idx_locations_operario_c1 ON public.locations(operario_c1_id);
CREATE INDEX idx_locations_operario_c2 ON public.locations(operario_c2_id);
CREATE INDEX idx_locations_operario_c3 ON public.locations(operario_c3_id);
CREATE INDEX idx_locations_operario_c4 ON public.locations(operario_c4_id);

-- Migrate existing operario_id to operario_c1_id (assuming existing assignments were for C1)
UPDATE public.locations SET operario_c1_id = operario_id WHERE operario_id IS NOT NULL;