# Exportar conteos: nueva pestaña "Planta"

## Qué se agrega

Una tercera pestaña en `/superadmin/exportar-conteos` llamada **Planta**, con su propio botón "Exportar Planta", vista previa paginada y buscador, idéntica en estructura a la de Almacén: **una fila por referencia**, todas las referencias de planta (MP y PP), sin tope de 1.000 filas.

## Columnas del archivo (mismas que Almacén)

REFERENCIA · TIPO · BODEGA (siempre "Planta") · ERP · CONTEO1–4 · DIF1–4 · RESULTADO · A MONTAR · CANT A MONTAR

Se agrega una sola columna extra, **UBICACIONES**, con cuántas ubicaciones de planta tiene la referencia, para poder detectar en el Excel las que suman de varios sitios.

## Diferencia clave con Almacén: referencias en varias ubicaciones

En planta una misma referencia sí aparece en varias ubicaciones, así que:

- **CONTEO1–4**: se **suman** las cantidades de todas las ubicaciones de planta de esa referencia en cada ronda. Las ubicaciones sin ese conteo aportan 0.
- **ERP**: NO se suma. El ERP de planta (`Cant.PLd + Cant.PLr`) pertenece a la referencia, no a la ubicación; se toma **una sola vez** aunque la referencia tenga 5 ubicaciones.
- **DIF1–4**: suma de conteos de la ronda menos el ERP de la referencia.
- **CANT A MONTAR**: suma de las cantidades validadas de todas las ubicaciones de planta.
- **A MONTAR**: la ronda de la validación (`C1`…`C5`). Si distintas ubicaciones cerraron en rondas diferentes, se muestra la **mayor** (la ronda en que quedó cerrado el bloque completo).
- **RESULTADO**: el motivo de la validación (ej. `PL:C1=C2`, `cierre_forzado: ...`). Si aún no hay validación, se muestra el estado del bloque de planta (`pendiente`, `conflicto`, `critico`).

Como faltan ubicaciones por digitar, las referencias sin validar saldrán con RESULTADO = su estado, A MONTAR vacío y CANT A MONTAR en 0; al terminar la digitación basta volver a exportar.

## Reglas de formato

- Conteos inexistentes se exportan como **0**.
- Todo redondeado a 1 decimal.
- Diferencias con signo natural (positivo = sobrante, negativo = faltante) para filtrar y sumar en Excel.

## De dónde salen los datos

- Ubicaciones y ERP de planta: `locations_bodega_view` filtrada por inventario y `bodega = 'planta'` (mismo criterio que usa la auditoría, para que export y validación nunca se contradigan).
- Conteos C1–C4: `inventory_counts` por ubicación.
- Validaciones (cantidad, ronda, motivo): `validated_counts`.
- TIPO: `material_type` de la maestra.

Carga por lotes (páginas de 1.000 filas) igual que en Almacén, sin tope de registros.

## Notas técnicas

- En `src/pages/superadmin/ExportarConteos.tsx`: extraer la consulta actual de almacén a una función parametrizada por `bodega` que además cuente ubicaciones y tome el ERP una sola vez por referencia; reutilizarla para ambos tabs.
- Nuevo estado de tab (búsqueda, página, exportando) y nueva `TabsTrigger`/`TabsContent` "Planta"; la `TabsList` pasa a 4 columnas.
- Archivo generado: `conteos_planta_<fecha>.xlsx`, una sola hoja llamada "Planta".
- Sin cambios de base de datos.
