-- Paso 2: Crear función helper is_any_admin()
CREATE OR REPLACE FUNCTION public.is_any_admin(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles
    WHERE user_id = _user_id
      AND role IN ('admin_mp', 'admin_pp')
  )
$$;

-- 3. Actualizar RLS policies en inventory_master
DROP POLICY IF EXISTS "Admins can delete inventory" ON public.inventory_master;
DROP POLICY IF EXISTS "Admins can insert inventory" ON public.inventory_master;
DROP POLICY IF EXISTS "Admins can select all inventory" ON public.inventory_master;
DROP POLICY IF EXISTS "Admins can update inventory" ON public.inventory_master;

CREATE POLICY "Admins can delete inventory" ON public.inventory_master
FOR DELETE USING (is_any_admin(auth.uid()));

CREATE POLICY "Admins can insert inventory" ON public.inventory_master
FOR INSERT WITH CHECK (is_any_admin(auth.uid()));

CREATE POLICY "Admins can select all inventory" ON public.inventory_master
FOR SELECT USING (is_any_admin(auth.uid()));

CREATE POLICY "Admins can update inventory" ON public.inventory_master
FOR UPDATE USING (is_any_admin(auth.uid())) WITH CHECK (is_any_admin(auth.uid()));

-- 4. Actualizar RLS policies en count_tasks
DROP POLICY IF EXISTS "Admins can delete tasks" ON public.count_tasks;
DROP POLICY IF EXISTS "Admins can insert tasks" ON public.count_tasks;
DROP POLICY IF EXISTS "Admins can select all tasks" ON public.count_tasks;
DROP POLICY IF EXISTS "Admins can update tasks" ON public.count_tasks;

CREATE POLICY "Admins can delete tasks" ON public.count_tasks
FOR DELETE USING (is_any_admin(auth.uid()));

CREATE POLICY "Admins can insert tasks" ON public.count_tasks
FOR INSERT WITH CHECK (is_any_admin(auth.uid()));

CREATE POLICY "Admins can select all tasks" ON public.count_tasks
FOR SELECT USING (is_any_admin(auth.uid()));

CREATE POLICY "Admins can update tasks" ON public.count_tasks
FOR UPDATE USING (is_any_admin(auth.uid())) WITH CHECK (is_any_admin(auth.uid()));

-- 5. Actualizar RLS policies en audit_logs
DROP POLICY IF EXISTS "Admins can view audit logs" ON public.audit_logs;

CREATE POLICY "Admins can view audit logs" ON public.audit_logs
FOR SELECT USING (is_any_admin(auth.uid()));

-- 6. Actualizar RLS policies en operarios
DROP POLICY IF EXISTS "Admins can delete operarios" ON public.operarios;
DROP POLICY IF EXISTS "Admins can insert operarios" ON public.operarios;
DROP POLICY IF EXISTS "Admins can update operarios" ON public.operarios;

CREATE POLICY "Admins can delete operarios" ON public.operarios
FOR DELETE USING (is_any_admin(auth.uid()));

CREATE POLICY "Admins can insert operarios" ON public.operarios
FOR INSERT WITH CHECK (is_any_admin(auth.uid()));

CREATE POLICY "Admins can update operarios" ON public.operarios
FOR UPDATE USING (is_any_admin(auth.uid())) WITH CHECK (is_any_admin(auth.uid()));

-- 7. Actualizar RLS policies en profiles
DROP POLICY IF EXISTS "Admins can view all profiles" ON public.profiles;

CREATE POLICY "Admins can view all profiles" ON public.profiles
FOR SELECT USING (is_any_admin(auth.uid()));

-- 8. Actualizar RLS policies en user_roles
DROP POLICY IF EXISTS "Admins can delete roles" ON public.user_roles;
DROP POLICY IF EXISTS "Admins can insert roles" ON public.user_roles;
DROP POLICY IF EXISTS "Admins can update roles" ON public.user_roles;
DROP POLICY IF EXISTS "Admins can view all roles" ON public.user_roles;

CREATE POLICY "Admins can delete roles" ON public.user_roles
FOR DELETE USING (is_any_admin(auth.uid()));

CREATE POLICY "Admins can insert roles" ON public.user_roles
FOR INSERT WITH CHECK (is_any_admin(auth.uid()));

CREATE POLICY "Admins can update roles" ON public.user_roles
FOR UPDATE USING (is_any_admin(auth.uid()));

CREATE POLICY "Admins can view all roles" ON public.user_roles
FOR SELECT USING (is_any_admin(auth.uid()));