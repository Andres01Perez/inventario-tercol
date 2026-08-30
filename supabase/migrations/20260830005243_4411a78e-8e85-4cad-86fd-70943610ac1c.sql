-- =========================================================
-- FASE 1: Histórico por inventario
-- =========================================================

CREATE TABLE public.inventories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nombre text NOT NULL,
  fecha_inicio date NOT NULL DEFAULT CURRENT_DATE,
  fecha_cierre timestamptz,
  status text NOT NULL DEFAULT 'abierto',
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT inventories_status_check CHECK (status IN ('abierto','cerrado'))
);

GRANT SELECT ON public.inventories TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.inventories TO authenticated;
GRANT ALL ON public.inventories TO service_role;

ALTER TABLE public.inventories ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can view inventories"
  ON public.inventories FOR SELECT TO authenticated USING (true);
CREATE POLICY "Superadmins can insert inventories"
  ON public.inventories FOR INSERT TO authenticated WITH CHECK (public.is_superadmin(auth.uid()));
CREATE POLICY "Superadmins can update inventories"
  ON public.inventories FOR UPDATE TO authenticated
  USING (public.is_superadmin(auth.uid())) WITH CHECK (public.is_superadmin(auth.uid()));
CREATE POLICY "Superadmins can delete inventories"
  ON public.inventories FOR DELETE TO authenticated USING (public.is_superadmin(auth.uid()));

-- Solo un inventario abierto a la vez
CREATE UNIQUE INDEX inventories_one_open_idx ON public.inventories (status) WHERE status = 'abierto';

CREATE TRIGGER update_inventories_updated_at
  BEFORE UPDATE ON public.inventories
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Inventario actual
INSERT INTO public.inventories (nombre, fecha_inicio, status)
VALUES ('Semestral 2026-1', CURRENT_DATE, 'abierto');

-- =========================================================
-- Función: inventario activo (resuelto en servidor)
-- =========================================================
CREATE OR REPLACE FUNCTION public.get_active_inventory()
RETURNS uuid
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT id FROM public.inventories WHERE status = 'abierto' LIMIT 1
$$;

GRANT EXECUTE ON FUNCTION public.get_active_inventory() TO anon, authenticated, service_role;

-- =========================================================
-- Columnas inventory_id
-- =========================================================
ALTER TABLE public.inventory_master ADD COLUMN inventory_id uuid;
ALTER TABLE public.locations ADD COLUMN inventory_id uuid;
ALTER TABLE public.inventory_counts ADD COLUMN inventory_id uuid;

UPDATE public.inventory_master SET inventory_id = public.get_active_inventory();
UPDATE public.locations SET inventory_id = public.get_active_inventory();
UPDATE public.inventory_counts SET inventory_id = public.get_active_inventory();

ALTER TABLE public.inventory_master
  ALTER COLUMN inventory_id SET NOT NULL,
  ALTER COLUMN inventory_id SET DEFAULT public.get_active_inventory(),
  ADD CONSTRAINT inventory_master_inventory_id_fkey
    FOREIGN KEY (inventory_id) REFERENCES public.inventories(id) ON DELETE CASCADE;

ALTER TABLE public.locations
  ALTER COLUMN inventory_id SET NOT NULL,
  ALTER COLUMN inventory_id SET DEFAULT public.get_active_inventory(),
  ADD CONSTRAINT locations_inventory_id_fkey
    FOREIGN KEY (inventory_id) REFERENCES public.inventories(id) ON DELETE CASCADE;

ALTER TABLE public.inventory_counts
  ALTER COLUMN inventory_id SET NOT NULL,
  ALTER COLUMN inventory_id SET DEFAULT public.get_active_inventory(),
  ADD CONSTRAINT inventory_counts_inventory_id_fkey
    FOREIGN KEY (inventory_id) REFERENCES public.inventories(id) ON DELETE CASCADE;

-- =========================================================
-- PK compuesta en la maestra + FK compuesta desde locations
-- =========================================================
ALTER TABLE public.locations DROP CONSTRAINT count_tasks_master_reference_fkey;
ALTER TABLE public.inventory_master DROP CONSTRAINT inventory_master_pkey;
ALTER TABLE public.inventory_master ADD CONSTRAINT inventory_master_pkey PRIMARY KEY (inventory_id, referencia);

ALTER TABLE public.locations
  ADD CONSTRAINT locations_master_reference_fkey
    FOREIGN KEY (inventory_id, master_reference)
    REFERENCES public.inventory_master(inventory_id, referencia)
    ON UPDATE CASCADE ON DELETE CASCADE;

-- =========================================================
-- Coherencia: el conteo hereda el inventario de su ubicación
-- =========================================================
CREATE OR REPLACE FUNCTION public.sync_count_inventory()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
DECLARE
  v_inv uuid;
BEGIN
  IF NEW.location_id IS NOT NULL THEN
    SELECT inventory_id INTO v_inv FROM public.locations WHERE id = NEW.location_id;
    IF v_inv IS NOT NULL THEN
      NEW.inventory_id := v_inv;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER sync_count_inventory_trg
  BEFORE INSERT OR UPDATE ON public.inventory_counts
  FOR EACH ROW EXECUTE FUNCTION public.sync_count_inventory();

-- =========================================================
-- Candado: nada se escribe en un inventario cerrado
-- =========================================================
CREATE OR REPLACE FUNCTION public.block_closed_inventory()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
DECLARE
  v_inv uuid;
  v_status text;
BEGIN
  IF TG_OP = 'DELETE' THEN
    v_inv := OLD.inventory_id;
  ELSE
    v_inv := NEW.inventory_id;
  END IF;

  SELECT status INTO v_status FROM public.inventories WHERE id = v_inv;

  IF v_status IS DISTINCT FROM 'abierto' THEN
    RAISE EXCEPTION 'El inventario está cerrado: no se permiten cambios sobre datos históricos';
  END IF;

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER block_closed_inventory_trg
  BEFORE INSERT OR UPDATE OR DELETE ON public.inventory_master
  FOR EACH ROW EXECUTE FUNCTION public.block_closed_inventory();
CREATE TRIGGER block_closed_inventory_trg
  BEFORE INSERT OR UPDATE OR DELETE ON public.locations
  FOR EACH ROW EXECUTE FUNCTION public.block_closed_inventory();
CREATE TRIGGER block_closed_inventory_trg
  BEFORE INSERT OR UPDATE OR DELETE ON public.inventory_counts
  FOR EACH ROW EXECUTE FUNCTION public.block_closed_inventory();

-- =========================================================
-- Índices
-- =========================================================
CREATE INDEX IF NOT EXISTS locations_inv_ref_idx ON public.locations (inventory_id, master_reference);
CREATE INDEX IF NOT EXISTS locations_inv_supervisor_idx ON public.locations (inventory_id, assigned_supervisor_id);
CREATE INDEX IF NOT EXISTS inventory_master_inv_type_status_idx ON public.inventory_master (inventory_id, material_type, status_slug);
CREATE INDEX IF NOT EXISTS inventory_counts_inv_round_idx ON public.inventory_counts (inventory_id, audit_round);

-- =========================================================
-- Funciones actualizadas con filtro por inventario
-- =========================================================
CREATE OR REPLACE FUNCTION public.admin_can_access_reference(_user_id uuid, _reference text, _inventory_id uuid DEFAULT NULL)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.inventory_master im
    WHERE im.referencia = _reference
      AND im.inventory_id = COALESCE(_inventory_id, public.get_active_inventory())
      AND (
        (public.has_role(_user_id, 'admin_mp') AND im.control IS NOT NULL)
        OR
        (public.has_role(_user_id, 'admin_pp') AND im.control IS NULL)
      )
  )
$$;

CREATE OR REPLACE FUNCTION public.get_filter_options(_material_type text DEFAULT NULL::text, _inventory_id uuid DEFAULT NULL)
RETURNS jsonb
LANGUAGE sql
STABLE
SET search_path TO 'public'
AS $$
  WITH inv AS (SELECT COALESCE(_inventory_id, public.get_active_inventory()) AS id),
  base AS (
    SELECT l.subcategoria, l.location_name, l.observaciones, l.punto_referencia
    FROM locations l
    JOIN inventory_master im
      ON im.referencia = l.master_reference AND im.inventory_id = l.inventory_id
    WHERE l.inventory_id = (SELECT id FROM inv)
      AND (_material_type IS NULL OR im.material_type = _material_type::material_type)
  )
  SELECT jsonb_build_object(
    'subcategorias', COALESCE((SELECT jsonb_agg(DISTINCT subcategoria ORDER BY subcategoria) FROM base WHERE subcategoria IS NOT NULL), '[]'::jsonb),
    'ubicaciones', COALESCE((SELECT jsonb_agg(DISTINCT location_name ORDER BY location_name) FROM base WHERE location_name IS NOT NULL), '[]'::jsonb),
    'observaciones', COALESCE((SELECT jsonb_agg(DISTINCT observaciones ORDER BY observaciones) FROM base WHERE observaciones IS NOT NULL), '[]'::jsonb),
    'puntos_referencia', COALESCE((SELECT jsonb_agg(DISTINCT punto_referencia ORDER BY punto_referencia) FROM base WHERE punto_referencia IS NOT NULL), '[]'::jsonb)
  );
$$;

-- =========================================================
-- validate_and_close_round con inventario
-- =========================================================
DROP FUNCTION IF EXISTS public.validate_and_close_round(text, uuid);

CREATE OR REPLACE FUNCTION public.validate_and_close_round(_reference text, _admin_id uuid, _inventory_id uuid DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_inv uuid;
  v_inv_status text;
  v_master RECORD;
  v_location RECORD;
  v_sum_validated NUMERIC := 0;
  v_all_validated BOOLEAN := TRUE;
  v_any_validated_this_round BOOLEAN := FALSE;
  v_count_c1 NUMERIC;
  v_count_c2 NUMERIC;
  v_count_c3 NUMERIC;
  v_count_c4 NUMERIC;
  v_count_current NUMERIC;
  v_result JSONB;
  v_history_array JSONB;
  v_erp NUMERIC;
  v_validation_details JSONB := '[]'::JSONB;
  v_pending_locations INTEGER := 0;
  v_validated_locations INTEGER := 0;
  v_discovered_round INTEGER;
  v_sum_c1 NUMERIC;
  v_sum_c2 NUMERIC;
  v_sum_c3 NUMERIC;
  v_sum_c4 NUMERIC;
  v_matched_round TEXT := NULL;
BEGIN
  v_inv := COALESCE(_inventory_id, public.get_active_inventory());

  SELECT status INTO v_inv_status FROM inventories WHERE id = v_inv;
  IF v_inv_status IS DISTINCT FROM 'abierto' THEN
    RETURN jsonb_build_object('success', false, 'error', 'El inventario está cerrado: no se permiten validaciones');
  END IF;

  SELECT * INTO v_master FROM inventory_master WHERE referencia = _reference AND inventory_id = v_inv;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Referencia no encontrada');
  END IF;

  v_erp := COALESCE(v_master.cant_total_erp, 0);

  SELECT COALESCE(SUM(ic.quantity_counted), 0) INTO v_sum_c1
  FROM inventory_counts ic JOIN locations l ON l.id = ic.location_id
  WHERE l.master_reference = _reference AND l.inventory_id = v_inv AND ic.audit_round = 1;

  SELECT COALESCE(SUM(ic.quantity_counted), 0) INTO v_sum_c2
  FROM inventory_counts ic JOIN locations l ON l.id = ic.location_id
  WHERE l.master_reference = _reference AND l.inventory_id = v_inv AND ic.audit_round = 2;

  SELECT COALESCE(SUM(ic.quantity_counted), 0) INTO v_sum_c3
  FROM inventory_counts ic JOIN locations l ON l.id = ic.location_id
  WHERE l.master_reference = _reference AND l.inventory_id = v_inv AND ic.audit_round = 3;

  SELECT COALESCE(SUM(ic.quantity_counted), 0) INTO v_sum_c4
  FROM inventory_counts ic JOIN locations l ON l.id = ic.location_id
  WHERE l.master_reference = _reference AND l.inventory_id = v_inv AND ic.audit_round = 4;

  IF v_master.audit_round = 3 AND v_sum_c3 = 0 THEN
    RETURN jsonb_build_object('success', false, 'action', 'waiting_for_counts', 'round', 3, 'message', 'Esperando conteos de ronda 3');
  END IF;

  IF v_master.audit_round = 4 AND v_sum_c4 = 0 THEN
    RETURN jsonb_build_object('success', false, 'action', 'waiting_for_counts', 'round', 4, 'message', 'Esperando conteos de ronda 4');
  END IF;

  IF v_master.audit_round = 1 THEN
    IF v_sum_c1 = v_erp AND v_sum_c1 > 0 THEN
      v_matched_round := 'C1=ERP';
    ELSIF v_sum_c2 = v_erp AND v_sum_c2 > 0 THEN
      v_matched_round := 'C2=ERP';
    ELSIF v_sum_c1 = v_sum_c2 AND v_sum_c1 > 0 THEN
      v_matched_round := 'C1=C2';
    END IF;
  ELSIF v_master.audit_round = 3 THEN
    IF v_sum_c3 = v_erp AND v_sum_c3 > 0 THEN
      v_matched_round := 'C3=ERP';
    ELSIF v_sum_c3 = v_sum_c1 AND v_sum_c3 > 0 THEN
      v_matched_round := 'C3=C1';
    ELSIF v_sum_c3 = v_sum_c2 AND v_sum_c3 > 0 THEN
      v_matched_round := 'C3=C2';
    END IF;
  ELSIF v_master.audit_round = 4 THEN
    IF v_sum_c4 = v_erp AND v_sum_c4 > 0 THEN
      v_matched_round := 'C4=ERP';
    ELSIF v_sum_c4 = v_sum_c3 AND v_sum_c4 > 0 THEN
      v_matched_round := 'C4=C3';
    ELSIF v_sum_c4 = v_sum_c2 AND v_sum_c4 > 0 THEN
      v_matched_round := 'C4=C2';
    ELSIF v_sum_c4 = v_sum_c1 AND v_sum_c4 > 0 THEN
      v_matched_round := 'C4=C1';
    END IF;
  END IF;

  IF v_matched_round IS NOT NULL THEN
    FOR v_location IN
      SELECT l.id FROM locations l
      WHERE l.master_reference = _reference AND l.inventory_id = v_inv AND l.validated_at_round IS NULL
    LOOP
      SELECT quantity_counted INTO v_count_current
      FROM inventory_counts
      WHERE location_id = v_location.id AND audit_round = v_master.audit_round;

      IF v_count_current IS NULL THEN
        SELECT quantity_counted INTO v_count_current
        FROM inventory_counts
        WHERE location_id = v_location.id
        ORDER BY audit_round DESC LIMIT 1;
      END IF;

      UPDATE locations SET
        validated_at_round = v_master.audit_round,
        validated_quantity = COALESCE(v_count_current, 0)
      WHERE id = v_location.id;
    END LOOP;

    SELECT COALESCE(SUM(validated_quantity), 0) INTO v_sum_validated
    FROM locations WHERE master_reference = _reference AND inventory_id = v_inv;

    v_history_array := COALESCE(v_master.count_history, '[]'::jsonb) || jsonb_build_object(
      'round', v_master.audit_round,
      'sum_validated', v_sum_validated,
      'reason', v_matched_round,
      'sum_c1', v_sum_c1, 'sum_c2', v_sum_c2, 'sum_c3', v_sum_c3, 'sum_c4', v_sum_c4,
      'erp', v_erp, 'timestamp', now()
    );

    UPDATE inventory_master SET status_slug = 'auditado', count_history = v_history_array
    WHERE referencia = _reference AND inventory_id = v_inv;

    INSERT INTO audit_logs (master_reference, user_id, action_type, round_number, new_data)
    VALUES (_reference, _admin_id, 'closed_by_total_sum', v_master.audit_round,
            jsonb_build_object('sum', v_sum_validated, 'reason', v_matched_round, 'inventory_id', v_inv));

    RETURN jsonb_build_object('success', true, 'action', 'closed', 'reason', v_matched_round, 'total', v_sum_validated);
  END IF;

  FOR v_location IN
    SELECT l.id, l.location_name, l.validated_at_round, l.validated_quantity, l.discovered_at_round
    FROM locations l
    WHERE l.master_reference = _reference AND l.inventory_id = v_inv
  LOOP
    IF v_location.validated_at_round IS NOT NULL THEN
      v_sum_validated := v_sum_validated + COALESCE(v_location.validated_quantity, 0);
      v_validated_locations := v_validated_locations + 1;
      CONTINUE;
    END IF;

    v_discovered_round := v_location.discovered_at_round;

    SELECT quantity_counted INTO v_count_c1 FROM inventory_counts WHERE location_id = v_location.id AND audit_round = 1;
    SELECT quantity_counted INTO v_count_c2 FROM inventory_counts WHERE location_id = v_location.id AND audit_round = 2;
    SELECT quantity_counted INTO v_count_c3 FROM inventory_counts WHERE location_id = v_location.id AND audit_round = 3;
    SELECT quantity_counted INTO v_count_c4 FROM inventory_counts WHERE location_id = v_location.id AND audit_round = 4;

    IF v_master.audit_round = 1 THEN
      IF v_discovered_round = 2 THEN
        IF v_count_c2 IS NOT NULL THEN
          UPDATE locations SET validated_at_round = 2, validated_quantity = v_count_c2 WHERE id = v_location.id;
          v_sum_validated := v_sum_validated + v_count_c2;
          v_any_validated_this_round := TRUE;
          v_validated_locations := v_validated_locations + 1;
          v_validation_details := v_validation_details || jsonb_build_object('location_id', v_location.id, 'validated_round', 2, 'quantity', v_count_c2, 'reason', 'discovered_at_C2');
        ELSE
          v_all_validated := FALSE;
          v_pending_locations := v_pending_locations + 1;
        END IF;
        CONTINUE;
      END IF;

      IF v_count_c1 IS NULL OR v_count_c2 IS NULL THEN
        v_all_validated := FALSE;
        v_pending_locations := v_pending_locations + 1;
        CONTINUE;
      END IF;

      IF v_count_c1 = v_count_c2 THEN
        UPDATE locations SET validated_at_round = 1, validated_quantity = v_count_c1 WHERE id = v_location.id;
        v_sum_validated := v_sum_validated + v_count_c1;
        v_any_validated_this_round := TRUE;
        v_validated_locations := v_validated_locations + 1;
        v_validation_details := v_validation_details || jsonb_build_object('location_id', v_location.id, 'validated_round', 1, 'quantity', v_count_c1, 'reason', 'C1=C2');
      ELSE
        v_all_validated := FALSE;
        v_pending_locations := v_pending_locations + 1;
      END IF;

    ELSIF v_master.audit_round = 3 THEN
      IF v_count_c3 IS NULL THEN
        v_all_validated := FALSE;
        v_pending_locations := v_pending_locations + 1;
        CONTINUE;
      END IF;

      IF v_discovered_round = 2 THEN
        IF v_count_c3 = v_count_c2 THEN
          UPDATE locations SET validated_at_round = 3, validated_quantity = v_count_c3 WHERE id = v_location.id;
          v_sum_validated := v_sum_validated + v_count_c3;
          v_any_validated_this_round := TRUE;
          v_validated_locations := v_validated_locations + 1;
          v_validation_details := v_validation_details || jsonb_build_object('location_id', v_location.id, 'validated_round', 3, 'quantity', v_count_c3, 'reason', 'C3=C2 (discovered_at_C2)');
        ELSE
          v_all_validated := FALSE;
          v_pending_locations := v_pending_locations + 1;
        END IF;
        CONTINUE;
      END IF;

      IF v_discovered_round = 3 THEN
        UPDATE locations SET validated_at_round = 3, validated_quantity = v_count_c3 WHERE id = v_location.id;
        v_sum_validated := v_sum_validated + v_count_c3;
        v_any_validated_this_round := TRUE;
        v_validated_locations := v_validated_locations + 1;
        v_validation_details := v_validation_details || jsonb_build_object('location_id', v_location.id, 'validated_round', 3, 'quantity', v_count_c3, 'reason', 'discovered_at_C3');
        CONTINUE;
      END IF;

      IF v_count_c3 = v_count_c1 OR v_count_c3 = v_count_c2 THEN
        UPDATE locations SET validated_at_round = 3, validated_quantity = v_count_c3 WHERE id = v_location.id;
        v_sum_validated := v_sum_validated + v_count_c3;
        v_any_validated_this_round := TRUE;
        v_validated_locations := v_validated_locations + 1;
        v_validation_details := v_validation_details || jsonb_build_object('location_id', v_location.id, 'validated_round', 3, 'quantity', v_count_c3, 'reason', CASE WHEN v_count_c3 = v_count_c1 THEN 'C3=C1' ELSE 'C3=C2' END);
      ELSE
        v_all_validated := FALSE;
        v_pending_locations := v_pending_locations + 1;
      END IF;

    ELSIF v_master.audit_round = 4 THEN
      IF v_count_c4 IS NULL THEN
        v_all_validated := FALSE;
        v_pending_locations := v_pending_locations + 1;
        CONTINUE;
      END IF;

      IF v_discovered_round = 4 THEN
        UPDATE locations SET validated_at_round = 4, validated_quantity = v_count_c4 WHERE id = v_location.id;
        v_sum_validated := v_sum_validated + v_count_c4;
        v_any_validated_this_round := TRUE;
        v_validated_locations := v_validated_locations + 1;
        v_validation_details := v_validation_details || jsonb_build_object('location_id', v_location.id, 'validated_round', 4, 'quantity', v_count_c4, 'reason', 'discovered_at_C4');
        CONTINUE;
      END IF;

      IF v_discovered_round = 3 THEN
        IF v_count_c4 = v_count_c3 THEN
          UPDATE locations SET validated_at_round = 4, validated_quantity = v_count_c4 WHERE id = v_location.id;
          v_sum_validated := v_sum_validated + v_count_c4;
          v_any_validated_this_round := TRUE;
          v_validated_locations := v_validated_locations + 1;
          v_validation_details := v_validation_details || jsonb_build_object('location_id', v_location.id, 'validated_round', 4, 'quantity', v_count_c4, 'reason', 'C4=C3 (discovered_at_C3)');
        ELSE
          v_all_validated := FALSE;
          v_pending_locations := v_pending_locations + 1;
        END IF;
        CONTINUE;
      END IF;

      IF v_discovered_round = 2 THEN
        IF v_count_c4 = v_count_c2 OR v_count_c4 = v_count_c3 THEN
          UPDATE locations SET validated_at_round = 4, validated_quantity = v_count_c4 WHERE id = v_location.id;
          v_sum_validated := v_sum_validated + v_count_c4;
          v_any_validated_this_round := TRUE;
          v_validated_locations := v_validated_locations + 1;
          v_validation_details := v_validation_details || jsonb_build_object('location_id', v_location.id, 'validated_round', 4, 'quantity', v_count_c4, 'reason', CASE WHEN v_count_c4 = v_count_c2 THEN 'C4=C2' ELSE 'C4=C3' END || ' (discovered_at_C2)');
        ELSE
          v_all_validated := FALSE;
          v_pending_locations := v_pending_locations + 1;
        END IF;
        CONTINUE;
      END IF;

      IF v_count_c4 = v_count_c1 OR v_count_c4 = v_count_c2 OR v_count_c4 = v_count_c3 THEN
        UPDATE locations SET validated_at_round = 4, validated_quantity = v_count_c4 WHERE id = v_location.id;
        v_sum_validated := v_sum_validated + v_count_c4;
        v_any_validated_this_round := TRUE;
        v_validated_locations := v_validated_locations + 1;
        v_validation_details := v_validation_details || jsonb_build_object('location_id', v_location.id, 'validated_round', 4, 'quantity', v_count_c4,
          'reason', CASE WHEN v_count_c4 = v_count_c1 THEN 'C4=C1' WHEN v_count_c4 = v_count_c2 THEN 'C4=C2' ELSE 'C4=C3' END);
      ELSE
        v_all_validated := FALSE;
        v_pending_locations := v_pending_locations + 1;
      END IF;

    ELSIF v_master.audit_round = 5 THEN
      IF NOT is_superadmin(_admin_id) THEN
        RETURN jsonb_build_object('success', false, 'error', 'Solo superadmins pueden cerrar referencias en Conteo 5');
      END IF;

      SELECT quantity_counted INTO v_count_current FROM inventory_counts WHERE location_id = v_location.id AND audit_round = 5;

      IF v_count_current IS NULL THEN
        v_all_validated := FALSE;
        v_pending_locations := v_pending_locations + 1;
        CONTINUE;
      END IF;

      UPDATE locations SET validated_at_round = 5, validated_quantity = v_count_current WHERE id = v_location.id;
      v_sum_validated := v_sum_validated + v_count_current;
      v_any_validated_this_round := TRUE;
      v_validated_locations := v_validated_locations + 1;
      v_validation_details := v_validation_details || jsonb_build_object('location_id', v_location.id, 'validated_round', 5, 'quantity', v_count_current, 'reason', 'superadmin_forced');
    END IF;
  END LOOP;

  v_history_array := COALESCE(v_master.count_history, '[]'::jsonb) || jsonb_build_object(
    'round', v_master.audit_round,
    'sum_validated', v_sum_validated,
    'validated_locations', v_validated_locations,
    'pending_locations', v_pending_locations,
    'validation_details', v_validation_details,
    'timestamp', now()
  );

  IF v_all_validated AND v_validated_locations > 0 THEN
    IF v_sum_validated = v_erp THEN
      UPDATE inventory_master SET status_slug = 'auditado', count_history = v_history_array WHERE referencia = _reference AND inventory_id = v_inv;
      v_result := jsonb_build_object('success', true, 'action', 'closed', 'reason', 'all_locations_validated_matches_erp', 'total', v_sum_validated);
    ELSIF v_master.audit_round = 5 THEN
      UPDATE inventory_master SET status_slug = 'cerrado_forzado', count_history = v_history_array WHERE referencia = _reference AND inventory_id = v_inv;
      v_result := jsonb_build_object('success', true, 'action', 'forced_close_superadmin', 'total', v_sum_validated);
    ELSE
      UPDATE inventory_master SET status_slug = 'auditado', count_history = v_history_array WHERE referencia = _reference AND inventory_id = v_inv;
      v_result := jsonb_build_object('success', true, 'action', 'closed', 'reason', 'all_locations_validated', 'total', v_sum_validated);
    END IF;

  ELSIF v_pending_locations > 0 THEN
    IF v_master.audit_round = 1 THEN
      UPDATE inventory_master SET audit_round = 3, status_slug = 'conflicto', count_history = v_history_array WHERE referencia = _reference AND inventory_id = v_inv;
      v_result := jsonb_build_object('success', true, 'action', 'next_round', 'new_round', 3, 'pending_locations', v_pending_locations, 'validated_locations', v_validated_locations);
    ELSIF v_master.audit_round = 3 THEN
      UPDATE inventory_master SET audit_round = 4, status_slug = 'conflicto', count_history = v_history_array WHERE referencia = _reference AND inventory_id = v_inv;
      v_result := jsonb_build_object('success', true, 'action', 'next_round', 'new_round', 4, 'pending_locations', v_pending_locations, 'validated_locations', v_validated_locations);
    ELSIF v_master.audit_round = 4 THEN
      UPDATE inventory_master SET audit_round = 5, status_slug = 'critico', count_history = v_history_array WHERE referencia = _reference AND inventory_id = v_inv;
      v_result := jsonb_build_object('success', true, 'action', 'escalate_to_superadmin', 'new_round', 5, 'pending_locations', v_pending_locations, 'validated_locations', v_validated_locations);
    ELSE
      v_result := jsonb_build_object('success', false, 'error', 'Estado de ronda inválido', 'round', v_master.audit_round);
    END IF;
  ELSE
    v_result := jsonb_build_object('success', false, 'error', 'No hay ubicaciones para validar');
  END IF;

  INSERT INTO audit_logs (master_reference, user_id, action_type, round_number, new_data)
  VALUES (_reference, _admin_id, v_result->>'action', v_master.audit_round, v_result || jsonb_build_object('inventory_id', v_inv));

  RETURN v_result;
END;
$function$;
