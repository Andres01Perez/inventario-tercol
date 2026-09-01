# Corregir importación de maestra PT

## Diagnóstico (verificado)

Dos problemas reales:

1. **Estás subiendo el archivo en el lugar equivocado.** La pantalla `/superadmin/importar` (Importar Maestra) todavía tiene una tarjeta "PT" heredada del flujo viejo de MP/PP: su parser exige una columna `referencia` y escribiría en `inventory_master` (la maestra MP/PP), no en `pt_master`. El módulo PT nuevo tiene su propia pantalla `/pt/maestra` con el parser correcto, pero la tarjeta vieja sigue ahí y confunde.

2. **El archivo tiene encabezado desplazado.** El Excel del ERP trae filas de membrete antes de los datos:
   - Filas 1–7: `TERCOL SAS`, NIT, `SALDOS`, `PERIODO 8 DE 2026`, etc.
   - **Fila 8: `CODIGO | DESCRIPCION | CANT. | V.UNIT | V.TOTAL`** ← encabezados reales
   - Datos desde la fila 10 (`ACAMPANA12`, `ADAPTER34`, …)

   El parser nuevo (`ptMasterParser.ts`) asume encabezados en la fila 1, así que también fallaría con este archivo.

## Qué se va a hacer

### 1. Retirar la tarjeta PT del importador viejo
En `MasterDataImport.tsx` (página Importar Maestra): quitar la pestaña/tarjeta "Producto Terminado (PT)" y todo el manejo de archivo PT (`ptFile`, `ptResult`, conteo PT, validación combinada). En su lugar, la tarjeta PT muestra un botón "Ir a Maestra PT" que navega a `/pt/maestra`. MP y PP quedan intactos.

### 2. Parser PT con detección automática del encabezado
En `src/lib/ptMasterParser.ts`:
- Escanear las primeras ~15 filas de la hoja buscando la fila que contenga los encabezados normalizados `codigo` y `cant` (aceptando los alias ya definidos).
- Usar esa fila como encabezado y leer los datos desde la siguiente.
- Ignorar filas vacías intermedias (fila 9 del archivo está vacía).
- Se mantienen los alias actuales (`codigo/referencia/ref`, `cant/cantidad/saldo/…`), validación de duplicados y números es-CO.
- Si el archivo tuviera encabezados en la fila 1 (formato limpio), sigue funcionando igual.

### 3. Bonus: usar V.UNIT / V.TOTAL
El archivo trae también `V.UNIT` y `V.TOTAL` (valor unitario y total). Se dejan mapeadas como columnas opcionales reconocidas (sin error ni warning si vienen) pero **no se guardan** por ahora — `pt_master` no tiene campos de valor y el plan original no los pedía. Si luego quieres valorado de PT, se agrega en otra fase.

## Cómo usarlo después del cambio

1. Dashboard → Producto Terminado → **Maestra PT** (o directo en `/pt/maestra`).
2. Arrastrar `SALDO INVENTARIO 31 AGOSTO 2026-para inventarioPT.xls` tal cual viene del ERP, sin editarlo.
3. Vista previa → Importar. Reemplaza solo la maestra PT del inventario abierto.

## Detalles técnicos

- Sin migración: no hay cambios de base de datos.
- Archivos tocados: `src/components/superadmin/MasterDataImport.tsx`, `src/lib/ptMasterParser.ts`, y posiblemente `src/pages/superadmin/ImportarMaestra.tsx` si allí vive el conteo de la tarjeta PT.
- El mensaje de error "Columnas requeridas no encontradas: referencia" desaparece porque esa tarjeta vieja deja de existir.
