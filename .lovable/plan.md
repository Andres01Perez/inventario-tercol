# Por qué el dashboard muestra "Pendiente 2.545 · 100%" y cómo organizarlo

## Qué está pasando (verificado en la base)

En el inventario abierto hay **2.545 ubicaciones de almacén** (775 MP + 1.770 PP), y hoy existen **171 conteos, todos de C1**, sin ninguna validación registrada (`validated_counts` = 0).

Los dos bloques del screenshot no miden conteos: miden el **estado del bloque de bodega de cada referencia** (`status_alm`) y su **ronda vigente** (`audit_round_alm`). Esos dos campos solo cambian cuando el motor de validación cierra o escala el bloque, y el bloque de ronda 1 solo se evalúa cuando **todas** las ubicaciones de esa referencia en esa bodega tienen C1 **y** C2. Como todavía no hay ningún C2, ninguna referencia ha sido evaluada: las 2.545 siguen en `pendiente` y en `C1`. Es correcto según la lógica actual, pero visualmente parece "no hay nada contado", que es justo lo que se ve mal.

El avance real de conteo sí existe (171 ubicaciones con C1), pero está escondido en una sola tarjeta y no se refleja en estos dos bloques.

## Qué se va a cambiar (solo presentación del dashboard)

### 1. "Por estado" deja de ser una sola barra amarilla

Se abre el estado `pendiente` en sub-estados según el avance de conteo real de sus ubicaciones en esa bodega:

```text
Por estado
+---------------------------+-------+------+
| Auditado                  |     0 |   0% |
| En conflicto              |     0 |   0% |
| Crítico                   |     0 |   0% |
| Pendiente — en progreso   |   169 |   7% |   (tiene algún conteo, le falta al menos uno)
| Pendiente — sin iniciar   | 2.376 |  93% |   (ninguna ubicación con conteo)
+---------------------------+-------+------+
```

Una referencia queda "en progreso" cuando al menos una de sus ubicaciones de esa bodega ya tiene conteo en la ronda vigente, y "sin iniciar" cuando ninguna lo tiene.

### 2. "Por ronda vigente" muestra el avance dentro de la ronda

Cada fila de ronda deja de ser una barra plana y pasa a mostrar cuánto se ha contado de lo que esa ronda exige:

```text
Por ronda vigente
+-------+---------+---------------------------------+
| Ronda | Refs    | Avance de conteos de la ronda   |
+-------+---------+---------------------------------+
| C1    |  2.545  | 171 / 5.090 conteos  (3%)       |
| C3    |      0  | -                               |
| C4    |      0  | -                               |
| C5    |      0  | -                               |
+-------+---------+---------------------------------+
```

Importante: en ronda 1 cada ubicación requiere **dos** conteos (C1 y C2), así que el denominador de la ronda 1 es `ubicaciones activas × 2`. En C3, C4 y C5 es un conteo por ubicación. Hoy la tarjeta de avance cuenta solo C1 y por eso el porcentaje se lee inflado frente a lo que realmente falta.

### 3. Tarjeta de avance coherente y desglose C1 / C2

La tarjeta "Avance de conteo" pasa a usar el mismo denominador (conteos requeridos, no ubicaciones) y muestra debajo, en texto pequeño, `C1 171/2.545 · C2 0/2.545`, para que se vea de inmediato que lo que bloquea el cierre es C2.

### 4. Nota explicativa

Bajo los dos bloques, una línea corta: "Una referencia solo cambia de estado y de ronda cuando todas sus ubicaciones de la bodega completan los conteos de la ronda (C1 y C2 en la ronda 1)". Así el 100% en Pendiente deja de leerse como error.

## Notas técnicas

- Cambios solo en `src/components/superadmin/AuditoriaKpiPanel.tsx`; no se toca la base de datos ni el motor de validación.
- Ya se traen `inventory_counts` por ubicación y ronda; se agregan al agregado por referencia dos contadores (`conteosHechos`, `conteosRequeridos`) y una marca `enProgreso`.
- El denominador por ronda usa las ubicaciones activas (`activo <> false`) y no cerradas, igual que hoy, multiplicado por 2 cuando la ronda vigente es 1.
- Las ubicaciones descubiertas en C2 (`discovered_at_round = 2`) requieren un solo conteo en la ronda 1; se contemplan en el cálculo para no inflar el denominador.
- Se mantienen los colores y badges de estado existentes; los dos sub-estados de "pendiente" usan el mismo amarillo en dos intensidades.

## Verificación

- Con los datos actuales: `Pendiente — en progreso` debe dar el número de referencias de almacén con al menos un C1 (hoy ~169) y el avance de la ronda 1 debe leer `171 / 5.090`.
- Guardar un conteo nuevo mueve una referencia de "sin iniciar" a "en progreso" sin recargar.
- Typecheck y build.
