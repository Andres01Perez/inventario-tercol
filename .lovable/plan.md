# Exportar conteos: nueva pestaña "Almacén" (una referencia por fila)

## Qué se agrega

Una pestaña nueva en `/superadmin/exportar-conteos` llamada **Almacén**, claramente rotulada, con su propio botón "Exportar Almacén". Exporta **todas** las referencias de almacén (MP y PP), sin límite de filas, una fila por referencia. Planta queda para después (se dejará el mismo motor listo para reutilizar).

## Columnas del archivo

| Columna | Contenido |
|---|---|
| REFERENCIA | Código de la referencia |
| TIPO | MP o PP (de la maestra) |
| BODEGA | Siempre "Almacén" en este archivo |
| ERP | Cantidad ERP de almacén (`Cant.Alm`) |
| CONTEO1 | Cantidad contada en C1 |
| CONTEO2 | Cantidad contada en C2 |
| CONTEO3 | Cantidad contada en C3 |
| CONTEO4 | Cantidad contada en C4 |
| DIF1 | CONTEO1 − ERP |
| DIF2 | CONTEO2 − ERP |
| DIF3 | CONTEO3 − ERP |
| DIF4 | CONTEO4 − ERP |
| RESULTADO | Motivo de la validación (ej. `ALM:C1=C2`, `cierre_forzado: ...`) o el estado si aún no está validada |
| A MONTAR | Cuál conteo quedó validado: `C1`, `C2`, `C3`, `C4`, `C5` (vacío si aún no hay validación) |
| CANT A MONTAR | Cantidad validada que se debe montar en el ERP |

Reglas:
- Si un conteo no existe, la celda del conteo y su DIF quedan vacías (no cero), para no confundir un conteo real de 0 con "no contado".
- Todas las cantidades y diferencias se redondean a 1 decimal.
- Las diferencias van como número con signo natural (positivo = sobrante, negativo = faltante), para poder filtrar y sumar en Excel.

## De dónde salen los datos

- Referencias y ubicaciones de almacén: `locations_bodega_view` filtrada por inventario y `bodega = 'almacen'` (mismo criterio que usa la auditoría, así el export nunca se contradice con la validación).
- ERP de almacén: `bodega_erp` de esa misma vista.
- Conteos C1–C4: `inventory_counts` por ubicación.
- Validación (cantidad, ronda y motivo): `validated_counts`.
- TIPO: `material_type` de la maestra.

Como en almacén cada referencia tiene una sola ubicación, la fila es directa. Aun así el motor suma por referencia, de modo que si apareciera una referencia con dos ubicaciones el archivo no se rompe: los conteos y la cantidad validada se suman y el motivo/ronda se toma de la validación existente.

## Carga sin límite

Se traen los datos por lotes (páginas de 1.000 filas para ubicaciones y de 100 referencias para conteos y validaciones), como ya se hace en las otras exportaciones, así que no hay tope de 1.000 registros.

## Notas técnicas

- Nueva función `exportConteosBodega({ bodega })` en `src/hooks/useExportToExcel.ts`, escrita genérica para poder activar Planta después sin reescribir nada.
- Nueva pestaña en `src/pages/superadmin/ExportarConteos.tsx` con vista previa paginada (mismas columnas del archivo) y botón de exportación con estado de carga.
- Archivo generado: `conteos_almacen_<fecha>.xlsx`, una sola hoja.
- Sin cambios de base de datos.
