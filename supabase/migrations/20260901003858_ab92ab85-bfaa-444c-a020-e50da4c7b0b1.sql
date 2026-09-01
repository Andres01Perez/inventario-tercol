ALTER TABLE public.locations
  ADD COLUMN IF NOT EXISTS activo boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS terminado boolean NOT NULL DEFAULT false;