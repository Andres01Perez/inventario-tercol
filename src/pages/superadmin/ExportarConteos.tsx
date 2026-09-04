import React, { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useInventory } from '@/contexts/InventoryContext';
import ReadOnlyBanner from '@/components/shared/ReadOnlyBanner';
import AppLayout from '@/components/layout/AppLayout';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Pagination,
  PaginationContent,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
} from '@/components/ui/pagination';
import { Download, Search, RefreshCw, CheckCircle2, MapPin, Warehouse } from 'lucide-react';
import { toast } from 'sonner';
import * as XLSX from 'xlsx';

const ITEMS_PER_PAGE = 20;

const round1 = (n: number) => Math.round((Number(n) || 0) * 10) / 10;

interface AuditedReference {
  material_type: string;
  referencia: string;
  conteo: number;
  cantidad_validada: number;
  motivo: string;
}

interface BodegaRow {
  referencia: string;
  tipo: string;
  bodega: string;
  erp: number;
  c1: number;
  c2: number;
  c3: number;
  c4: number;
  dif1: number;
  dif2: number;
  dif3: number;
  dif4: number;
  resultado: string;
  a_montar: string;
  cant_a_montar: number | null;
  ubicaciones: number;
}

interface CountByLocation {
  material_type: string;
  referencia: string;
  ubicacion: string;
  ubicacion_detallada: string;
  punto_referencia: string;
  conteo_1: number | null;
  conteo_2: number | null;
  conteo_3: number | null;
  conteo_4: number | null;
  validado: number | null;
  motivo: string;
}

// Helper to fetch all records in batches (Supabase limits to 1000 per query)
async function fetchAllInBatches<T>(
  table: 'locations' | 'inventory_counts' | 'inventory_master' | 'validated_counts',
  selectQuery: string,
  inventoryId: string,
  batchSize = 1000
): Promise<T[]> {
  let allData: T[] = [];
  let from = 0;
  let hasMore = true;

  while (hasMore) {
    const { data, error } = await supabase
      .from(table)
      .select(selectQuery)
      .eq('inventory_id', inventoryId)
      .range(from, from + batchSize - 1);

    if (error) throw error;

    if (data && data.length > 0) {
      allData = [...allData, ...(data as T[])];
      from += batchSize;
      hasMore = data.length === batchSize;
    } else {
      hasMore = false;
    }
  }

  return allData;
}

const ExportarConteos: React.FC = () => {
  const navigate = useNavigate();
  const { profile } = useAuth();
  const { inventoryId } = useInventory();
  
  // Tab Validados state
  const [searchTerm, setSearchTerm] = useState('');
  const [materialTypeFilter, setMaterialTypeFilter] = useState<string>('all');
  const [currentPage, setCurrentPage] = useState(1);
  const [isExporting, setIsExporting] = useState(false);

  // Tab Por Ubicación state
  const [searchTermLoc, setSearchTermLoc] = useState('');
  const [materialTypeFilterLoc, setMaterialTypeFilterLoc] = useState<string>('all');
  const [currentPageLoc, setCurrentPageLoc] = useState(1);
  const [isExportingLoc, setIsExportingLoc] = useState(false);

  // Tab Almacén state
  const [searchTermAlm, setSearchTermAlm] = useState('');
  const [currentPageAlm, setCurrentPageAlm] = useState(1);
  const [isExportingAlm, setIsExportingAlm] = useState(false);



  // ===== TAB VALIDADOS: Query =====
  const { data: auditedReferences, isLoading, refetch } = useQuery({
    queryKey: ['export-auditados', searchTerm, materialTypeFilter, inventoryId],
    enabled: !!inventoryId,
    queryFn: async () => {
      let masterQuery = supabase
        .from('inventory_master')
        .select('referencia, material_type')
        .eq('inventory_id', inventoryId!)
        .eq('status_slug', 'auditado');

      if (materialTypeFilter !== 'all') {
        masterQuery = masterQuery.eq('material_type', materialTypeFilter as 'MP' | 'PP' | 'PT');
      }

      if (searchTerm) {
        masterQuery = masterQuery.ilike('referencia', `%${searchTerm}%`);
      }

      // Paginado: sin .range() Supabase corta en 1000 referencias
      const masters: { referencia: string; material_type: string }[] = [];
      {
        let from = 0;
        while (true) {
          const { data, error } = await masterQuery
            .order('referencia')
            .range(from, from + 999);
          if (error) throw error;
          if (!data || data.length === 0) break;
          masters.push(...data);
          if (data.length < 1000) break;
          from += 1000;
        }
      }
      if (masters.length === 0) return [];

      const allValidated: {
        master_reference: string;
        validated_quantity: number;
        audit_round: number;
        reason: string;
      }[] = [];

      // Lotes de 200 referencias y paginación interna: una sola referencia
      // puede tener cientos de ubicaciones validadas.
      for (let i = 0; i < masters.length; i += 200) {
        const batchRefs = masters.slice(i, i + 200).map(m => m.referencia);
        let from = 0;
        while (true) {
          const { data, error } = await supabase
            .from('validated_counts')
            .select('master_reference, validated_quantity, audit_round, reason')
            .eq('inventory_id', inventoryId!)
            .in('master_reference', batchRefs)
            .order('master_reference')
            .range(from, from + 999);

          if (error) throw error;
          if (!data || data.length === 0) break;
          allValidated.push(...data);
          if (data.length < 1000) break;
          from += 1000;
        }
      }

      const grouped: AuditedReference[] = masters.map(master => {
        const rows = allValidated.filter(v => v.master_reference === master.referencia);
        const totalValidado = rows.reduce((sum, v) => sum + (Number(v.validated_quantity) || 0), 0);
        const round = rows[0]?.audit_round || 1;
        const reason = rows[0]?.reason || '';

        return {
          material_type: master.material_type,
          referencia: master.referencia,
          conteo: round,
          cantidad_validada: totalValidado,
          motivo: reason,
        };
      });

      return grouped;
    },
    staleTime: 30 * 1000,
  });

  // ===== TAB POR UBICACIÓN: Query =====
  const { data: countsByLocation, isLoading: isLoadingLoc, refetch: refetchLoc } = useQuery({
    queryKey: ['export-counts-by-location', searchTermLoc, materialTypeFilterLoc, inventoryId],
    enabled: !!inventoryId,
    queryFn: async () => {
      // Fetch ALL records using batch pagination to avoid Supabase 1000 row limit
      const [locations, counts, masters, validated] = await Promise.all([
        fetchAllInBatches<{ id: string; master_reference: string; location_name: string | null; location_detail: string | null; punto_referencia: string | null }>(
          'locations',
          'id, master_reference, location_name, location_detail, punto_referencia',
          inventoryId!
        ),
        fetchAllInBatches<{ location_id: string; audit_round: number; quantity_counted: number }>(
          'inventory_counts',
          'location_id, audit_round, quantity_counted',
          inventoryId!
        ),
        fetchAllInBatches<{ referencia: string; material_type: string }>(
          'inventory_master',
          'referencia, material_type',
          inventoryId!
        ),
        fetchAllInBatches<{ location_id: string; validated_quantity: number; reason: string }>(
          'validated_counts',
          'location_id, validated_quantity, reason',
          inventoryId!
        ),
      ]);

      if (locations.length === 0) return [];

      // Create lookup maps for performance
      const masterMap = new Map(masters.map(m => [m.referencia, m.material_type]));
      const countsMap = new Map<string, Map<number, number>>();
      for (const c of counts) {
        if (!countsMap.has(c.location_id)) {
          countsMap.set(c.location_id, new Map());
        }
        countsMap.get(c.location_id)!.set(c.audit_round, c.quantity_counted);
      }
      const validatedMap = new Map(validated.map(v => [v.location_id, v]));

      // Pivot data: one row per location with conteo_1, conteo_2, conteo_3, conteo_4
      const pivotedData: CountByLocation[] = locations.map(location => {
        const locationCounts = countsMap.get(location.id);
        const validatedRow = validatedMap.get(location.id);

        return {
          material_type: masterMap.get(location.master_reference) || '',
          referencia: location.master_reference,
          ubicacion: location.location_name || '',
          ubicacion_detallada: location.location_detail || '',
          punto_referencia: location.punto_referencia || '',
          conteo_1: locationCounts?.get(1) ?? null,
          conteo_2: locationCounts?.get(2) ?? null,
          conteo_3: locationCounts?.get(3) ?? null,
          conteo_4: locationCounts?.get(4) ?? null,
          validado: validatedRow?.validated_quantity ?? null,
          motivo: validatedRow?.reason || '',
        };
      });

      // Filter by material type
      let filtered = pivotedData;
      if (materialTypeFilterLoc !== 'all') {
        filtered = filtered.filter(row => row.material_type === materialTypeFilterLoc);
      }

      // Filter by search term
      if (searchTermLoc) {
        const term = searchTermLoc.toLowerCase();
        filtered = filtered.filter(row => row.referencia.toLowerCase().includes(term));
      }

      return filtered;
    },
    staleTime: 30 * 1000,
  });

  // ===== TAB ALMACÉN: una referencia por fila =====
  const { data: bodegaRows, isLoading: isLoadingAlm, refetch: refetchAlm } = useQuery({
    queryKey: ['export-bodega-almacen', inventoryId],
    enabled: !!inventoryId,
    queryFn: async (): Promise<BodegaRow[]> => {
      // 1. Ubicaciones de almacén (paginado, sin tope de 1000)
      const locs: {
        id: string;
        master_reference: string;
        material_type: string | null;
        bodega_erp: number | null;
        bodega_status: string | null;
      }[] = [];
      let from = 0;
      while (true) {
        const { data, error } = await supabase
          .from('locations_bodega_view')
          .select('id, master_reference, material_type, bodega_erp, bodega_status')
          .eq('inventory_id', inventoryId!)
          .eq('bodega', 'almacen')
          .order('master_reference')
          .range(from, from + 999);
        if (error) throw error;
        if (!data || data.length === 0) break;
        locs.push(...(data as typeof locs));
        if (data.length < 1000) break;
        from += 1000;
      }
      if (locs.length === 0) return [];

      const locIds = new Set(locs.map(l => l.id));

      const counts = await fetchAllInBatches<{ location_id: string; audit_round: number; quantity_counted: number }>(
        'inventory_counts',
        'location_id, audit_round, quantity_counted',
        inventoryId!
      );
      const validated = await fetchAllInBatches<{
        location_id: string;
        master_reference: string;
        validated_quantity: number;
        audit_round: number;
        reason: string;
      }>(
        'validated_counts',
        'location_id, master_reference, validated_quantity, audit_round, reason',
        inventoryId!
      );

      const countsByLoc = new Map<string, Map<number, number>>();
      for (const c of counts) {
        if (!locIds.has(c.location_id)) continue;
        if (!countsByLoc.has(c.location_id)) countsByLoc.set(c.location_id, new Map());
        countsByLoc.get(c.location_id)!.set(c.audit_round, Number(c.quantity_counted) || 0);
      }

      const validatedByLoc = new Map(validated.filter(v => locIds.has(v.location_id)).map(v => [v.location_id, v]));

      // 2. Agrupar por referencia
      const byRef = new Map<string, BodegaRow & { hasValidated: boolean }>();
      for (const l of locs) {
        const key = l.master_reference;
        let row = byRef.get(key);
        if (!row) {
          row = {
            referencia: key,
            tipo: l.material_type || '',
            bodega: 'Almacén',
            erp: round1(Number(l.bodega_erp) || 0),
            c1: 0, c2: 0, c3: 0, c4: 0,
            dif1: 0, dif2: 0, dif3: 0, dif4: 0,
            resultado: '',
            a_montar: '',
            cant_a_montar: null,
            hasValidated: false,
          };
          byRef.set(key, row);
        }
        const lc = countsByLoc.get(l.id);
        row.c1 += lc?.get(1) ?? 0;
        row.c2 += lc?.get(2) ?? 0;
        row.c3 += lc?.get(3) ?? 0;
        row.c4 += lc?.get(4) ?? 0;

        const v = validatedByLoc.get(l.id);
        if (v) {
          row.hasValidated = true;
          row.cant_a_montar = (row.cant_a_montar ?? 0) + (Number(v.validated_quantity) || 0);
          if (!row.a_montar) row.a_montar = `C${v.audit_round}`;
          if (!row.resultado) row.resultado = v.reason || '';
        } else if (!row.resultado && !row.hasValidated) {
          row.resultado = l.bodega_status || '';
        }
      }

      const rows: BodegaRow[] = Array.from(byRef.values()).map(r => {
        const c1 = round1(r.c1), c2 = round1(r.c2), c3 = round1(r.c3), c4 = round1(r.c4);
        return {
          referencia: r.referencia,
          tipo: r.tipo,
          bodega: r.bodega,
          erp: r.erp,
          c1, c2, c3, c4,
          dif1: round1(c1 - r.erp),
          dif2: round1(c2 - r.erp),
          dif3: round1(c3 - r.erp),
          dif4: round1(c4 - r.erp),
          resultado: r.resultado,
          a_montar: r.a_montar,
          cant_a_montar: r.cant_a_montar === null ? null : round1(r.cant_a_montar),
        };
      });

      rows.sort((a, b) => a.referencia.localeCompare(b.referencia));
      return rows;
    },
    staleTime: 30 * 1000,
  });

  const filteredBodegaRows = useMemo(() => {
    if (!bodegaRows) return [];
    const term = searchTermAlm.trim().toLowerCase();
    if (!term) return bodegaRows;
    return bodegaRows.filter(r => r.referencia.toLowerCase().includes(term));
  }, [bodegaRows, searchTermAlm]);

  const totalPagesAlm = Math.ceil(filteredBodegaRows.length / ITEMS_PER_PAGE);
  const paginatedBodega = useMemo(() => {
    const start = (currentPageAlm - 1) * ITEMS_PER_PAGE;
    return filteredBodegaRows.slice(start, start + ITEMS_PER_PAGE);
  }, [filteredBodegaRows, currentPageAlm]);

  const handleExportAlmacen = async () => {
    if (!filteredBodegaRows.length) {
      toast.error('No hay datos para exportar');
      return;
    }
    setIsExportingAlm(true);
    try {
      const exportData = filteredBodegaRows.map(r => ({
        REFERENCIA: r.referencia,
        TIPO: r.tipo,
        BODEGA: r.bodega,
        ERP: r.erp,
        CONTEO1: r.c1,
        CONTEO2: r.c2,
        CONTEO3: r.c3,
        CONTEO4: r.c4,
        DIF1: r.dif1,
        DIF2: r.dif2,
        DIF3: r.dif3,
        DIF4: r.dif4,
        RESULTADO: r.resultado,
        'A MONTAR': r.a_montar,
        'CANT A MONTAR': r.cant_a_montar ?? 0,
      }));
      const worksheet = XLSX.utils.json_to_sheet(exportData);
      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, 'Almacén');
      const today = new Date().toISOString().split('T')[0];
      XLSX.writeFile(workbook, `conteos_almacen_${today}.xlsx`);
      toast.success(`Exportadas ${exportData.length} referencias de almacén`);
    } catch (error) {
      console.error('Export error:', error);
      toast.error('Error al exportar');
    } finally {
      setIsExportingAlm(false);
    }
  };


  // Pagination - Validados
  const totalPages = Math.ceil((auditedReferences?.length || 0) / ITEMS_PER_PAGE);
  const paginatedReferences = useMemo(() => {
    const start = (currentPage - 1) * ITEMS_PER_PAGE;
    return auditedReferences?.slice(start, start + ITEMS_PER_PAGE) || [];
  }, [auditedReferences, currentPage]);

  // Pagination - Por Ubicación
  const totalPagesLoc = Math.ceil((countsByLocation?.length || 0) / ITEMS_PER_PAGE);
  const paginatedLocations = useMemo(() => {
    const start = (currentPageLoc - 1) * ITEMS_PER_PAGE;
    return countsByLocation?.slice(start, start + ITEMS_PER_PAGE) || [];
  }, [countsByLocation, currentPageLoc]);

  // Reset page when filters change
  React.useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm, materialTypeFilter]);

  React.useEffect(() => {
    setCurrentPageLoc(1);
  }, [searchTermLoc, materialTypeFilterLoc]);

  React.useEffect(() => {
    setCurrentPageAlm(1);
  }, [searchTermAlm]);

  // Export function - Validados
  const handleExport = async () => {
    if (!auditedReferences || auditedReferences.length === 0) {
      toast.error('No hay datos para exportar');
      return;
    }

    setIsExporting(true);
    try {
      const exportData = auditedReferences.map((ref) => ({
        'Tipo Material': ref.material_type,
        'Referencia': ref.referencia,
        'Conteo': ref.conteo,
        'Cantidad Validada': ref.cantidad_validada,
        'Motivo': ref.motivo,
      }));

      const worksheet = XLSX.utils.json_to_sheet(exportData);
      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, 'Referencias Auditadas');

      const today = new Date().toISOString().split('T')[0];
      const filename = `referencias_auditadas_${today}.xlsx`;
      XLSX.writeFile(workbook, filename);

      toast.success(`Exportadas ${auditedReferences.length} referencias auditadas`);
    } catch (error) {
      console.error('Export error:', error);
      toast.error('Error al exportar');
    } finally {
      setIsExporting(false);
    }
  };

  // Export function - Por Ubicación
  const handleExportByLocation = async () => {
    if (!countsByLocation || countsByLocation.length === 0) {
      toast.error('No hay datos para exportar');
      return;
    }

    setIsExportingLoc(true);
    try {
      const exportData = countsByLocation.map((row) => ({
        'Tipo Material': row.material_type,
        'Referencia': row.referencia,
        'Ubicación': row.ubicacion,
        'Ubicación Detallada': row.ubicacion_detallada,
        'Punto Referencia': row.punto_referencia,
        'Conteo 1': row.conteo_1 ?? '',
        'Conteo 2': row.conteo_2 ?? '',
        'Conteo 3': row.conteo_3 ?? '',
        'Conteo 4': row.conteo_4 ?? '',
        'Validado': row.validado ?? '',
        'Motivo': row.motivo,
      }));

      const worksheet = XLSX.utils.json_to_sheet(exportData);
      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, 'Conteos por Ubicación');

      const today = new Date().toISOString().split('T')[0];
      const filename = `conteos_por_ubicacion_${today}.xlsx`;
      XLSX.writeFile(workbook, filename);

      toast.success(`Exportadas ${countsByLocation.length} ubicaciones`);
    } catch (error) {
      console.error('Export error:', error);
      toast.error('Error al exportar');
    } finally {
      setIsExportingLoc(false);
    }
  };

  // Render pagination helper
  const renderPagination = (current: number, total: number, setCurrent: (p: number) => void) => {
    if (total <= 1) return null;
    return (
      <div className="mt-4">
        <Pagination>
          <PaginationContent>
            <PaginationItem>
              <PaginationPrevious 
                onClick={() => setCurrent(Math.max(1, current - 1))}
                className={current === 1 ? 'pointer-events-none opacity-50' : 'cursor-pointer'}
              />
            </PaginationItem>
            {Array.from({ length: Math.min(5, total) }, (_, i) => {
              let pageNum: number;
              if (total <= 5) {
                pageNum = i + 1;
              } else if (current <= 3) {
                pageNum = i + 1;
              } else if (current >= total - 2) {
                pageNum = total - 4 + i;
              } else {
                pageNum = current - 2 + i;
              }
              return (
                <PaginationItem key={pageNum}>
                  <PaginationLink
                    onClick={() => setCurrent(pageNum)}
                    isActive={current === pageNum}
                    className="cursor-pointer"
                  >
                    {pageNum}
                  </PaginationLink>
                </PaginationItem>
              );
            })}
            <PaginationItem>
              <PaginationNext 
                onClick={() => setCurrent(Math.min(total, current + 1))}
                className={current === total ? 'pointer-events-none opacity-50' : 'cursor-pointer'}
              />
            </PaginationItem>
          </PaginationContent>
        </Pagination>
      </div>
    );
  };

  return (
    <AppLayout
      title="Exportar Conteos"
      subtitle="Exportar referencias auditadas y conteos por ubicación"
      showBackButton
      backPath="/dashboard"
    >

      {/* Main Content */}
      <main>
        <ReadOnlyBanner />
        <Tabs defaultValue="validados" className="space-y-6">
          <TabsList className="grid w-full max-w-2xl grid-cols-3">
            <TabsTrigger value="validados" className="flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4" />
              Validados
            </TabsTrigger>
            <TabsTrigger value="por-ubicacion" className="flex items-center gap-2">
              <MapPin className="w-4 h-4" />
              Por Ubicación
            </TabsTrigger>
            <TabsTrigger value="almacen" className="flex items-center gap-2">
              <Warehouse className="w-4 h-4" />
              Almacén
            </TabsTrigger>
          </TabsList>

          {/* ===== TAB ALMACÉN ===== */}
          <TabsContent value="almacen" className="space-y-6">
            <Card>
              <CardHeader className="pb-4">
                <CardTitle className="text-lg flex items-center gap-2">
                  <Warehouse className="w-5 h-5 text-amber-600" />
                  Conteos de Almacén
                </CardTitle>
                <CardDescription>
                  Una fila por referencia de almacén (MP y PP), con conteos 1 a 4, diferencias contra el ERP y la cantidad validada a montar.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex flex-col sm:flex-row gap-4 items-end">
                  <div className="flex-1 space-y-1">
                    <label className="text-sm font-medium text-muted-foreground">Buscar referencia</label>
                    <div className="relative">
                      <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                      <Input
                        placeholder="Buscar por referencia..."
                        value={searchTermAlm}
                        onChange={(e) => setSearchTermAlm(e.target.value)}
                        className="pl-10"
                      />
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <Button variant="outline" onClick={() => refetchAlm()} disabled={isLoadingAlm}>
                      <RefreshCw className={`w-4 h-4 mr-2 ${isLoadingAlm ? 'animate-spin' : ''}`} />
                      Actualizar
                    </Button>
                    <Button onClick={handleExportAlmacen} disabled={isExportingAlm || !filteredBodegaRows.length}>
                      <Download className="w-4 h-4 mr-2" />
                      Exportar Almacén ({filteredBodegaRows.length})
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-lg">Vista Previa</CardTitle>
                  <span className="text-sm text-muted-foreground">
                    {filteredBodegaRows.length} referencias
                  </span>
                </div>
              </CardHeader>
              <CardContent>
                {isLoadingAlm ? (
                  <div className="flex items-center justify-center py-12">
                    <RefreshCw className="w-6 h-6 animate-spin text-muted-foreground" />
                  </div>
                ) : paginatedBodega.length === 0 ? (
                  <div className="text-center py-12 text-muted-foreground">
                    No se encontraron referencias de almacén
                  </div>
                ) : (
                  <>
                    <div className="overflow-x-auto">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>REFERENCIA</TableHead>
                            <TableHead>TIPO</TableHead>
                            <TableHead>BODEGA</TableHead>
                            <TableHead className="text-right">ERP</TableHead>
                            <TableHead className="text-right">C1</TableHead>
                            <TableHead className="text-right">C2</TableHead>
                            <TableHead className="text-right">C3</TableHead>
                            <TableHead className="text-right">C4</TableHead>
                            <TableHead className="text-right">DIF1</TableHead>
                            <TableHead className="text-right">DIF2</TableHead>
                            <TableHead className="text-right">DIF3</TableHead>
                            <TableHead className="text-right">DIF4</TableHead>
                            <TableHead>RESULTADO</TableHead>
                            <TableHead>A MONTAR</TableHead>
                            <TableHead className="text-right">CANT A MONTAR</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {paginatedBodega.map((r) => (
                            <TableRow key={r.referencia}>
                              <TableCell className="font-medium">{r.referencia}</TableCell>
                              <TableCell>{r.tipo}</TableCell>
                              <TableCell>{r.bodega}</TableCell>
                              <TableCell className="text-right font-mono">{r.erp}</TableCell>
                              <TableCell className="text-right font-mono">{r.c1}</TableCell>
                              <TableCell className="text-right font-mono">{r.c2}</TableCell>
                              <TableCell className="text-right font-mono">{r.c3}</TableCell>
                              <TableCell className="text-right font-mono">{r.c4}</TableCell>
                              <TableCell className="text-right font-mono">{r.dif1}</TableCell>
                              <TableCell className="text-right font-mono">{r.dif2}</TableCell>
                              <TableCell className="text-right font-mono">{r.dif3}</TableCell>
                              <TableCell className="text-right font-mono">{r.dif4}</TableCell>
                              <TableCell className="text-xs text-muted-foreground">{r.resultado}</TableCell>
                              <TableCell>{r.a_montar || '-'}</TableCell>
                              <TableCell className="text-right font-mono font-semibold">
                                {r.cant_a_montar ?? 0}
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                    {renderPagination(currentPageAlm, totalPagesAlm, setCurrentPageAlm)}
                  </>
                )}
              </CardContent>
            </Card>
          </TabsContent>


          {/* ===== TAB VALIDADOS ===== */}
          <TabsContent value="validados" className="space-y-6">
            <Card>
              <CardHeader className="pb-4">
                <CardTitle className="text-lg flex items-center gap-2">
                  <CheckCircle2 className="w-5 h-5 text-green-600" />
                  Referencias Auditadas
                </CardTitle>
                <CardDescription>
                  Exporta las referencias que coincidieron con el total validado
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex flex-col sm:flex-row gap-4 items-end">
                  <div className="w-full sm:w-48 space-y-1">
                    <label className="text-sm font-medium text-muted-foreground">Tipo Material</label>
                    <Select value={materialTypeFilter} onValueChange={setMaterialTypeFilter}>
                      <SelectTrigger>
                        <SelectValue placeholder="Todos" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">Todos</SelectItem>
                        <SelectItem value="MP">MP</SelectItem>
                        <SelectItem value="PP">PP</SelectItem>
                        <SelectItem value="PT">PT</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="flex-1 space-y-1">
                    <label className="text-sm font-medium text-muted-foreground">Buscar referencia</label>
                    <div className="relative">
                      <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                      <Input
                        placeholder="Buscar por referencia..."
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        className="pl-10"
                      />
                    </div>
                  </div>

                  <div className="flex gap-2">
                    <Button variant="outline" onClick={() => refetch()} disabled={isLoading}>
                      <RefreshCw className={`w-4 h-4 mr-2 ${isLoading ? 'animate-spin' : ''}`} />
                      Actualizar
                    </Button>
                    <Button onClick={handleExport} disabled={isExporting || !auditedReferences?.length}>
                      <Download className="w-4 h-4 mr-2" />
                      Exportar ({auditedReferences?.length || 0})
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-lg">Vista Previa</CardTitle>
                  <span className="text-sm text-muted-foreground">
                    {auditedReferences?.length || 0} referencias
                  </span>
                </div>
              </CardHeader>
              <CardContent>
                {isLoading ? (
                  <div className="flex items-center justify-center py-12">
                    <RefreshCw className="w-6 h-6 animate-spin text-muted-foreground" />
                  </div>
                ) : paginatedReferences.length === 0 ? (
                  <div className="text-center py-12 text-muted-foreground">
                    No se encontraron referencias auditadas
                  </div>
                ) : (
                  <>
                    <div className="overflow-x-auto">
                      <Table>
                          <TableHeader>
                          <TableRow>
                            <TableHead>Tipo Material</TableHead>
                            <TableHead>Referencia</TableHead>
                            <TableHead className="text-center">Conteo</TableHead>
                            <TableHead className="text-right">Cantidad Validada</TableHead>
                            <TableHead>Motivo</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {paginatedReferences.map((ref) => (
                            <TableRow key={ref.referencia}>
                              <TableCell>
                                <span className={`px-2 py-1 rounded text-xs font-medium ${
                                  ref.material_type === 'MP'
                                    ? 'bg-blue-100 text-blue-800'
                                    : ref.material_type === 'PP'
                                    ? 'bg-purple-100 text-purple-800'
                                    : 'bg-green-100 text-green-800'
                                }`}>
                                  {ref.material_type}
                                </span>
                              </TableCell>
                              <TableCell className="font-medium">{ref.referencia}</TableCell>
                              <TableCell className="text-center">C{ref.conteo}</TableCell>
                              <TableCell className="text-right font-mono font-semibold">
                                {ref.cantidad_validada.toLocaleString('es-CO')}
                              </TableCell>
                              <TableCell className="text-xs text-muted-foreground">{ref.motivo}</TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                    {renderPagination(currentPage, totalPages, setCurrentPage)}
                  </>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* ===== TAB POR UBICACIÓN ===== */}
          <TabsContent value="por-ubicacion" className="space-y-6">
            <Card>
              <CardHeader className="pb-4">
                <CardTitle className="text-lg flex items-center gap-2">
                  <MapPin className="w-5 h-5 text-blue-600" />
                  Conteos por Ubicación
                </CardTitle>
                <CardDescription>
                  Exporta los conteos de cada ubicación con las cantidades de cada ronda
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex flex-col sm:flex-row gap-4 items-end">
                  <div className="w-full sm:w-48 space-y-1">
                    <label className="text-sm font-medium text-muted-foreground">Tipo Material</label>
                    <Select value={materialTypeFilterLoc} onValueChange={setMaterialTypeFilterLoc}>
                      <SelectTrigger>
                        <SelectValue placeholder="Todos" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">Todos</SelectItem>
                        <SelectItem value="MP">MP</SelectItem>
                        <SelectItem value="PP">PP</SelectItem>
                        <SelectItem value="PT">PT</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="flex-1 space-y-1">
                    <label className="text-sm font-medium text-muted-foreground">Buscar referencia</label>
                    <div className="relative">
                      <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                      <Input
                        placeholder="Buscar por referencia..."
                        value={searchTermLoc}
                        onChange={(e) => setSearchTermLoc(e.target.value)}
                        className="pl-10"
                      />
                    </div>
                  </div>

                  <div className="flex gap-2">
                    <Button variant="outline" onClick={() => refetchLoc()} disabled={isLoadingLoc}>
                      <RefreshCw className={`w-4 h-4 mr-2 ${isLoadingLoc ? 'animate-spin' : ''}`} />
                      Actualizar
                    </Button>
                    <Button onClick={handleExportByLocation} disabled={isExportingLoc || !countsByLocation?.length}>
                      <Download className="w-4 h-4 mr-2" />
                      Exportar ({countsByLocation?.length || 0})
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-lg">Vista Previa</CardTitle>
                  <span className="text-sm text-muted-foreground">
                    {countsByLocation?.length || 0} ubicaciones
                  </span>
                </div>
              </CardHeader>
              <CardContent>
                {isLoadingLoc ? (
                  <div className="flex items-center justify-center py-12">
                    <RefreshCw className="w-6 h-6 animate-spin text-muted-foreground" />
                  </div>
                ) : paginatedLocations.length === 0 ? (
                  <div className="text-center py-12 text-muted-foreground">
                    No se encontraron ubicaciones con conteos
                  </div>
                ) : (
                  <>
                    <div className="overflow-x-auto">
                      <Table>
                          <TableHeader>
                          <TableRow>
                            <TableHead>Tipo</TableHead>
                            <TableHead>Referencia</TableHead>
                            <TableHead>Ubicación</TableHead>
                            <TableHead>Ubicación Detallada</TableHead>
                            <TableHead>Punto Referencia</TableHead>
                            <TableHead className="text-right">C1</TableHead>
                            <TableHead className="text-right">C2</TableHead>
                            <TableHead className="text-right">C3</TableHead>
                            <TableHead className="text-right">C4</TableHead>
                            <TableHead className="text-right">Validado</TableHead>
                            <TableHead>Motivo</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {paginatedLocations.map((row, idx) => (
                            <TableRow key={`${row.referencia}-${row.ubicacion}-${idx}`}>
                              <TableCell>
                                <span className={`px-2 py-1 rounded text-xs font-medium ${
                                  row.material_type === 'MP'
                                    ? 'bg-blue-100 text-blue-800'
                                    : row.material_type === 'PP'
                                    ? 'bg-purple-100 text-purple-800'
                                    : 'bg-green-100 text-green-800'
                                }`}>
                                  {row.material_type}
                                </span>
                              </TableCell>
                              <TableCell className="font-medium">{row.referencia}</TableCell>
                              <TableCell>{row.ubicacion || '-'}</TableCell>
                              <TableCell>{row.ubicacion_detallada || '-'}</TableCell>
                              <TableCell>{row.punto_referencia || '-'}</TableCell>
                              <TableCell className="text-right font-mono">
                                {row.conteo_1 !== null ? Number(row.conteo_1).toLocaleString('es-CO') : '-'}
                              </TableCell>
                              <TableCell className="text-right font-mono">
                                {row.conteo_2 !== null ? Number(row.conteo_2).toLocaleString('es-CO') : '-'}
                              </TableCell>
                              <TableCell className="text-right font-mono">
                                {row.conteo_3 !== null ? Number(row.conteo_3).toLocaleString('es-CO') : '-'}
                              </TableCell>
                              <TableCell className="text-right font-mono">
                                {row.conteo_4 !== null ? Number(row.conteo_4).toLocaleString('es-CO') : '-'}
                              </TableCell>
                              <TableCell className="text-right font-mono font-semibold">
                                {row.validado !== null ? Number(row.validado).toLocaleString('es-CO') : '-'}
                              </TableCell>
                              <TableCell className="text-xs text-muted-foreground">{row.motivo}</TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                    {renderPagination(currentPageLoc, totalPagesLoc, setCurrentPageLoc)}
                  </>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </main>
    </AppLayout>
  );
};

export default ExportarConteos;
