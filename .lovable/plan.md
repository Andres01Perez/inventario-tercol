# Corregir el conteo de referencias por familia en /superadmin/importar

## Qué está pasando

Los datos en la base están completos: MP tiene 780 referencias y PP tiene 1.771 (los archivos subidos traen 780 y 1.771 filas de datos, así que la importación funcionó bien).

El error está solo en el número que muestra la tarjeta. La pantalla trae **las filas** de `inventory_master` y las cuenta en el navegador, pero PostgREST corta la respuesta en 1.000 filas. Por eso llegan 780 de MP + 220 de PP = exactamente 1.000, y PT queda en 0.

## Cambio

En `src/components/superadmin/MasterDataImport.tsx`, reemplazar la consulta que descarga filas por tres consultas de solo conteo (`select('*', { count: 'exact', head: true })`) filtradas por `inventory_id` y `material_type`, ejecutadas en paralelo. Así el conteo lo hace el servidor y no depende del límite de filas.

Resultado esperado: MP 780, PP 1.771, PT 0.

## Verificación

- Typecheck/build.
- Confirmar contra la base que los números mostrados coinciden con los conteos reales por familia.
