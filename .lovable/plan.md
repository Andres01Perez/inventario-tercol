# Corrección de bloques que no cierran

## Por qué RESORTE aparece "sin responsable"

Son dos cosas distintas y por eso en Gestión de Responsables se ve todo asignado:

- **Responsable (supervisor)**: quién cuenta. La ubicación "BODEGA 1 – interiores" **sí tiene** supervisor: Santiago Díaz (interiores@tercol.com.co).
- **Bodega (admin dueño)**: si la ubicación pertenece a Almacén o a Planta. Eso lo define el admin asignado a la ubicación, y esa ubicación **no tiene ninguno**, por eso el sistema no sabe en qué comparación meterla.

Las 87 ubicaciones restantes de Santiago Díaz sí están marcadas como **Planta**; solo estas 2 quedaron sin marcar:

| Referencia | Ubicación | Supervisor | Bodega | Conteos |
|---|---|---|---|---|
| RESORTE | BODEGA 1 – interiores | Santiago Díaz | (falta) | C1 = 2.000, sin C2 |
| NEUTRO12 | BODEGA 1 – interiores | Santiago Díaz | (falta) | ninguno |

Mientras una sola ubicación de la referencia no tenga bodega, el sistema se niega a validar toda la referencia. Por eso RESORTE – Almacén quedó Pendiente aunque C1 = C2 = 22.637.

## Qué se va a hacer

1. **RESORTE**: como confirmaste que solo tiene dos ubicaciones reales (Almacén – Sección B Picking y Planta – Bodega 7), se desactiva la ubicación sobrante "BODEGA 1 – interiores" y se pone `AV` como punto de referencia en la de Planta. Luego se revalida: Almacén cierra auditado en 22.637 y Planta queda auditada en 91.700. No se recuenta nada.

2. **NEUTRO12**: su ubicación "BODEGA 1 – interiores" (sin conteos) se marca como **Planta**, igual que las otras 87 ubicaciones del mismo supervisor, para que no bloquee esa referencia.

3. **Bloques en cero**: cuando C1 = C2 = 0 y el ERP también es 0, el bloque cerrará auditado en cero en lugar de quedarse pendiente. Se revalidan NEUTRO12RALE, NEUTRO30RALE, PPESPLG24.v2, PPESPLG30.v2 y PPESPLG42.v2.

4. **NEUTRO4 (Planta)**: tiene 2 ubicaciones y solo una fue contada; se deja pendiente y se reporta, porque esta sí requiere conteo real.

5. **Prevención**: al importar o crear ubicaciones se exigirá la bodega (Almacén/Planta), y se avisará en pantalla cuando una referencia no pueda validarse por tener ubicaciones sin bodega, en vez de quedarse en Pendiente sin explicación.

6. **Protección tipo TIERRA6RT**: bloquear el guardado de conteos en ubicaciones ya validadas, mostrando un aviso en vez de guardar un dato que no se usará.

7. **Pendiente de tu confirmación física**: TIERRA6RT (validada en 440, con un 46 digitado después del cierre) y TE0675P-COVER (validada en 0).

## Detalle técnico

- Datos: `activo = false` en la ubicación `7aaaccb1…` (RESORTE interiores); `punto_referencia = 'AV'` en `df48c3e0…` (RESORTE Planta); `assigned_admin_id = <admin_pp>` en `72a54af1…` (NEUTRO12 interiores). Después, `validate_and_close_round` para RESORTE y las referencias en cero.
- Lógica: en `validate_bucket`, los match de ronda 1/3/4 exigen `sum > 0`; se permite el match en cero cuando el ERP del bloque también es 0.
- Aviso de bodega faltante: `validate_and_close_round` ya devuelve el error "Hay N ubicación(es) sin bodega"; se mostrará ese mensaje en la vista de auditoría y en Gestión de Ubicaciones/Responsables (badge "Sin bodega" ya existente) en lugar de dejarlo silencioso.
- Protección: trigger `BEFORE INSERT OR UPDATE` en `inventory_counts` que rechaza si `locations.validated_at_round IS NOT NULL`, con manejo del error en los puntos de guardado del frontend.
