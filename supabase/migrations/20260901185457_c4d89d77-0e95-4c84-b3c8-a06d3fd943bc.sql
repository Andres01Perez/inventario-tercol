-- ============ PT MASTER ============
CREATE TABLE public.pt_master (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  inventory_id uuid NOT NULL DEFAULT public.get_active_inventory() REFERENCES public.inventories(id) ON DELETE CASCADE,
  referencia text NOT NULL,
  descripcion text,
  cant_erp numeric NOT NULL DEFAULT 0,
  status_slug text NOT NULL DEFAULT 'pendiente',
  audit_round integer NOT NULL DEFAULT 1,
  count_history jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT pt_master_inv_ref_unique UNIQUE (inventory_id, referencia)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.pt_master TO authenticated;
GRANT ALL ON public.pt_master TO service_role;

ALTER TABLE public.pt_master ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can read pt_master" ON public.pt_master
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admins manage pt_master" ON public.pt_master
  FOR ALL TO authenticated
  USING (public.is_superadmin(auth.uid()) OR public.is_any_admin(auth.uid()))
  WITH CHECK (public.is_superadmin(auth.uid()) OR public.is_any_admin(auth.uid()));

CREATE INDEX idx_pt_master_inventory ON public.pt_master(inventory_id);
CREATE INDEX idx_pt_master_referencia ON public.pt_master(referencia);

-- ============ PT LOCATIONS ============
CREATE TABLE public.pt_locations (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  inventory_id uuid NOT NULL DEFAULT public.get_active_inventory() REFERENCES public.inventories(id) ON DELETE CASCADE,
  referencia text NOT NULL,
  piso text NOT NULL,
  prodc text,
  ubic text,
  linea text,
  ue numeric,
  orden integer,
  assigned_supervisor_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  status_c1 text NOT NULL DEFAULT 'pendiente',
  status_c2 text NOT NULL DEFAULT 'pendiente',
  status_c3 text NOT NULL DEFAULT 'pendiente',
  status_c4 text NOT NULL DEFAULT 'pendiente',
  validated_at_round integer,
  validated_quantity numeric,
  discovered_at_round integer NOT NULL DEFAULT 1,
  activo boolean NOT NULL DEFAULT true,
  terminado boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT pt_locations_master_fk FOREIGN KEY (inventory_id, referencia)
    REFERENCES public.pt_master(inventory_id, referencia) ON DELETE CASCADE
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.pt_locations TO authenticated;
GRANT ALL ON public.pt_locations TO service_role;

ALTER TABLE public.pt_locations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can read pt_locations" ON public.pt_locations
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admins manage pt_locations" ON public.pt_locations
  FOR ALL TO authenticated
  USING (public.is_superadmin(auth.uid()) OR public.is_any_admin(auth.uid()))
  WITH CHECK (public.is_superadmin(auth.uid()) OR public.is_any_admin(auth.uid()));
CREATE POLICY "Supervisors update own pt_locations" ON public.pt_locations
  FOR UPDATE TO authenticated
  USING (assigned_supervisor_id = auth.uid())
  WITH CHECK (assigned_supervisor_id = auth.uid());

CREATE INDEX idx_pt_locations_inventory ON public.pt_locations(inventory_id);
CREATE INDEX idx_pt_locations_referencia ON public.pt_locations(inventory_id, referencia);
CREATE INDEX idx_pt_locations_piso ON public.pt_locations(inventory_id, piso);
CREATE INDEX idx_pt_locations_supervisor ON public.pt_locations(assigned_supervisor_id);

-- ============ PT FLOOR ASSIGNMENTS ============
CREATE TABLE public.pt_floor_assignments (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  inventory_id uuid NOT NULL DEFAULT public.get_active_inventory() REFERENCES public.inventories(id) ON DELETE CASCADE,
  piso text NOT NULL,
  supervisor_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT pt_floor_assignments_unique UNIQUE (inventory_id, piso)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.pt_floor_assignments TO authenticated;
GRANT ALL ON public.pt_floor_assignments TO service_role;

ALTER TABLE public.pt_floor_assignments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can read pt_floor_assignments" ON public.pt_floor_assignments
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admins manage pt_floor_assignments" ON public.pt_floor_assignments
  FOR ALL TO authenticated
  USING (public.is_superadmin(auth.uid()) OR public.is_any_admin(auth.uid()))
  WITH CHECK (public.is_superadmin(auth.uid()) OR public.is_any_admin(auth.uid()));

CREATE INDEX idx_pt_floor_assignments_inventory ON public.pt_floor_assignments(inventory_id);

-- ============ PT COUNTS ============
CREATE TABLE public.pt_counts (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  inventory_id uuid NOT NULL DEFAULT public.get_active_inventory() REFERENCES public.inventories(id) ON DELETE CASCADE,
  location_id uuid NOT NULL REFERENCES public.pt_locations(id) ON DELETE CASCADE,
  audit_round integer NOT NULL DEFAULT 1,
  quantity_counted numeric NOT NULL,
  supervisor_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT pt_counts_unique UNIQUE (location_id, audit_round)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.pt_counts TO authenticated;
GRANT ALL ON public.pt_counts TO service_role;

ALTER TABLE public.pt_counts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can read pt_counts" ON public.pt_counts
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admins manage pt_counts" ON public.pt_counts
  FOR ALL TO authenticated
  USING (public.is_superadmin(auth.uid()) OR public.is_any_admin(auth.uid()))
  WITH CHECK (public.is_superadmin(auth.uid()) OR public.is_any_admin(auth.uid()));
CREATE POLICY "Supervisors manage own pt_counts" ON public.pt_counts
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.pt_locations l WHERE l.id = pt_counts.location_id AND l.assigned_supervisor_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM public.pt_locations l WHERE l.id = pt_counts.location_id AND l.assigned_supervisor_id = auth.uid()));

CREATE INDEX idx_pt_counts_inventory ON public.pt_counts(inventory_id);
CREATE INDEX idx_pt_counts_location ON public.pt_counts(location_id);

-- ============ PT VALIDATED COUNTS ============
CREATE TABLE public.pt_validated_counts (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  inventory_id uuid NOT NULL REFERENCES public.inventories(id) ON DELETE CASCADE,
  referencia text NOT NULL,
  location_id uuid NOT NULL REFERENCES public.pt_locations(id) ON DELETE CASCADE,
  validated_quantity numeric NOT NULL DEFAULT 0,
  audit_round integer NOT NULL,
  reason text NOT NULL,
  validated_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT pt_validated_counts_unique UNIQUE (inventory_id, location_id)
);

GRANT SELECT ON public.pt_validated_counts TO authenticated;
GRANT ALL ON public.pt_validated_counts TO service_role;

ALTER TABLE public.pt_validated_counts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can read pt_validated_counts" ON public.pt_validated_counts
  FOR SELECT TO authenticated USING (true);

CREATE INDEX idx_pt_validated_counts_inventory ON public.pt_validated_counts(inventory_id);
CREATE INDEX idx_pt_validated_counts_ref ON public.pt_validated_counts(inventory_id, referencia);

-- ============ TRIGGERS ============
CREATE TRIGGER update_pt_master_updated_at BEFORE UPDATE ON public.pt_master
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_pt_locations_updated_at BEFORE UPDATE ON public.pt_locations
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_pt_floor_assignments_updated_at BEFORE UPDATE ON public.pt_floor_assignments
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_pt_counts_updated_at BEFORE UPDATE ON public.pt_counts
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_pt_validated_counts_updated_at BEFORE UPDATE ON public.pt_validated_counts
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER block_closed_inventory_pt_master BEFORE INSERT OR UPDATE OR DELETE ON public.pt_master
  FOR EACH ROW EXECUTE FUNCTION public.block_closed_inventory();
CREATE TRIGGER block_closed_inventory_pt_locations BEFORE INSERT OR UPDATE OR DELETE ON public.pt_locations
  FOR EACH ROW EXECUTE FUNCTION public.block_closed_inventory();
CREATE TRIGGER block_closed_inventory_pt_floor_assignments BEFORE INSERT OR UPDATE OR DELETE ON public.pt_floor_assignments
  FOR EACH ROW EXECUTE FUNCTION public.block_closed_inventory();
CREATE TRIGGER block_closed_inventory_pt_counts BEFORE INSERT OR UPDATE OR DELETE ON public.pt_counts
  FOR EACH ROW EXECUTE FUNCTION public.block_closed_inventory();
CREATE TRIGGER block_closed_inventory_pt_validated_counts BEFORE INSERT OR UPDATE OR DELETE ON public.pt_validated_counts
  FOR EACH ROW EXECUTE FUNCTION public.block_closed_inventory();