# Auditoría PT

Nueva vista de auditoría para Producto Terminado, con el mismo formato de Almacén y Planta, más PT dentro del Dashboard KPI.

## Acceso

- Nuevo botón **Auditoría PT** en la categoría Auditoría del panel superadmin.
- Ruta `/superadmin/auditoria/pt`, solo superadmin (admins pueden entrar en solo lectura si ya lo hacen en las otras).
- El Dashboard KPI pasa a tener tres opciones: `Almacén | Planta | PT`. Al elegir PT se ocultan los filtros de familia MP/PP (no aplican) y aparece un filtro de **Piso**.

## Tabla de Auditoría PT

Agrupada por referencia, expandible a sus ubicaciones (pisos).

```text
Referencia  Descripción            Ubic.  C1    C2    C3   C4   Validado  ERP     Descuadre  $   Estado     Ronda
ADAPTER34   ADAPTADOR TERMINAL     3      350   353   –    –    –         353.048            —   Conflicto  C3
  Piso 1 · B · 1BA-1BB · PL        UE 432 120   120   –    –    120                              validado C1=C2
  Piso 2 · A · 2BG     · PL        UE 432 110   115   –    –    –                               pendiente
  Piso 3 · C · 3AA     · PL        UE 432 120   118   –    –    –                               pendiente
```

- Fila de referencia: totales por ronda (suma de las ubicaciones), total validado, ERP (`cant_erp`), descuadre en unidades (validado − ERP) y estado/ronda de `pt_master`.
- Fila de ubicación: piso, prodc, ubic, línea, U.E., conteos C1–C4, cantidad validada, ronda y motivo de validación.
- Columna **Descuadre ($)** presente pero mostrando `—` mientras la maestra PT no traiga costo unitario, para dejarla lista a futuro.
- Igual que en Almacén/Planta, el descuadre no se muestra cuando el validado es 0.

## Filtros y carga

- Búsqueda por referencia o descripción, filtro por **Piso**, filtro por **Estado** (pendiente, conflicto, crítico, auditado, cerrado forzado, n/a) y switch "solo referencias en varios pisos".
- Carga por lotes con scroll infinito (páginas de 400 ubicaciones) y lecturas por lotes de 100 ids para conteos y validaciones, sin tope de 1.000 filas.
- Contador de "X de Y ubicaciones cargadas" y botón de cargar más.

## Acciones de superadmin

Las mismas que hoy existen en Almacén/Planta, aplicadas a PT:

- **Validar ahora**: ejecuta `pt_validate_and_close_round` para la referencia y muestra el resultado (cerrada, pasa a C3/C4, o faltan conteos).
- **Cierre forzado**: fija la cantidad validada por ubicación con un motivo escrito, marca la referencia como `cerrado_forzado` y lo registra en `count_history`.
- **Editar conteos**: corregir C1–C4 de una ubicación; al guardar se revalida la referencia automáticamente.
- **Ver historial**: diálogo con `count_history`.
- Todo bloqueado cuando el inventario está cerrado (banner de solo lectura).

## Exportación a Excel

Botón "Exportar" con dos hojas:

**Detalle por ubicación**

| Referencia | Descripción | Piso | Prodc | Ubic | Línea | U.E | C1 | C2 | C3 | C4 | Validado | Ronda validación | Motivo |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|

**Resumen por referencia**

| Referencia | Descripción | ERP | Total validado | Descuadre (und) | Estado | Ronda | Ubicaciones |
|---|---|---|---|---|---|---|---|

## Dashboard KPI — bloque PT

Reutiliza el panel actual con la misma estructura:

- Tarjetas: referencias PT, avance de conteo (ubicaciones contadas en su ronda vigente), auditadas, descuadre en unidades (faltante/sobrante) y descuadre en $ como `—`.
- Bloques "Por estado" y "Por ronda vigente" con los mismos colores de badge.
- Top 10 descuadres por unidades absolutas.
- Desglose adicional **por piso**: ubicaciones, contadas, validadas y avance.
- En vivo con suscripción realtime a `pt_counts` y `pt_validated_counts` más refresco periódico, igual que hoy.

## Notas técnicas

- Archivos nuevos: `src/pages/superadmin/AuditoriaPT.tsx` y `src/components/superadmin/AuditoriaPtTable.tsx` (mismo patrón que `AuditoriaBodegaTable.tsx`).
- Fuentes de datos: `pt_locations` (filtrada por `inventory_id`, `activo`), `pt_master` (ERP, descripción, estado, ronda, historial), `pt_counts` (C1–C4) y `pt_validated_counts` (validado, ronda, motivo).
- `AuditoriaKpiPanel.tsx` se extiende con el modo `pt` y `DashboardAuditoria.tsx` con el tercer botón y el filtro de piso.
- `useExportToExcel.ts` gana `exportAuditoriaPT` con el mismo batching existente.
- Ruta nueva en `src/App.tsx` y acción `auditoriaPT` en `src/pages/UnifiedDashboard.tsx`.
- Sin cambios de base de datos: se usan las tablas y el RPC `pt_validate_and_close_round` que ya existen.

## Verificación

- Los totales por referencia deben coincidir con la suma de los pisos y con lo guardado en `pt_validated_counts`.
- Una referencia en varios pisos aparece una sola vez, con sus pisos anidados.
- Editar un conteo dispara revalidación y refleja el nuevo estado/ronda sin recargar.
- Exportar y comparar contra la base; verificar que no hay corte en 1.000 filas.
- Typecheck y build.
