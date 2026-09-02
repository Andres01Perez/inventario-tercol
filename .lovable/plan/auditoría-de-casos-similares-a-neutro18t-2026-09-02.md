# Auditoría de casos similares a NEUTRO18T

## Resultado del análisis

Revisé todos los bloques abiertos (almacén y planta) contra sus conteos reales y contra las validaciones guardadas.

**Buena noticia:** ya no queda ningún caso igual al de NEUTRO18T. Después de la limpieza no hay conteos duplicados (0 grupos), y no existe ninguna referencia en "Conflicto" cuyo C1 y C2 realmente coincidan. Todas las referencias que hoy están en C3 están ahí porque sus dos conteos genuinamente no coinciden (por ejemplo T3162CM: 60.975 vs 38.326).

Sí aparecieron **tres grupos pequeños** que conviene que audites tú directamente.

## Lista para auditar manualmente

### Grupo 1 — Cerradas y luego se volvió a contar (2 referencias)
El bloque se cerró y después alguien digitó otro valor en la misma ubicación. La validación guardada no considera ese último dato.

| Referencia | Bodega | Validado | Conteo posterior | Qué revisar |
|---|---|---|---|---|
| TIERRA6RT | Almacén | 440 (C1=C2) | 46 en C2 | Confirmar físicamente si son 440 o 46 |
| TE0675P-COVER | Almacén | 0 (C1=C2) | reconteo en cero | Solo confirmar que sí es cero |

### Grupo 2 — C1 = C2 pero el bloque no cerró (7 bloques)
Tienen los dos conteos iguales y siguen en "Pendiente". Hay que revisar por qué no cerraron (falta un conteo en otra ubicación del mismo bloque, o la ubicación no tiene responsable de bodega asignado).

| Referencia | Bodega | C1 = C2 | Causa probable |
|---|---|---|---|
| RESORTE | Almacén | 22.637 | tiene una ubicación sin responsable asignado |
| NEUTRO4 | Planta | 234 | 2 ubicaciones, solo 1 con C1 y C2 |
| NEUTRO12RALE | Almacén | 0 | revisar cierre |
| NEUTRO30RALE | Almacén | 0 | revisar cierre |
| PPESPLG24.v2 | Almacén | 0 | revisar cierre |
| PPESPLG30.v2 | Almacén | 0 | revisar cierre |
| PPESPLG42.v2 | Almacén | 0 | revisar cierre |

### Grupo 3 — Ubicaciones sin responsable de bodega (2 ubicaciones, 2 referencias)
Al no tener responsable asignado, el sistema no sabe si son de Almacén o de Planta, así que sus conteos no entran en ninguna comparación. Una de ellas ya tiene un conteo digitado que hoy no se está tomando en cuenta (pertenece a RESORTE).

## Acciones propuestas

1. Entregarte estas tres listas (ya están arriba) para tu revisión física.
2. Corregir los datos de las ubicaciones sin responsable: asignarles Almacén o Planta para que sus conteos entren en la comparación.
3. Una vez me confirmes los valores correctos de TIERRA6RT (440 o 46) y las 7 referencias del Grupo 2, reabrir y revalidar esos bloques para que queden con el número real.
4. Agregar una protección: cuando un bloque ya está cerrado/auditado, no permitir que se guarden nuevos conteos en sus ubicaciones (hoy sí se puede, y eso genera casos como TIERRA6RT). En lugar de guardar en silencio, mostrar un aviso de que la referencia ya está validada.

## Detalle técnico

- Verificación de duplicados: `inventory_counts` agrupado por `(location_id, audit_round)` → 0 grupos con más de una fila; la restricción única ya está activa.
- Grupo 1: filas de `validated_counts` donde existe un `inventory_counts.created_at` posterior al `created_at` de la validación.
- Grupo 2: bloques con `status_alm/status_pl` distinto de `auditado` cuya suma de C1 y C2 por bodega es idéntica.
- Bodega se resuelve por el rol (`admin_mp` → Almacén, `admin_pp` → Planta) del `assigned_admin_id` de la ubicación; `NULL` deja la ubicación fuera de ambos buckets.
- La protección del punto 4 se implementaría como validación en el guardado (transcripción, alta de ubicación y edición desde auditoría) más un trigger de respaldo en `inventory_counts`.
