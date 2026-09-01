# Optimización móvil — Vista de conteo PT

## Objetivo
Los supervisores de piso cuentan caminando con el celular en la mano, escribiendo cantidades directamente. La vista de conteo PT (`/gestion-operativa/pt/conteo/:round`) debe ser usable a una mano en pantallas de ~360-414 px, con toques grandes, teclado numérico y mínima fricción.

## Estado actual (verificado)
`src/components/pt/PtTranscriptionTab.tsx` ya tiene una estructura apilable (tarjeta por ubicación con datos en columna e input + botón en fila), pero está pensada para escritorio:
- Input de 128 px y botón "Guardar" con texto en fila — estrecho en móvil.
- Sin pegado al fondo: al hacer scroll con muchas ubicaciones, el buscador desaparece.
- Los acordeones de piso abren todos por defecto — scroll muy largo en móvil.
- El header de AppLayout (título largo "PT · Conteo 1 - Primer Turno") ocupa mucho espacio vertical.

## Cambios

### 1. Tarjeta de ubicación optimizada (PtTranscriptionTab)
- En móvil (`< md`): layout vertical compacto — referencia y descripción arriba; fila inferior con input a ancho completo y botón de guardar grande (mínimo 48 px de alto, ideal para pulgar).
- Botón de guardar en móvil solo con icono de check grande (sin texto) para ahorrar espacio; en escritorio se mantiene "Guardar".
- Input con `inputMode="decimal"`, fuente ≥ 16 px (evita el zoom automático de iOS), y teclado numérico.
- Enter / "Ir" del teclado guarda y mantiene foco listo para la siguiente tarjeta.

### 2. Buscador y barra de estado fija
- Buscador + contador de pendientes en barra `sticky top-0` con fondo, para que siempre esté visible al hacer scroll.
- En móvil, el botón "Actualizar" pasa a icono compacto junto al contador.

### 3. Acordeones por piso
- En móvil, abrir solo el primer piso por defecto (no todos), reduciendo el scroll inicial. En escritorio se mantiene el comportamiento actual (todos abiertos).

### 4. Header compacto (ConteoRoundPT)
- Subtítulo "Tus pisos asignados / Todos los pisos" se mantiene, pero el título en móvil se acorta a "PT · Conteo N".
- Padding lateral reducido en móvil para ganar ancho útil.

### 5. Detalles de usabilidad en campo
- Áreas táctiles mínimas de 44×44 px en todos los controles (disparadores de acordeón, botones).
- Al guardar exitosamente, la tarjeta desaparece con el conteo guardado (comportamiento actual) y se muestra un toast breve que no bloquea la pantalla.
- Feedback inmediato de "guardando" en el botón (spinner) para conexiones lentas de bodega.

## Detalles técnicos
- Solo cambios de UI en `PtTranscriptionTab.tsx` y `ConteoRoundPT.tsx` (clases responsivas Tailwind `sm:`/`md:`, `useIsMobile` si ya existe en el proyecto, o media query CSS).
- Sin cambios en base de datos, RPC ni lógica de validación C1–C4.
- Verificación: typecheck + build, y prueba visual con viewport móvil (390×844) en la vista de conteo PT.

## Fuera de alcance
- Gestión Operativa de MP/PP (sigue con su flujo actual).
- Cambios en asignación de pisos, maestra PT o auditoría.
