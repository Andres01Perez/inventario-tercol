# Conteo PT (C1–C4) para supervisores de piso

Cerrar el flujo de Producto Terminado: los supervisores con pisos asignados ven sus referencias/ubicaciones PT en Gestión Operativa, transcriben la cantidad y guardan. La validación automática funciona igual que en MP/PP (C1=C2, C1=ERP, C2=ERP, …), escalando a C3 y luego a C4 solo lo que no coincide.

## 1. Quién ve qué

- Se mantiene el rol `supervisor` (sin rol nuevo). El acceso a PT se deriva de `pt_floor_assignments`: si el usuario tiene al menos un piso asignado, ve el bloque PT.
- Al asignar un piso en Responsables PT, todas las ubicaciones de ese piso quedan con `assigned_supervisor_id` = ese supervisor (hoy se guarda la asignación; se refuerza la propagación a `pt_locations` para que la RLS de conteo funcione).
- Superadmin y admins ven todas las referencias PT; el supervisor solo las de sus pisos.

## 2. Gestión Operativa con dos bloques

`/gestion-operativa` pasa a mostrar, según lo que tenga asignado el usuario:

- **Almacén / Planta (MP y PP)** — las 4 tarjetas de ronda actuales, sin cambios.
- **Producto Terminado** — 4 tarjetas nuevas de ronda que llevan a `/gestion-operativa/pt/conteo/:round`.

Si el usuario solo tiene pisos PT, solo ve el bloque PT; si solo tiene ubicaciones MP/PP, solo ve el actual. Nada cambia para quien ya usaba el flujo existente.

## 3. Pantalla de conteo PT

Misma mecánica que la transcripción actual, adaptada a la estructura PT:

- Agrupada por **Piso** (acordeón), y dentro por referencia/ubicación.
- Columnas visibles: Referencia, Descripción, PRODC, UBIC, LÍNEA, U.E.
- Un campo de cantidad por ubicación + botón guardar (Enter también guarda).
- Solo aparecen las ubicaciones **pendientes** de esa ronda: al guardar, la fila desaparece; realtime sobre `pt_counts` mantiene la lista viva entre usuarios.
- Buscador por referencia y botón de refrescar.
- Inventario histórico = solo lectura (mismo banner que el resto).

```text
Piso 1  ·  18 ubicaciones pendientes
  REFERENCIA    DESCRIPCIÓN                 UBIC        LÍNEA  U.E   CANTIDAD
  CP2X4-CC      CAJA PVC 2X4                1BA-1BB     PL     432   [    ] Guardar
  ADAPTER34     ADAPTADOR TERMINAL 3/4"     2BG         PL     100   [    ] Guardar
```

## 4. Validación automática PT

Al guardar un conteo se dispara una función de validación para esa referencia. Regla clave: **no se compara nada hasta que todas las ubicaciones activas de la referencia (en todos los pisos) tengan conteo en la ronda vigente.**

Cuando ya están todas:

| Ronda | Se cierra si… | Cantidad validada |
|---|---|---|
| C1 y C2 | suma C1 = suma C2 | esa suma |
| C1 y C2 | suma C1 = ERP | C1 |
| C1 y C2 | suma C2 = ERP | C2 |
| C3 | C3 = C1, C3 = C2 o C3 = ERP | C3 (o la que coincidió) |
| C4 | C4 coincide con C1, C2, C3 o ERP | la que coincidió |

- Si en C1/C2 no coincide nada → la referencia pasa a **C3**. Si C3 no coincide → pasa a **C4**. Nunca se salta una ronda.
- Si C4 tampoco coincide → queda **crítico / escalado a superadmin**.
- Al cerrar, se guarda una fila por ubicación en `pt_validated_counts` con cantidad, ronda y motivo (`C1=C2`, `C2=ERP`, …) y se verifica que la suma por ubicación sea igual al total validado; si no cuadra, no se cierra (mismo blindaje que MP/PP).
- Las ubicaciones descubiertas en rondas posteriores se marcan con su motivo `discovered_at_Cx`.

## 5. Detalles técnicos

- **Migración**: función `public.pt_validate_and_close_round(_inventory_id, _referencia, _user_id)` (security definer) que evalúa la referencia completa, actualiza `pt_locations.status_c1..c4`, `validated_at_round`, `validated_quantity`, `pt_master.audit_round/status_slug/count_history`, e inserta/actualiza `pt_validated_counts`. Grants: `execute` a `authenticated`.
- Trigger en `pt_counts` para marcar `pt_locations.status_cX = 'contado'` al insertar (equivalente a `update_location_status_on_count`) y `pt_counts` añadida a la publicación realtime.
- Propagación de supervisor: al hacer upsert en `pt_floor_assignments`, actualizar `pt_locations.assigned_supervisor_id` de ese piso (trigger en la tabla de asignaciones, así queda consistente sin depender del frontend).
- **Frontend**:
  - `src/components/pt/PtTranscriptionTab.tsx` — lista agrupada por piso, guardado y llamada al RPC (patrón de `GroupedTranscriptionTab`, con paginación `.range()` de 1.000 filas).
  - `src/pages/pt/ConteoPT.tsx` + ruta `/gestion-operativa/pt/conteo/:round` (roles `superadmin`, `admin_*`, `supervisor`).
  - `src/pages/GestionOperativa.tsx` — dos bloques de tarjetas según asignaciones; `RoundSelectorCards` recibe una prop de ruta base.
- Sin cambios en MP/PP ni en las tablas existentes.

## 6. Verificación

- Referencia PT en 1 piso: C1 = ERP → cierra en C1/C2.
- Referencia PT en 2 pisos: C1 ≠ C2 → pasa a C3; C3 ≠ todo → pasa a C4.
- La fila desaparece de la vista al guardar y en la sesión de otro usuario (realtime).
- Typecheck y build.
