-- Performance indexes for inventory_counts
CREATE INDEX IF NOT EXISTS idx_counts_location_round 
ON inventory_counts(location_id, audit_round);

CREATE INDEX IF NOT EXISTS idx_counts_supervisor 
ON inventory_counts(supervisor_id);

CREATE INDEX IF NOT EXISTS idx_counts_audit_round 
ON inventory_counts(audit_round);

-- Performance indexes for locations
CREATE INDEX IF NOT EXISTS idx_locations_assigned_admin 
ON locations(assigned_admin_id);

CREATE INDEX IF NOT EXISTS idx_locations_assigned_supervisor 
ON locations(assigned_supervisor_id);

CREATE INDEX IF NOT EXISTS idx_locations_master_reference 
ON locations(master_reference);

CREATE INDEX IF NOT EXISTS idx_locations_validated 
ON locations(validated_at_round) WHERE validated_at_round IS NULL;

-- Composite index for RoundTranscriptionTab queries
CREATE INDEX IF NOT EXISTS idx_locations_operario_c1 
ON locations(operario_c1_id) WHERE operario_c1_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_locations_operario_c2 
ON locations(operario_c2_id) WHERE operario_c2_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_locations_operario_c3 
ON locations(operario_c3_id) WHERE operario_c3_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_locations_operario_c4 
ON locations(operario_c4_id) WHERE operario_c4_id IS NOT NULL;

-- Performance indexes for operarios
CREATE INDEX IF NOT EXISTS idx_operarios_active 
ON operarios(is_active) WHERE is_active = true;

-- Performance indexes for inventory_master
CREATE INDEX IF NOT EXISTS idx_inventory_master_audit_round 
ON inventory_master(audit_round);

CREATE INDEX IF NOT EXISTS idx_inventory_master_control 
ON inventory_master(control) WHERE control IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_inventory_master_referencia 
ON inventory_master(referencia);

-- Trigram indexes for text search (ILIKE filters)
CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE INDEX IF NOT EXISTS idx_locations_subcategoria_trgm 
ON locations USING gin(subcategoria gin_trgm_ops);

CREATE INDEX IF NOT EXISTS idx_locations_location_name_trgm 
ON locations USING gin(location_name gin_trgm_ops);

CREATE INDEX IF NOT EXISTS idx_locations_observaciones_trgm 
ON locations USING gin(observaciones gin_trgm_ops);

CREATE INDEX IF NOT EXISTS idx_inventory_referencia_trgm 
ON inventory_master USING gin(referencia gin_trgm_ops);

-- Index for user_roles lookups
CREATE INDEX IF NOT EXISTS idx_user_roles_role 
ON user_roles(role);

CREATE INDEX IF NOT EXISTS idx_user_roles_user_id 
ON user_roles(user_id);