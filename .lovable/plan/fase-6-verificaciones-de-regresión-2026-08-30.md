# Fase 6 — Verificaciones de regresión

Objetivo: comprobar, con evidencia reproducible, que el flujo de conteo y las exportaciones funcionan correctamente después de las fases 1–5. No es una fase de rediseño: se construye un banco de pruebas, se ejecuta y solo se corrigen los defectos que aparezcan.

## Punto de partida (verificado hoy)

- El inventario activo `Semestral 2026-1` tiene 2.551 referencias, **0 ubicaciones, 0 conteos y 0 validaciones**. Hoy no es posible verificar nada de C1–C4 ni de exportaciones con datos reales.
- Realtime está habilitado para `inventory_master`, `locations` e `inventory_counts`.
- La vista de conteo ya se suscribe a `postgres_changes` sobre `inventory_counts` y filtra por ronda.
- `validate_bucket` avanza rondas con la secuencia 1 → 3 → 4 → 5 (nunca salta a 4 desde 1) y persiste en `validated_counts`.

## Qué se hará

### 1. Inventario de pruebas aislado

Crear un inventario aparte llamado `QA Regresión Fase 6` (no toca el inventario real) con un set pequeño y controlado de referencias y ubicaciones que cubra los casos:

| Caso | Referencia | Bodega(s) | Situación esperada |
|---|---|---|---|
| A | QA-OK-ALM | Almacén (2 ubic.) | C1=C2 → cierra en ronda 1 |
| B | QA-ERP-PL | Planta (1 ubic.) | C1=ERP (PLd+PLr) → cierra en ronda 1 |
| C | QA-DESC-ALM | Almacén (2 ubic.) | C1≠C2 → pasa a C3; C3≠C1/C2 → pasa a C4; nunca a C4 directo |
| D | QA-MIXTA | Almacén (2) + Planta (2) | Almacén cierra en ronda 1, Planta sigue a C3 de forma independiente |
| E | QA-C5 | Planta (1 ubic.) | C4 sin match → escala a C5 (crítico) |
| F | QA-VOLUMEN | Almacén | ~1.300 ubicaciones sintéticas para probar el tope de 1.000 filas |

El seed se hará con SQL de prueba (no migración de esquema) y quedará documentado para poder repetirlo o borrarlo.

### 2. Verificación C1–C4 (desaparición en tiempo real)

- Con Playwright, abrir la vista de conteo del supervisor asignado, guardar un conteo y confirmar que la fila desaparece sin recargar.
- Repetir en C2, C3 y C4.
- Comprobar que una referencia que ya cerró (auditado) no reaparece al cambiar de ronda.
- Registrar evidencia (capturas + consola).

### 3. Verificación de avance de rondas

Ejecutar la secuencia completa del caso C y D consultando la base después de cada paso:
- tras C1/C2 sin match: `audit_round_alm = 3`, estado `conflicto`;
- tras C3 sin match: `audit_round_alm = 4`;
- tras C4 sin match: ronda 5 y estado `critico`;
- verificar que **no** existe ningún salto 1 → 4 y que el bloque que sí cuadró queda en `auditado` sin volver a pedir conteos.

### 4. Verificación de exportaciones

- Exportar “Por total validado” y “Por ubicación” del inventario QA y comparar contra las cifras calculadas directamente en base de datos (`validated_counts` y `inventory_counts`): cantidades, motivos, número de filas.
- Repetir con el caso F (~1.300 ubicaciones) para confirmar que el archivo trae todas las filas y no 1.000.

### 5. Auditoría de topes de 1.000 filas

Revisar todas las consultas que alimentan exportaciones y listados grandes y confirmar que paginan con `.range()` en bucle o usan `count: 'exact'`:
`useExportToExcel.ts`, `ExportarConteos.tsx`, `AuditoriaBodegaTable.tsx`, `GroupedTranscriptionTab.tsx`, `AuditoriaAlmacen/Planta`, `InventarioMP/PP`, `GestionUbicacion`, `GestionResponsables`, `AddLocationDialog`, `LocationsImport`.
Cualquier consulta sin paginación se corrige con el mismo patrón de lotes ya usado en el proyecto.

### 6. Limpieza y reporte

- Eliminar el inventario `QA Regresión Fase 6` al terminar (o dejarlo cerrado, según prefieras).
- Entregar un reporte corto con: caso, resultado (OK / corregido / pendiente) y evidencia.

## Detalles técnicos

- El seed usa `inventories`, `inventory_master`, `locations` (con `assigned_admin_id` de `admin_mp`/`admin_pp` para definir bodega) e `inventory_counts`; la validación se dispara con `validate_and_close_round`.
- Las verificaciones de números se hacen con SQL de solo lectura, comparando contra lo exportado.
- Las pruebas de UI usan la sesión inyectada por el preview; si no hay sesión disponible, se verifica la lógica por SQL y se te pide validar la parte visual.
- Correcciones esperadas: únicamente paginación faltante o filtros de realtime; no se prevé cambio de esquema.
