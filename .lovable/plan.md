# Plan: Rediseñar la carga de maestra cuando ya hay inventario abierto

## Contexto
En `/superadmin/importar` actualmente se muestran tres zonas de arrastrar-archivo grandes (`FileUploadZone`) para MP, PP y PT, incluso cuando ya existe un inventario abierto con maestras cargadas. Esto confunde al usuario porque parece que no hay nada importado.

## Objetivo
Cuando haya un inventario abierto, reemplazar las tres zonas de drag-and-drop por tres botones compactos de acción "Reemplazar MP / PP / PT". El flujo de arrastrar-archivo sigue existiendo, pero se activa solo después de hacer clic en el botón correspondiente, o bien se mantiene oculto hasta que se elija una familia.

## Cambios propuestos

1. **Detectar si hay inventario abierto**
   - Usar `inventoryId` y `inventory` de `useInventory`.
   - Considerar "hay inventario abierto" cuando `inventoryId` existe y `inventory.status === 'abierto'` y `!isReadOnly`.

2. **Nuevo estado para modo de selección de familia**
   - Agregar `selectedFamily: 'MP' | 'PP' | 'PT' | null`.
   - Inicialmente `null` cuando hay inventario abierto.

3. **Nueva UI condicional en `MasterDataImport.tsx`**
   - Si **no** hay inventario abierto (o está en modo "Crear un inventario nuevo"), mantener las tres zonas de drag-and-drop actuales.
   - Si hay inventario abierto y modo es "Cargar sobre el inventario abierto", mostrar:
     - Tres tarjetas/botones alineados (una por familia) con el icono correspondiente, el conteo actual de referencias de esa familia en el inventario activo, y el texto "Reemplazar MP", "Reemplazar PP", "Reemplazar PT".
     - Al hacer clic en una, revelar la zona de drag-and-drop solo para esa familia (o abrir el selector de archivo directamente).
     - Permitir cambiar de familia o cancelar la selección.

4. **Mostrar conteo actual por familia**
   - Consultar o reutilizar los conteos de `inventory_master` filtrados por `inventory_id` y `material_type`.
   - Mostrar "X referencias cargadas" en cada botón para dejar claro que ya hay datos.

5. **Ajustar textos del modo "replace"**
   - En el `RadioGroup`, cambiar "Cargar sobre el inventario abierto" a "Reemplazar familias del inventario abierto".
   - Actualizar subtítulo de la página de "Importar Maestra" a algo como "Reemplaza familias de maestra en el inventario activo o crea un inventario nuevo".

6. **Preservar funcionalidad existente**
   - El parseo, la validación combinada, la vista previa, el progreso, la confirmación destructiva con "BORRAR" y la importación final deben seguir funcionando igual.
   - El modo "Crear un inventario nuevo" sigue mostrando las tres zonas de drag-and-drop porque parte de cero.

## Archivos a modificar
- `src/components/superadmin/MasterDataImport.tsx` (único archivo).

## Verificación
- Abrir `/superadmin/importar` con un inventario abierto que ya tenga maestras.
- Confirmar que aparecen tres botones con el conteo actual y la opción "Reemplazar".
- Hacer clic en "Reemplazar MP", arrastrar un archivo, verificar que se muestra la vista previa y que el botón de importación dice "Reemplazar X referencias".
- Cambiar a modo "Crear un inventario nuevo" y confirmar que vuelven a aparecer las tres zonas de drag-and-drop.
