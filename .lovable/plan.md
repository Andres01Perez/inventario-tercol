# Fase 1 — Histórico por inventario

Objetivo: que la app deje de vivir en "un solo inventario global". Cada referencia, ubicación y conteo pertenece a un inventario identificado; los inventarios pasados quedan como histórico consultable en solo lectura y un inventario nuevo ya no exige borrar la base.

Estado actual verificado en la base: `inventory_master` tiene 776 referencias, y `locations`, `inventory_counts` y `audit_logs` están vacías. Es el mejor momento posible para el cambio: la migración de datos históricos es mínima.

## 1. Nueva tabla `inventories`

Campos: nombre, fecha de inicio, fecha de cierre, estado (`abierto` / `cerrado`), quién lo creó.
Reglas de acceso: cualquier usuario autenticado puede verlos; solo superadmin crea, edita o cierra. Solo puede haber un inventario abierto a la vez (índice único parcial).

## 2. `inventory_id` en las tres tablas de datos

- `inventory_master`, `locations` e `inventory_counts` reciben la columna `inventory_id`.
- La llave primaria de `inventory_master` pasa de `referencia` a la pareja `(inventory_id, referencia)`: la misma referencia puede existir en varios inventarios.
- La relación `locations -> inventory_master` pasa a ser compuesta `(inventory_id, master_reference)`, para que una ubicación nunca pueda apuntar a la maestra de otro inventario.
- `inventory_counts` hereda `inventory_id` de su ubicación, validado por trigger, para poder filtrar y exportar sin joins costosos.

## 3. Índices

Índices compuestos `(inventory_id, master_reference)` en `locations`, `(inventory_id, referencia)` y `(inventory_id, material_type, status_slug)` en `inventory_master`, y `(inventory_id, audit_round)` en `inventory_counts`. Los índices actuales que ya no sirven se reemplazan, no se acumulan.

## 4. Migración de los datos actuales

Se crea el inventario **"Semestral 2026-1"** en estado abierto y las 776 referencias existentes quedan asignadas a él. No se pierde nada.

## 5. Funciones de base de datos

- `validate_and_close_round` pasa a recibir también el inventario y filtra por él en todas sus fases (conteos por ubicación, sumas C1–C4, escalamiento de ronda).
- `get_filter_options` y `admin_can_access_reference` reciben el inventario como parámetro.
- Ninguna función cambia su lógica de negocio en esta fase: solo se les añade el filtro por inventario. Las reglas C1–C4 quedan idénticas.

## 6. `InventoryContext` en el frontend

Un contexto nuevo que expone el inventario seleccionado, la lista de inventarios y si el seleccionado es de solo lectura (todo el que no sea el abierto). Por defecto arranca en el inventario abierto y recuerda la selección del superadmin en `localStorage`. Todas las claves de React Query incluyen el `inventory_id`, de modo que cambiar de inventario no mezcla caché.

## 7. Selector de inventario: solo el superadmin

- **Superadmin**: único rol con selector. Puede pararse sobre cualquier inventario histórico para consultar y exportar; el histórico se ve pero no se edita.
- **Admins, líderes de bodega y supervisores**: no ven selector ni saben que existe. Su `InventoryContext` resuelve siempre y automáticamente el único inventario abierto. No hay forma de que apunten a otro: no es una preferencia de UI, es lo que devuelve el servidor.
- El inventario abierto es único por diseño (índice único parcial en la base). Si por error hubiera cero inventarios abiertos, la app muestra a los no-superadmin un mensaje de "no hay inventario activo" en vez de dejarlos escribir en cualquier lado.

## 7b. Cómo se blinda el histórico (lo que impide tocar un inventario cerrado)

Tres candados, de adentro hacia afuera. El primero es el que realmente importa: aunque alguien manipule el navegador, la base rechaza la escritura.

1. **Candado en la base (definitivo).** Un trigger `BEFORE INSERT/UPDATE/DELETE` en `inventory_master`, `locations` e `inventory_counts` lanza error si la fila pertenece a un inventario cuyo estado no es `abierto`. Cubre por igual a la app, a un script y al propio superadmin.
2. **Candado en las funciones.** `validate_and_close_round` verifica que el inventario esté abierto antes de escribir; sobre un inventario cerrado devuelve un error explicativo.
3. **Candado en la interfaz.** Con un inventario cerrado seleccionado, el superadmin ve un banner de "Histórico — solo lectura" y desaparecen los botones de guardar, validar, importar, editar y asignar. Es comodidad, no seguridad.

Reabrir un inventario cerrado es una acción deliberada y exclusiva del superadmin, con confirmación escrita, y cerrando antes el que esté abierto. Así "septiembre 2026" queda congelado el día que se cierra y en enero 2027 nadie puede escribir sobre él ni por accidente ni a propósito.

## 7c. Qué se hereda al crear el inventario de enero 2027

Al crear un inventario nuevo el superadmin decide qué se arrastra:
- **Siempre nuevo**: maestra ERP (se importa del Excel), ubicaciones, conteos, rondas y estados. Arranca en cero.
- **Se conserva global, no por inventario**: usuarios, roles y operarios. No se reasignan roles en cada inventario.
- **Opcional al crear**: copiar las ubicaciones y las asignaciones de supervisor del inventario anterior como punto de partida, para no reconstruirlas a mano. Si no se marca, se importan desde Excel como hoy.



## 8. Queries filtradas

Se añade el filtro por inventario activo en: transcripción y conteos C1–C4, auditoría, críticos, exportar conteos (ambas pestañas), inventarios MP y PP, gestión de ubicaciones, gestión de responsables, agregar referencia e impresión de hojas.

## 9. Importar maestra

Deja de borrar datos. El flujo pasa a ser:
1. Se elige entre **cargar sobre el inventario abierto** (comportamiento actual, reemplazando solo la familia importada dentro de ese inventario) o **crear un inventario nuevo** dando nombre y fecha.
2. Si se crea uno nuevo, el anterior se marca cerrado automáticamente y el nuevo queda abierto.
3. La confirmación con "BORRAR" se conserva únicamente para el caso de reemplazo dentro del inventario abierto, y el texto aclara que solo afecta a ese inventario y a esa familia.

## Detalles técnicos

- Migración en un solo paso: crear `inventories` con GRANTs + RLS, insertar "Semestral 2026-1", añadir `inventory_id` con backfill, hacerlo `NOT NULL`, recrear PK y FK compuestas, crear índices, recrear las funciones con el parámetro nuevo.
- Las políticas RLS existentes se conservan tal cual; el aislamiento por inventario es por filtro de query, no por RLS, salvo el bloqueo de escritura sobre inventarios cerrados, que se hace con un trigger `BEFORE INSERT/UPDATE/DELETE` en las tres tablas — así el modo solo lectura no depende del frontend.
- `src/integrations/supabase/types.ts` se regenera solo tras la migración; el código que dependa del esquema nuevo se escribe después.
- Realtime: los canales siguen igual, pero los handlers descartan eventos cuyo `inventory_id` no sea el activo.

## Fuera de alcance de esta fase

Tabla `validated_counts` (Fase 2), validación almacén vs planta (Fase 3), auditoría sin tope (Fase 4), PT (Fase 5) y eliminación del rol operario (Fase 7).

## Verificación antes de cerrar la fase

- Crear un segundo inventario de prueba y comprobar que la misma referencia convive en ambos sin choques.
- Con el inventario histórico seleccionado: la data se ve, nada se puede guardar.
- Conteos C1–C4, validación, auditoría y las dos exportaciones dan las mismas cifras que hoy sobre "Semestral 2026-1".
