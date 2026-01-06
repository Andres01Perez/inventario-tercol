-- Índices compuestos para consultas frecuentes con 40 usuarios simultáneos

-- Para consultas de validación que filtran por supervisor + ronda
CREATE INDEX IF NOT EXISTS idx_counts_supervisor_round ON inventory_counts(supervisor_id, audit_round);

-- Para consultas que filtran ubicaciones por admin + supervisor
CREATE INDEX IF NOT EXISTS idx_locations_admin_supervisor ON locations(assigned_admin_id, assigned_supervisor_id);

-- Índice parcial para ubicaciones no validadas (acelera queries de conteo pendiente)
CREATE INDEX IF NOT EXISTS idx_locations_not_validated ON locations(master_reference) WHERE validated_at_round IS NULL;

-- Índice parcial para referencias en conflicto/críticas
CREATE INDEX IF NOT EXISTS idx_master_pending ON inventory_master(audit_round) WHERE status_slug IN ('conflicto', 'critico');

-- Función optimizada para obtener opciones de filtro sin traer todas las ubicaciones
CREATE OR REPLACE FUNCTION get_filter_options(_material_type text DEFAULT NULL)
RETURNS jsonb
LANGUAGE sql
STABLE
SET search_path TO 'public'
AS $$
  SELECT jsonb_build_object(
    'subcategorias', COALESCE((
      SELECT jsonb_agg(DISTINCT l.subcategoria ORDER BY l.subcategoria)
      FROM locations l
      JOIN inventory_master im ON im.referencia = l.master_reference
      WHERE l.subcategoria IS NOT NULL
        AND (_material_type IS NULL OR im.material_type = _material_type::material_type)
    ), '[]'::jsonb),
    'ubicaciones', COALESCE((
      SELECT jsonb_agg(DISTINCT l.location_name ORDER BY l.location_name)
      FROM locations l
      JOIN inventory_master im ON im.referencia = l.master_reference
      WHERE l.location_name IS NOT NULL
        AND (_material_type IS NULL OR im.material_type = _material_type::material_type)
    ), '[]'::jsonb),
    'observaciones', COALESCE((
      SELECT jsonb_agg(DISTINCT l.observaciones ORDER BY l.observaciones)
      FROM locations l
      JOIN inventory_master im ON im.referencia = l.master_reference
      WHERE l.observaciones IS NOT NULL
        AND (_material_type IS NULL OR im.material_type = _material_type::material_type)
    ), '[]'::jsonb),
    'puntos_referencia', COALESCE((
      SELECT jsonb_agg(DISTINCT l.punto_referencia ORDER BY l.punto_referencia)
      FROM locations l
      JOIN inventory_master im ON im.referencia = l.master_reference
      WHERE l.punto_referencia IS NOT NULL
        AND (_material_type IS NULL OR im.material_type = _material_type::material_type)
    ), '[]'::jsonb)
  );
$$;