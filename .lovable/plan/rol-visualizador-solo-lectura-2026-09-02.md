# Rol Visualizador (solo lectura)

Nuevo rol para usuarios que necesitan consultar resultados sin poder modificar nada.

## Qué podrá hacer

- Iniciar sesión y ver un panel con 4 accesos: Dashboard de Auditoría, Auditoría Almacén, Auditoría Planta y Auditoría PT.
- Elegir cualquier inventario (activo o histórico) desde el selector.
- Buscar, filtrar, ordenar, expandir ubicaciones/pisos y exportar a Excel.

## Qué NO podrá hacer

- No verá la columna "Acción" ni los botones de validar / forzar cierre / historial de edición.
- Las celdas de conteo se muestran como texto, no editables.
- No accede a maestras, ubicaciones, responsables, gestión operativa, usuarios ni importaciones (si escribe la URL, se redirige al panel).
- A nivel de base de datos no podrá insertar, actualizar ni borrar en ninguna tabla del inventario.

## Cambios técnicos

**Base de datos (migración)**
- Añadir `visualizador` al enum `app_role`.
- Agregar función auxiliar `is_viewer(_user_id)` (security definer) y políticas de solo lectura para el rol en: `inventories`, `inventory_master`, `locations`, `inventory_counts`, `validated_counts`, `pt_master`, `pt_locations`, `pt_counts`, `pt_validated_counts`, `pt_floor_assignments`, `profiles`, `task_statuses`.
- No se añade ninguna política de escritura para este rol; las existentes siguen limitadas a superadmin/admins/supervisores.

**Frontend**
- `AuthContext`: agregar `'visualizador'` al tipo `AppRole`.
- `UserManagement`: nueva opción "Visualizador" en el selector de rol, con su badge/color.
- `AppLayout`: configuración de rol (etiqueta "Visualizador", icono de ojo).
- `App.tsx`: incluir `visualizador` en `allowedRoles` de las 4 rutas de auditoría; el resto queda sin acceso.
- `UnifiedDashboard`: rama de tarjetas propia para el rol, solo con las 4 tarjetas de auditoría; sin estadísticas de gestión.
- `InventorySelector`: permitir selección de inventarios también para `visualizador` (siempre en modo lectura).
- Nuevo indicador de solo lectura reutilizando `ReadOnlyBanner` para que se muestre también cuando el rol es visualizador.
- `AuditoriaBodegaTable` y `AuditoriaPtTable`: derivar un flag `canEdit = !isReadOnly && role !== 'visualizador'`; cuando es falso, ocultar la columna "Acción" (encabezado y celdas) y renderizar los valores de conteo como texto en vez de `EditableCell`. La exportación y los filtros no cambian.
- `AuditoriaKpiPanel` / `AuditoriaPtKpiPanel` / `DashboardAuditoria`: sin cambios funcionales, ya son de lectura.

## Cómo se crea un visualizador

Desde Panel Superadmin > Gestión de Usuarios, se asigna el rol "Visualizador" a un usuario ya registrado.
