# Exportar ubicaciones de Bodega 3 (Paola - Mario B - Danna) en formato de importación

## Objetivo
Generar un archivo descargable con todas las ubicaciones cuyo líder de conteo asignado es **Paola - Mario B - Danna (Bodega 3)** (`bodega3@tercol.com.co`), en el mismo formato de columnas de la plantilla de importación de ubicaciones, listo para copiar/pegar en Excel.

## Datos verificados
- 156 ubicaciones en `locations` tienen `assigned_supervisor_id` = perfil "Paola - Mario B - Danna (Bodega 3)".
- Las 156 corresponden a `location_name = 'Bodega 3'` (coinciden los dos criterios; se filtra por el líder asignado, que es el dato determinante).

## Qué se hará
1. Consulta (solo lectura) a `locations` filtrando por `assigned_supervisor_id` del líder de Bodega 3, trayendo:
   - `master_reference`, `subcategoria`, `observaciones`, `location_name`, `location_detail`, `punto_referencia`, `metodo_conteo`, `activo`, `terminado`, y la bodega derivada de `assigned_admin_id` (Almacén/Planta).
2. Generar un archivo `.xlsx` en `/mnt/documents/` con exactamente las columnas de la plantilla de importación:
   - **Referencia | Bodega | Subcategoría | Observaciones | Ubicación | Ubicación Detallada | Punto Referencia | Método Conteo | Activo | Terminado**
3. Entregar el archivo como adjunto en el chat.

## Notas
- Es una exportación puntual (no se crea pantalla ni funcionalidad nueva en la app).
- No se modifica ningún dato; solo lectura.
- Si se prefiere el formato exacto de la pestaña "por ubicación" de Exportar Conteos, se ajusta antes de generar.
