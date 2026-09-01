# Calculadora de conteo por ubicación (PT)

## Qué se va a hacer

Agregar una **calculadora por ubicación** en la pantalla de conteo de PT, pensada para contar cajas y unidades sueltas:

- Cada fila de referencia tendrá un botón con ícono de calculadora junto al campo "Cantidad".
- Al tocarlo se abre una ventana emergente (modal en celular, panel flotante en PC) con:
  1. **Cajas completas**: campo numérico + la unidad de empaque (U.E.) de la ubicación, precargada automáticamente. Ejemplo: `3 cajas × 15 = 45`.
  2. **Unidades sueltas**: campo numérico. Ejemplo: `+3`.
  3. **Total en vivo**: `45 + 3 = 48`.
  4. Botón **"Usar 48"** que escribe el total en el campo Cantidad de esa ubicación.
- Si la ubicación **no tiene U.E.** registrada, la calculadora muestra un campo editable para escribir el multiplicador manualmente (y si no se quiere multiplicar, se puede dejar en 1).
- Después de usar la calculadora, el campo Cantidad **sigue siendo editable** (por si quieren corregir a mano).
- El guardado **no cambia**: sigue siendo manual con el botón rojo de Guardar. La calculadora solo rellena el número.

## Consideraciones móviles

- En celular la ventana se abre como modal de pantalla completa inferior (bottom sheet) con campos grandes, teclado numérico (`inputMode="decimal"`) y Enter para confirmar.
- La U.E. actual se muestra como botones rápidos si es un número común (×U.E.), y el cálculo se actualiza al escribir, sin pasos extra.

## Detalle técnico

- Nuevo componente `src/components/pt/CountCalculator.tsx`:
  - Props: `ue: number | null`, `onApply(total: number)`.
  - Estado interno: cajas (string), unidades sueltas (string), multiplicador editable (precargado con `ue ?? ''`).
  - Total = `cajas * multiplicador + sueltas` (soporta decimales y comas).
  - `Popover` en desktop, `Sheet` (bottom) en móvil (usando `useIsMobile`).
- `src/components/pt/PtTranscriptionTab.tsx`:
  - Botón de calculadora junto al Input de cantidad en cada fila; al aplicar, `setQuantities(prev => ({...prev, [loc.id]: String(total)}))` y foco de vuelta al input.
  - Pasar `loc.ue` al componente.
- Sin cambios en base de datos, validación ni flujo de guardado.
