-- Permitir a supervisores ver TODAS las referencias (solo lectura)
-- Esto es necesario para que puedan agregar items encontrados físicamente
-- seleccionando cualquiera de las 2400+ referencias disponibles
CREATE POLICY "Supervisors can view all references"
  ON public.inventory_master
  FOR SELECT
  TO authenticated
  USING (has_role(auth.uid(), 'supervisor'::app_role));