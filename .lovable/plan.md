# Columna y filtro de Bodega en Gestión de Responsables

## Contexto

La bodega de una ubicación se deduce de su admin dueño (`locations.assigned_admin_id`):
`admin_mp` → **Almacén**, `admin_pp` → **Planta**. Hoy `GestionResponsables.tsx` ya consulta
`assigned_admin_id` pero no lo muestra ni permite filtrar por él, así que un superadmin no puede
ver de un vistazo qué ubicaciones son de almacén y cuáles de planta al asignar supervisores.

No hay migración de base de datos: todo es frontend.

## Cambios en `src/pages/admin/GestionResponsables.tsx`

### 1. Resolver la bodega por ubicación

- Extender el query `admin-bodega-map` existente: en lugar de guardar solo un admin por rol,
  construir un `Map<user_id, 'almacen' | 'planta'>` con **todos** los usuarios con rol
  `admin_mp` / `admin_pp` (por si hay más de uno).
- Cada fila de tipo `location` gana el campo `bodega: 'almacen' | 'planta' | null`:
  - `almacen` si su `assigned_admin_id` tiene rol `admin_mp`
  - `planta` si tiene rol `admin_pp`
  - `null` ("Sin bodega") si no tiene admin asignado o el admin no tiene ninguno de esos roles
- Las filas sintéticas `no-location` (referencias sin ubicación) muestran bodega **—** (aún no
  existe la ubicación; la bodega se define al crearla).

### 2. Nueva columna "Bodega" en la tabla

- Badge `Almacén` (naranja) / `Planta` (esmeralda) / `Sin bodega` (gris, con tooltip
  explicando que falta asignar el admin de la ubicación).
- Solo visible para superadmin (admin_mp/admin_pp ya ven solo su propia bodega por el filtro
  de rol existente).

### 3. Nuevo filtro "Bodega"

- Select junto a los filtros existentes, solo para superadmin, con opciones:
  - Todas (por defecto)
  - Almacén
  - Planta
  - Sin bodega
- Implementación: como la bodega depende de qué usuarios son admin_mp/admin_pp, el filtro se
  aplica **en servidor** pasando la lista de user_ids de ese rol:
  - `Almacén` → `locations.assigned_admin_id in (ids admin_mp)`
  - `Planta` → `locations.assigned_admin_id in (ids admin_pp)`
  - `Sin bodega` → `assigned_admin_id` nulo o no en ninguna de las dos listas
- Filtrar por bodega fuerza el join `locations!inner` (igual que los demás filtros de ubicación),
  por lo que las filas `no-location` se ocultan cuando hay filtro de bodega activo.
- El filtro se suma a `hasActiveFilters`, `clearFilters`, al `useEffect` que limpia la selección
  y al `queryKey` de la consulta.

## Sin cambios

- No se toca la base de datos, RLS ni el RPC.
- La lógica de asignación de supervisores (individual y masiva) queda igual; esto solo mejora
  la visibilidad para asignar supervisores de almacén a ubicaciones de almacén y los de planta
  a las de planta.
- Gestión de Ubicaciones no cambia (ya muestra el admin dueño implícitamente por rol).

## Verificación

- Typecheck y build.
- Como superadmin: la columna muestra Almacén/Planta correctamente cruzando con Gestión de
  Usuarios, y el filtro "Almacén" deja solo ubicaciones cuyo admin es admin_mp (y viceversa).
