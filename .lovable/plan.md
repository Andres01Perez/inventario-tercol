# Planta o Almacén según "Controlado" (solo PP)

## Qué encontré
- Las 1.771 referencias PP del archivo existen en la app, sin faltantes ni sobrantes.
- La marca de controlado coincide en todas las referencias: 671 controladas y 1.098 no controladas.
- Las cantidades ERP coinciden, salvo 4: AL318I-100E, ALPTE3M, CU318I-125 y RESORTE.
- Hoy la app divide cada referencia por el lugar del ERP. Así sale BN04EP-CMB con 0 en Planta y 1.193 en Almacén.
- 519 referencias no controladas tienen ERP o conteos en Almacén. 103 controladas tienen estado o conteos en Planta.

## Regla nueva
- **No controlada (0):** se audita solo en Planta. ERP Planta = Almacén + Planta disponible + Planta reservado. Lo contado en Almacén se suma al físico de Planta. Ejemplo: BN06-CMB = 107.
- **Controlada (1):** se audita solo en Almacén, con el ERP total. Lo contado en Planta se suma al físico de Almacén y la referencia sale de Auditoría Planta. Ejemplo: AL312I-100E = 695.
- PUNTA pasa a controlada. TSGAP100X30G pasa a no controlada.
- MP y PT no cambian.

## Pasos
1. **Respaldo:** un Excel con el estado actual de las referencias PP: ERP, estado y conteo validado por bodega, y conteos por ubicación.
2. Guardar la marca de controlado de PUNTA y TSGAP100X30G.
3. Cambiar el cálculo del ERP y de la bodega donde se valida cada referencia PP, siguiendo la regla nueva.
4. Revalidar todas las referencias PP afectadas en su nueva bodega, con la lógica actual: coincidencia con ERP de C1 a C4. Los conteos originales no se borran; solo se recalcula el resultado validado.
5. Auditoría Planta, Auditoría Almacén, los indicadores y Exportar conteos mostrarán cada referencia PP en una sola bodega.
6. Revisar BN04EP-CMB, BN06-CMB y AL312I-100E, y entregar un resumen de cuántas referencias cambiaron de estado.

## Para confirmar
- ¿Actualizo también las 4 cantidades distintas para que queden como en el archivo? Si no respondes, no las cambio.
- Al revalidar, algunas referencias que hoy están auditadas pueden pasar a conflicto. Pasará cuando la suma de los conteos ya no coincida con el nuevo ERP total.

## Detalles técnicos
- Controlado = `inventory_master.control IS NOT NULL`. Se actualiza `control` en las 2 referencias sin dato.
- Nueva función `pp_bodega(control)` que devuelve `'almacen'` o `'planta'`. `erp_bodega` usa el total (`cant_alm_pp + cant_pld + cant_plr`) en la bodega asignada y 0 en la otra.
- `validate_bucket`, `revalidate_reference` y `reopen_reference`: para PP agrupan todas las ubicaciones de la referencia en la bodega asignada, sin importar su `assigned_admin_id`. La otra bodega queda en `n/a`.
- Front: `AuditoriaBodegaTable`, KPI y `ExportarConteos` filtran PP por la bodega asignada y suman las ubicaciones de ambas bodegas.
- Migración más un script de revalidación por lotes. No se borran registros de `inventory_counts`.
