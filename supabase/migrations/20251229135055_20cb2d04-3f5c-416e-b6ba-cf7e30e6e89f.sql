-- Eliminar la restricción CHECK existente que solo permite turno 1 y 2
ALTER TABLE public.operarios DROP CONSTRAINT IF EXISTS operarios_turno_check;

-- Crear nueva restricción que permite turno 1, 2 y 3
ALTER TABLE public.operarios ADD CONSTRAINT operarios_turno_check 
  CHECK (turno = ANY (ARRAY[1, 2, 3]));