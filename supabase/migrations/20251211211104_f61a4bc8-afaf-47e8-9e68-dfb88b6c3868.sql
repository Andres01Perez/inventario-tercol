-- Paso 1: Solo agregar nuevos valores al ENUM
ALTER TYPE app_role ADD VALUE IF NOT EXISTS 'admin_mp' BEFORE 'supervisor';
ALTER TYPE app_role ADD VALUE IF NOT EXISTS 'admin_pp' BEFORE 'supervisor';