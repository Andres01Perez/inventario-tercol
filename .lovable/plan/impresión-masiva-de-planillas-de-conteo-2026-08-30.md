# Impresión Masiva de planillas de conteo

Sí, se entiende y es posible. Hoy cada planilla se imprime entrando a una zona desde el conteo. Se agrega una vista nueva donde se seleccionan varias zonas y se imprime **una sola vez**, generando un documento continuo en el que cada zona empieza en hoja nueva (nunca se mezclan dos zonas en la misma hoja). La impresión por zona actual queda intacta.

## Qué se agrega

- Nuevo botón **Impresión Masiva** en la categoría **General** del panel (superadmin y admins), con ruta `/superadmin/impresion-masiva`.
- La vista trabaja siempre sobre el **inventario activo** y muestra **todas las ubicaciones** (no solo pendientes). El filtrado de pendientes sigue siendo del supervisor en su conteo.
- Selector de ronda solo para el encabezado de la planilla: **Conteo 1** o **Conteo 2** (que es el uso real: imprimir y repartir).
- Filtro por **responsable/supervisor** + lista de **zonas con checkbox**, con "Seleccionar todas" / "Limpiar", contador de zonas y de ubicaciones seleccionadas.
- Botón **Imprimir seleccionadas** → abre la vista previa con todas las planillas concatenadas y un único `Imprimir`.

## Reglas de paginación

- Cada zona seleccionada se renderiza como una planilla completa e independiente: encabezado (zona, fecha, supervisor, total de ítems), tabla de ubicaciones con casilla de cantidad, y pie de firmas.
- Cada zona arranca en página nueva (`break-before: page`), salvo la primera.
- El encabezado de columnas y el pie de firmas se repiten en cada página de esa zona (igual que hoy, con `thead`/`tfoot`).
- Las filas no se parten entre páginas.

## Detalles técnicos

- Nueva página `src/pages/superadmin/ImpresionMasiva.tsx` bajo `AppLayout`, ruta protegida en `src/App.tsx` para `superadmin`, `admin_mp`, `admin_pp`.
- Consulta a `locations` filtrada por `inventory_id` del `InventoryContext`, con join opcional a `inventory_master` (tipo de material) y al perfil del supervisor asignado; carga por lotes con `.range()` para no cortarse en 1000 filas.
- Agrupación por zona con la misma clave que `GroupedTranscriptionTab` (`location_name`, con grupo "Sin zona").
- Nuevo componente `src/components/supervisor/BulkPrintableSheets.tsx` que reutiliza el marcado exacto de `PrintableSheet` por zona dentro de un contenedor `#printable-sheet`, para aprovechar sin cambios los estilos de impresión existentes de `src/index.css`.
- Ajuste mínimo en `src/index.css`: clase `.print-page-break` con `break-before: page` aplicada a cada planilla salvo la primera.
- Sin cambios en base de datos.

## Fuera de alcance

- No se modifica la impresión por zona desde el conteo.
- No se genera archivo PDF descargable; se usa el diálogo de impresión del navegador (que permite "Guardar como PDF").
