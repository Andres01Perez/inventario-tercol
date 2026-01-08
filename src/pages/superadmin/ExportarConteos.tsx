import React, { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
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
import { ArrowLeft, Download, Search, RefreshCw, CheckCircle2, MapPin } from 'lucide-react';
import { toast } from 'sonner';
import * as XLSX from 'xlsx';

const ITEMS_PER_PAGE = 20;

interface AuditedReference {
  material_type: string;
  referencia: string;
  conteo: number;
  cantidad_validada: number;
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
}

const ExportarConteos: React.FC = () => {
  const navigate = useNavigate();
  const { profile } = useAuth();
  
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

  // ===== TAB VALIDADOS: Query =====
  const { data: auditedReferences, isLoading, refetch } = useQuery({
    queryKey: ['export-auditados', searchTerm, materialTypeFilter],
    queryFn: async () => {
      let masterQuery = supabase
        .from('inventory_master')
        .select('referencia, material_type')
        .eq('status_slug', 'auditado');

      if (materialTypeFilter !== 'all') {
        masterQuery = masterQuery.eq('material_type', materialTypeFilter as 'MP' | 'PP');
      }

      if (searchTerm) {
        masterQuery = masterQuery.ilike('referencia', `%${searchTerm}%`);
      }

      const { data: masters, error: masterError } = await masterQuery;
      if (masterError) throw masterError;
      if (!masters || masters.length === 0) return [];

      const { data: locations, error: locError } = await supabase
        .from('locations')
        .select('master_reference, validated_quantity, validated_at_round')
        .in('master_reference', masters.map(m => m.referencia))
        .not('validated_quantity', 'is', null);

      if (locError) throw locError;

      const grouped: AuditedReference[] = masters.map(master => {
        const locs = locations?.filter(l => l.master_reference === master.referencia) || [];
        const totalValidado = locs.reduce((sum, l) => sum + (Number(l.validated_quantity) || 0), 0);
        const round = locs[0]?.validated_at_round || 1;

        return {
          material_type: master.material_type,
          referencia: master.referencia,
          conteo: round,
          cantidad_validada: totalValidado,
        };
      });

      return grouped;
    },
    staleTime: 30 * 1000,
  });

  // ===== TAB POR UBICACIÓN: Query =====
  const { data: countsByLocation, isLoading: isLoadingLoc, refetch: refetchLoc } = useQuery({
    queryKey: ['export-counts-by-location', searchTermLoc, materialTypeFilterLoc],
    queryFn: async () => {
      // 1. Get locations
      const { data: locations, error: locError } = await supabase
        .from('locations')
        .select('id, master_reference, location_name, location_detail, punto_referencia');

      if (locError) throw locError;
      if (!locations || locations.length === 0) return [];

      // 2. Get inventory_counts
      const { data: counts, error: countsError } = await supabase
        .from('inventory_counts')
        .select('location_id, audit_round, quantity_counted');

      if (countsError) throw countsError;

      // 3. Get inventory_master for material_type
      const { data: masters, error: masterError } = await supabase
        .from('inventory_master')
        .select('referencia, material_type');

      if (masterError) throw masterError;

      // 4. Pivot data: one row per location with conteo_1, conteo_2, conteo_3, conteo_4
      const pivotedData: CountByLocation[] = locations.map(location => {
        const master = masters?.find(m => m.referencia === location.master_reference);
        const locationCounts = counts?.filter(c => c.location_id === location.id) || [];

        return {
          material_type: master?.material_type || '',
          referencia: location.master_reference,
          ubicacion: location.location_name || '',
          ubicacion_detallada: location.location_detail || '',
          punto_referencia: location.punto_referencia || '',
          conteo_1: locationCounts.find(c => c.audit_round === 1)?.quantity_counted ?? null,
          conteo_2: locationCounts.find(c => c.audit_round === 2)?.quantity_counted ?? null,
          conteo_3: locationCounts.find(c => c.audit_round === 3)?.quantity_counted ?? null,
          conteo_4: locationCounts.find(c => c.audit_round === 4)?.quantity_counted ?? null,
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
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b border-border bg-card">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center gap-3">
              <Button variant="ghost" size="icon" onClick={() => navigate('/dashboard')}>
                <ArrowLeft className="w-5 h-5" />
              </Button>
              <div>
                <h1 className="text-lg font-bold text-foreground">Exportar Conteos</h1>
                <p className="text-xs text-muted-foreground">Exportar referencias auditadas y conteos por ubicación</p>
              </div>
            </div>
            <div className="text-right hidden sm:block">
              <p className="text-sm font-medium text-foreground">{profile?.full_name || 'Usuario'}</p>
              <p className="text-xs text-muted-foreground">{profile?.email}</p>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        <Tabs defaultValue="validados" className="space-y-6">
          <TabsList className="grid w-full max-w-md grid-cols-2">
            <TabsTrigger value="validados" className="flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4" />
              Validados
            </TabsTrigger>
            <TabsTrigger value="por-ubicacion" className="flex items-center gap-2">
              <MapPin className="w-4 h-4" />
              Por Ubicación
            </TabsTrigger>
          </TabsList>

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
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {paginatedReferences.map((ref) => (
                            <TableRow key={ref.referencia}>
                              <TableCell>
                                <span className={`px-2 py-1 rounded text-xs font-medium ${
                                  ref.material_type === 'MP' 
                                    ? 'bg-blue-100 text-blue-800' 
                                    : 'bg-purple-100 text-purple-800'
                                }`}>
                                  {ref.material_type}
                                </span>
                              </TableCell>
                              <TableCell className="font-medium">{ref.referencia}</TableCell>
                              <TableCell className="text-center">C{ref.conteo}</TableCell>
                              <TableCell className="text-right font-mono font-semibold">
                                {ref.cantidad_validada.toLocaleString('es-CO')}
                              </TableCell>
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
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {paginatedLocations.map((row, idx) => (
                            <TableRow key={`${row.referencia}-${row.ubicacion}-${idx}`}>
                              <TableCell>
                                <span className={`px-2 py-1 rounded text-xs font-medium ${
                                  row.material_type === 'MP' 
                                    ? 'bg-blue-100 text-blue-800' 
                                    : 'bg-purple-100 text-purple-800'
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
    </div>
  );
};

export default ExportarConteos;
