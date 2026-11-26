# Valorización del inventario (solo lectura)

Nueva pestaña **Valorización** en Dashboard Auditoría con los 4 indicadores de tu Excel de cierre, por bodega (Almacén/Planta) y familia (MP/PP). No se modifica `validate_bucket`, `erp_bodega_ctl`, `auto_close_c4`, conteos ni validaciones.

## 1. Función de base de datos (nueva, solo lectura)

```sql
CREATE OR REPLACE FUNCTION public.valorizacion_bodega(_inventory_id uuid)
RETURNS TABLE (
  referencia text, familia material_type, bodega text, control text,
  erp_bodega numeric, costo_u numeric, sin_costo boolean,
  cant_a_montar numeric, estado text, num_ubicaciones integer,
  valor_inicial numeric, valor_a_montar numeric, dif_valor numeric
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF NOT (public.is_superadmin(auth.uid()) OR public.is_viewer(auth.uid())) THEN
    RAISE EXCEPTION 'No autorizado';
  END IF;

  RETURN QUERY
  WITH b(bodega) AS (VALUES ('almacen'), ('planta')),
  loc AS (
    SELECT l.master_reference AS ref,
           public.location_bodega(l.assigned_admin_id) AS bodega,
           l.id
    FROM locations l
    WHERE l.inventory_id = _inventory_id AND l.activo
  ),
  agg AS (
    SELECT loc.ref, loc.bodega,
           COUNT(*)::int AS n_ubic,
           COALESCE(SUM(vc.validated_quantity), 0) AS cant
    FROM loc
    LEFT JOIN validated_counts vc
      ON vc.location_id = loc.id AND vc.inventory_id = _inventory_id
    GROUP BY loc.ref, loc.bodega
  ),
  base AS (
    SELECT m.referencia, m.material_type, b.bodega, m.control,
      public.erp_bodega_ctl(m.material_type, m.control, m.cant_alm_mp,
        m.cant_alm_pp, m.cant_pld, m.cant_plr, b.bodega) AS erp,
      CASE WHEN m.material_type = 'MP' THEN m.costo_u_mp ELSE m.costo_u_pp END AS cu,
      COALESCE(a.cant, 0) AS cant,
      CASE WHEN b.bodega = 'almacen' THEN m.status_alm ELSE m.status_pl END AS est,
      COALESCE(a.n_ubic, 0) AS n_ubic
    FROM inventory_master m
    CROSS JOIN b
    LEFT JOIN agg a ON a.ref = m.referencia AND a.bodega = b.bodega
    WHERE m.inventory_id = _inventory_id
      AND m.material_type IN ('MP','PP')
  )
  SELECT referencia, material_type, bodega, control,
         COALESCE(erp,0), COALESCE(cu,0), (cu IS NULL),
         cant, est, n_ubic,
         COALESCE(erp,0) * COALESCE(cu,0),
         cant * COALESCE(cu,0),
         cant * COALESCE(cu,0) - COALESCE(erp,0) * COALESCE(cu,0)
  FROM base
  WHERE NOT (COALESCE(erp,0) = 0 AND n_ubic = 0);
END $$;

REVOKE ALL ON FUNCTION public.valorizacion_bodega(uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.valorizacion_bodega(uuid) TO authenticated;
```

Notas:
- La bodega de cada ubicación usa la misma regla que `locations_bodega_view` (`location_bodega`), así Almacén y Planta nunca se mezclan.
- Una validación en 0 cuenta como faltante real. Sin validación → 0.
- Solo ubicaciones activas. Universo: todas las referencias MP/PP del inventario; se excluyen solo las N/A (ERP 0 y sin ubicaciones).

## 2. Indicadores
- Total inv. inicial = Σ valor_inicial
- Total inv. a montar = Σ valor_a_montar
- Costo dif. negativa = Σ dif_valor < 0 (rojo)
- Costo dif. positiva = Σ dif_valor > 0 (verde)
- Chequeo: A montar − Inicial = Negativa + Positiva → ✓ o la diferencia.

## 3. Pantalla (pestaña "Valorización")
- Selectores Bodega (Almacén/Planta/Ambas) y Familia (MP/PP/Todas), con el inventario seleccionado.
- 4 tarjetas en COP sin decimales + chequeo de consistencia.
- Matriz 2×2 (MP/PP × Almacén/Planta) con los 4 valores.
- Tarjetas de riesgo: nº y $ inicial en pendiente/conflicto/crítico; nº con ERP > 0 sin ubicaciones; nº con descuadre y sin costo.
- Tabla detalle: búsqueda, filtro por estado y signo de diferencia, orden por |dif_valor|; clic abre la auditoría de esa referencia (Almacén o Planta, con la búsqueda prellenada).
- Refresco automático cada 30 s.

## 4. Exportar Excel
`Valorizacion_<inventario>_<fecha>.xlsx`: hoja **Resumen** (4 indicadores por bodega/familia y total) y hoja **Detalle** (todas las columnas de la función), sin redondear.

## Detalles técnicos
- Migración nueva solo con la función (sin tocar tablas ni funciones existentes).
- Archivos: `src/hooks/useValorizacion.ts` (RPC + cálculos puros), `src/lib/valorizacion.ts` (agregados testeables), `src/components/superadmin/ValorizacionPanel.tsx`, pestaña en `DashboardAuditoria.tsx`, exportación con la librería Excel ya usada.
- Test de los indicadores: negativa + positiva = a montar − inicial; validación en 0 genera diferencia negativa completa; sin costo → valor 0 y marcado.
- Tras crear la función, comparar los totales contra una consulta SQL directa en el inventario activo.
