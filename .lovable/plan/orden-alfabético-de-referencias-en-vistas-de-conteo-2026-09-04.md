# Orden alfabético de referencias en vistas de conteo

## Objetivo
Mostrar las referencias dentro de cada grupo de conteo ordenadas alfabéticamente de A a Z, para facilitar la búsqueda manual en cada ubicación.

## Cambios

### 1. Almacén / Planta (`GroupedTranscriptionTab.tsx`)
- En la agrupación `filteredGroupedByZone`, después de agrupar las ubicaciones por `punto_referencia`, ordenar el arreglo `locations` de cada grupo por `master_reference` ascendente (locale `es`, sensible a números).
- Mantener el orden de zonas actual: alfabético, con "Sin Zona Asignada" al final.

### 2. Producto Terminado (`PtTranscriptionTab.tsx`)
- En el `useMemo` de `grouped`, después de agrupar las ubicaciones por `piso`, ordenar el arreglo de cada piso por `referencia` ascendente (locale `es`, sensible a números).
- Mantener el orden de pisos actual.

## Criterios de aceptación
- Las referencias dentro de cada zona (Almacén/Planta) y dentro de cada piso (PT) aparecen de la A a la Z.
- El orden no se pierde al usar el buscador.
- No se modifica la lógica de conteos, validaciones ni guardados.
- Typecheck sin errores.
