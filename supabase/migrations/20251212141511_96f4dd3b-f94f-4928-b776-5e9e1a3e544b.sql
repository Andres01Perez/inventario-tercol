-- Renombrar tabla count_tasks a locations
ALTER TABLE public.count_tasks RENAME TO locations;

-- Eliminar campos que no pertenecen a locations (serán parte de la nueva count_tasks)
ALTER TABLE public.locations DROP COLUMN IF EXISTS operario_id;
ALTER TABLE public.locations DROP COLUMN IF EXISTS quantity_counted;
ALTER TABLE public.locations DROP COLUMN IF EXISTS is_completed;
ALTER TABLE public.locations DROP COLUMN IF EXISTS audit_round;

-- Actualizar las políticas RLS para la tabla locations (renombrar referencias)
-- Las políticas existentes se mantienen automáticamente con el rename

-- Crear índice para mejorar búsquedas por referencia
CREATE INDEX IF NOT EXISTS idx_locations_master_reference ON public.locations(master_reference);

-- Crear índice para búsquedas por supervisor asignado
CREATE INDEX IF NOT EXISTS idx_locations_assigned_supervisor ON public.locations(assigned_supervisor_id);