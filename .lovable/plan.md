# Corregir el mapeo de columnas de PP en la importación de maestra

## Qué encontré

Comparé los dos archivos que subiste y la base de datos. El problema es real y está identificado: **los encabezados de PP cambiaron de nombre y el importador no los reconoce**, así que guarda las 1.771 referencias pero con todas las cantidades vacías.

### Encabezados reales de los archivos

| Archivo | Encabezados |
|---|---|
| MP.xlsx (780 filas) | Referencia, Control, `Cant.Alm`, `Cant.PLd`, `Cant.PLr`, Cant.ZA, Cant.ProvD, Cant.ProvR, Cant.T |
| PP.xlsx (1.771 filas) | Referencia, Control, `C.Alm`, `C.PLd`, `C.PLr`, Cant.ZA, `Proveedor`, `C.Total` |

### Lo que el importador espera hoy para PP

| Columna en el Excel PP | Nombre que espera el importador | ¿Coincide? | Campo destino |
|---|---|---|---|
| C.Alm | `Cant.Alm` / `Can.Alm` | No | cant_alm_pp |
| C.PLd | `Cant.PLd` | No | cant_pld |
| C.PLr | `Cant.PLr` | No | cant_plr |
| Proveedor | `Cant.Prov` | No | cant_prov_pp |
| C.Total | `Cant.Total` | No | cant_total_pp |
| Cant.ZA | `Cant.ZA` | Sí | cant_za |
| Control | `Control` | Sí | control |

### Estado actual en la base (confirma el diagnóstico)

| Tipo | Referencias | Con Cant.Alm | Con Cant.PLd | Con Cant.PLr |
|---|---|---|---|---|
| MP | 780 | 780 | 780 | 780 |
| PP | 1.771 | **0** | **0** | **0** |

MP quedó bien; PP quedó con todas las cantidades en nulo. Con eso, cualquier referencia PP compararía contra un ERP de 0 tanto en almacén como en planta, lo que rompería toda la validación de la Fase 3.

## Cambios a realizar

### 1. Ampliar el mapeo de PP (`src/lib/masterDataParser.ts`)

Agregar los alias reales, conservando los antiguos para archivos viejos:

| Alias nuevo | Campo |
|---|---|
| `c.alm` | cant_alm_pp |
| `c.pld` | cant_pld |
| `c.plr` | cant_plr |
| `proveedor` | cant_prov_pp |
| `c.total` | cant_total_pp |

También se agregan alias equivalentes en MP (`c.alm`, `c.pld`, `c.plr`) por si el ERP exporta MP con la misma abreviatura en el futuro.

### 2. Aviso cuando una columna clave no se reconoce

Hoy el importador no dice nada si una columna no cruza: simplemente guarda nulos. Se agrega una advertencia visible en la vista previa del tipo:

> "Columnas no reconocidas y omitidas: C.Alm, C.PLd, C.PLr, Proveedor, C.Total"

y, si faltan las cantidades de almacén o planta, un aviso destacado de que ese archivo quedaría sin cantidades ERP. Así este error nunca vuelve a pasar en silencio.

### 3. Re-importar PP

Después del cambio hay que volver a usar "Reemplazar PP" con el mismo archivo. La vista previa debe mostrar cantidades distintas de cero (por ejemplo AESTRIADAT: almacén 18.397, planta 3.719,40, total 22.116,40).

## Verificación

- Parseo del PP.xlsx real en pruebas: comprobar que las 1.771 filas traen `cant_alm_pp`, `cant_pld`, `cant_plr` y `cant_total_pp`.
- Después de re-importar, consultar la base y confirmar que las 1.771 filas PP tienen cantidades y que el total ERP por bodega cuadra con el Excel.
- Typecheck y build.

## Notas técnicas

- Archivo único a modificar: `src/lib/masterDataParser.ts` (`PP_COLUMN_MAP`, `MP_COLUMN_MAP`, y el bloque de warnings en `parseExcelFile`).
- El separador decimal español (`18.397,00`) ya lo maneja bien `parseNumber`, no se toca.
- PT se deja como está; ese mapeo se hará más adelante.
- Nota aparte: los archivos de hoy no traen `Costo.U` ni `Costo.T`, así que los costos quedan en nulo. Eso no afecta el conteo, pero sí dejaría en cero cualquier descuadre en valor ($). Confirmar si esas columnas deben venir en el archivo.
