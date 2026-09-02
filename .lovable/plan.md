# Corrección de bloques que no cierran

## Por qué RESORTE sale Pendiente

RESORTE no está esperando un reconteo. Tiene tres ubicaciones registradas:

| Ubicación | Bodega | Conteos | Estado |
|---|---|---|---|
| ALMACEN – PRIMER PISO | Almacén | C1 = 22.637, C2 = 22.637 | sin validar |
| Bodega 7 – AV | Planta | C1 = 91.700, C2 = 91.700 | ya auditada |
| BODEGA 1 – interiores | sin responsable | C1 = 2.000 (sin C2) | sobra |

La tercera ubicación quedó sin responsable de bodega. La regla actual es: si **una sola** ubicación de la referencia no tiene bodega, el sistema se niega a validar la referencia completa. Por eso Almacén quedó en Pendiente aunque C1 y C2 coinciden.

## Qué se va a hacer

1. **RESORTE**: desactivar la ubicación sobrante "BODEGA 1 – interiores" (queda con las dos ubicaciones correctas), poner `AV` como punto de referencia en la ubicación de Planta, y revalidar la referencia para que Almacén cierre auditado en 22.637 (Planta ya está auditada en 91.700). No se recuenta nada.

2. **Bloques en cero**: ajustar la regla para que, cuando C1 = C2 = 0 y el ERP también es 0, el bloque cierre auditado en cero en vez de quedarse pendiente. Luego revalidar NEUTRO12RALE, NEUTRO30RALE, PPESPLG24.v2, PPESPLG30.v2 y PPESPLG42.v2.

3. **NEUTRO4 (Planta)**: tiene 2 ubicaciones y solo una fue contada; se deja pendiente y se reporta para que se cuente la que falta (esta sí requiere conteo real).

4. **Protección contra el caso TIERRA6RT**: impedir que se guarden conteos nuevos en ubicaciones ya validadas/cerradas. Hoy se puede seguir digitando después del cierre y ese dato queda "colgado" sin efecto. Se bloqueará en la base de datos y se mostrará un aviso claro en pantalla en vez de guardar en silencio.

5. **Pendiente de tu confirmación física**: TIERRA6RT (validada en 440, con un 46 digitado después del cierre) y TE0675P-COVER (validada en 0). Cuando confirmes el valor correcto, reabro y revalido.

## Detalle técnico

- Datos: `UPDATE locations SET activo = false` en la ubicación `7aaaccb1…` (BODEGA 1 – interiores) y `punto_referencia = 'AV'` en la ubicación de Planta `df48c3e0…`; luego ejecutar `validate_and_close_round('RESORTE', <superadmin>, <inventario>)`.
- Lógica: en `validate_bucket`, las condiciones de match de ronda 1/3/4 exigen `sum > 0`. Se cambia a permitir el match en cero cuando el ERP del bloque también es 0 (`v_erp = 0`), manteniendo el resto igual.
- Protección: trigger `BEFORE INSERT OR UPDATE` en `inventory_counts` que rechaza la operación si `locations.validated_at_round IS NOT NULL`, más manejo del error en los puntos de guardado del frontend (transcripción, alta de ubicación, edición desde auditoría, referencias críticas) para mostrar un toast explicativo.
- La ubicación restante sin bodega (NEUTRO12 – BODEGA 1, sin conteos) se asigna a Almacén para que no vuelva a bloquear esa referencia.
