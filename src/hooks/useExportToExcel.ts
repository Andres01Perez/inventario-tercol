import { useCallback, useState } from 'react';
import * as XLSX from 'xlsx';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

interface ExportConfig {
  filename: string;
  sheetName: string;
  columns: { key: string; label: string }[];
}

// Helper to fetch all data in batches
async function fetchAllData<T>(
  queryBuilder: () => ReturnType<ReturnType<typeof supabase.from>['select']>,
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

  const exportInventoryMP = useCallback(async (searchTerm?: string) => {
    setIsExporting(true);
    try {
      const data = await fetchAllData<Record<string, unknown>>(() => {
        let query = supabase
          .from('inventory_master')
          .select('referencia, control, cant_alm_mp, cant_prov_d, cant_prov_r, cant_t_mp, costo_u_mp, costo_t')
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
  }, []);

  const exportInventoryPP = useCallback(async (searchTerm?: string) => {
    setIsExporting(true);
    try {
      const data = await fetchAllData<Record<string, unknown>>(() => {
        let query = supabase
          .from('inventory_master')
          .select('referencia, cant_pld, cant_plr, cant_za, cant_prov_pp, cant_total_pp, costo_u_pp, costo_t')
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
  }, []);

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
        validated_quantity: number | null;
      }[] = [];

      const batchSize = 100;
      for (let i = 0; i < refs.length; i += batchSize) {
        const batchRefs = refs.slice(i, i + batchSize);
        let query = supabase
          .from('locations')
          .select('id, master_reference, location_name, location_detail, subcategoria, validated_quantity')
          .in('master_reference', batchRefs);

        if (filters?.location && filters.location !== 'all') {
          query = query.eq('location_name', filters.location);
        }

        const { data, error } = await query;
        if (error) throw error;
        if (data) allLocations.push(...data);
      }

      // 3. Fetch all counts
      const locationIds = allLocations.map(l => l.id);
      const allCounts: { location_id: string; audit_round: number; quantity_counted: number }[] = [];

      for (let i = 0; i < locationIds.length; i += batchSize) {
        const batchIds = locationIds.slice(i, i + batchSize);
        const { data, error } = await supabase
          .from('inventory_counts')
          .select('location_id, audit_round, quantity_counted')
          .in('location_id', batchIds);

        if (error) throw error;
        if (data) allCounts.push(...data);
      }

      // 4. Build counts map per location
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

      // 5. Build master lookup
      const masterMap = new Map(masters.map(m => [m.referencia, m]));

      // 6. Build export data
      const exportData = allLocations.map(loc => {
        const master = masterMap.get(loc.master_reference);
        const counts = countsMap.get(loc.id) || { c1: null, c2: null, c3: null, c4: null, c5: null };

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
          validado: loc.validated_quantity ?? '',
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
  }, []);

  return { isExporting, exportInventoryMP, exportInventoryPP, exportAuditoria };
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
