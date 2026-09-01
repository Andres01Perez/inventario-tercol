# Dashboard KPI de Auditoría (Almacén / Planta)

Una sola pantalla nueva en el Panel Superadmin, con un botón que alterna entre **Almacén** y **Planta**. Muestra el estado en vivo del avance de conteo y el descuadre acumulado, sin convertirse en un tablero gigante.

## Acceso

- Nuevo botón **Dashboard Auditoría** en la categoría **Auditoría** del panel superadmin.
- Ruta: `/superadmin/auditoria/dashboard`, solo superadmin.
- Dentro de la vista, un selector tipo toggle: `Almacén | Planta`. Debajo, filtro de familia: `Todas | MP | PP`.

## Contenido de la vista (de arriba hacia abajo)

### 1. Tarjetas KPI (fila compacta, 5 tarjetas)

```text
+--------------+--------------+---------------+------------------+------------------+
| Referencias  | Avance de    | Auditadas     | Descuadre total  | Descuadre total  |
| en la bodega | conteo       |               | (unidades)       | ($)              |
|    1.240     |  68%         |  845 (68%)    |    -1.320        |   -$18.450.000   |
+--------------+--------------+---------------+------------------+------------------+
```

- Avance de conteo = ubicaciones contadas en su ronda vigente / ubicaciones activas de la bodega.
- Descuadre = suma de (validado − ERP de la bodega) por referencia; el valor usa `costo_u_mp` / `costo_u_pp`.
- Faltante y sobrante se muestran por separado dentro de la tarjeta de unidades (texto pequeño: `Faltante -1.500 · Sobrante +180`).

### 2. Estado por ronda y por estado (dos bloques lado a lado)

```text
Por estado                          Por ronda vigente
+-------------+-------+-------+     +-------+-------+
| Estado      | Refs  |  %    |     | Ronda | Refs  |
+-------------+-------+-------+     +-------+-------+
| Auditado    |  845  | 68%   |     | C1    |  120  |
| Pendiente   |  260  | 21%   |     | C2    |  180  |
| Conflicto   |  105  |  8%   |     | C3    |   70  |
| Crítico     |   25  |  2%   |     | C4    |   25  |
| Cerrado forz|    5  |  1%   |     | Cerr. |  845  |
+-------------+-------+-------+     +-------+-------+
```

Barras horizontales simples con el color ya usado en la auditoría para cada estado. Cada fila es clickeable y lleva a la auditoría de esa bodega con el filtro de estado aplicado.

### 3. Descuadre por familia

```text
+--------+------------+-----------+-----------+---------------+
| Familia| ERP bodega | Validado  | Descuadre | Descuadre ($) |
+--------+------------+-----------+-----------+---------------+
| MP     |   84.200   |  83.500   |   -700    |  -$9.100.000  |
| PP     |   35.400   |  34.780   |   -620    |  -$9.350.000  |
| Total  |  119.600   | 118.280   | -1.320    | -$18.450.000  |
+--------+------------+-----------+-----------+---------------+
```

### 4. Top 10 descuadres

Tabla corta con las referencias de mayor impacto en $ (absoluto): referencia, familia, ERP bodega, validado, descuadre und, descuadre $, estado, ronda. Cada fila abre esa referencia en la auditoría correspondiente.

## En vivo

- Suscripción realtime a `inventory_counts` y `validated_counts` filtrada por el inventario activo; al llegar un evento se invalida la consulta del dashboard (con un pequeño debounce para no recargar en cada tecleo de conteo).
- Además refresco automático cada 30 s y botón manual de recargar, con marca de "actualizado hace X".
- Aviso visible de "sin costo cargado" cuando el costo unitario de una referencia es 0 o nulo, para que el descuadre en $ no se lea como cuadrado.

## Notas técnicas

- Archivos nuevos: `src/pages/superadmin/DashboardAuditoria.tsx` y `src/components/superadmin/AuditoriaKpiPanel.tsx` (recibe `bodega` y `materialType`).
- Fuente de datos: `locations_bodega_view` filtrada por `inventory_id` + `bodega` (mismo criterio que usa `AuditoriaBodegaTable`), `validated_counts` para lo validado, e `inventory_master` para `costo_u_mp` / `costo_u_pp`. Lectura por lotes con `.range()` para no cortarse en 1.000 filas, y agregación en cliente memorizada.
- Sin cambios de base de datos ni del motor de validación; es una vista de solo lectura.
- Ruta protegida en `src/App.tsx` y nueva acción `dashboardAuditoria` en la categoría Auditoría de `src/pages/UnifiedDashboard.tsx`.
- Estilos con `.glass-card` y los badges de estado ya definidos.

## Verificación

- Los totales del dashboard deben coincidir con la suma de la tabla de auditoría de la misma bodega y familia.
- Guardar un conteo en otra pestaña actualiza los KPI sin recargar la página.
- Typecheck y build.
