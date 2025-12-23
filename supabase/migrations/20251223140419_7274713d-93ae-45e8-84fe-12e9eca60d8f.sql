-- 1. Agregar columnas de estado para cada conteo
ALTER TABLE locations 
ADD COLUMN IF NOT EXISTS status_c1 text DEFAULT 'pendiente',
ADD COLUMN IF NOT EXISTS status_c2 text DEFAULT 'pendiente',
ADD COLUMN IF NOT EXISTS status_c3 text DEFAULT 'pendiente',
ADD COLUMN IF NOT EXISTS status_c4 text DEFAULT 'pendiente';

-- 2. Agregar constraint para valores válidos
ALTER TABLE locations 
ADD CONSTRAINT status_c1_check CHECK (status_c1 IN ('pendiente', 'asignado', 'contado')),
ADD CONSTRAINT status_c2_check CHECK (status_c2 IN ('pendiente', 'asignado', 'contado')),
ADD CONSTRAINT status_c3_check CHECK (status_c3 IN ('pendiente', 'asignado', 'contado')),
ADD CONSTRAINT status_c4_check CHECK (status_c4 IN ('pendiente', 'asignado', 'contado'));

-- 3. Trigger para actualizar status cuando se asigna operario
CREATE OR REPLACE FUNCTION update_location_status_on_operario()
RETURNS TRIGGER AS $$
BEGIN
  -- C1: Si operario_c1_id cambia de NULL a valor, status_c1 = 'asignado'
  IF NEW.operario_c1_id IS NOT NULL AND (OLD.operario_c1_id IS NULL OR OLD.operario_c1_id != NEW.operario_c1_id) THEN
    IF NEW.status_c1 = 'pendiente' THEN
      NEW.status_c1 := 'asignado';
    END IF;
  END IF;
  -- Si se quita el operario y no está contado, vuelve a pendiente
  IF NEW.operario_c1_id IS NULL AND OLD.operario_c1_id IS NOT NULL AND NEW.status_c1 = 'asignado' THEN
    NEW.status_c1 := 'pendiente';
  END IF;

  -- C2
  IF NEW.operario_c2_id IS NOT NULL AND (OLD.operario_c2_id IS NULL OR OLD.operario_c2_id != NEW.operario_c2_id) THEN
    IF NEW.status_c2 = 'pendiente' THEN
      NEW.status_c2 := 'asignado';
    END IF;
  END IF;
  IF NEW.operario_c2_id IS NULL AND OLD.operario_c2_id IS NOT NULL AND NEW.status_c2 = 'asignado' THEN
    NEW.status_c2 := 'pendiente';
  END IF;

  -- C3
  IF NEW.operario_c3_id IS NOT NULL AND (OLD.operario_c3_id IS NULL OR OLD.operario_c3_id != NEW.operario_c3_id) THEN
    IF NEW.status_c3 = 'pendiente' THEN
      NEW.status_c3 := 'asignado';
    END IF;
  END IF;
  IF NEW.operario_c3_id IS NULL AND OLD.operario_c3_id IS NOT NULL AND NEW.status_c3 = 'asignado' THEN
    NEW.status_c3 := 'pendiente';
  END IF;

  -- C4
  IF NEW.operario_c4_id IS NOT NULL AND (OLD.operario_c4_id IS NULL OR OLD.operario_c4_id != NEW.operario_c4_id) THEN
    IF NEW.status_c4 = 'pendiente' THEN
      NEW.status_c4 := 'asignado';
    END IF;
  END IF;
  IF NEW.operario_c4_id IS NULL AND OLD.operario_c4_id IS NOT NULL AND NEW.status_c4 = 'asignado' THEN
    NEW.status_c4 := 'pendiente';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

CREATE TRIGGER trg_location_operario_status
BEFORE UPDATE ON locations
FOR EACH ROW
EXECUTE FUNCTION update_location_status_on_operario();

-- 4. Trigger para marcar 'contado' cuando se inserta un inventory_count
CREATE OR REPLACE FUNCTION update_location_status_on_count()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.audit_round = 1 THEN
    UPDATE locations SET status_c1 = 'contado' WHERE id = NEW.location_id AND status_c1 != 'contado';
  ELSIF NEW.audit_round = 2 THEN
    UPDATE locations SET status_c2 = 'contado' WHERE id = NEW.location_id AND status_c2 != 'contado';
  ELSIF NEW.audit_round = 3 THEN
    UPDATE locations SET status_c3 = 'contado' WHERE id = NEW.location_id AND status_c3 != 'contado';
  ELSIF NEW.audit_round = 4 THEN
    UPDATE locations SET status_c4 = 'contado' WHERE id = NEW.location_id AND status_c4 != 'contado';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

CREATE TRIGGER trg_inventory_count_status
AFTER INSERT ON inventory_counts
FOR EACH ROW
EXECUTE FUNCTION update_location_status_on_count();

-- 5. Sincronizar datos existentes basado en operarios asignados
UPDATE locations SET 
  status_c1 = CASE WHEN operario_c1_id IS NOT NULL THEN 'asignado' ELSE 'pendiente' END,
  status_c2 = CASE WHEN operario_c2_id IS NOT NULL THEN 'asignado' ELSE 'pendiente' END,
  status_c3 = CASE WHEN operario_c3_id IS NOT NULL THEN 'asignado' ELSE 'pendiente' END,
  status_c4 = CASE WHEN operario_c4_id IS NOT NULL THEN 'asignado' ELSE 'pendiente' END;

-- 6. Sincronizar datos existentes basado en conteos ya realizados
UPDATE locations l SET status_c1 = 'contado'
WHERE EXISTS (SELECT 1 FROM inventory_counts ic WHERE ic.location_id = l.id AND ic.audit_round = 1);

UPDATE locations l SET status_c2 = 'contado'
WHERE EXISTS (SELECT 1 FROM inventory_counts ic WHERE ic.location_id = l.id AND ic.audit_round = 2);

UPDATE locations l SET status_c3 = 'contado'
WHERE EXISTS (SELECT 1 FROM inventory_counts ic WHERE ic.location_id = l.id AND ic.audit_round = 3);

UPDATE locations l SET status_c4 = 'contado'
WHERE EXISTS (SELECT 1 FROM inventory_counts ic WHERE ic.location_id = l.id AND ic.audit_round = 4);

-- 7. Eliminar columna obsoleta operario_id (ya no se usa)
ALTER TABLE locations DROP COLUMN IF EXISTS operario_id;