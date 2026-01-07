-- Drop existing policies that might conflict
DROP POLICY IF EXISTS "Superadmins can insert counts" ON public.inventory_counts;
DROP POLICY IF EXISTS "Superadmins can update counts" ON public.inventory_counts;

-- Allow superadmins to manage inventory_counts (needed for Auditoria -> Editar Conteo)
CREATE POLICY "Superadmins can insert counts"
ON public.inventory_counts
FOR INSERT
TO authenticated
WITH CHECK (is_superadmin(auth.uid()));

CREATE POLICY "Superadmins can update counts"
ON public.inventory_counts
FOR UPDATE
TO authenticated
USING (is_superadmin(auth.uid()))
WITH CHECK (is_superadmin(auth.uid()));