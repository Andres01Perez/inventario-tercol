# Dos ajustes: 20 referencias a crítico + mensaje de validación con bodega equivocada

## 1. Las 20 referencias en conflicto pasan a crítico

Ya está diagnosticado: no hubo error de validación. Esas 20 tenían un Conteo 1 real y la siembra les completó el Conteo 2 faltante con 0, así que 0 no coincidió con el C1 y avanzaron a Conteo 3 (15 casos de una sola ubicación, 5 casos multi-ubicación como `BN08-75PG`, `CN08-75PG`, `DFGA70`, `CNCA90`, `DF18R-125-CMB`).

Acción: marcar esas 20 referencias del bloque **Almacén** como `critico` en ronda 5, sin borrar ni alterar sus conteos, para que salgan de la lista de conteo pendiente y se resuelvan manualmente desde Auditoría Almacén / Críticos. No se toca Planta ni PT.

## 2. Por qué al guardar Conteo 1 en Planta salía "Pasó a Conteo 3 (Almacén)"

**La validación no está trocada.** Cada bloque se compara contra su propio ERP: Almacén contra `Cant.Alm`, Planta contra `Cant.PLd + Cant.PLr`. El problema es solo el **aviso en pantalla**.

Al guardar cualquier conteo, la pantalla llama a `validate_and_close_round`, que evalúa la referencia completa y devuelve el resultado de los dos bloques. La vista de conteo muestra un toast por cada bloque devuelto, sin importar en cuál estaba trabajando el usuario.

En `CN08-75PG` el bloque de Almacén ya venía descuadrado por su cuenta (C1 sumaba 57 y C2 sumaba 0), así que al guardar el Conteo 1 de Planta el RPC reportó, correctamente, que Almacén pasaba a Conteo 3 — pero el mensaje apareció justo después de teclear en Planta y se leyó como si Planta hubiera avanzado.

### Corrección

En la vista de conteo (`GroupedTranscriptionTab.tsx`), notificar únicamente el bloque de la ubicación que se acaba de guardar:

- La fila guardada ya trae su `bodega` (la vista `locations_bodega_view` la expone).
- `runValidation` recibirá esa bodega y mostrará solo `res.almacen` o solo `res.planta`.
- El resultado del otro bloque se sigue aplicando en la base de datos (el RPC no cambia), simplemente no genera un toast que confunda.
- El texto del toast pasa a ser explícito: `⚠️ CN08-75PG (Planta) - Pasó a Conteo 3`, y si el bloque cierra, `✅ ... (Planta) - AUDITADO`.

## Detalles técnicos

- SQL de datos (no migración de esquema): `UPDATE inventory_master SET status_alm='critico', audit_round_alm=5` para las 20 referencias con `status_alm='conflicto'` del inventario activo, más entrada en `audit_logs`.
- Frontend: `src/components/supervisor/GroupedTranscriptionTab.tsx` — la mutación de guardado devuelve también `bodega` junto a `masterReference`; `runValidation(masterReference, bodega)` filtra qué bucket notifica. Sin cambios en RPC, triggers ni en la lógica de comparación.
- No se modifica `PtTranscriptionTab.tsx` (PT tiene un solo bloque y no presenta este problema).

## Verificación

- Consulta de control: 0 referencias de almacén en `conflicto`; las 20 quedan en `critico`.
- Guardar un conteo de una ubicación de planta muestra un único toast, siempre etiquetado "(Planta)".
- Typecheck y build.
