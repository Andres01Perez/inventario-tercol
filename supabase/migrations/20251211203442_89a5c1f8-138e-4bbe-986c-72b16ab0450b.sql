-- ============================================
-- MIGRACIÓN: Expandir inventory_master con todas las columnas de MP y PP
-- ============================================

-- Paso 1: Eliminar la columna generada antes de hacer cambios
ALTER TABLE public.inventory_master DROP COLUMN IF EXISTS erp_target_qty;

-- Paso 2: Renombrar columna reference a referencia
ALTER TABLE public.inventory_master RENAME COLUMN reference TO referencia;

-- Paso 3: Renombrar columnas ERP existentes
ALTER TABLE public.inventory_master RENAME COLUMN erp_pld TO cant_pld;
ALTER TABLE public.inventory_master RENAME COLUMN erp_plr TO cant_plr;
ALTER TABLE public.inventory_master RENAME COLUMN erp_za TO cant_za;

-- Paso 4: Eliminar erp_alm (se reemplaza con columnas específicas por tipo)
ALTER TABLE public.inventory_master DROP COLUMN IF EXISTS erp_alm;

-- Paso 5: Agregar columnas COMPARTIDAS
ALTER TABLE public.inventory_master ADD COLUMN control TEXT NULL;
ALTER TABLE public.inventory_master ADD COLUMN costo_t NUMERIC NULL DEFAULT 0;

-- Paso 6: Agregar columnas SOLO MP (serán NULL para PP)
ALTER TABLE public.inventory_master ADD COLUMN costo_u_mp NUMERIC NULL;
ALTER TABLE public.inventory_master ADD COLUMN cant_alm_mp NUMERIC NULL;
ALTER TABLE public.inventory_master ADD COLUMN cant_prov_d NUMERIC NULL;
ALTER TABLE public.inventory_master ADD COLUMN cant_prov_r NUMERIC NULL;
ALTER TABLE public.inventory_master ADD COLUMN cant_t_mp NUMERIC NULL;

-- Paso 7: Agregar columnas SOLO PP (serán NULL para MP)
ALTER TABLE public.inventory_master ADD COLUMN mp_costo NUMERIC NULL;
ALTER TABLE public.inventory_master ADD COLUMN mo_costo NUMERIC NULL;
ALTER TABLE public.inventory_master ADD COLUMN servicio NUMERIC NULL;
ALTER TABLE public.inventory_master ADD COLUMN costo_u_pp NUMERIC NULL;
ALTER TABLE public.inventory_master ADD COLUMN cant_alm_pp NUMERIC NULL;
ALTER TABLE public.inventory_master ADD COLUMN cant_prov_pp NUMERIC NULL;
ALTER TABLE public.inventory_master ADD COLUMN cant_total_pp NUMERIC NULL;

-- Paso 8: Recrear la columna generada con lógica por tipo de material
ALTER TABLE public.inventory_master ADD COLUMN cant_total_erp NUMERIC GENERATED ALWAYS AS (
  CASE 
    WHEN material_type = 'MP' THEN 
      COALESCE(cant_alm_mp, 0) + COALESCE(cant_pld, 0) + COALESCE(cant_plr, 0) + COALESCE(cant_za, 0)
    WHEN material_type = 'PP' THEN 
      COALESCE(cant_alm_pp, 0) + COALESCE(cant_pld, 0) + COALESCE(cant_plr, 0) + COALESCE(cant_za, 0)
    ELSE 0
  END
) STORED;

-- Paso 9: Recrear índice con el nuevo nombre de columna
DROP INDEX IF EXISTS idx_inventory_status;
CREATE INDEX idx_inventory_status ON public.inventory_master (status_slug);

-- Paso 10: Actualizar constraint de primary key (si es necesario)
-- La PK ya está en 'reference', necesitamos actualizarla a 'referencia'
-- Esto se hace automáticamente con RENAME COLUMN