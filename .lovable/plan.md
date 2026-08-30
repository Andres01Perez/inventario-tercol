# Fase 4 — Auditoría separada por bodega

## Objetivo

Partir la auditoría en dos vistas independientes (Almacén y Planta), cada una con pestañas MP y PP, cargar **todas** las referencias sin tope de página, y mostrar el descuadre por bodega en cantidad y en valor, también en la exportación.

## Estructura de navegación

```text
/superadmin/auditoria            → selector: Auditoría Almacén | Auditoría Planta
/superadmin/auditoria/almacen    → tabs: MP | PP
/superadmin/auditoria/planta     → tabs: MP | PP
```

Cada combinación (bodega × familia) es una consulta pequeña e independiente, que es lo que resuelve el problema de carga: en vez de traer 2.551 referencias de golpe, cada pestaña trae solo su subconjunto.

## Qué se lista en cada vista

- **Almacén**: referencias con al menos una ubicación cuyo admin dueño es `admin_mp`. Es el mismo criterio que usa el motor de validación de la Fase 3, así que auditoría y validación nunca se contradicen.
- **Planta**: referencias con al menos una ubicación cuyo admin dueño es `admin_pp`.
- Una referencia con ubicaciones en ambas bodegas aparece en las dos vistas, cada una con su propia ronda (`bodega_round`), su propio estado (`bodega_status`) y su propio ERP.
- Dentro de cada vista, la pestaña MP o PP filtra por `material_type`.

Todo esto ya está disponible en `locations_bodega_view`, que expone `bodega`, `bodega_round`, `bodega_status`, `bodega_erp`, `material_type` y `control` por ubicación.

## Tabla de auditoría (por bodega)

| Referencia | Ubicación | C1 | C2 | C3 | C4 | Validado | ERP bodega | Descuadre (und) | Descuadre ($) | Estado | Ronda |
|---|---|---|---|---|---|---|---|---|---|---|---|
| CCE125TG | ALM-A1 | 10 | 10 | – | – | 10 | 25 | | | | |
| CCE125TG | ALM-B2 | 12 | 12 | – | – | 12 | | | | | |
| **Total almacén** | 2 ubic. | | | | | **22** | **25** | **-3** | **-$4.500** | conflicto | C3 |

- El descuadre se calcula por referencia y bodega: `suma de validado en esa bodega − ERP de esa bodega`.
- ERP almacén = `Cant.Alm`; ERP planta = `Cant.PLd + Cant.PLr` (ya lo entrega `bodega_erp`).
- El valor usa el costo unitario de la referencia (`costo_u_mp` para MP, `costo_u_pp` para PP) por la diferencia en unidades. Mientras los archivos no traigan `Costo.U`, la columna mostrará `$0` y se marcará con un aviso de "sin costo cargado" para que no se lea como cuadrado.
- Cantidades validadas leídas de `validated_counts` (Fase 2), no de `locations.validated_quantity`.

## Carga de todas las referencias sin tope

- Se elimina la paginación de 1.000 por página.
- Cada pestaña carga por lotes con `useInfiniteQuery` y `.range()`, en páginas de 200 referencias, con scroll infinito y un botón "cargar todas" para cuando se quiera revisar completo.
- Los datos dependientes (ubicaciones, conteos, validaciones) se piden solo para las referencias ya cargadas, en lotes de 100 para no reventar el largo de URL.
- Filtros (búsqueda, estado, ubicación) se resuelven en el servidor, no en el navegador, para que no se traiga nada de más.
- `staleTime` de 60 s y `keepPreviousData` para que el scroll no parpadee. Con este patrón cada usuario mantiene abierta una sola pestaña ligera, lo que baja mucho la carga frente a 40 usuarios simultáneos.

## Exportación

`exportAuditoria` recibe bodega y familia y exporta exactamente lo que se ve, con dos hojas:

**Hoja "Detalle por ubicación"**

| Referencia | Tipo | Bodega | Ubicación | Detalle | C1 | C2 | C3 | C4 | Validado | Ronda validación | Motivo |
|---|---|---|---|---|---|---|---|---|---|---|---|
| CCE125TG | PP | Almacén | ALM-A1 | Estante 3 | 10 | 10 | | | 10 | 1 | ALM:C1=C2 |

**Hoja "Resumen por referencia"**

| Referencia | Tipo | Bodega | ERP bodega | Total validado | Descuadre (und) | Costo unitario | Descuadre ($) | Estado | Ronda |
|---|---|---|---|---|---|---|---|---|---|
| CCE125TG | PP | Almacén | 25 | 22 | -3 | 1.500 | -4.500 | conflicto | 3 |

La exportación usa el mismo batch fetch existente, sin tope de 1.000 filas.

## Qué no cambia

- El motor de validación (`validate_and_close_round` / `validate_bucket`) queda intacto.
- Las acciones actuales de la auditoría (validar manualmente, cierre forzado, editar conteos) se conservan, ahora aplicadas al bloque de bodega correspondiente.
- Nada de esto toca la vista de conteo de supervisores.

## Verificación

- Confirmar que una referencia con ubicaciones mixtas aparece en las dos vistas con ERP y descuadre distintos y correctos.
- Confirmar que la suma de referencias listadas en Almacén MP + Almacén PP coincide con las referencias que tienen ubicaciones de almacén.
- Cargar una pestaña completa y verificar que no hay corte en 1.000 filas.
- Exportar y comparar contra la base.
- Typecheck y build.

## Notas técnicas

- Nuevos archivos: `src/pages/superadmin/AuditoriaAlmacen.tsx`, `src/pages/superadmin/AuditoriaPlanta.tsx` y un componente compartido `src/components/superadmin/AuditoriaBodega.tsx` que recibe `bodega` y `materialType`; `Auditoria.tsx` pasa a ser el selector de las dos vistas y conserva los diálogos de acciones.
- Fuente de datos: `locations_bodega_view` filtrada por `inventory_id`, `bodega` y `material_type`; el listado de referencias sale de un `select` sobre la vista agrupado en cliente por referencia dentro de cada lote.
- Se agrega `costo_u_mp` y `costo_u_pp` al select de `inventory_master` para el cálculo de valor.
- Rutas nuevas en `src/App.tsx` y enlaces en `UnifiedDashboard.tsx`.
- Sin cambios de base de datos.
