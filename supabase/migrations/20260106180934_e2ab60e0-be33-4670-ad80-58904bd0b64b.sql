-- Habilitar REPLICA IDENTITY FULL para que realtime funcione correctamente
ALTER TABLE inventory_counts REPLICA IDENTITY FULL;
ALTER TABLE locations REPLICA IDENTITY FULL;
ALTER TABLE inventory_master REPLICA IDENTITY FULL;

-- Agregar tablas a la publicación supabase_realtime
ALTER PUBLICATION supabase_realtime ADD TABLE inventory_counts;
ALTER PUBLICATION supabase_realtime ADD TABLE locations;
ALTER PUBLICATION supabase_realtime ADD TABLE inventory_master;