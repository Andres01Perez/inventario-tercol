-- ETAPA 1: Preparación de Base de Datos
-- Agregar columnas faltantes a count_tasks para gestión de ubicación

-- Hacer location_name nullable (se llenará después por el admin)
ALTER TABLE public.count_tasks ALTER COLUMN location_name DROP NOT NULL;

-- Agregar nuevas columnas para la gestión de ubicación
ALTER TABLE public.count_tasks ADD COLUMN IF NOT EXISTS subcategoria text;
ALTER TABLE public.count_tasks ADD COLUMN IF NOT EXISTS punto_referencia text;
ALTER TABLE public.count_tasks ADD COLUMN IF NOT EXISTS metodo_conteo text;
ALTER TABLE public.count_tasks ADD COLUMN IF NOT EXISTS assigned_admin_id uuid REFERENCES public.profiles(id);

-- Crear índice para mejorar búsquedas por admin asignado
CREATE INDEX IF NOT EXISTS idx_count_tasks_assigned_admin ON public.count_tasks(assigned_admin_id);

-- Crear función para verificar si un admin puede ver una referencia según el campo control
CREATE OR REPLACE FUNCTION public.admin_can_access_reference(_user_id uuid, _reference text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.inventory_master im
    WHERE im.referencia = _reference
      AND (
        -- admin_mp puede ver referencias donde control IS NOT NULL
        (public.has_role(_user_id, 'admin_mp') AND im.control IS NOT NULL)
        OR
        -- admin_pp puede ver referencias donde control IS NULL
        (public.has_role(_user_id, 'admin_pp') AND im.control IS NULL)
      )
  )
$$;