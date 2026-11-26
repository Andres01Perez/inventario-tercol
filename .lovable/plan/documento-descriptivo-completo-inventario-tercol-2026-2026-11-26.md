# Documento descriptivo completo: Inventario Tercol 2026

## Qué se entregará
Un documento Word (.docx) en español, extenso y detallado, guardado en Archivos como `Descripcion_Inventario_Tercol_2026.docx`, que describe todo el aplicativo tal como funciona hoy.

## Estructura del documento
1. **Introducción** – propósito del aplicativo, tipos de inventario (MP, PP, PT), bodegas (Planta, Almacén) y glosario (ERP, C1–C5, descuadre, validado, a montar, punto de referencia, controlado).
2. **Acceso y roles** – inicio de sesión, aprobación pendiente, roles (Superadmin, Admin MP, Admin PP, Supervisor, Visualizador, Usuario) y qué ve cada uno.
3. **General** – Dashboard/tablero unificado: indicadores, tarjetas, avance por bodega.
4. **Operación** – conteos por ronda (C1–C5), transcripción, buscador, orden A–Z, agregar referencia desde conteo, hojas imprimibles, reglas de turno (C1 Turno 1, C2 Turno 2), gestión operativa de operarios.
5. **Administración** – Gestión de ubicaciones (importación Excel, normalización de nombres de bodega, punto de referencia), Gestión de responsables (supervisor vs. administrador dueño de bodega), Usuarios, Importar maestra, Inventario MP y PP, Impresión masiva.
6. **Auditoría** – Dashboard de auditoría, Auditoría Planta, Almacén y PT: columnas, filtros (ubicación, punto, estado, descuadre), estados (Pendiente, Auditado, Conflicto, Cerrado forzado), validación automática, multiubicación, edición superadmin, Re-validar, reabrir, validación manual, cierre forzado, cierre automático C4, colores del descuadre; Exportar conteos (Almacén y Planta, columnas TIPO…CANT A MONTAR).
7. **Producto Terminado** – Maestra PT, Ubicaciones PT (edición incluida la referencia), Responsables PT, Conteo PT por rondas y su auditoría.
8. **Carga de datos** – qué archivo se importa en cada módulo, columnas esperadas, validaciones y protección "BORRAR".
9. **Reglas de negocio y cálculos** – lógica de validación C1–C4, coincidencia con ERP, regla PP controlado/no controlado, suma por bodega, formato de un decimal.
10. **Seguridad y respaldo** – permisos por rol, bloqueos de borrado, respaldos realizados.

## Cómo se construirá
Se leerá cada pantalla y las reglas de la base de datos para describir solo lo que existe realmente, y se generará el .docx con títulos, tablas y listas. No se modifica nada del aplicativo.
