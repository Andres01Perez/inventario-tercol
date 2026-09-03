# Mostrar validaciones con cantidad 0 en Auditoría PT

## Qué pasa

PAU506G-EH sí está validada: la base de datos tiene una validación real con cantidad **0** en Piso 3, motivo `C1=C2`, ronda 1, contra un ERP de 1. ITM350NG se ve bien porque su cantidad validada es 276 (mayor que cero).

La tabla de Auditoría PT decide si hay validación preguntando "¿el total validado es mayor que 0?". Cuando la validación existe pero vale 0, la fila queda como si no estuviera validada: la columna **Válido** muestra `-` y **Desc. (und)** muestra `—`, aunque el estado sea Auditado.

Es solo un problema de visualización: el dato guardado es correcto (validado 0, descuadre −1 frente al ERP 1).

## Qué se corrige

- La referencia se considera validada cuando **existe** un registro de validación en alguna de sus ubicaciones, sin importar que la cantidad sea 0.
- Con eso, PAU506G-EH mostrará **Válido: 0** y **Desc. (und): −1** en rojo.
- Referencias sin ninguna validación seguirán mostrando `-` y `—`.
- El filtro de Descuadre (Con/Sin descuadre, faltantes, sobrantes, sin validar) queda coherente con este mismo criterio.

## Detalle técnico

- `src/components/superadmin/AuditoriaPtTable.tsx`: en `renderMainRow`, reemplazar `hasValidation = group.totalValidado > 0` por una comprobación de existencia (`group.rows.some(r => r.validatedQuantity !== null)`), preferiblemente calculada una sola vez al armar el grupo y expuesta como campo del grupo para reutilizarla en el filtro (línea 358) y en el render.
- `src/components/superadmin/AuditoriaPtKpiPanel.tsx`: `hasValidation = validado > 0` pasa a basarse en la existencia de validación, para que los KPI de descuadre en unidades incluyan estos casos.
- No se cambia la regla de ocultar el **Desc. ($)** cuando no hay costo/validación monetaria.
- Sin cambios en base de datos ni en la lógica de validación de rondas.
