# Impresión masiva: saltos de página reales + impresión nativa

Hoy la vista previa masiva se dibuja dentro del diálogo y usa el mismo truco de impresión que la planilla por zona (`visibility: hidden` sobre todo el body). Con varias zonas eso falla: el contenedor del diálogo tiene scroll y altura limitada, y el `break-before: page` de cada zona queda dentro de un bloque posicionado, así que el navegador imprime todo corrido (o con páginas en blanco) en vez de una zona por hoja.

## Qué se cambia

### 1. Contenedor de impresión propio

- El contenido imprimible de la impresión masiva deja de vivir dentro del `DialogContent` con scroll y se renderiza en un portal a `document.body`, en un contenedor dedicado (`#bulk-print-root`).
- En pantalla ese contenedor está oculto; el diálogo sigue mostrando la vista previa como hoy.
- En `@media print` se oculta todo el resto de la app y solo se muestra `#bulk-print-root`, en flujo normal (sin `position: absolute`, sin altura fija, sin overflow), que es la condición para que los saltos de página funcionen.

### 2. Saltos de página por zona

- Cada zona se envuelve en un bloque `.print-sheet` con `break-after: page` (salvo la última), en lugar del `break-before` actual sobre un contenedor anidado.
- Se mantiene: encabezado de columnas repetido por página (`thead`), pie de firmas (`tfoot`), y filas que no se parten (`break-inside: avoid`).
- Resultado: nunca aparecen dos zonas en la misma hoja, y una zona larga sí continúa en las hojas siguientes con su encabezado.

### 3. Botón de impresión nativo

- El botón "Imprimir" del diálogo llama a `window.print()` después de asegurar que el contenedor de impresión está montado, de modo que se abra la ventana nativa del navegador con la vista paginada correcta (permite también "Guardar como PDF").
- Se agrega un botón directo "Imprimir seleccionadas" que puede lanzar la impresión sin necesidad de revisar la vista previa (la vista previa sigue disponible).

## Detalles técnicos

- `src/components/supervisor/BulkPrintableSheets.tsx`: extraer el marcado de las planillas a un componente que se monta vía `createPortal` en `document.body` bajo `#bulk-print-root`; el diálogo reutiliza el mismo marcado para la vista previa en pantalla.
- `src/index.css`: nuevas reglas dentro del bloque `@media print` existente para `#bulk-print-root` (mostrarlo, ocultar el resto) y `.print-sheet { break-after: page }`; se conserva intacto el bloque actual de `#printable-sheet` para la impresión por zona.
- No se toca `PrintableSheet.tsx` (impresión por zona actual queda igual) ni la base de datos.

## Fuera de alcance

- No se genera PDF por servidor; se usa el diálogo nativo del navegador.
- No cambian los filtros ni la selección de zonas.
