# Importar maestras con costos (MP-4 / PP-3)

## Análisis de los archivos

Revisé los dos archivos con costos:

| Archivo | Filas | Encabezados |
|---|---|---|
| MP-4.xlsx | 780 | Referencia, Control, `CostoU`, `Cant.Alm`, Cant.PLd, Cant.PLr, Cant.ZA, Cant.ProvD, Cant.ProvR, Cant.T, `Costo.T` |
| PP-3.xlsx | 1.771 | Referencia, Control, MP, MO, Servicio, `Costo.U`, `Can.Alm`, Cant.PLd, Cant.PLr, Cant.ZA, `Cant.Prov`, `Cant.Total`, `Costo.T` |

## Conclusión: el mapeo actual ya cubre ambos archivos, no hay que cambiar nada

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

Es decir: los alias que agregamos en la corrección anterior (`costou`, `can.alm`, `cant.prov`, etc.) ya cubren exactamente estos formatos con costos. **Cero cambios de código.**

## Plan de acción

1. **Sin cambios al importador**: el mapeo actual reconoce el 100% de las columnas de ambos archivos, incluyendo `CostoU` (MP), `Costo.U` (PP) y `Costo.T` (ambos).
2. **Re-importar** con los archivos nuevos usando "Reemplazar MP" y "Reemplazar PP":
   - La vista previa de MP debe mostrar ACIDO NITRICO: almacén 75, Costo.U 3.120, Costo.T 234.000.
   - La vista previa de PP debe mostrar AESTRIADAT: almacén 18.397, planta 3.317,40, Costo.U 26,57, Costo.T 576.951,61.
   - No debe aparecer la advertencia "Columnas no reconocidas" en ninguno de los dos.
3. **Verificar en la base** después de importar: las 780 filas MP traen `costo_u_mp` y las 1.771 PP traen `costo_u_pp` distintos de nulo, y la Auditoría por bodega mostrará el descuadre en valor ($) con datos reales.

## Verificación

- Parseo de prueba de ambos archivos contra `masterDataParser` confirmando que todas las columnas cruzan (sin "Columnas no reconocidas").
- Consulta a la base post-importación: conteo de filas con `costo_u_mp`/`costo_u_pp` no nulos.
- Typecheck y build (sin cambios esperados).

## Notas técnicas

- Archivos: ninguno se modifica. Solo re-importación por la UI.
- Con `costo_u_mp`/`costo_u_pp` poblados, las columnas de descuadre en valor de la Fase 4 (Auditoría Almacén/Planta y exportación) pasan de vacías a valores reales sin tocar código.
- Ejemplo verificado de la fila AESTRIADAT en PP-3: Cant.PLr = 3.317,4 con formato español; `parseNumber` ya lo maneja.
