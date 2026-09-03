# Filtro de Descuadre (und) en Auditoría PT

## Objetivo
Agregar en `AuditoriaPtTable.tsx` un filtro que permita mostrar las referencias según su descuadre en unidades (físico validado − ERP).

## Cambios

### 1. Nuevo filtro "Descuadre"
- Nuevo `Select` junto a los filtros de Estado y Piso, con las opciones:
  - **Todos** (por defecto)
  - **Con descuadre** (descuadre ≠ 0)
  - **Sin descuadre** (descuadre = 0, con validación)
  - **Solo faltantes** (descuadre < 0, rojo)
  - **Solo sobrantes** (descuadre > 0, verde)
  - **Sin validar** (aún no tienen cantidad validada consolidada)

### 2. Lógica de filtrado
- El descuadre se calcula en memoria (`totalValidado - erp`), así que el filtro se aplica en el `useMemo` de `groupedData`, igual que el filtro "Varios pisos".
- Condiciones:
  - `sin_validar`: `rows` sin ninguna `validatedQuantity`
  - `sin_descuadre`: tiene validación y `descuadre === 0`
  - `faltantes` / `sobrantes`: tiene validación y `descuadre < 0` / `> 0`
  - `con_descuadre`: tiene validación y `descuadre !== 0`

### 3. Detalles
- El contador de la barra de estado ("N referencias") refleja el resultado filtrado.
- Se mantiene compatible con los demás filtros (búsqueda, estado, piso, varios pisos).
- Rol visualizador: solo lectura, también puede usar el filtro (no hay columna Acción para ese rol, sin cambios ahí).

## Archivos
- `src/components/superadmin/AuditoriaPtTable.tsx` (único archivo modificado)

## Verificación
- Typecheck sin errores.
- Revisión visual en el preview: aplicar cada opción del filtro y confirmar que las filas mostradas coinciden con el valor de la columna Desc. (und).
