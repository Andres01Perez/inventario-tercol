import { useCallback, useState } from 'react';
import * as XLSX from 'xlsx';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { useInventory } from '@/contexts/InventoryContext';

interface ExportConfig {
  filename: string;
  sheetName: string;
  columns: { key: string; label: string }[];
}

// Redondea cantidades a 1 decimal para evitar decimales largos en Excel
const q1 = (v: number): number => Math.round(v * 10) / 10;

// Helper to fetch all data in batches
type RangeableQuery = {
  range: (from: number, to: number) => PromiseLike<{ data: unknown[] | null; error: unknown }>;
};

async function fetchAllData<T>(
  queryBuilder: () => RangeableQuery,
  batchSize = 1000
): Promise<T[]> {
  const allData: T[] = [];
  let from = 0;

  while (true) {
    const query = queryBuilder();
    const { data, error } = await query.range(from, from + batchSize - 1);

    if (error) throw error;
    if (!data || data.length === 0) break;

    allData.push(...(data as T[]));
    if (data.length < batchSize) break;
    from += batchSize;
  }

  return allData;
}

export function useExportToExcel() {
  const [isExporting, setIsExporting] = useState(false);
  const { inventoryId } = useInventory();

  const exportInventoryMP = useCallback(async (searchTerm?: string) => {
    setIsExporting(true);
    try {
      const data = await fetchAllData<Record<string, unknown>>(() => {
        let query = supabase
          .from('inventory_master')
          .select('referencia, control, cant_alm_mp, cant_prov_d, cant_prov_r, cant_t_mp, costo_u_mp, costo_t')
          .eq('inventory_id', inventoryId!)
          .eq('material_type', 'MP')
          .order('referencia');

        if (searchTerm) {
          query = query.ilike('referencia', `%${searchTerm}%`);
        }

        return query;
      });

      const columns = [
        { key: 'referencia', label: 'Referencia' },
        { key: 'control', label: 'Control' },
        { key: 'cant_alm_mp', label: 'Cant. Almacén' },
        { key: 'cant_prov_d', label: 'Cant. Prov D' },
        { key: 'cant_prov_r', label: 'Cant. Prov R' },
        { key: 'cant_t_mp', label: 'Cant. Total' },
        { key: 'costo_u_mp', label: 'Costo Unit.' },
        { key: 'costo_t', label: 'Costo Total' },
      ];

      exportToExcel(data, { filename: 'inventario_mp', sheetName: 'Inventario MP', columns });
      toast.success(`Exportados ${data.length} registros`);
    } catch (error) {
      console.error('Export error:', error);
      toast.error('Error al exportar');
    } finally {
      setIsExporting(false);
    }
  }, [inventoryId]);

  const exportInventoryPP = useCallback(async (searchTerm?: string) => {
    setIsExporting(true);
    try {
      const data = await fetchAllData<Record<string, unknown>>(() => {
        let query = supabase
          .from('inventory_master')
          .select('referencia, cant_pld, cant_plr, cant_za, cant_prov_pp, cant_total_pp, costo_u_pp, costo_t')
          .eq('inventory_id', inventoryId!)
          .eq('material_type', 'PP')
          .order('referencia');

        if (searchTerm) {
          query = query.ilike('referencia', `%${searchTerm}%`);
        }

        return query;
      });

      const columns = [
        { key: 'referencia', label: 'Referencia' },
        { key: 'cant_pld', label: 'Cant. PLD' },
        { key: 'cant_plr', label: 'Cant. PLR' },
        { key: 'cant_za', label: 'Cant. ZA' },
        { key: 'cant_prov_pp', label: 'Cant. Prov' },
        { key: 'cant_total_pp', label: 'Cant. Total' },
        { key: 'costo_u_pp', label: 'Costo Unit.' },
        { key: 'costo_t', label: 'Costo Total' },
      ];

      exportToExcel(data, { filename: 'inventario_pp', sheetName: 'Inventario PP', columns });
      toast.success(`Exportados ${data.length} registros`);
    } catch (error) {
      console.error('Export error:', error);
      toast.error('Error al exportar');
    } finally {
      setIsExporting(false);
    }
  }, [inventoryId]);

  const exportAuditoria = useCallback(async (filters?: {
    searchTerm?: string;
    materialType?: string;
    status?: string;
    location?: string;
  }) => {
    setIsExporting(true);
    try {
      // 1. Fetch all inventory masters
      const masters = await fetchAllData<{
        referencia: string;
        material_type: string;
        cant_total_erp: number | null;
        status_slug: string | null;
        audit_round: number | null;
      }>(() => {
        let query = supabase
          .from('inventory_master')
          .select('referencia, material_type, cant_total_erp, status_slug, audit_round')
          .eq('inventory_id', inventoryId!)
          .order('referencia');

        if (filters?.searchTerm) {
          query = query.ilike('referencia', `%${filters.searchTerm}%`);
        }
        if (filters?.materialType && filters.materialType !== 'all') {
          query = query.eq('material_type', filters.materialType as 'MP' | 'PP');
        }
        if (filters?.status && filters.status !== 'all') {
          query = query.eq('status_slug', filters.status);
        }

        return query;
      });

      if (masters.length === 0) {
        toast.info('No hay datos para exportar');
        setIsExporting(false);
        return;
      }

      // 2. Fetch all locations
      const refs = masters.map(m => m.referencia);
      const allLocations: {
        id: string;
        master_reference: string;
        location_name: string | null;
        location_detail: string | null;
        subcategoria: string | null;
      }[] = [];

      const batchSize = 100;
      for (let i = 0; i < refs.length; i += batchSize) {
        const batchRefs = refs.slice(i, i + batchSize);
        // Paginación interna: un lote de referencias puede tener más de 1000 ubicaciones
        let from = 0;
        while (true) {
          let query = supabase
            .from('locations')
            .select('id, master_reference, location_name, location_detail, subcategoria')
            .eq('inventory_id', inventoryId!)
            .in('master_reference', batchRefs);

          if (filters?.location && filters.location !== 'all') {
            query = query.eq('location_name', filters.location);
          }

          const { data, error } = await query.order('id').range(from, from + 999);
          if (error) throw error;
          if (!data || data.length === 0) break;
          allLocations.push(...data);
          if (data.length < 1000) break;
          from += 1000;
        }
      }

      // 3. Fetch all counts
      const locationIds = allLocations.map(l => l.id);
      const allCounts: { location_id: string; audit_round: number; quantity_counted: number }[] = [];

      for (let i = 0; i < locationIds.length; i += batchSize) {
        const batchIds = locationIds.slice(i, i + batchSize);
        const { data, error } = await supabase
          .from('inventory_counts')
          .select('location_id, audit_round, quantity_counted')
          .eq('inventory_id', inventoryId!)
          .in('location_id', batchIds);

        if (error) throw error;
        if (data) allCounts.push(...data);
      }

      // 4. Fetch validated quantities from validated_counts
      const allValidated: { location_id: string; validated_quantity: number | null; reason: string | null }[] = [];
      for (let i = 0; i < locationIds.length; i += batchSize) {
        const batchIds = locationIds.slice(i, i + batchSize);
        const { data, error } = await supabase
          .from('validated_counts')
          .select('location_id, validated_quantity, reason')
          .eq('inventory_id', inventoryId!)
          .in('location_id', batchIds);

        if (error) throw error;
        if (data) allValidated.push(...data);
      }
      const validatedMap = new Map(allValidated.map(v => [v.location_id, v]));

      // 5. Build counts map per location
      const countsMap = new Map<string, { c1: number | null; c2: number | null; c3: number | null; c4: number | null; c5: number | null }>();
      allLocations.forEach(loc => {
        countsMap.set(loc.id, { c1: null, c2: null, c3: null, c4: null, c5: null });
      });
      allCounts.forEach(count => {
        const existing = countsMap.get(count.location_id);
        if (existing) {
          const key = `c${count.audit_round}` as keyof typeof existing;
          if (key in existing) {
            existing[key] = count.quantity_counted;
          }
        }
      });

      // 6. Build master lookup
      const masterMap = new Map(masters.map(m => [m.referencia, m]));

      // 7. Build export data
      const exportData = allLocations.map(loc => {
        const master = masterMap.get(loc.master_reference);
        const counts = countsMap.get(loc.id) || { c1: null, c2: null, c3: null, c4: null, c5: null };
        const validated = validatedMap.get(loc.id);

        return {
          referencia: loc.master_reference,
          tipo: master?.material_type || '',
          ubicacion: loc.location_name || '',
          detalle: loc.location_detail || '',
          subcategoria: loc.subcategoria || '',
          cant_erp: master?.cant_total_erp ?? '',
          conteo_1: counts.c1 ?? '',
          conteo_2: counts.c2 ?? '',
          conteo_3: counts.c3 ?? '',
          conteo_4: counts.c4 ?? '',
          conteo_5: counts.c5 ?? '',
          validado: validated?.validated_quantity ?? '',
          motivo_validacion: validated?.reason ?? '',
          estado: master?.status_slug || '',
        };
      });

      const columns = [
        { key: 'referencia', label: 'Referencia' },
        { key: 'tipo', label: 'Tipo' },
        { key: 'ubicacion', label: 'Ubicación' },
        { key: 'detalle', label: 'Detalle' },
        { key: 'subcategoria', label: 'Subcategoría' },
        { key: 'cant_erp', label: 'Cant. ERP' },
        { key: 'conteo_1', label: 'Conteo 1' },
        { key: 'conteo_2', label: 'Conteo 2' },
        { key: 'conteo_3', label: 'Conteo 3' },
        { key: 'conteo_4', label: 'Conteo 4' },
        { key: 'conteo_5', label: 'Conteo 5' },
        { key: 'validado', label: 'Validado' },
        { key: 'motivo_validacion', label: 'Motivo Validación' },
        { key: 'estado', label: 'Estado' },
      ];

      exportToExcel(exportData, { filename: 'auditoria', sheetName: 'Auditoría', columns });
      toast.success(`Exportados ${exportData.length} registros`);
    } catch (error) {
      console.error('Export error:', error);
      toast.error('Error al exportar');
    } finally {
      setIsExporting(false);
    }
  }, [inventoryId]);

  const exportAuditoriaBodega = useCallback(async (params: {
    bodega: 'almacen' | 'planta';
    materialType: 'MP' | 'PP';
    searchTerm?: string;
    status?: string;
    location?: string;
  }) => {
    setIsExporting(true);
    try {
      const { bodega, materialType } = params;

      // 1. Ubicaciones de la bodega/familia (todas, por lotes)
      const locations = await fetchAllData<{
        id: string;
        master_reference: string;
        location_name: string | null;
        location_detail: string | null;
        subcategoria: string | null;
        bodega_erp: number | null;
        bodega_round: number | null;
        bodega_status: string | null;
      }>(() => {
        let query = supabase
          .from('locations_bodega_view')
          .select('id, master_reference, location_name, location_detail, subcategoria, bodega_erp, bodega_round, bodega_status')
          .eq('inventory_id', inventoryId!)
          .eq('bodega', bodega)
          .eq('material_type', materialType)
          .order('master_reference');

        if (params.searchTerm) query = query.ilike('master_reference', `%${params.searchTerm}%`);
        if (params.status && params.status !== 'all') query = query.eq('bodega_status', params.status);
        if (params.location && params.location !== 'all') query = query.eq('location_name', params.location);

        return query;
      });

      if (locations.length === 0) {
        toast.info('No hay datos para exportar');
        setIsExporting(false);
        return;
      }

      const locationIds = locations.map((l) => l.id);
      const refs = [...new Set(locations.map((l) => l.master_reference))];
      const batchSize = 100;

      // 2. Conteos
      const allCounts: { location_id: string; audit_round: number; quantity_counted: number }[] = [];
      for (let i = 0; i < locationIds.length; i += batchSize) {
        const { data, error } = await supabase
          .from('inventory_counts')
          .select('location_id, audit_round, quantity_counted')
          .eq('inventory_id', inventoryId!)
          .in('location_id', locationIds.slice(i, i + batchSize));
        if (error) throw error;
        if (data) allCounts.push(...data);
      }

      // 3. Validaciones
      const allValidated: { location_id: string; validated_quantity: number; audit_round: number; reason: string }[] = [];
      for (let i = 0; i < locationIds.length; i += batchSize) {
        const { data, error } = await supabase
          .from('validated_counts')
          .select('location_id, validated_quantity, audit_round, reason')
          .eq('inventory_id', inventoryId!)
          .in('location_id', locationIds.slice(i, i + batchSize));
        if (error) throw error;
        if (data) allValidated.push(...data);
      }
      const validatedMap = new Map(allValidated.map((v) => [v.location_id, v]));

      // 4. Costos unitarios
      const costMap = new Map<string, number | null>();
      for (let i = 0; i < refs.length; i += batchSize) {
        const { data, error } = await supabase
          .from('inventory_master')
          .select('referencia, costo_u_mp, costo_u_pp')
          .eq('inventory_id', inventoryId!)
          .in('referencia', refs.slice(i, i + batchSize));
        if (error) throw error;
        data?.forEach((m) => costMap.set(m.referencia, materialType === 'MP' ? m.costo_u_mp : m.costo_u_pp));
      }

      const countsMap = new Map<string, Record<string, number | null>>();
      locationIds.forEach((id) => countsMap.set(id, { c1: null, c2: null, c3: null, c4: null, c5: null }));
      allCounts.forEach((c) => {
        const entry = countsMap.get(c.location_id);
        if (entry) entry[`c${c.audit_round}`] = c.quantity_counted;
      });

      const bodegaLabel = bodega === 'almacen' ? 'Almacén' : 'Planta';

      const detalle = locations.map((loc) => {
        const counts = countsMap.get(loc.id) || {};
        const validated = validatedMap.get(loc.id);
        return {
          referencia: loc.master_reference,
          tipo: materialType,
          bodega: bodegaLabel,
          ubicacion: loc.location_name || '',
          detalle: loc.location_detail || '',
          subcategoria: loc.subcategoria || '',
          conteo_1: counts.c1 != null ? q1(counts.c1) : '',
          conteo_2: counts.c2 != null ? q1(counts.c2) : '',
          conteo_3: counts.c3 != null ? q1(counts.c3) : '',
          conteo_4: counts.c4 != null ? q1(counts.c4) : '',
          conteo_5: counts.c5 != null ? q1(counts.c5) : '',
          validado: validated?.validated_quantity != null ? q1(validated.validated_quantity) : '',
          ronda_validacion: validated?.audit_round ?? '',
          motivo: validated?.reason ?? '',
        };
      });

      // Resumen por referencia
      const resumenMap = new Map<string, {
        referencia: string; tipo: string; bodega: string; erp: number; validado: number;
        estado: string; ronda: number; ubicaciones: number;
      }>();
      locations.forEach((loc) => {
        const v = validatedMap.get(loc.id);
        const existing = resumenMap.get(loc.master_reference);
        if (existing) {
          existing.validado += Number(v?.validated_quantity ?? 0);
          existing.ubicaciones += 1;
        } else {
          resumenMap.set(loc.master_reference, {
            referencia: loc.master_reference,
            tipo: materialType,
            bodega: bodegaLabel,
            erp: Number(loc.bodega_erp ?? 0),
            validado: Number(v?.validated_quantity ?? 0),
            estado: loc.bodega_status || '',
            ronda: loc.bodega_round || 1,
            ubicaciones: 1,
          });
        }
      });

      const resumen = [...resumenMap.values()].map((r) => {
        const costo = costMap.get(r.referencia) ?? null;
        const descuadre = r.validado - r.erp;
        return {
          referencia: r.referencia,
          tipo: r.tipo,
          bodega: r.bodega,
          ubicaciones: r.ubicaciones,
          erp: q1(r.erp),
          validado: q1(r.validado),
          descuadre: q1(descuadre),
          costo_unitario: costo ?? '',
          descuadre_valor: costo !== null ? q1(descuadre * costo) : '',
          estado: r.estado,
          ronda: r.ronda,
        };
      });

      exportMultiSheet(`auditoria_${bodega}_${materialType.toLowerCase()}`, [
        {
          sheetName: 'Detalle por ubicación',
          data: detalle,
          columns: [
            { key: 'referencia', label: 'Referencia' },
            { key: 'tipo', label: 'Tipo' },
            { key: 'bodega', label: 'Bodega' },
            { key: 'ubicacion', label: 'Ubicación' },
            { key: 'detalle', label: 'Detalle' },
            { key: 'subcategoria', label: 'Subcategoría' },
            { key: 'conteo_1', label: 'C1' },
            { key: 'conteo_2', label: 'C2' },
            { key: 'conteo_3', label: 'C3' },
            { key: 'conteo_4', label: 'C4' },
            { key: 'conteo_5', label: 'C5' },
            { key: 'validado', label: 'Validado' },
            { key: 'ronda_validacion', label: 'Ronda Validación' },
            { key: 'motivo', label: 'Motivo' },
          ],
        },
        {
          sheetName: 'Resumen por referencia',
          data: resumen,
          columns: [
            { key: 'referencia', label: 'Referencia' },
            { key: 'tipo', label: 'Tipo' },
            { key: 'bodega', label: 'Bodega' },
            { key: 'ubicaciones', label: 'Ubicaciones' },
            { key: 'erp', label: 'ERP Bodega' },
            { key: 'validado', label: 'Total Validado' },
            { key: 'descuadre', label: 'Descuadre (und)' },
            { key: 'costo_unitario', label: 'Costo Unitario' },
            { key: 'descuadre_valor', label: 'Descuadre ($)' },
            { key: 'estado', label: 'Estado' },
            { key: 'ronda', label: 'Ronda' },
          ],
        },
      ]);

      toast.success(`Exportadas ${resumen.length} referencias (${detalle.length} ubicaciones)`);
    } catch (error) {
      console.error('Export error:', error);
      toast.error('Error al exportar');
    } finally {
      setIsExporting(false);
    }
  }, [inventoryId]);

  const exportAuditoriaPT = useCallback(async (params?: {
    searchTerm?: string;
    status?: string;
    piso?: string;
  }) => {
    setIsExporting(true);
    try {
      // 1. Maestra PT
      const masters = await fetchAllData<{
        referencia: string;
        descripcion: string | null;
        cant_erp: number | null;
        status_slug: string | null;
        audit_round: number | null;
      }>(() => {
        let query = supabase
          .from('pt_master')
          .select('referencia, descripcion, cant_erp, status_slug, audit_round')
          .eq('inventory_id', inventoryId!)
          .order('referencia');
        if (params?.searchTerm) {
          query = query.or(`referencia.ilike.%${params.searchTerm}%,descripcion.ilike.%${params.searchTerm}%`);
        }
        if (params?.status && params.status !== 'all') query = query.eq('status_slug', params.status);
        return query;
      });

      if (masters.length === 0) {
        toast.info('No hay datos para exportar');
        setIsExporting(false);
        return;
      }

      const masterMap = new Map(masters.map((m) => [m.referencia, m]));

      // 2. Ubicaciones PT
      const locations = await fetchAllData<{
        id: string; referencia: string; piso: string; prodc: string | null;
        ubic: string | null; linea: string | null; ue: number | null;
      }>(() => {
        let query = supabase
          .from('pt_locations')
          .select('id, referencia, piso, prodc, ubic, linea, ue')
          .eq('inventory_id', inventoryId!)
          .eq('activo', true)
          .order('referencia');
        if (params?.piso && params.piso !== 'all') query = query.eq('piso', params.piso);
        return query;
      });

      const locationIds = locations.map((l) => l.id);
      const batchSize = 100;

      // 3. Conteos
      const allCounts: { location_id: string; audit_round: number; quantity_counted: number }[] = [];
      for (let i = 0; i < locationIds.length; i += batchSize) {
        const { data, error } = await supabase
          .from('pt_counts')
          .select('location_id, audit_round, quantity_counted')
          .eq('inventory_id', inventoryId!)
          .in('location_id', locationIds.slice(i, i + batchSize));
        if (error) throw error;
        if (data) allCounts.push(...data);
      }

      // 4. Validaciones
      const allValidated: { location_id: string; validated_quantity: number; audit_round: number; reason: string }[] = [];
      for (let i = 0; i < locationIds.length; i += batchSize) {
        const { data, error } = await supabase
          .from('pt_validated_counts')
          .select('location_id, validated_quantity, audit_round, reason')
          .eq('inventory_id', inventoryId!)
          .in('location_id', locationIds.slice(i, i + batchSize));
        if (error) throw error;
        if (data) allValidated.push(...data);
      }
      const validatedMap = new Map(allValidated.map((v) => [v.location_id, v]));

      const countsMap = new Map<string, Record<string, number | null>>();
      locationIds.forEach((id) => countsMap.set(id, { c1: null, c2: null, c3: null, c4: null }));
      allCounts.forEach((c) => {
        const entry = countsMap.get(c.location_id);
        if (entry) entry[`c${c.audit_round}`] = c.quantity_counted;
      });

      const detalle = locations
        .filter((loc) => masterMap.has(loc.referencia))
        .map((loc) => {
          const counts = countsMap.get(loc.id) || {};
          const validated = validatedMap.get(loc.id);
          return {
            referencia: loc.referencia,
            descripcion: masterMap.get(loc.referencia)?.descripcion || '',
            piso: loc.piso,
            prodc: loc.prodc || '',
            ubic: loc.ubic || '',
            linea: loc.linea || '',
            ue: loc.ue ?? '',
            conteo_1: counts.c1 != null ? q1(counts.c1) : '',
            conteo_2: counts.c2 != null ? q1(counts.c2) : '',
            conteo_3: counts.c3 != null ? q1(counts.c3) : '',
            conteo_4: counts.c4 != null ? q1(counts.c4) : '',
            validado: validated?.validated_quantity != null ? q1(validated.validated_quantity) : '',
            ronda_validacion: validated?.audit_round ?? '',
            motivo: validated?.reason ?? '',
          };
        });

      const validadoPorRef = new Map<string, { validado: number; ubicaciones: number }>();
      locations.forEach((loc) => {
        if (!masterMap.has(loc.referencia)) return;
        const v = validatedMap.get(loc.id);
        const acc = validadoPorRef.get(loc.referencia) || { validado: 0, ubicaciones: 0 };
        acc.validado += Number(v?.validated_quantity ?? 0);
        acc.ubicaciones += 1;
        validadoPorRef.set(loc.referencia, acc);
      });

      const resumen = masters.map((m) => {
        const agg = validadoPorRef.get(m.referencia) || { validado: 0, ubicaciones: 0 };
        const erp = Number(m.cant_erp ?? 0);
        return {
          referencia: m.referencia,
          descripcion: m.descripcion || '',
          ubicaciones: agg.ubicaciones,
          erp: q1(erp),
          validado: q1(agg.validado),
          descuadre: agg.validado > 0 ? q1(agg.validado - erp) : '',
          estado: m.status_slug || '',
          ronda: m.audit_round || 1,
        };
      });

      exportMultiSheet('auditoria_pt', [
        {
          sheetName: 'Detalle por ubicación',
          data: detalle,
          columns: [
            { key: 'referencia', label: 'Referencia' },
            { key: 'descripcion', label: 'Descripción' },
            { key: 'piso', label: 'Piso' },
            { key: 'prodc', label: 'Prodc' },
            { key: 'ubic', label: 'Ubic' },
            { key: 'linea', label: 'Línea' },
            { key: 'ue', label: 'U.E' },
            { key: 'conteo_1', label: 'C1' },
            { key: 'conteo_2', label: 'C2' },
            { key: 'conteo_3', label: 'C3' },
            { key: 'conteo_4', label: 'C4' },
            { key: 'validado', label: 'Validado' },
            { key: 'ronda_validacion', label: 'Ronda Validación' },
            { key: 'motivo', label: 'Motivo' },
          ],
        },
        {
          sheetName: 'Resumen por referencia',
          data: resumen,
          columns: [
            { key: 'referencia', label: 'Referencia' },
            { key: 'descripcion', label: 'Descripción' },
            { key: 'ubicaciones', label: 'Ubicaciones' },
            { key: 'erp', label: 'ERP' },
            { key: 'validado', label: 'Total Validado' },
            { key: 'descuadre', label: 'Descuadre (und)' },
            { key: 'estado', label: 'Estado' },
            { key: 'ronda', label: 'Ronda' },
          ],
        },
      ]);

      toast.success(`Exportadas ${resumen.length} referencias PT (${detalle.length} ubicaciones)`);
    } catch (error) {
      console.error('Export error:', error);
      toast.error('Error al exportar');
    } finally {
      setIsExporting(false);
    }
  }, [inventoryId]);

  return { isExporting, exportInventoryMP, exportInventoryPP, exportAuditoria, exportAuditoriaBodega, exportAuditoriaPT };
}

function exportMultiSheet(
  filename: string,
  sheets: { sheetName: string; data: Record<string, unknown>[]; columns: { key: string; label: string }[] }[]
) {
  const workbook = XLSX.utils.book_new();
  sheets.forEach((sheet) => {
    const rows = sheet.data.map((row) => {
      const mapped: Record<string, unknown> = {};
      sheet.columns.forEach((col) => {
        mapped[col.label] = row[col.key] ?? '';
      });
      return mapped;
    });
    const worksheet = XLSX.utils.json_to_sheet(rows);
    XLSX.utils.book_append_sheet(workbook, worksheet, sheet.sheetName.slice(0, 31));
  });
  const date = new Date().toISOString().split('T')[0];
  XLSX.writeFile(workbook, `${filename}_${date}.xlsx`);
}

function exportToExcel(data: Record<string, unknown>[], config: ExportConfig) {
  // Map data to have column labels as headers
  const exportRows = data.map(row => {
    const mapped: Record<string, unknown> = {};
    config.columns.forEach(col => {
      mapped[col.label] = row[col.key] ?? '';
    });
    return mapped;
  });

  const worksheet = XLSX.utils.json_to_sheet(exportRows);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, config.sheetName);

  // Generate filename with date
  const date = new Date().toISOString().split('T')[0];
  XLSX.writeFile(workbook, `${config.filename}_${date}.xlsx`);
}
