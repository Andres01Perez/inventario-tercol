-- =============================================
-- PASO 1: FUNCIÓN HELPER PARA UPDATED_AT
-- =============================================
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

-- =============================================
-- PASO 2: ENUM Y TABLAS BASE
-- =============================================

-- Crear ENUM para tipo de material
CREATE TYPE public.material_type AS ENUM ('MP', 'PP');

-- Tabla de Operarios (Catálogo simple)
CREATE TABLE public.operarios (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  full_name TEXT NOT NULL,
  document_id TEXT,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
ALTER TABLE public.operarios ENABLE ROW LEVEL SECURITY;

-- Tabla de Estados
CREATE TABLE public.task_statuses (
  slug TEXT PRIMARY KEY, 
  label TEXT NOT NULL,
  is_final BOOLEAN DEFAULT false
);
ALTER TABLE public.task_statuses ENABLE ROW LEVEL SECURITY;

-- Insertar estados iniciales
INSERT INTO public.task_statuses (slug, label, is_final) VALUES 
  ('pendiente', 'Pendiente', false),
  ('en_progreso', 'En Progreso', false),
  ('conflicto', 'Conflicto / Diferencia', false),
  ('auditado', 'Auditado OK', true),
  ('cerrado_forzado', 'Cerrado por Ronda 5', true);

-- Maestra de Inventario
CREATE TABLE public.inventory_master (
  reference TEXT PRIMARY KEY,
  material_type public.material_type NOT NULL,
  description TEXT,
  erp_alm NUMERIC DEFAULT 0,
  erp_pld NUMERIC DEFAULT 0,
  erp_plr NUMERIC DEFAULT 0,
  erp_za NUMERIC DEFAULT 0,
  erp_target_qty NUMERIC GENERATED ALWAYS AS (
    COALESCE(erp_alm, 0) + COALESCE(erp_pld, 0) + 
    COALESCE(erp_plr, 0) + COALESCE(erp_za, 0)
  ) STORED,
  status_slug TEXT REFERENCES public.task_statuses(slug) DEFAULT 'pendiente',
  assigned_admin_id UUID REFERENCES auth.users(id),
  audit_round INT DEFAULT 1 CHECK (audit_round >= 1 AND audit_round <= 5),
  count_history JSONB DEFAULT '[]'::jsonb,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
ALTER TABLE public.inventory_master ENABLE ROW LEVEL SECURITY;

-- Tareas de Conteo
CREATE TABLE public.count_tasks (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  master_reference TEXT NOT NULL REFERENCES public.inventory_master(reference) 
    ON DELETE CASCADE ON UPDATE CASCADE,
  location_name TEXT NOT NULL,
  location_detail TEXT,
  assigned_supervisor_id UUID REFERENCES auth.users(id),
  operario_id UUID REFERENCES public.operarios(id),
  responsible_name TEXT,
  quantity_counted NUMERIC DEFAULT 0,
  is_completed BOOLEAN DEFAULT false,
  audit_round INT NOT NULL DEFAULT 1,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
ALTER TABLE public.count_tasks ENABLE ROW LEVEL SECURITY;

-- Logs de Auditoría
CREATE TABLE public.audit_logs (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  master_reference TEXT REFERENCES public.inventory_master(reference),
  task_id UUID REFERENCES public.count_tasks(id) ON DELETE SET NULL,
  user_id UUID REFERENCES auth.users(id),
  action_type TEXT NOT NULL,
  round_number INT,
  previous_data JSONB,
  new_data JSONB,
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;

-- =============================================
-- PASO 3: ÍNDICES
-- =============================================
CREATE INDEX idx_count_tasks_reference ON public.count_tasks(master_reference);
CREATE INDEX idx_count_tasks_supervisor ON public.count_tasks(assigned_supervisor_id);
CREATE INDEX idx_count_tasks_round ON public.count_tasks(master_reference, audit_round);
CREATE INDEX idx_inventory_status ON public.inventory_master(status_slug);
CREATE INDEX idx_inventory_type ON public.inventory_master(material_type);
CREATE INDEX idx_audit_logs_reference ON public.audit_logs(master_reference);
CREATE INDEX idx_audit_logs_user ON public.audit_logs(user_id);

-- =============================================
-- PASO 4: TRIGGERS
-- =============================================
CREATE TRIGGER update_inventory_master_updated_at
  BEFORE UPDATE ON public.inventory_master
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_count_tasks_updated_at
  BEFORE UPDATE ON public.count_tasks
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();