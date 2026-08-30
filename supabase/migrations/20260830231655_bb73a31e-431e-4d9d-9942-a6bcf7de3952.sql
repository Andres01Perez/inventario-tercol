-- 1. Eliminar tabla operarios (vacía, sin dependencias)
DROP TABLE IF EXISTS public.operarios CASCADE;

-- 2. Reasignar / eliminar usuarios con rol operario
DELETE FROM public.user_roles WHERE role = 'operario';

-- 3. Quitar default
ALTER TABLE public.user_roles ALTER COLUMN role DROP DEFAULT;

-- 4. Eliminar políticas que dependen de has_role(uuid, app_role)
DROP POLICY IF EXISTS "Supervisors can view assigned inventory" ON public.inventory_master;
DROP POLICY IF EXISTS "Supervisors can view all references" ON public.inventory_master;
DROP POLICY IF EXISTS "Supervisors can view own tasks" ON public.locations;
DROP POLICY IF EXISTS "Supervisors can update own tasks" ON public.locations;
DROP POLICY IF EXISTS "Supervisors can insert locations" ON public.locations;

-- 5. Eliminar funciones con app_role en su firma
DROP FUNCTION IF EXISTS public.has_role(uuid, app_role);
DROP FUNCTION IF EXISTS public.get_user_role(uuid);

-- 6. Recrear el enum sin 'operario'
ALTER TYPE public.app_role RENAME TO app_role_old;
CREATE TYPE public.app_role AS ENUM ('superadmin', 'admin', 'admin_mp', 'admin_pp', 'supervisor');
ALTER TABLE public.user_roles
  ALTER COLUMN role TYPE public.app_role
  USING role::text::public.app_role;
DROP TYPE public.app_role_old;

-- 7. Recrear funciones
CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role public.app_role)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND role = _role
  )
$$;

CREATE OR REPLACE FUNCTION public.get_user_role(_user_id uuid)
RETURNS public.app_role
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT role FROM public.user_roles WHERE user_id = _user_id LIMIT 1
$$;

-- 8. Recrear políticas de supervisores (idénticas a las anteriores)
CREATE POLICY "Supervisors can view all references"
ON public.inventory_master FOR SELECT TO authenticated
USING (has_role(auth.uid(), 'supervisor'::public.app_role));

CREATE POLICY "Supervisors can view assigned inventory"
ON public.inventory_master FOR SELECT TO authenticated
USING (
  has_role(auth.uid(), 'supervisor'::public.app_role)
  AND EXISTS (
    SELECT 1 FROM public.locations
    WHERE locations.master_reference = inventory_master.referencia
      AND locations.assigned_supervisor_id = auth.uid()
  )
);

CREATE POLICY "Supervisors can view own tasks"
ON public.locations FOR SELECT TO authenticated
USING (
  has_role(auth.uid(), 'supervisor'::public.app_role)
  AND assigned_supervisor_id = auth.uid()
);

CREATE POLICY "Supervisors can update own tasks"
ON public.locations FOR UPDATE TO authenticated
USING (
  has_role(auth.uid(), 'supervisor'::public.app_role)
  AND assigned_supervisor_id = auth.uid()
)
WITH CHECK (
  has_role(auth.uid(), 'supervisor'::public.app_role)
  AND assigned_supervisor_id = auth.uid()
);

CREATE POLICY "Supervisors can insert locations"
ON public.locations FOR INSERT
WITH CHECK (
  has_role(auth.uid(), 'supervisor'::public.app_role)
  AND assigned_supervisor_id = auth.uid()
);