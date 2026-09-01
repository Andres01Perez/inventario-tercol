# Producto Terminado (PT) — estructura independiente

Módulo PT completamente separado de MP/PP: tablas nuevas, importadores nuevos y pantallas nuevas. No se toca nada del flujo actual de almacén/planta.

Sin roles nuevos: los contadores de PT siguen siendo `supervisor`; tú como superadmin asignas qué supervisor cuenta cada piso.

## Qué se va a construir

### 1. Maestra PT (importación)
Se lee el archivo tipo "SALDO INVENTARIO ... para inventario PT" con 3 columnas:

| CODIGO | DESCRIPCION | CANT. |
|---|---|---|
| ACAMPANA12 | ADAPTADOR CAMPANA 1/2" | 51.200 |
| ADAPTER34 | ADAPTADOR TERMINAL 3/4" | 353.048 |

`CANT.` es el saldo ERP real y total de la referencia (no se suma con nada más). Cada importación reemplaza la maestra PT del inventario abierto, igual que hoy con MP/PP.

### 2. Ubicaciones PT (importación)
Plantilla de 7 columnas; obligatorias solo **PISO** y **REFERENCIA**:

| # | PISO | PRODC | UBIC | LINEA | REFERENCIA | U.E |
|---|---|---|---|---|---|---|
| 1 | 1 | B | 1BA-1BB-2BG-2BF | PL | CP2X4-CC | 432 |

Reglas: la referencia debe existir en la maestra PT; una misma referencia puede repetirse en varios pisos; se descarga plantilla desde la app.

### 3. Asignación de pisos
Pantalla "Responsables PT": lista de pisos detectados en el inventario, con un selector de supervisor por piso. Al asignar, todas las ubicaciones de ese piso quedan a cargo de ese supervisor.

### 4. Base para el conteo (se implementa en el siguiente plan)
La base de datos ya queda preparada para C1/C2/C3/C4, validación automática (C1=ERP, C1=C2, C2=ERP, …), validaciones persistidas por ubicación y la regla de "no comparar hasta que todos los pisos de la referencia estén contados".

## Cómo queda la estructura de datos

Tablas nuevas, todas ligadas a `inventory_id` (histórico por inventario, igual que MP/PP):

**`pt_master`** — maestra PT
| campo | detalle |
|---|---|
| inventory_id + referencia | clave |
| descripcion | texto |
| cant_erp | saldo ERP total |
| status_slug, audit_round, count_history | estado de auditoría |

**`pt_locations`** — ubicaciones PT
| campo | detalle |
|---|---|
| inventory_id, referencia | vincula con `pt_master` |
| piso | obligatorio |
| prodc, ubic, linea, ue, orden | opcionales |
| assigned_supervisor_id | supervisor del piso |
| status_c1..c4, validated_at_round, validated_quantity | estado de conteo |

**`pt_floor_assignments`** — supervisor por piso (inventory_id + piso únicos).

**`pt_counts`** — conteos por ubicación y ronda (cantidad, ronda, supervisor).

**`pt_validated_counts`** — cantidad validada final por ubicación, con ronda y motivo.

Todas con GRANTs explícitos, RLS (supervisores solo sus pisos; admins y superadmin todo) y bloqueo de escritura cuando el inventario está cerrado, reutilizando el trigger existente.

## Pantallas

- **Importar Maestra**: nueva pestaña/tarjeta "PT" que usa el nuevo formato de 3 columnas (se retira el esqueleto PT actual que apunta a la maestra MP/PP).
- **Ubicaciones PT** (`/pt/ubicaciones`): importar Excel, descargar plantilla, ver y editar la lista.
- **Responsables PT** (`/pt/responsables`): asignar supervisor por piso.
- Botones nuevos en el dashboard de superadmin, sección General.

## Detalles técnicos

- Migración única con las 5 tablas, índices (`inventory_id`, `referencia`, `piso`, `assigned_supervisor_id`), FKs compuestas `(inventory_id, referencia)` contra `pt_master`, GRANTs, RLS y triggers `updated_at` + `block_closed_inventory`.
- Parsers nuevos: `src/lib/ptMasterParser.ts` y `src/lib/ptLocationsParser.ts` (normalización de encabezados y números con formato es-CO, igual que los parsers actuales).
- Componentes nuevos bajo `src/components/pt/`; rutas protegidas en `App.tsx` (`superadmin` + `admin_*` para gestión, `supervisor` solo para conteo futuro).
- Importación en lotes de 500 filas con `.upsert()` y lecturas paginadas con `.range()` para no toparse con el límite de 1.000 filas.
