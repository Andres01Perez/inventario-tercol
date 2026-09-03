# Mostrar la referencia completa en las auditorías

Hoy el nombre de la referencia se corta con puntos suspensivos en las tres auditorías (Almacén, Planta y PT), porque la columna es angosta y fuerza una sola línea.

## Cambios

1. **Auditoría Almacén y Planta** (`AuditoriaBodegaTable.tsx`, comparten el mismo componente)
   - Ampliar la columna Referencia de 180px a 240px.
   - Quitar el recorte con puntos suspensivos y permitir que el texto salte de línea, con la fila creciendo en altura automáticamente.
   - Ajustar el encabezado y la fila de detalle al mismo ancho para que todo quede alineado.

2. **Auditoría PT** (`AuditoriaPtTable.tsx`)
   - Ampliar la columna Referencia de 170px a 240px.
   - Mismo tratamiento: texto en varias líneas, sin recorte, altura automática.
   - Alinear el encabezado y las filas hijas al nuevo ancho.

3. **Verificación**
   - Revisar que las filas agrupadas y expandidas sigan alineadas y que no se rompa el desplazamiento horizontal de la tabla.

## Detalle técnico

- Reemplazar `truncate` por `break-words` / `whitespace-normal` en las celdas de referencia y quitar la altura fija de fila (`items-center` se mantiene con `min-h`).
- Actualizar en paralelo las clases `w-[...] min-w-[...]` del encabezado, la fila de grupo y la fila de detalle para conservar la alineación.
- Sin cambios de lógica, datos ni exportaciones.
