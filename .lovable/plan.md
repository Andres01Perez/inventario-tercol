# Verificación pre-inicio del conteo PT

## Estado real verificado en la base de datos

| Elemento | Estado |
|---|---|
| Maestra PT | 414 referencias cargadas |
| Ubicaciones PT activas | 381, en 5 pisos |
| Ubicaciones sin supervisor | 0 (todas asignadas vía pisos) |
| Ubicaciones huérfanas (referencia no existe en maestra) | 0 |
| Conteos registrados | 0 (limpio para empezar) |
| Función de validación `pt_validate_and_close_round` | Creada y operativa |
| Trigger que marca ubicación como "contado" al guardar | Activo |
| Trigger que propaga supervisor de piso a ubicaciones | Activo |
| Realtime en `pt_counts` (para que la fila desaparezca en todos los dispositivos) | Habilitado |

## Conclusión: sí, puedes iniciar el conteo

No falta nada. El flujo funciona así:

1. Cada supervisor de piso entra a Gestión Operativa → bloque Producto Terminado → Conteo 1.
2. Ve solo sus pisos, escribe la cantidad (puede usar la calculadora: cajas × U.E. + sueltas) y guarda.
3. Conteo 2 lo hace el segundo turno sobre las mismas ubicaciones.
4. Solo cuando TODAS las ubicaciones de una referencia tienen C1 y C2, la validación automática compara: C1=C2, C1=ERP o C2=ERP → se cierra; si nada coincide → pasa a Conteo 3.
5. C3 igual: si coincide con C1, C2 o ERP cierra; si no, pasa a C4 (final). Si C4 tampoco coincide → la referencia queda en estado crítico para superadmin.
6. Todo queda persistido en `pt_validated_counts` (cantidad, ronda, motivo) para exportaciones y auditoría.

## Dos datos a tener en cuenta (no son bloqueo)

- Hay 95 referencias con `cant_erp = 0`. Es válido: si además no tienen ubicaciones quedan como n/a automáticamente; si tienen ubicaciones, se cuentan normal.
- Las rondas C3 y C4 solo aparecen para referencias que no cerraron en C1/C2 o C3; no se puede saltar una ronda.

## Recomendación de arranque

Empezar con 1–2 ubicaciones de prueba real en un piso: guardar C1, verificar que la fila desaparece de la lista y que en otro dispositivo también desaparece (realtime), y luego C2 con el mismo valor para ver el cierre automático "AUDITADO". Si ese ensayo funciona, soltar el conteo completo.
