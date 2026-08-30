# Tercol Inventario — Evolución a v2 (PT, validaciones por bodega, histórico de inventarios)

## Recomendación honesta: evolucionar este proyecto, no empezar de cero

Empezar de cero suena tentador porque ya sabes cómo debe funcionar, pero en este caso perderías más de lo que ganarías:

- Lo que hoy funciona bien y es caro de reconstruir: el motor `validate_and_close_round` (con reglas C1–C4, ubicaciones descubiertas en rondas posteriores, cierre por suma total), los parsers de Excel (MP/PP, ubicaciones, operarios) con detección de formato regional, las exportaciones con batch fetch, la paginación server-side y todo el trabajo de límites de 1000 filas ya resuelto.
- Los cuatro cambios que pides son **aditivos o quirúrgicos**, no arquitectónicos: PT ya tiene enum + parser esqueleto; el cambio de validaciones toca una sola función SQL; quitar el rol operario es una limpieza; el `inventory_id` y la tabla de validaciones son dos migraciones.
- Un proyecto nuevo implicaría rehacer auth, roles, RLS, importadores y exportadores — semanas de trabajo para llegar al mismo punto, con riesgo de reintroducir bugs ya resueltos (los 8 listados en el informe).

Lo que sí conviene: tratar esto como una **v2 con limpieza deliberada** — nueva tabla de inventarios como raíz del modelo, tabla de validaciones persistida, y borrar el rol operario y el código muerto asociado. Eso te da el "minimalismo" que buscas sin tirar el motor.

Solo recomendaría empezar de cero si además quisieras cambiar de stack o si el modelo de datos fuera incompatible — no es el caso.

## Alcance de la v2

### 1. Informe ejecutivo exportado
Generar `Informe-Ejecutivo-Tercol-Inventario.md` (y versión PDF) en Documentos, con el mapeo completo del aplicativo: propósito, roles, flujo C1–C4, módulos, modelo de datos, bugs históricos resueltos y pendientes.

### 2. Producto Terminado (PT)
- Definir el mapeo real de columnas del Excel PT en `PT_COLUMN_MAP` (`src/lib/masterDataParser.ts`) — requiere que nos pases un archivo de ejemplo.
- Fórmula de `cant_total_erp` para PT en `calculateTotalErp`.
- Columnas PT en `inventory_master` si el Excel trae campos propios (migración).
- Vista `/superadmin/inventario-pt` equivalente a MP/PP, con exportación.
- PT incluido en filtros, auditoría, exportaciones y selector de tipo de material.

### 3. Nueva regla de validación: planta vs planta, almacén vs almacén
Hoy `validate_and_close_round` compara la **suma total** de todas las ubicaciones contra el ERP total. La nueva regla separa por bodega:

```text
ERP almacén  = cant_alm      ─┐
ERP planta   = cant_pld + cant_plr + cant_za  ─┘  (a confirmar el desglose exacto)

Conteo almacén = SUM(ubicaciones marcadas como almacén)
Conteo planta  = SUM(ubicaciones marcadas como planta)

Validación: conteo_almacen = ERP_almacen  Y  conteo_planta = ERP_planta
```

Implica:
- Un campo que clasifique cada ubicación como `almacen` o `planta` (probablemente derivable de `subcategoria` o `location_name`; si no, columna nueva `bodega` en `locations` + ajuste del importador de ubicaciones).
- Reescribir la fase de "match por suma total" del RPC para evaluar los dos bloques por separado, manteniendo la jerarquía C1→C4 actual.

### 4. Persistir la validación en tabla propia
Nueva tabla `validated_counts` (o similar): una fila por referencia+ubicación+inventario con la cantidad validada, la ronda que la validó y el motivo (`C1=C2`, `C3=ERP`, etc.). El RPC escribe ahí en vez de depender solo de `locations.validated_quantity`. Las exportaciones leen de esa tabla — elimina la clase de error del caso CCE125TG.

### 5. Historial por inventario (`inventory_id`)
Nueva tabla `inventories` (nombre, fecha de inicio, estado abierto/cerrado). `inventory_master`, `locations`, `inventory_counts` y `validated_counts` reciben `inventory_id`. Todas las consultas se filtran por el inventario activo. Efectos:
- Importar una maestra nueva ya no borra nada: crea un inventario nuevo.
- Selector de inventario en el dashboard para consultar históricos en modo lectura.
- Migración de los datos actuales a un inventario "Semestral 2026-1".

### 6. Eliminar el rol operario
Quitar `operario` del enum `app_role`, reasignar usuarios existentes, y limpiar las ramas de UI y RLS que lo referencian.

## Orden de ejecución propuesto

1. Informe ejecutivo en Documentos (inmediato).
2. `inventories` + `inventory_id` en todas las tablas (base de todo lo demás).
3. `validated_counts` + RPC escribiendo ahí + exportaciones leyendo de ahí.
4. Nueva regla de validación almacén/planta.
5. PT completo.
6. Limpieza del rol operario.

Cada paso es independiente y verificable; se puede pausar entre uno y otro.

## Detalles técnicos

- Migraciones: `inventories`, columnas `inventory_id` con FK e índices compuestos (`inventory_id, master_reference`), tabla `validated_counts` con GRANTs y RLS, ajuste del enum `app_role`.
- `validate_and_close_round`: reescritura de la Fase 0 (match por suma) para operar sobre dos bloques (almacén/planta) y escritura en `validated_counts`.
- Frontend: todas las queries de `GroupedTranscriptionTab`, `Auditoria`, `Criticos`, `ExportarConteos`, `InventarioMP/PP` reciben el `inventory_id` activo en su query key.
- Contexto nuevo `InventoryContext` que expone el inventario activo.

## Antes de empezar necesito

1. Un Excel de ejemplo de PT con sus columnas reales.
2. Confirmación del desglose exacto de qué columnas ERP son "almacén" y cuáles "planta".
3. Cómo se identifica hoy si una ubicación es de almacén o de planta (¿`subcategoria`? ¿nombre? ¿o hay que agregar la columna?).
