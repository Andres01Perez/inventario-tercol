# Descuadre con signo y color + formato de un decimal

## Objetivo
Que el descuadre se lea de un vistazo: si el físico es MAYOR que el ERP sale en **verde con signo +** (sobrante), si el físico es MENOR sale en **rojo con signo −** (faltante), y si cuadra exacto queda neutro. Además, eliminar los decimales largos (ej. `269.0000`) dejando máximo **un decimal** en cantidades y descuadres.

## Regla de presentación (aplica a unidades y a dinero)
| Situación | Cálculo | Muestra | Color |
|---|---|---|---|
| Físico > ERP | validado − erp > 0 | `+N` / `+$XXX` | Verde |
| Físico < ERP | validado − erp < 0 | `−N` / `−$XXX` | Rojo |
| Físico = ERP | 0 | `0` / `$0` | Neutro (gris/verde tenue) |
| Sin validar aún | — | `—` | Gris (como ya está) |

La lógica de cálculo (validado − erp) ya es correcta en todo el sistema; el cambio es de **presentación**: hoy todo descuadre distinto de cero se pinta rojo, aunque sea sobrante.

## Cambios

### 1. Utilidades compartidas de formato
- Crear helper único (ej. `src/lib/format.ts`):
  - `formatQty(n)`: número con `Intl.NumberFormat('es-CO', { maximumFractionDigits: 1 })` — elimina decimales largos, conserva uno si existe (ej. `2.5`).
  - `formatSignedQty(n)`: como el anterior pero con signo `+` cuando es positivo.
  - `formatSignedMoney(n)`: moneda COP con signo explícito (`+$1.234` / `−$1.234`).
- Reutilizar los helpers existentes `formatMoney` / `nf` donde ya haya, moviéndolos al archivo compartido para no duplicar.

### 2. Auditoría Almacén / Planta (`AuditoriaBodegaTable.tsx`)
- Columna **Descuadre (und)**: usar `formatSignedQty`; verde si `> 0`, rojo si `< 0`, neutro si `0` (hoy es verde solo en 0 y rojo en todo lo demás).
- Columna **Descuadre ($)**: usar `formatSignedMoney` con la misma regla de color (hoy siempre rojo y sin signo `+`).
- Cantidades de columnas ERP, C1–C5 y Validado: pasar por `formatQty` para quitar decimales residuales.

### 3. Auditoría PT (`AuditoriaPtTable.tsx`)
- Misma regla en la columna Descuadre: signo `+`/verde para sobrante, `−`/rojo para faltante, neutro en cero.
- Cantidades (ERP, conteos, validado) con `formatQty` (un decimal máximo).

### 4. Paneles KPI y Dashboard (`AuditoriaKpiPanel.tsx`, `AuditoriaPtKpiPanel.tsx`, `DashboardAuditoria.tsx`)
- Tarjetas de **Descuadre (und)** y **Descuadre ($)**: mostrar valor con signo y color según la regla (verde si sobrante neto, rojo si faltante neto). Las tarjetas de "Faltante" y "Sobrante" ya separadas se conservan, ajustando formato.
- Tabla **Top 10 descuadres**: signo y color por fila según dirección del descuadre (hoy toda la columna sale roja); formato un decimal.
- Desgloses por familia/bodega: mismo tratamiento.

### 5. Exportaciones Excel (`useExportToExcel.ts`)
- Columnas de cantidades y descuadre en unidades: redondear a 1 decimal.
- Descuadre ($) se exporta como número con signo natural (positivo/negativo) — Excel ya lo interpreta; sin cambio de color (Excel no lleva color aquí).

## Verificación
- Typecheck y build.
- Revisión visual con Playwright de una auditoría que tenga descuadres positivos y negativos reales (ej. NEUTRO18T: descuadre `+1` debe salir verde) y de las tarjetas KPI.

## Notas técnicas
- No se toca ningún cálculo en base de datos ni en RPCs; solo formato en frontend.
- Los archivos afectados: `src/lib/format.ts` (nuevo), `AuditoriaBodegaTable.tsx`, `AuditoriaPtTable.tsx`, `AuditoriaKpiPanel.tsx`, `AuditoriaPtKpiPanel.tsx`, `DashboardAuditoria.tsx`, `useExportToExcel.ts`.
