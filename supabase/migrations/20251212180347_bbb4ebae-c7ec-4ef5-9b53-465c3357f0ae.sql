-- Índices para optimizar consultas de filtrado en locations y inventory_master
CREATE INDEX IF NOT EXISTS idx_locations_master_reference ON locations(master_reference);
CREATE INDEX IF NOT EXISTS idx_locations_subcategoria ON locations(subcategoria);
CREATE INDEX IF NOT EXISTS idx_locations_location_name ON locations(location_name);
CREATE INDEX IF NOT EXISTS idx_locations_assigned_supervisor_id ON locations(assigned_supervisor_id);
CREATE INDEX IF NOT EXISTS idx_locations_observaciones ON locations(observaciones);
CREATE INDEX IF NOT EXISTS idx_inventory_master_material_type ON inventory_master(material_type);
CREATE INDEX IF NOT EXISTS idx_inventory_master_control ON inventory_master(control);