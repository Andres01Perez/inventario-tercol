# Reorganizar tarjeta "Avance de conteo" del Dashboard de Auditoría

## Problema
La tarjeta de "Avance de conteo" en `AuditoriaKpiPanel.tsx` muestra el hint en una sola línea de texto que se rompe al envolver, dejando las etiquetas desalineadas de sus valores:

```
173 de 4.890 conteos · C1
173/2.445 · C2
0/2.445
```

Esto hace que parezca que `173/2.445` corresponde a C2 y `0/2.445` no tenga etiqueta, generando confusión.

## Solución
Reorganizar la tarjeta para que cada métrica tenga su propia fila con etiqueta y valor alineados, usando una lista vertical dentro de la tarjeta en lugar de un hint de texto plano.

## Cambios
1. En `src/components/superadmin/AuditoriaKpiPanel.tsx`, dentro del array `kpis`, cambiar el hint de la tarjeta "Avance de conteo" por una estructura JSX que renderice:
   - **Total:** `173 de 4.890 conteos`
   - **C1:** `173 / 2.445`
   - **C2:** `0 / 2.445`
   Cada fila con su etiqueta a la izquierda y el valor a la derecha.
2. Ajustar el render de las tarjetas KPI para soportar `hint` como `ReactNode` (string o JSX) sin alterar el resto de tarjetas.
3. Mantener el porcentaje grande (`4%`) como valor principal de la tarjeta.
4. Preservar el cálculo de `avance`, `c1Done`, `c1Required`, `c2Done` y `c2Required`.

## Resultado esperado
La tarjeta se leerá así:

```
Avance de conteo
4%
Total      173 / 4.890
C1         173 / 2.445
C2         0 / 2.445
```

Sin ambigüedad sobre a qué conteo pertenece cada número.
