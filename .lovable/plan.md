# Tercol Inventario — Hoja de ruta v2

## Recomendación: evolucionar este proyecto, no empezar de cero

Los cambios que pides son aditivos o quirúrgicos, no arquitectónicos. Lo que ya funciona y sería caro rehacer (motor `validate_and_close_round`, parsers de Excel, exportaciones con batch fetch, paginación, límites de 1000 filas resueltos) se conserva. Empezar de cero costaría semanas para llegar al mismo punto y arriesgaría reintroducir los 8 bugs históricos ya resueltos. Lo que sí hacemos es tratarlo como una **v2 con limpieza deliberada**.

## Paso 1 (ahora): documento maestro en Documentos

Único entregable de esta ronda. Generar `Informe-Ejecutivo-Tercol-Inventario.md` en Documentos con:

- Propósito del aplicativo, roles y accesos
- Flujo completo C1–C4 y reglas de auto-validación
- Módulos y páginas existentes
- Modelo de datos (tablas, funciones, triggers)
- Bugs históricos resueltos (para no reintroducirlos)
- **Sección de pendientes v2 con el to-do list completo de abajo**

## To-do list v2

Se va tachando cada ítem a medida que quede implementado **y probado**.

### Fase 0 — Documentación
- [ ] Informe ejecutivo exportado a Documentos con el to-do list incluido

### Fase 1 — Histórico por inventario (base de todo lo demás)
- [ ] Tabla `inventories` (nombre, fecha inicio, estado abierto/cerrado)
- [ ] Columna `inventory_id` en `inventory_master`, `locations`, `inventory_counts`
- [ ] Índices compuestos (`inventory_id`, `master_reference`)
- [ ] `InventoryContext` con el inventario activo
- [ ] Todas las queries filtradas por inventario activo (transcripción, auditoría, críticos, exportar, inventarios MP/PP)
- [ ] Selector de inventario en el dashboard (históricos en solo lectura)
- [ ] Importar maestra crea inventario nuevo en vez de borrar datos
- [ ] Migrar datos actuales al inventario "Semestral 2026-1"

### Fase 2 — Validaciones persistidas
- [ ] Tabla `validated_counts` (inventario, referencia, ubicación, cantidad, ronda, motivo) con GRANTs y RLS
- [ ] `validate_and_close_round` escribe en `validated_counts`
- [ ] Exportaciones leen de `validated_counts` en vez de `locations.validated_quantity`
- [ ] Verificar que el caso tipo CCE125TG ya no puede ocurrir

### Fase 3 — Validación almacén vs planta
- [ ] Definir cómo se identifica si una ubicación es almacén o planta (¿`subcategoria`? ¿columna nueva `bodega`?)
- [ ] Confirmar qué columnas ERP suman "almacén" y cuáles "planta"
- [ ] Columna/derivación de bodega en `locations` + ajuste del importador de ubicaciones
- [ ] Reescribir la fase de match por suma del RPC: comparar almacén contra almacén y planta contra planta por separado
- [ ] Probar con referencias multi-ubicación mixtas
- [ ] **Auditoría muestra el descuadre desglosado**: si el total no cuadra, indicar si el faltante/sobrante es de almacén o de planta, con la diferencia en cantidad y en valor ($, usando `costo_u`)

### Fase 4 — Auditoría completa
- [ ] Vista de auditoría que cargue **todas** las referencias (hoy hay tope de 500/1000 por página)
- [ ] Carga por lotes con `.range()` o scroll infinito, sin degradar el rendimiento con 40 usuarios simultáneos
- [ ] Columnas de descuadre por bodega (cantidad y valor) visibles y exportables

### Fase 5 — Producto Terminado (PT)
- [ ] Recibir Excel de ejemplo de PT
- [ ] Mapeo real de columnas en `PT_COLUMN_MAP`
- [ ] Fórmula de `cant_total_erp` para PT
- [ ] Columnas PT en `inventory_master` si aplica
- [ ] Vista `/superadmin/inventario-pt` con exportación
- [ ] PT en filtros, auditoría, exportaciones y selectores

### Fase 6 — Verificaciones de regresión (tu checklist)
- [ ] Las referencias ya contadas desaparecen de la vista de conteo (realtime C1–C4)
- [ ] Una referencia que no coincide pasa correctamente a C3, y de C3 a C4 (sin saltarse rondas)
- [ ] La exportación por total validado y la exportación por ubicación entregan cifras correctas y completas
- [ ] Ninguna exportación se corta en 1000 filas

### Fase 7 — Limpieza
- [ ] Eliminar rol `operario` del enum y reasignar usuarios existentes
- [ ] Limpiar ramas de UI y políticas RLS que lo referencian
- [ ] Unificar layouts que hoy no usan `AppLayout`

## Información pendiente de tu lado

1. Excel de ejemplo de PT con sus columnas reales
2. Desglose exacto de qué columnas ERP son "almacén" y cuáles "planta"
3. Cómo se identifica hoy si una ubicación pertenece a almacén o a planta
4. Si el descuadre en valor se calcula con `costo_u_mp`/`costo_u_pp` o con `costo_t`

