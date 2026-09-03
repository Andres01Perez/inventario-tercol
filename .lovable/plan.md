# Revisión: por qué 20 referencias de almacén quedaron en Conteo 3

## Diagnóstico (verificado con datos reales)

La validación **no** está fallando. Las referencias con C1=0 y C2=0 sí cerraron:

- 1.920 referencias con ambos conteos en cero quedaron **auditadas en ronda 1**.
- Total almacén hoy: 2.439 auditadas en C1, 66 auditadas en C3, 11 en C4, 20 en conflicto, 6 n/a, 6 críticas, 3 cerradas forzadas.

Las 20 en conflicto no son casos de "cero contra cero". Son dos situaciones distintas:

**A. 15 referencias que ya tenían Conteo 1 real y sólo les faltaba el Conteo 2.**
La siembra completó el C2 faltante con 0, y 0 no coincide con el C1 existente, así que la referencia pasó a C3. Ejemplos: `CamisaZ-Tooling1/2tipoA.` (C1=1, C2=0), `PI-KOD` (C1=4, C2=0), `SP-KOD-PU` (C1=6, C2=0), `SQ-15-56M-MA` (C1=1, C2=0).

**B. 5 referencias con varias ubicaciones**, donde una ubicación tenía conteo real y otra recibió el cero.
La suma de C1 no coincide con la suma de C2. Ejemplos: `BN08-75P` (C1 total 109 vs C2 total 0), `CN08-75PG` (57 vs 0), `DFGA70` (3 vs 0), `CNCA90` (1 vs 0), `DF18R-125-CMB` (C1 18 vs C2 18 pero con ubicaciones desalineadas).

Causa raíz: la instrucción fue "almacén ya no tiene nada en conteo 1, 2, 3 ni 4", pero en G1 y en Sin Zona Asignada sí había 169 ubicaciones con C1 previo y algunas ubicaciones con conteo parcial. La siembra respetó lo existente (no sobrescribió) y por eso quedó C1 real + C2 en cero.

## Qué se puede hacer (elegir una opción)

### Opción 1 — Alinear el C2 al C1 existente y revalidar
Para esas 20 referencias, reemplazar el C2 sembrado en cero por el valor del C1 de la misma ubicación, borrar los conteos C3/C4 si los hubiera, y ejecutar `revalidate_reference`. Resultado: quedan auditadas en C1 con la cantidad física realmente contada.

### Opción 2 — Poner también el C1 en cero y revalidar
Sobrescribir C1=0 en las ubicaciones de almacén de G1 / Sin Zona que tenían conteo previo, dejando todo el bloque en 0/0. Resultado: 20 referencias más auditadas en cero, pero se pierde el conteo físico que ya existía.

### Opción 3 — Dejarlas en conflicto
No tocar nada; esas 20 se ajustan a mano desde Auditoría Almacén (editar conteo o cierre forzado) y el resto ya está listo para exportar.

## Detalles técnicos

- La corrección previa de `validate_bucket` (permitir coincidencia en cero aunque el ERP sea positivo) está activa y funcionando: es lo que cerró las 1.920 referencias en cero.
- Cualquier cambio se haría con `UPDATE`/`INSERT` sobre `inventory_counts` respetando la unicidad `(location_id, audit_round)`, seguido de `revalidate_reference(inventory_id, referencia, 'almacen', user_id)` referencia por referencia.
- No se tocan Planta ni PT.

## Recomendación

Opción 1: conserva el conteo físico real, elimina los 20 conflictos y deja el export de almacén completo.
