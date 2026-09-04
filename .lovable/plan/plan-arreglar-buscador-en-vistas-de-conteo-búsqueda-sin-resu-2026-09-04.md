# Plan: Arreglar buscador en vistas de conteo (búsqueda sin resultados)

## Problema

Cuando el buscador no encuentra una referencia, la pantalla queda "en blanco" y no se puede seguir buscando. Causa confirmada en el código:

1. **`GroupedTranscriptionTab.tsx` (conteos Almacén/Planta), línea 640:** para supervisores hay un retorno anticipado `if (groupedByZone.length === 0 && !canShowDiagnostic)` que devuelve solo el texto "No hay ubicaciones pendientes..." **sin renderizar el buscador**. Como la búsqueda también produce `groupedByZone.length === 0`, al buscar algo inexistente el input desaparece y el usuario queda atrapado sin poder borrar el término ni buscar otra referencia.

2. **`PtTranscriptionTab.tsx` (conteo PT), línea 310:** cuando la búsqueda no tiene resultados se muestra el mensaje incorrecto "No hay ubicaciones pendientes — Todo lo asignado ya fue transcrito", que confunde (parece que todo terminó). El buscador sí permanece visible, pero el mensaje debe distinguir búsqueda vacía de conteo completo.

## Cambios

### 1. `src/components/supervisor/GroupedTranscriptionTab.tsx`
- El retorno anticipado para supervisores solo aplica cuando **no hay término de búsqueda activo** (`!debouncedSearchTerm.trim()`). Si hay búsqueda activa con 0 resultados, se sigue el flujo normal, que ya renderiza el buscador y el mensaje `No se encontraron resultados para "<término>"` (línea 808-814 ya existe).
- En ese mensaje de "sin resultados" agregar un botón **"Limpiar búsqueda"** que vacíe el término, para recuperar la vista completa con un clic.

### 2. `src/components/pt/PtTranscriptionTab.tsx`
- En el estado vacío (línea 310): si `debouncedSearch` tiene texto, mostrar "No se encontraron resultados para <término>" con botón **"Limpiar búsqueda"**; si no hay búsqueda, mantener el mensaje actual de "Todo fue transcrito".

## Verificación
- Typecheck (`tsgo`).
- No se toca lógica de datos, conteos ni validaciones; solo renderizado condicional y un botón de limpiar.
