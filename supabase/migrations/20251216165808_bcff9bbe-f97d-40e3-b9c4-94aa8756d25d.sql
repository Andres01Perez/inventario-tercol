-- Allow supervisors to insert new locations they discover during counting
CREATE POLICY "Supervisors can insert locations"
ON public.locations
FOR INSERT
WITH CHECK (
  has_role(auth.uid(), 'supervisor'::app_role) 
  AND assigned_supervisor_id = auth.uid()
);