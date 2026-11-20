# Significado de los estados en Auditoría (Planta / Almacén)

Este documento solo explica; no propone cambios en la aplicación.

Cada referencia se audita **por separado en cada bodega** (Planta con Planta, Almacén con Almacén). Para PP, la bodega la define la columna Controlado (no controlado = Planta, controlado = Almacén).

## Pendiente
Todavía no se puede validar la referencia. Pasa cuando:
- Falta contar alguna de sus ubicaciones en la ronda actual (deben contarse **todas** las ubicaciones antes de comparar).
- Solo tiene C1 y falta C2.
- Aún no tiene ningún conteo.

## Auditado
La referencia ya quedó validada y tiene "Cantidad a montar". Se valida sola al guardar un conteo cuando:
- C1 coincide con el ERP, o
- dos conteos coinciden entre sí (C1 = C2, C2 = C3, etc.), aunque no coincidan con el ERP. En ese caso queda auditado con descuadre (+ verde o − rojo).
- También queda así cuando un superadmin la valida manualmente (motivo "manual_edit").

## Conflicto
Se contó C1 y C2 (o C3), pero **no coinciden entre sí ni con el ERP**. La referencia pasa a la siguiente ronda (C3, luego C4) y hay que volver a contar. Algunas también quedaron aquí tras correcciones manuales y solo requieren usar **Re-validar**.

## Crítico
Se llegó a C4 y tampoco hubo coincidencia (ni con otro conteo ni con el ERP). Requiere decisión del superadmin: editar conteos, Re-validar o hacer un cierre forzado.

## Cerrado forzado
Un superadmin cerró la referencia manualmente con motivo obligatorio (por ejemplo "cierre forzado superadmin"). Se toma como cantidad a montar el conteo elegido (el más cercano al ERP o el más reciente).

## N/A
La referencia **no aplica a esta bodega**: no tiene ERP ni ubicaciones en ella. Ejemplo: una PP controlada aparece N/A en Planta porque se audita en Almacén. No requiere acción.

## Resumen del flujo
```text
Sin conteos / incompleto -> Pendiente
C1 = ERP o C1 = C2        -> Auditado
No coinciden              -> Conflicto (C3, C4)
C4 sin coincidencia       -> Crítico -> Cerrado forzado
No pertenece a la bodega  -> N/A
```
