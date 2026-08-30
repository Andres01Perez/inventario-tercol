# Ajuste plantilla e importador de ubicaciones (Fase 5.1)

## Contexto

Con la Fase 3, la bodega de una ubicación se determina por su admin dueño:
`admin_mp` → Almacén, `admin_pp` → Planta. Hoy `LocationsImport` asigna todas las
ubicaciones al usuario que importa el archivo, por lo que un superadmin que importe
dejaría las ubicaciones sin bodega válida y `validate_bucket` las rechazaría.

## Decisión del usuario

- Nueva columna **Bodega** en la plantilla, con valores `Almacén` o `Planta`.
- Si la columna está vacía o tiene un valor no válido → la fila se **rechaza con error**.

## Cambios

### 1. `src/lib/locationsParser.ts`

- `ParsedLocation` gana el campo `bodega: 'almacen' | 'planta'`.
- Aliases aceptados para la columna (normalizados, sin acentos, case-insensitive):
  `bodega`, `almacen/planta`.
- Valores aceptados: `almacen`, `almacén` → almacén; `planta` → planta.
- Fila sin bodega o con valor inválido → error `Fila N: Bodega vacía o inválida (use "Almacén" o "Planta")` y la fila no se incluye.
- `generateLocationsTemplate()` se actualiza:
  - Nueva columna `Bodega*` con ejemplos (`Almacén`, `Planta`).

Plantilla resultante:

| Referencia* | Bodega* | Subcategoría | Observaciones | Ubicación | Ubicación Detallada | Punto Referencia | Método Conteo |
|---|---|---|---|---|---|---|---|
| REF-001 | Almacén | Tornillos | Zona A | ESTANTE-1 | Nivel 3 | Puerta principal | Manual |
| REF-001 | Planta | Tornillos | Zona B | ESTANTE-2 | Nivel 1 | Pasillo 2 | Conteo rápido |

### 2. `src/components/shared/LocationsImport.tsx`

- Antes de importar, resolver los admins de cada bodega:
  - Consultar `user_roles` filtrando `role in ('admin_mp','admin_pp')` y cruzar con `profiles` para mostrar nombres.
  - `Almacén` → primer usuario con rol `admin_mp`; `Planta` → primer usuario con rol `admin_pp`.
  - Si no existe admin configurado para una bodega presente en el archivo → error claro antes de importar: "No hay un Admin Almacén/Planta configurado. Asígnalo desde Gestión de Usuarios."
- Insertar con `assigned_admin_id` según la bodega de cada fila (no `profile.id`).
- Actualizar el bloque "Columnas esperadas" para incluir `Bodega*` y explicar los valores válidos.
- En el preview mostrar también la columna Bodega.

### 3. Compatibilidad

- Archivos viejos sin columna Bodega: fallarán con el error por fila explicando qué falta → mensaje visible en el importador. No se intenta importación parcial silenciosa.

## Sin cambios

- No hay migración de base de datos (la clasificación sigue siendo dinámica por `assigned_admin_id`).
- La creación manual de ubicaciones (Fase 5) ya pide el admin explícitamente; no cambia.

## Verificación

- Typecheck + build.
- Importar la plantilla de ejemplo descargada debe crear ubicaciones con el admin correcto por bodega.
