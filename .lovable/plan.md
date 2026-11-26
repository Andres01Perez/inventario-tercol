# Corregir Valorización: totales completos y Excel sin corte de 1.000 filas

## Qué cambia para ti
- Tarjetas, matriz 2×2 y hoja Resumen del Excel salen de un total calculado en el servidor sobre TODAS las referencias (ya no de un subconjunto que cambia en cada carga).
- La tabla y la hoja Detalle traen todas las filas, en orden estable.
- Indicador visible "Filas cargadas X de Y". Si no cuadran filas o valores, alerta roja y botón Exportar deshabilitado.
- Nueva columna en Detalle: cantidad validada en ubicaciones inactivas (lo que la valorización excluye hoy).

No se tocan reglas de validación, `erp_bodega_ctl`, estados ni conteos.

## Pasos
1. **Base de datos (una migración)**
   - `valorizacion_bodega`: se recrea (cambia su lista de columnas) con el mismo cálculo, más:
     - `ORDER BY referencia, bodega` al final.
     - columna `cant_validada_inactivas` = Σ `validated_counts` de ubicaciones con `activo = false` de esa referencia y bodega. Solo informativa: no entra en `cant_a_montar` ni en valores.
   - Nueva `valorizacion_resumen(_inventory_id)`: agrega en SQL sobre `valorizacion_bodega` y devuelve por familia × bodega: `referencias`, `total_inv_inicial`, `total_inv_a_montar`, `costo_dif_negativa` (Σ dif_valor<0), `costo_dif_positiva` (Σ dif_valor>0). Misma restricción superadmin/visualizador y mismos permisos de ejecución.
2. **Carga de datos (`useValorizacion`)**
   - Detalle: paginar con `.range(from, from+999)` hasta agotar (patrón `fetchAllPages` de AuditoriaKpiPanel).
   - Nuevo hook `useValorizacionResumen` que llama a la RPC de resumen (mismo refresco de 30 s).
3. **Panel (`ValorizacionPanel`)**
   - Tarjetas y matriz 2×2 leen solo del resumen.
   - Control de integridad: X = filas de detalle cargadas, Y = Σ `referencias` del resumen; además Σ dif_valor del detalle vs Σ(a montar − inicial) del resumen (tolerancia de redondeo de $1). Si falla: alerta roja y Exportar deshabilitado.
   - El control de consistencia existente se mantiene.
4. **Excel**
   - Resumen: solo desde `valorizacion_resumen`.
   - Detalle: todas las filas, ordenadas por familia, bodega, referencia; se añade `cant_validada_inactivas`.
5. **Pruebas**: actualizar `src/lib/valorizacion.test.ts` con la regla de integridad (X≠Y bloquea, diferencia de valores bloquea, cuadre exacto permite exportar) y el orden familia→bodega→referencia.

## Detalles técnicos
- Cambiar el tipo de retorno exige `DROP FUNCTION valorizacion_bodega(uuid)` + `CREATE`; luego se re-otorgan `EXECUTE` a authenticated/service_role y se revoca a anon/PUBLIC.
- `valorizacion_resumen` es `SECURITY DEFINER` y llama internamente a `valorizacion_bodega`, que ya valida el rol.
- La paginación sobre RPC funciona porque el orden ahora es determinista.
