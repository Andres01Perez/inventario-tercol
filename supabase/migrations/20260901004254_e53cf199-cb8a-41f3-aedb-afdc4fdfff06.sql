CREATE OR REPLACE VIEW public.locations_bodega_view AS
SELECT l.id,
    l.inventory_id,
    l.master_reference,
    l.location_name,
    l.location_detail,
    l.punto_referencia,
    l.metodo_conteo,
    l.subcategoria,
    l.observaciones,
    l.assigned_supervisor_id,
    l.assigned_admin_id,
    l.status_c1,
    l.status_c2,
    l.status_c3,
    l.status_c4,
    l.validated_at_round,
    l.validated_quantity,
    l.discovered_at_round,
    l.created_at,
    l.updated_at,
    im.material_type,
    im.control,
    im.cant_total_erp,
    location_bodega(l.assigned_admin_id) AS bodega,
    CASE WHEN location_bodega(l.assigned_admin_id) = 'planta'::text THEN im.audit_round_pl ELSE im.audit_round_alm END AS bodega_round,
    CASE WHEN location_bodega(l.assigned_admin_id) = 'planta'::text THEN im.status_pl ELSE im.status_alm END AS bodega_status,
    erp_bodega(im.material_type, im.cant_alm_mp, im.cant_alm_pp, im.cant_pld, im.cant_plr, COALESCE(location_bodega(l.assigned_admin_id), 'almacen'::text)) AS bodega_erp,
    l.activo,
    l.terminado
FROM locations l
JOIN inventory_master im ON im.referencia = l.master_reference AND im.inventory_id = l.inventory_id;

GRANT SELECT ON public.locations_bodega_view TO authenticated;
GRANT SELECT ON public.locations_bodega_view TO service_role;