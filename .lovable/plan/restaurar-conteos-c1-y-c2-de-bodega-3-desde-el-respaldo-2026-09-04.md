# Restaurar conteos C1 y C2 de Bodega 3 desde el respaldo

Cargar en la base los conteos 1 y 2 del archivo `backup_bodega3_2026-09-04.xlsx` (hoja **Conteos**, 195 filas), atribuidos al usuario **bodega3@tercol.com.co**, sin volver a digitar nada a mano.

## Situación actual verificada

- El inventario activo es "Semestral 2026-1".
- Hoy existen 180 ubicaciones en Bodega 3 (173 creadas en la reimportación de hoy); solo 67 tienen algún conteo.
- El respaldo trae 102 referencias / 110 combinaciones referencia+punto con conteos.
- De esas 110 combinaciones, solo 41 coinciden hoy con una ubicación de Bodega 3: la reimportación cambió puntos de referencia (ej. TS70 estaba en AD y hoy está en AF) y 46 referencias del respaldo ya no están en Bodega 3 (ej. BN30, CAJA4, TCHCA40).

## Reglas de carga acordadas

1. **Referencia ya existe en Bodega 3 con otro punto** → el conteo se carga en la ubicación actual (no se crean duplicados).
2. **Referencia sin ubicación en Bodega 3** → se recrea la ubicación con los datos del respaldo (punto de referencia, subcategoría, observaciones, método de conteo, activo/terminado), bodega Planta, y se le cargan sus conteos.
3. **Filas duplicadas para el mismo punto** (LCT2010 449/496, LCT4020 35/40, TSCA30 12/4, T-CT1515 57/394) → se conserva la de fecha más reciente.
4. **Validaciones**: no se reinsertan. El propio flujo compara C1 vs C2 y decide auditado o conflicto.
5. Todos los conteos quedan con `supervisor_id` = bodega3@tercol.com.co y las ubicaciones recreadas quedan asignadas a ese mismo líder.
6. Solo se insertan conteos que hoy no existan; si una ubicación ya tiene C1 o C2 registrado, ese valor no se sobrescribe (se reporta en el resumen).

## Detalles técnicos

- Se genera un script SQL (migración de datos) con los pares ubicación/ronda/cantidad resueltos desde el Excel, resolviendo el `location_id` por referencia + Bodega 3 y creando las ubicaciones faltantes con `assigned_admin_id` de Planta (`get_bodega_admin('planta')`) y `assigned_supervisor_id` del perfil bodega3.
- Los conteos se insertan con `INSERT ... ON CONFLICT (location_id, audit_round) DO NOTHING` para respetar la unicidad ya existente y no pisar datos actuales.
- 31 de las referencias afectadas tienen su bloque de Planta ya cerrado (`auditado`) o en `conflicto` (ej. BN42-CMB, TS70G, TSTBEG en ronda 3). Para poder cargar C1/C2 en ellas se ejecuta primero `reopen_reference(..., 'planta', 'Restauración de conteos Bodega 3', <superadmin>)`, que borra únicamente el resultado validado, no los conteos parciales de otras ubicaciones.
- Después de insertar se ejecuta `revalidate_reference` sobre las referencias tocadas, para que cada bloque de Planta quede en el estado correcto (auditado si C1=C2, o pase a conteo 3).

## Entregable

Un resumen con: conteos insertados, ubicaciones recreadas, conteos omitidos por ya existir, referencias que quedaron auditadas y las que pasan a conteo 3.
