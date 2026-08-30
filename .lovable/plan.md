# Por qué no salen las referencias al poner ubicaciones

Hay **dos cosas distintas** pasando. Una es un dato faltante, la otra es un error de diseño de la pantalla.

## 1. Hoy la maestra está vacía en la base de datos

Consulté la base directamente:

```text
Inventario           Estado    Referencias   Ubicaciones
Semestral 2026-1     abierto   0             0
```

No hay ningún otro inventario. Es decir, en este momento **no hay referencias cargadas** en el inventario activo (esta mañana sí había 780 MP y 1.771 PP; hoy la tabla quedó en cero). Sin referencias en la maestra, ninguna pantalla puede mostrarlas.

Primer paso, antes de tocar código: volver a importar MP y PP desde `/superadmin/importar` sobre el inventario abierto y confirmar que las tarjetas muestran 780 / 1.771. Si al terminar vuelven a quedar en cero, eso es un bug de importación aparte y lo atacamos con logs de esa operación.

## 2. Aunque la maestra esté cargada, la pantalla no muestra referencias sin ubicación

Esto no es adrede, es una limitación real del código actual. Tanto `Gestión de Ubicación` como `Gestión de Responsables` arrancan la consulta desde la tabla `locations` con un cruce obligatorio a la maestra:

```text
locations  ──(inner join)──►  inventory_master
```

Como una referencia recién importada **todavía no tiene ninguna ubicación**, no aparece en la lista. Y como no aparece, no hay dónde pulsar "agregar ubicación". Resultado: la única forma de crear ubicaciones hoy es el import de Excel. Es un círculo cerrado.

## Qué se va a cambiar

### Gestión de Ubicación
- La consulta pasa a arrancar desde `inventory_master` (con los mismos filtros de rol: Admin MP solo referencias con control, Admin PP todas) y a traer sus ubicaciones asociadas.
- Las referencias sin ubicación se muestran igual, con una fila marcada como "Sin ubicaciones" y el botón para crear la primera.
- Los filtros por subcategoría, ubicación, punto de referencia y supervisor siguen funcionando; cuando se usa uno de esos filtros solo se listan referencias que sí tienen ubicaciones (es lo esperado).
- Se conserva la paginación y el conteo total, ahora contando referencias en vez de filas de ubicación.

### Gestión de Responsables
- Mismo cambio de origen de datos, para que se pueda asignar supervisor a una referencia recién creada.

### Creación manual de ubicación
- Al crear la ubicación se guarda explícitamente el inventario activo y el admin dueño (`assigned_admin_id`), que es lo que define si la ubicación es de **almacén** (Admin MP) o de **planta** (Admin PP) para la validación de la Fase 3.
- Si un superadmin crea la ubicación, se pide a qué bodega pertenece, porque el superadmin no define bodega por sí mismo y una ubicación sin bodega bloquea el cierre de la referencia.

## Verificación

- Con la maestra cargada, abrir Gestión de Ubicación con una referencia nueva y confirmar que aparece con "Sin ubicaciones".
- Crear una ubicación manual y confirmar que queda con inventario y admin correctos, y que después aparece en el conteo C1.
- Typecheck y build.

## Notas técnicas

- Archivos: `src/pages/admin/GestionUbicacion.tsx` (consulta principal, `addLocationMutation`), `src/pages/admin/GestionResponsables.tsx` (consulta principal).
- Se pasa de `from('locations').select('..., inventory_master!inner(...)')` a `from('inventory_master').select('..., locations(...)')` con paginación por referencia y filtros server-side equivalentes.
- Sin cambios de base de datos: `locations.inventory_id` ya tiene default al inventario activo y las políticas RLS actuales ya permiten a los admins insertar sus ubicaciones.
