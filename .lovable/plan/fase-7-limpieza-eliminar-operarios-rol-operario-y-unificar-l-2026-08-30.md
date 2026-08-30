# Fase 7 — Limpieza: eliminar operarios, rol `operario` y unificar layouts

El sistema llega hasta ubicaciones y responsables (supervisores). Los operarios salen del software.

## Estado actual verificado

- La tabla `operarios` está **vacía** (0 filas) y **ninguna otra tabla la referencia** (sin llaves foráneas).
- **Ningún usuario tiene el rol `operario`** (0 de 14 asignaciones de rol).
- **Ninguna política de acceso** en la base de datos menciona `operario`.
- `user_roles.role` tiene como valor por defecto `'operario'`, aunque el registro de usuarios ya no asigna rol automáticamente.
- El selector de roles en Gestión de Usuarios ya solo ofrece: Sin Rol, Supervisor, Admin MP, Admin PP, Superadmin.
- El flujo de conteo ya **no usa** operarios ni turnos: solo quedan la página de gestión, su importador y el parser.

## 1. Eliminar la gestión de operarios (UI)

Se borran:

- Página `Gestión de Operarios` y su ruta `/superadmin/operarios`.
- Componentes de gestión e importación de operarios y su parser/plantilla Excel.
- Tarjeta de acción "Gestionar Operarios" del dashboard.
- Estadística "Operarios Activos" del dashboard (queda el resto de indicadores).

## 2. Eliminar el rol `operario`

Migración de base de datos:

- Reasignar cualquier usuario con rol `operario` a "sin rol" (hoy no hay ninguno; la sentencia queda por seguridad).
- Quitar el valor por defecto `operario` de la tabla de roles (pasa a exigir rol explícito).
- Recrear el tipo de roles sin `operario`, dejando: `superadmin`, `admin`, `admin_mp`, `admin_pp`, `supervisor`, actualizando las funciones y políticas que usan el tipo.
- Eliminar la tabla `operarios` (vacía y sin dependencias) junto con sus políticas.

En código: quitar la rama que excluía `operario` en el contexto de autenticación (ya no existe ese rol) y los comentarios asociados.

## 3. Unificar layouts

Hoy usan `AppLayout`: Gestión Operativa, Conteo, Críticos, Auditoría Almacén, Auditoría Planta, Importar Maestra, Usuarios.

Se migran a `AppLayout` (mismo encabezado, botón volver y contenedor):

- Gestión de Ubicación
- Gestión de Responsables
- Exportar Conteos
- Inventario MP
- Inventario PP

Quedan fuera a propósito, porque no son vistas de contenido: Login, Dashboard, Pendiente de Aprobación y Página no encontrada.

## Notas técnicas

- Migración SQL: `UPDATE`/`DELETE` sobre `user_roles`, `ALTER TABLE public.user_roles ALTER COLUMN role DROP DEFAULT`, recreación del enum `app_role` con `ALTER TYPE ... RENAME` + nuevo tipo + `ALTER TABLE ... USING`, recreación de funciones `has_role`, `get_user_role`, `is_any_admin`, `is_superadmin` y de las políticas que dependen del tipo, y `DROP TABLE public.operarios`.
- Archivos a eliminar: `src/pages/superadmin/Operarios.tsx`, `src/components/shared/OperariosManagement.tsx`, `src/components/shared/OperariosImport.tsx`, `src/lib/operariosParser.ts`.
- Archivos a editar: `src/App.tsx`, `src/pages/UnifiedDashboard.tsx`, `src/contexts/AuthContext.tsx`, y las 5 páginas que se migran a `AppLayout`.
- Verificación final: typecheck + build, revisión del linter de seguridad tras la migración, y confirmar que el dashboard y las rutas siguen funcionando por rol.
