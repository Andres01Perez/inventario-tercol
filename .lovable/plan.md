
## Problema 1 — La importación borra la otra familia

En `src/components/superadmin/MasterDataImport.tsx`, `executeImport()` siempre ejecuta:

1. `DELETE FROM locations WHERE id != …` (borra TODAS las ubicaciones)
2. `DELETE FROM inventory_master WHERE referencia != ''` (borra TODAS las referencias)
3. Inserta solo lo que viene en `combinedData`.

Cuando el usuario sube solo MP (o solo PP), `combinedData` contiene una sola familia, pero el paso 1 y 2 arrasan con la otra. Por eso al importar MP se borra PP y viceversa.

### Solución

Detectar qué familias están presentes en `combinedData` y borrar solo esas:

- Calcular `typesInImport = new Set(combinedData.map(r => r.material_type))`.
- Reemplazar los dos DELETE globales por DELETE filtrados:
  - `inventory_master`: `.delete().in('material_type', [...typesInImport])`
  - `locations`: borrar solo las ubicaciones cuya `master_reference` pertenezca a `inventory_master` con esos `material_type`. Como no hay columna directa, se hace en dos pasos:
    1. `select referencia from inventory_master where material_type in (...)`
    2. `locations.delete().in('master_reference', esasRefs)` (por lotes de ~500 para evitar URLs enormes).
- Si ambos archivos están presentes, el comportamiento actual (wipe total) se mantiene naturalmente porque `typesInImport` = ['MP','PP'].
- Actualizar el diálogo de confirmación (`checkActiveInventory` / mensaje "BORRAR") para que indique claramente qué familia(s) se van a reemplazar, no "todo el inventario".

## Problema 2 — Esqueleto para familia PT (Producto Terminado)

Solo esqueleto; las columnas/reglas específicas llegan en el siguiente mensaje del usuario.

### Cambios de base de datos (migración)

- Ampliar el enum `material_type` para incluir `'PT'`:
  ```sql
  ALTER TYPE public.material_type ADD VALUE IF NOT EXISTS 'PT';
  ```
- No se añaden columnas nuevas todavía (esperar directrices). Las columnas específicas de PT se agregarán en otra migración cuando el usuario las defina.

### Cambios de código (esqueleto, sin lógica de columnas todavía)

1. `src/lib/masterDataParser.ts`
   - `MaterialType` → `'MP' | 'PP' | 'PT'`.
   - Añadir `PT_COLUMN_MAP` vacío (placeholder con solo `referencia`) y `REQUIRED_COLUMNS_PT = ['referencia']`.
   - Extender `parseExcelFile` para aceptar `type: 'PT'` (usa el mapeo PT).
   - Extender `validateCombinedData` a tres arrays (MP, PP, PT) — o dejar la firma actual y crear un helper que valide duplicados en las tres listas y entre pares. Se ajustará cuando lleguen las columnas reales.

2. `src/components/superadmin/MasterDataImport.tsx`
   - Añadir tercer `FileUploadZone` con `type="PT"` (nuevo ícono/color, p. ej. ámbar).
   - Estado `ptFile`, `ptResult`, y handler `handlePtFileSelect` análogo a MP/PP.
   - `combinedData` ahora concatena las tres listas.
   - El grid pasa de `md:grid-cols-2` a `md:grid-cols-3`.
   - Incluir PT en el cálculo de `typesInImport` del fix del Problema 1.

3. `FileUploadZone`: aceptar `type: MaterialType` genérico; agregar caso PT (título "Producto Terminado (PT)", color e ícono nuevos — p. ej. `Boxes` de lucide).

No se toca aún la exportación ni otras vistas (auditoría, conteos, etc.) hasta que el usuario dé las reglas de PT.

## Verificación

- Subir solo MP con PP existente: PP se conserva, MP se reemplaza.
- Subir solo PP con MP existente: MP se conserva.
- Subir MP + PP: se reemplazan ambos (comportamiento anterior).
- La zona PT aparece en la UI, permite seleccionar archivo y muestra "0 referencias cargadas" o el conteo de filas con `referencia`, sin romper la importación de MP/PP.
