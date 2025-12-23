-- Agregar política RLS para que superadmins puedan ver todos los conteos
CREATE POLICY "Superadmins can select all counts"
ON public.inventory_counts
FOR SELECT
TO authenticated
USING (is_superadmin(auth.uid()));