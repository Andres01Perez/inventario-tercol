# Informe de estado del proyecto — Tercol Inventario Semestral

## 1. De qué se trata

**Tercol — Inventario Semestral**: plataforma web (React + Vite + Tailwind + shadcn, backend Lovable Cloud/Supabase) para gestionar el **conteo físico de inventario** de una bodega, contrastándolo contra las cantidades del ERP y resolviendo diferencias mediante rondas sucesivas de reconteo hasta cerrar cada referencia como auditada.

## 2. Roles y acceso

| Rol | Alcance |
|---|---|
| **Operario** | Solo ve y cuenta las ubicaciones asignadas a su turno (C1 → Turno 1, C2 → Turno 2; C3/C4 cualquier turno). |
| **Supervisor (Líder)** | Transcripción de conteos por grupo, agregar referencias/ubicaciones, seguimiento de operarios. |
| **Admin** | Todo lo del supervisor + vistas de auditoría. |
| **Superadmin** | Todo: importación de maestras y ubicaciones, gestión de operarios, inventarios MP/PP, auditoría general, exportaciones. |

Filtrado implícito de permisos: nunca se muestra "Acceso Denegado"; las funciones no autorizadas simplemente no aparecen.

## 3. Flujo principal: rondas de conteo (C1–C4)

```text
C1 ──coincide con ERP?──► sí → auditada (validated_quantity)
   │ no
   ▼
C2 ──coincide con C1 o ERP?──► sí → auditada
   │ no
   ▼
C3 ──coincide con C1, C2 o ERP?──► sí → auditada
   │ no
   ▼
C4 ──conteo final/cierre──► auditada con cantidad C4
```

Reglas clave:
- **Auto-validación**: no hay botones de validar en C1–C4; al guardar un conteo se dispara `validate_and_close_round` (RPC) que decide si la referencia queda auditada o escala a la siguiente ronda.
- **Multi-ubicación**: si una referencia tiene 2+ ubicaciones, todas deben contarse antes de que la referencia avance de ronda. La comparación es por **suma total** de la referencia contra ERP (no ubicación por ubicación) — esto se corrigió tras el caso AL324IE.
- **Jerarquía de comparación por ronda**: C2 compara contra C1 y ERP; C3 contra C1, C2 y ERP; C4 cierra con lo contado.
- Botón **"Validar Contados"** manual en /conteo/1 para el usuario almacen@tercol.com.co que limpia de la vista las ubicaciones con `status_c1 = 'contado'`.

## 4. Módulos / páginas

- **/conteo/1…4** — vistas de conteo por ronda (operarios/supervisores). Realtime con Supabase para que desaparezcan referencias al guardarse.
- **/supervisor/transcripcion** — `GroupedTranscriptionTab`: tabla de transcripción agrupada, panel de diagnóstico, agregar referencia (autocomplete con batch fetch), realtime.
- **/auditoria** — auditoría con paginación server-side de 1000 referencias por página.
- **/superadmin/auditoria** — auditoría general, editor de conteos (update/insert explícito, sin upsert), sin recargas de página (invalidación de React Query).
- **/superadmin/importar** — `MasterDataImport`: importación Excel de maestras MP/PP/PT con **borrado selectivo por familia** (corregido: antes borraba todo), validación de duplicados, y `LocationsImport` para ubicaciones (batches de 100).
- **/superadmin/inventario-mp** y **/inventario-pp** — inventarios por familia con exportación a Excel.
- **/superadmin/exportar-conteos** — dos tabs: **Totales Validados** (suma por referencia) y **Por Ubicación** (C1–C4 pivoteados por ubicación), con filtros por ronda, fecha y rango horario (`updated_at`). Batch fetch para superar el límite de 1000 filas.
- **/superadmin/operarios** — gestión de operarios y turnos.
- **/criticos** — referencias críticas (optimizado con batching).

## 5. Base de datos (tablas principales)

- **inventory_master** — referencias, tipo de material (enum `MP` | `PP` | `PT`), cantidad ERP.
- **locations** — ubicaciones por referencia, estados `status_c1…c4`, `validated_quantity`, `updated_at`.
- **inventory_counts** — conteos individuales por ronda (cantidad, operario, timestamp).
- **user_roles** — roles separados (nunca en profiles), con función `has_role()` security-definer.
- **operarios** — operarios y turnos.
- RPC **validate_and_close_round** — núcleo de la auto-validación y escalado de rondas; RPC **get_filter_options** para valores distintos eficientes.
- Realtime: `REPLICA IDENTITY FULL` + publicación `supabase_realtime` en las tablas clave.

## 6. Problemas históricos ya resueltos (para no reintroducirlos)

1. Límite de 1000 filas de PostgREST → todo fetch masivo usa `.range()` en batches.
2. Validación multi-ubicación por suma total (no por ubicación individual).
3. Race condition que saltaba de C2 a C4 → RPC verifica conteos existentes + lock `validatingRefs` en frontend.
4. Realtime C1/C2: comparaciones con `Number()`, `refetchQueries({ type: 'active' })`.
5. Importación de maestras: borrado solo de la familia importada.
6. `ON CONFLICT` en editor de auditoría → update/insert explícito + RLS de superadmin en `inventory_counts`.
7. Exportaciones con batch fetch (1657+ ubicaciones, 3700+ conteos).
8. `validated_quantity` incorrecto en validación por suma → RPC corregido (caso CCE125TG).

## 7. Pendientes / observaciones

1. **PT (Producto Terminado)**: esqueleto listo (enum, parser, zona de subida), falta el mapeo de columnas real del Excel PT.
2. `LocationsImport` aún no deduplica (quedó descartado el `upsert`, se puede retomar si se repite el problema).
3. `OperariosManagement` solo ofrece turnos 1 y 2 aunque el parser acepta 1–3.
4. Guardado de conteos funciona pero es algo lento (validación ya es asíncrona; se puede seguir optimizando).
5. Layouts inconsistentes: algunas pantallas usan `AppLayout` y otras arman su propio header.

## Próximos pasos

Este informe es la línea base de contexto. Indícame qué cambio quieres hacer y armo el plan específico.
