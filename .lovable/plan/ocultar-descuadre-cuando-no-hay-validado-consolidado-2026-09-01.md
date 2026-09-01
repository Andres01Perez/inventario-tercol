# Ocultar Descuadre ($) cuando no hay Validado consolidado

En el Dashboard KPI de Auditoría, mientras una referencia (o el total de una bodega/familia) tenga `Validado = 0` —es decir, aún no existe un conteo consolidado— no se debe mostrar el descuadre en dinero ($), porque genera una impresión negativa con un número rojo que aún no tiene sentido.

## Regla de negocio

- Si `validado === 0` para una referencia, su **Descuadre ($)** se considera no disponible.
- Si el total de `validado` de una familia es 0, el **Descuadre ($)** de esa familia se muestra como "—".
- Si el total de `validado` de toda la bodega es 0, la tarjeta KPI **Descuadre ($)** muestra "—" en lugar de `$0` o cualquier valor negativo.
- El **Descuadre (unidades)** sigue mostrándose normalmente; esta regla aplica solo al valor monetario.

## Cambios técnicos

### `src/components/superadmin/AuditoriaKpiPanel.tsx`

1. **Agregado de bandera `hasValidation` por referencia**
   - En el mapeo de `refs`, agregar `hasValidation: r.validado !== 0`.
   - Calcular `descuadreValor` solo cuando `hasValidation` sea verdadero; de lo contrario `null`.

2. **Agregados por familia**
   - En `familyMap`, acumular `valor` solo cuando la referencia tenga `validado !== 0`.
   - Agregar `validado` acumulado a la familia para poder decidir si se muestra "—".

3. **Totales del dashboard**
   - `descuadreValor` total = suma de `descuadreValor` de referencias con validación.
   - Agregar `hasAnyValidation` (total de referencias con `validado !== 0` > 0).

4. **Renderizado**
   - KPI card **Descuadre ($)**: si no hay ninguna validación, mostrar "—" y sin color danger; hint cambia a "Sin validaciones consolidadas".
   - Tabla **Descuadre por familia**: columna "Descuadre ($)" muestra "—" cuando `f.validado === 0`; la fila total igual.
   - **Top 10 descuadres**: excluir referencias con `validado === 0` del ranking, porque su descuadre en $ no está consolidado. Si no hay referencias con validación, mostrar mensaje "No hay descuadres consolidados".

## Verificación

- Typecheck y build sin errores.
- Dashboard KPI con inventario sin conteos validados: tarjeta Descuadre ($) muestra "—", tabla por familia muestra "—", Top 10 está vacío o con mensaje informativo.
- Dashboard KPI con al menos una referencia validada: el descuadre en $ aparece solo para referencias/familias con validado > 0.
