-- 1. Modificar trigger handle_new_user para NO asignar rol por defecto
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  INSERT INTO public.profiles (id, email, full_name)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data ->> 'full_name', '')
  );
  
  -- Ya NO insertamos rol por defecto, el superadmin debe asignarlo
  RETURN NEW;
END;
$function$;

-- 2. Eliminar columna redundante responsible_name de count_tasks
ALTER TABLE public.count_tasks DROP COLUMN IF EXISTS responsible_name;

-- 3. Agregar FK constraint para operario_id si no existe
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints 
    WHERE constraint_name = 'count_tasks_operario_id_fkey'
  ) THEN
    ALTER TABLE public.count_tasks 
    ADD CONSTRAINT count_tasks_operario_id_fkey 
    FOREIGN KEY (operario_id) REFERENCES public.operarios(id);
  END IF;
END $$;

-- 4. Crear función has_role actualizada para incluir superadmin
CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role app_role)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles
    WHERE user_id = _user_id
      AND role = _role
  )
$$;

-- 5. Crear función is_superadmin para verificación rápida
CREATE OR REPLACE FUNCTION public.is_superadmin(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles
    WHERE user_id = _user_id
      AND role = 'superadmin'
  )
$$;

-- 6. Agregar políticas RLS para superadmin en todas las tablas

-- profiles: superadmin puede ver todos
CREATE POLICY "Superadmins can view all profiles"
ON public.profiles FOR SELECT
USING (is_superadmin(auth.uid()));

-- profiles: superadmin puede actualizar todos
CREATE POLICY "Superadmins can update all profiles"
ON public.profiles FOR UPDATE
USING (is_superadmin(auth.uid()));

-- user_roles: superadmin puede ver todos los roles
CREATE POLICY "Superadmins can view all roles"
ON public.user_roles FOR SELECT
USING (is_superadmin(auth.uid()));

-- user_roles: superadmin puede insertar roles
CREATE POLICY "Superadmins can insert roles"
ON public.user_roles FOR INSERT
WITH CHECK (is_superadmin(auth.uid()));

-- user_roles: superadmin puede actualizar roles
CREATE POLICY "Superadmins can update roles"
ON public.user_roles FOR UPDATE
USING (is_superadmin(auth.uid()));

-- user_roles: superadmin puede eliminar roles
CREATE POLICY "Superadmins can delete roles"
ON public.user_roles FOR DELETE
USING (is_superadmin(auth.uid()));

-- inventory_master: superadmin tiene acceso completo
CREATE POLICY "Superadmins can select all inventory"
ON public.inventory_master FOR SELECT
USING (is_superadmin(auth.uid()));

CREATE POLICY "Superadmins can insert inventory"
ON public.inventory_master FOR INSERT
WITH CHECK (is_superadmin(auth.uid()));

CREATE POLICY "Superadmins can update inventory"
ON public.inventory_master FOR UPDATE
USING (is_superadmin(auth.uid()));

CREATE POLICY "Superadmins can delete inventory"
ON public.inventory_master FOR DELETE
USING (is_superadmin(auth.uid()));

-- count_tasks: superadmin tiene acceso completo
CREATE POLICY "Superadmins can select all tasks"
ON public.count_tasks FOR SELECT
USING (is_superadmin(auth.uid()));

CREATE POLICY "Superadmins can insert tasks"
ON public.count_tasks FOR INSERT
WITH CHECK (is_superadmin(auth.uid()));

CREATE POLICY "Superadmins can update tasks"
ON public.count_tasks FOR UPDATE
USING (is_superadmin(auth.uid()));

CREATE POLICY "Superadmins can delete tasks"
ON public.count_tasks FOR DELETE
USING (is_superadmin(auth.uid()));

-- operarios: superadmin tiene acceso completo
CREATE POLICY "Superadmins can select all operarios"
ON public.operarios FOR SELECT
USING (is_superadmin(auth.uid()));

CREATE POLICY "Superadmins can insert operarios"
ON public.operarios FOR INSERT
WITH CHECK (is_superadmin(auth.uid()));

CREATE POLICY "Superadmins can update operarios"
ON public.operarios FOR UPDATE
USING (is_superadmin(auth.uid()));

CREATE POLICY "Superadmins can delete operarios"
ON public.operarios FOR DELETE
USING (is_superadmin(auth.uid()));

-- audit_logs: superadmin puede ver todo
CREATE POLICY "Superadmins can view all audit logs"
ON public.audit_logs FOR SELECT
USING (is_superadmin(auth.uid()));