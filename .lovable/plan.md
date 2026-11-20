# Quitar los estados "Crítico" y "N/A"

## Qué encontré (datos actuales)

**Crítico** hoy se asigna por dos motivos distintos:
1. **Hay ERP en la bodega pero no hay ninguna ubicación para contar.** Es la mayoría: 57 referencias de Materia Prima salen "Crítico" en Planta (ERP Planta > 0) aunque ya están auditadas en Almacén y no tienen ubicaciones en Planta. Por eso parece que "C1 = C2 y aun así sale Crítico": esos conteos son de Almacén, no de Planta.
2. **Se llegó a C4 sin coincidencia.** Solo unas 8 referencias (6 en Almacén, 2 en Planta).

Totales: Planta 60, Almacén 6 (+ 3 en ambas). PT: ninguna.

**N/A** = la referencia no tiene ERP ni ubicaciones en esa bodega (Planta 1.169, Almacén 1.104). No hay nada que auditar ahí.

## Qué propongo

**N/A desaparece de la vista**
- Esas referencias dejan de mostrarse en la auditoría de esa bodega (no pertenecen a ella). Se quita "N/A" del filtro y de los indicadores.
- En la base se siguen marcando internamente para no contarlas, pero nunca se ven.

**Crítico se elimina y se reemplaza por cierre automático**
- Caso 1 (ERP sin ubicaciones): la referencia queda **Auditado** con cantidad a montar **0** y motivo "Sin ubicaciones en bodega". El descuadre se ve en rojo (−ERP) para que se pueda revisar.
- Caso 2 (C4 sin coincidencia): al guardar el C4 la referencia queda **Auditado** con el conteo más cercano al ERP (mismo criterio usado en el cierre de pendientes) y motivo "Cierre automático C4".
- Se aplica a lo que ya existe y a lo que pase en adelante (Planta, Almacén y PT).
- Antes de tocar datos: respaldo en Excel de las referencias afectadas.

Estados finales: **Pendiente, Auditado, Conflicto, Cerrado forzado.**

## Detalle técnico
- Migración: en `validate_bucket`, cuando no hay ubicaciones y ERP>0 → `auditado` + insertar validación 0 con motivo; cuando `v_new_round = 5` → elegir conteo C1–C4 más cercano al ERP, `upsert_validated_count`, estado `auditado`. Igual en `pt_validate_and_close_round`. `n/a` se conserva como valor interno.
- Datos: recalcular las ~69 referencias hoy en `critico` con la nueva lógica.
- UI: quitar opciones `critico` y `n/a` de los filtros en `AuditoriaBodegaTable`, `AuditoriaPtTable` y los paneles KPI; excluir filas `n/a` de las consultas y de la exportación.
