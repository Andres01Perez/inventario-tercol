# Explicación breve de "Lotes de ajustes"

Agregar debajo del título "Lotes de ajustes" (Dashboard Auditoría) un texto corto de ayuda, visible solo para superadmin, sin cambiar ninguna lógica ni dato.

## Texto propuesto

**¿Qué es un lote de ajustes?**
Cada vez que se carga y aplica un Excel de ajustes de cierre, se crea un lote. El lote agrupa todas las referencias ajustadas en esa carga y guarda:

- Quién lo aplicó, cuándo y con qué archivo.
- Por cada referencia: cantidad antes y después, motivo y soporte.
- Una foto de cómo estaba todo antes del ajuste, para poder deshacerlo.

**¿Qué hace el ajuste?** Fija la cantidad final validada (A montar) de la referencia en su bodega. Los conteos C1–C4 no se borran ni se modifican.

**Acciones disponibles**
- **Ver detalle / Exportar**: revisar o descargar en Excel las referencias del lote.
- **Revertir**: devuelve las referencias a como estaban antes del lote. Pide motivo y solo se permite si nadie modificó esas referencias después; así no se pierden cambios posteriores.

Los ajustes aplicados se reflejan en Valorización (columna origen "Ajuste de cierre") y en Auditoría con una etiqueta de ajuste.

## Detalle técnico
- Archivo: `src/components/superadmin/AjustesCierrePanel.tsx`, bloque informativo plegable (Collapsible o Alert con ícono Info) bajo el encabezado.
- Solo presentación; sin migraciones.
