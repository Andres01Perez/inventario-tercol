-- =============================================
-- FIX: Permitir lectura a todos los usuarios autenticados
-- El control de acceso por rol se maneja en el código
-- =============================================

-- 1. LOCATIONS: Agregar política de lectura para usuarios autenticados
CREATE POLICY "Authenticated users can read all locations"
  ON public.locations
  FOR SELECT
  TO authenticated
  USING (true);

-- 2. INVENTORY_MASTER: Agregar política de lectura para usuarios autenticados
CREATE POLICY "Authenticated users can read all inventory"
  ON public.inventory_master
  FOR SELECT
  TO authenticated
  USING (true);

-- 3. INVENTORY_COUNTS: Agregar política de lectura para usuarios autenticados
CREATE POLICY "Authenticated users can read all counts"
  ON public.inventory_counts
  FOR SELECT
  TO authenticated
  USING (true);