# Unificar visualmente ubicaciones por Bodega + Punto de referencia

## Objetivo
En las auditorías (Planta y Almacén), una referencia que tiene varias ubicaciones en la **misma bodega y mismo punto de referencia** (ej. BN42-CMB.v2, BNTOTA) se mostrará como **una sola ubicación**. Los datos guardados no se borran ni se modifican: es solo cómo se ve.

## Reglas
- **Misma bodega + mismo punto:** se agrupan en una sola línea "Bodega 1 · V".
  - Conteos C1–C4: se muestra la **suma** de las ubicaciones agrupadas por ronda.
  - Estado de cada conteo: "contado" solo si todas las ubicaciones del grupo tienen ese conteo; si falta alguna, se marca pendiente.
  - Validado: suma de lo validado del grupo.
- **Misma bodega + distintos puntos:** se agrupan bajo el punto de la ubicación **registrada primero** (fecha de creación más antigua). Esto ya se aplicó en los datos en el cambio anterior; la vista también lo respetará por si aparecen nuevos casos.
- El contador "En N ubicaciones" mostrará la cantidad de grupos (ej. 4 → 2).
- Al abrir el detalle del grupo, se podrá desplegar para ver las ubicaciones originales que lo componen (para edición del superadmin, que sigue siendo por ubicación real).
- El filtro de ubicaciones sigue mostrando un solo "Bodega 1", "Bodega 3", etc.

## Alcance
- Auditoría Planta y Auditoría Almacén (listado, ventana de ubicaciones y totales).
- Exportación por referencia: no cambia (ya suma por referencia).
- No se modifica la base de datos ni la lógica de validación (que ya suma por bodega).

## Detalles técnicos
- Nueva utilidad `groupLocationsByBodegaPunto(locations, counts)` en `src/lib/` que agrupa por clave `normalize(location_name) + normalize(punto_referencia)`, ordenando por `created_at` para elegir el punto canónico cuando difieren en la misma bodega.
- Usarla en `AuditoriaBodegaTable.tsx` donde se construye el popover/lista de ubicaciones y el conteo "En N ubicaciones".
- Edición y reapertura siguen operando sobre los `location_id` reales del grupo expandido.
- Prueba unitaria: dos ubicaciones Bodega 1·V con C1=10 y C1=5 → un grupo con C1=15; Bodega 1·V (primera) y Bodega 1·T (después) → un grupo con punto V.
