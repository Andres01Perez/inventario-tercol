# Columnas Activo y Terminado en ubicaciones

## Confirmación sobre MP / PP

Correcto: **no debes poner el tipo (MP o PP) en el archivo de ubicaciones**. El tipo sale automáticamente de la maestra (`inventory_master.material_type`) al cruzar por Referencia; de hecho el importador ya rechaza cualquier referencia que no exista en la maestra del inventario activo.

## Lectura del archivo adjunto

`ubicaciones_aleja_final.xlsx`: 2.601 filas, columnas
`Referencia | Bodega | Subcategoría | Observaciones | Ubicación | Ubicación Detallada | Punto Referencia | Método Conteo | Activo | Terminado`.

- Todas las filas tienen Bodega = `Almacén`.
- `Activo`: 2.501 `SI`, 100 `NO`.
- `Terminado`: 1.509 `NO`, 1.092 `SI`.
- Muchas filas traen Ubicación / Ubicación Detallada / Punto Referencia / Método Conteo vacíos (permitido hoy).

## Cambios

### 1. Base de datos

Migración sobre `locations`:

- `activo boolean not null default true`
- `terminado boolean not null default false`

Sin cambios de RLS ni de grants (la tabla ya los tiene).

### 2. Importador de ubicaciones

- `src/lib/locationsParser.ts`: nuevos campos `activo` y `terminado` en `ParsedLocation`.
  - Alias de columna: `activo`; `terminado`.
  - Valores aceptados (sin acentos, case-insensitive): `si`/`sí`/`true`/`1`/`x` → verdadero; `no`/`false`/`0`/vacío → falso.
  - Ambas columnas son **opcionales**: si faltan, `Activo = SI` y `Terminado = NO` por defecto (así el archivo de Planta puede ir sin ellas).
  - Un valor presente pero no reconocido genera advertencia y usa el valor por defecto (no rechaza la fila).
- Plantilla descargable: se agregan las columnas `Activo` y `Terminado` con ejemplos `SI` / `NO` (misma plantilla para Almacén y Planta).
- `src/components/shared/LocationsImport.tsx`: insertar `activo` y `terminado`, mostrarlas en el bloque "Columnas esperadas" y en el preview.

### 3. Vistas de ubicaciones

- `src/pages/admin/GestionUbicacion.tsx`: dos columnas nuevas (badges **Activo/Inactivo** y **Terminado/Pendiente**), incluidas en la consulta.
- `src/components/shared/CreateLocationDialog.tsx` y `src/components/supervisor/AddLocationDialog.tsx`: switches para Activo (por defecto sí) y Terminado (por defecto no).

### 4. Planillas de impresión

- `src/components/supervisor/PrintableSheet.tsx` (por zona) y `src/components/supervisor/BulkPrintableSheets.tsx` (masiva): dos columnas nuevas **Activo** y **Term.** mostrando `SI` / `NO`.
- Se ajusta el `colSpan` del encabezado y del pie de firmas de 9 a 11 y se compactan anchos para que siga cabiendo en la hoja.
- `src/pages/superadmin/ImpresionMasiva.tsx` y `GroupedTranscriptionTab.tsx`: traer los dos campos en la consulta para pasarlos a la planilla.

## Fuera de alcance

- No se filtra ni se bloquea el conteo según `activo` / `terminado`; por ahora son solo informativos. Si más adelante quieres que las inactivas no aparezcan en el conteo, se hace en otra fase.
