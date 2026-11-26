# Botón "Actualizar costos" en Inventario MP e Inventario PP

## Qué verá el superadmin
- En **Inventario MP** e **Inventario PP**, junto a Actualizar/Exportar, un botón **Actualizar costos** visible solo para superadmin (oculto para los demás, sin mensajes de "acceso denegado"; deshabilitado si el inventario está cerrado).
- Abre un diálogo en 3 pasos:
  1. **Subir Excel** con columnas `Referencia | CostoU` (acepta encabezados con mayúsculas/espacios/acentos distintos; toma la primera hoja). Botón para descargar plantilla.
  2. **Previsualización obligatoria** (no se puede guardar sin verla):
     - Contadores: total filas, a actualizar, sin cambio, no encontradas, duplicadas, inválidas (costo vacío, negativo o no numérico).
     - Tabla: Referencia, Costo actual, Costo nuevo, Var % (verde/rojo), Cant. total, Costo total nuevo.
     - Pestañas/listas de **No encontradas** (no existen en ese inventario y familia) y **Duplicadas** (misma referencia repetida en el archivo; se excluyen todas hasta corregirlo).
     - Descargar la previsualización a Excel.
  3. **Confirmar** → guarda y muestra cuántas se actualizaron y cuántas se omitieron.

## Reglas
- Emparejamiento por referencia con trim + mayúsculas, solo dentro del inventario seleccionado y la familia de la pantalla (MP o PP).
- Solo cambia: MP → `costo_u_mp`; PP → `costo_u_pp`; y `costo_t` = cantidad total × costo nuevo (MP: Cant. Total MP; PP: Cant. Total PP; nulo cuenta como 0).
- No se borra ni reemplaza la maestra, ubicaciones, conteos ni validaciones. Filas sin cambio de costo no se tocan.
- Historial por referencia: usuario, fecha, inventario, familia, costo anterior, costo nuevo, costo total anterior y nuevo, y un identificador de la carga.

## Detalles técnicos
- Nueva tabla `cost_update_history` (inventory_id, referencia, material_type, costo_u_anterior, costo_u_nuevo, costo_t_anterior, costo_t_nuevo, batch_id, file_name, updated_by, created_at) con GRANTs, RLS: lectura superadmin/visualizador, sin inserción directa desde el cliente.
- Nueva RPC `update_master_costs(_inventory_id, _material_type, _items jsonb, _file_name)` SECURITY DEFINER: verifica `is_superadmin(auth.uid())` y que el inventario no esté cerrado; en una sola transacción hace UPDATE únicamente de las columnas de costo con `upper(trim(referencia))`, inserta historial con valores anteriores y devuelve conteos. Respeta el trigger de inventario cerrado.
- Previsualización en cliente: lee el Excel (SheetJS ya usado en el proyecto), carga costos actuales del inventario paginando (>1.000 filas) y calcula var %.
- Componente compartido `ActualizarCostosDialog` usado por ambas páginas; lógica de parseo/clasificación en `src/lib/costUpdate.ts` con prueba unitaria (normalización, duplicadas, no encontradas, var %, costo_t).
- Tras guardar se refrescan Inventario MP/PP y Valorización.
