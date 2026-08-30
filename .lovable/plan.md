# Importar maestras con costos (MP-4 / PP-3) + silenciar columnas `__EMPTY`

## Análisis de los archivos

Revisé los dos archivos con costos:

| Archivo | Filas | Encabezados |
|---|---|---|
| MP-4.xlsx | 780 | Referencia, Control, `CostoU`, `Cant.Alm`, Cant.PLd, Cant.PLr, Cant.ZA, Cant.ProvD, Cant.ProvR, Cant.T, `Costo.T` |
| PP-3.xlsx | 1.771 | Referencia, Control, MP, MO, Servicio, `Costo.U`, `Can.Alm`, Cant.PLd, Cant.PLr, Cant.ZA, `Cant.Prov`, `Cant.Total`, `Costo.T` |

## Conclusión del mapeo: ya cubre ambos archivos

Columna por columna contra `src/lib/masterDataParser.ts`:

**MP-4**
| Encabezado | Normaliza a | Campo destino | Estado |
|---|---|---|---|
| CostoU | `costou` | costo_u_mp | ✔ ya soportado |
| Cant.Alm | `cant.alm` | cant_alm_mp | ✔ |
| Cant.PLd / Cant.PLr | `cant.pld` / `cant.plr` | cant_pld / cant_plr | ✔ |
| Cant.ZA | `cant.za` | cant_za | ✔ |
| Cant.ProvD / Cant.ProvR | `cant.provd` / `cant.provr` | cant_prov_d / cant_prov_r | ✔ |
| Cant.T | `cant.t` | cant_t_mp | ✔ |
| Costo.T | `costo.t` | costo_t | ✔ |

**PP-3**
| Encabezado | Normaliza a | Campo destino | Estado |
|---|---|---|---|
| MP / MO / Servicio | `mp` / `mo` / `servicio` | mp_costo / mo_costo / servicio | ✔ |
| Costo.U | `costo.u` | costo_u_pp | ✔ |
| Can.Alm | `can.alm` | cant_alm_pp | ✔ |
| Cant.PLd / Cant.PLr | `cant.pld` / `cant.plr` | cant_pld / cant_plr | ✔ |
| Cant.Prov | `cant.prov` | cant_prov_pp | ✔ |
| Cant.Total | `cant.total` | cant_total_pp | ✔ |
| Costo.T | `costo.t` | costo_t | ✔ |

Los alias de la corrección anterior (`costou`, `can.alm`, `cant.prov`, etc.) ya cubren estos formatos con costos. No hay que tocar el mapeo.

## Hallazgo nuevo: falsa advertencia `__EMPTY`

Al importar MP aparece: *"Columnas no reconocidas y omitidas: `__EMPTY`, `__EMPTY_1`"*. Esas no son columnas reales: el Excel tiene columnas vacías al final (sin encabezado) y SheetJS las nombra automáticamente `__EMPTY`, `__EMPTY_1`, etc. No contienen datos y no afectan la importación, pero la advertencia asusta y ensucia el aviso diseñado para detectar errores de encabezados reales.

## Plan de acción

1. **Filtrar columnas vacías en el aviso** (`src/lib/masterDataParser.ts`): excluir del listado de "columnas no reconocidas" cualquier columna cuyo nombre empiece por `__EMPTY`. El resto de la advertencia se conserva intacta para columnas con nombre real.
2. **Re-importar** con los archivos nuevos usando "Reemplazar MP" y "Reemplazar PP":
   - MP debe mostrar ACIDO NITRICO: almacén 75, Costo.U 3.120, Costo.T 234.000, **sin** la advertencia de `__EMPTY`.
   - PP debe mostrar AESTRIADAT: almacén 18.397, planta 3.317,40, Costo.U 26,57, Costo.T 576.951,61.
3. **Verificar en la base** después de importar: las 780 filas MP traen `costo_u_mp` y las 1.771 PP traen `costo_u_pp` distintos de nulo, y la Auditoría por bodega mostrará el descuadre en valor ($) con datos reales.

## Verificación

- Parseo de prueba de ambos archivos contra `masterDataParser`: todas las columnas con nombre cruzan y la advertencia de `__EMPTY` ya no aparece.
- Consulta a la base post-importación: conteo de filas con `costo_u_mp`/`costo_u_pp` no nulos.
- Typecheck y build.

## Notas técnicas

- Archivo a modificar: `src/lib/masterDataParser.ts` (solo el filtro del warning; ningún cambio de mapeo).
- Con `costo_u_mp`/`costo_u_pp` poblados, las columnas de descuadre en valor de la Fase 4 (Auditoría Almacén/Planta y exportación) pasan de vacías a valores reales sin tocar código.
- Ejemplo verificado de la fila AESTRIADAT en PP-3: Cant.PLr = 3.317,4 con formato español; `parseNumber` ya lo maneja.
