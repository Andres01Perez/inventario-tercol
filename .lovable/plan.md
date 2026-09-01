# Importación maestra PT: leer la hoja correcta y mostrar diagnóstico

## Diagnóstico (verificado sobre el archivo que subiste)

El archivo tiene **dos hojas**:

| Hoja | Filas | Contenido |
|---|---|---|
| `HgiNet` (primera) | 330 | Reporte del ERP con membrete; encabezados en la fila 8; **319 referencias** (solo las que tienen saldo) y una fila final `TOTALES` |
| `Hoja1` (segunda) | 416 | Tabla limpia: `CODIGO / DESCRIPCION / CANT.` en la fila 1 y **415 referencias**, incluidas 96 con cantidad 0 |

El parser actual solo lee `workbook.SheetNames[0]`, es decir `HgiNet`. Por eso muestra 319: está leyendo bien, pero la hoja equivocada.

Además, en `Hoja1` hay **una referencia duplicada**: `CE20-20-10EX` aparece en la fila 29 (cant. 14) y en la fila 376 (cant. 0). Con la lógica actual, un duplicado genera un **error bloqueante** y la importación no se podría completar.

## Qué se va a hacer

### 1. Elegir la hoja correcta automáticamente
En `src/lib/ptMasterParser.ts`: en lugar de usar solo la primera hoja, recorrer **todas** las hojas, detectar en cada una la fila de encabezado (`CODIGO` + `CANT.`, escaneo actual de las primeras filas) y quedarse con la hoja que produzca **más filas de datos válidas**. Con este archivo eso selecciona `Hoja1` (415) sobre `HgiNet` (319). Archivos de una sola hoja siguen funcionando igual.

### 2. Ignorar filas de totales / pie de reporte
Descartar filas cuyo código sea `TOTALES`, `TOTAL` o similar, y las filas sin código (ya se omiten).

### 3. Duplicados: advertencia en vez de error
- Si la referencia repetida tiene la **misma cantidad o cantidad 0**, se conserva la fila con cantidad mayor y se emite una **advertencia** (no bloquea).
- Si las cantidades difieren y ambas son distintas de 0, se mantiene como **error** (requiere decisión humana).
- En este archivo, `CE20-20-10EX` queda con 14 y una advertencia.

### 4. Diagnóstico visible en la vista previa
En `PtMasterImport.tsx`, añadir un bloque de diagnóstico antes de importar:

```text
Hoja leída: Hoja1 (de 2 hojas)     Encabezado detectado: fila 1
Filas leídas: 415   ·   Importables: 414   ·   Omitidas: 1
  · 1 duplicado consolidado (CE20-20-10EX)
  · 96 referencias con cantidad 0 (se importan)
```

El parser devolverá estos datos (`sheetName`, `sheetCount`, `headerRow`, `totalRows`, `skippedRows`, `zeroQty`, `duplicates`) para renderizarlos.

## Detalles técnicos

- Archivos tocados: `src/lib/ptMasterParser.ts` (selección de hoja, filtro de totales, duplicados, metadatos) y `src/components/pt/PtMasterImport.tsx` (panel de diagnóstico).
- Sin cambios de base de datos ni migraciones.
- Resultado esperado con tu archivo: **414 referencias importadas**, 1 advertencia de duplicado.
