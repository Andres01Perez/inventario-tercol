import React, { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
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
import { ArrowLeft, Download, Search, RefreshCw, CheckCircle2 } from 'lucide-react';
import { toast } from 'sonner';
import * as XLSX from 'xlsx';

const ITEMS_PER_PAGE = 20;

interface AuditedReference {
  material_type: string;
  referencia: string;
  conteo: number;
  cantidad_validada: number;
}

const ExportarConteos: React.FC = () => {
  const navigate = useNavigate();
  const { profile } = useAuth();
  const [searchTerm, setSearchTerm] = useState('');
  const [materialTypeFilter, setMaterialTypeFilter] = useState<string>('all');
  const [currentPage, setCurrentPage] = useState(1);
  const [isExporting, setIsExporting] = useState(false);

  // Fetch audited references with their total validated quantities
  const { data: auditedReferences, isLoading, refetch } = useQuery({
    queryKey: ['export-auditados', searchTerm, materialTypeFilter],
    queryFn: async () => {
      // 1. Get all audited references from inventory_master
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

      // 2. Get locations with validated_quantity for these references
      const { data: locations, error: locError } = await supabase
        .from('locations')
        .select('master_reference, validated_quantity, validated_at_round')
        .in('master_reference', masters.map(m => m.referencia))
        .not('validated_quantity', 'is', null);

      if (locError) throw locError;

      // 3. Group and sum by reference
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

  // Pagination
  const totalPages = Math.ceil((auditedReferences?.length || 0) / ITEMS_PER_PAGE);
  const paginatedReferences = useMemo(() => {
    const start = (currentPage - 1) * ITEMS_PER_PAGE;
    return auditedReferences?.slice(start, start + ITEMS_PER_PAGE) || [];
  }, [auditedReferences, currentPage]);

  // Reset page when filters change
  React.useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm, materialTypeFilter]);

  // Export function
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
                <h1 className="text-lg font-bold text-foreground">Exportar Referencias Auditadas</h1>
                <p className="text-xs text-muted-foreground">Exportar referencias que coincidieron (auditadas)</p>
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
        <Card>
          <CardHeader className="pb-4">
            <CardTitle className="text-lg flex items-center gap-2">
              <CheckCircle2 className="w-5 h-5 text-green-600" />
              Filtros
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex flex-col sm:flex-row gap-4 items-end">
              {/* Material Type Filter */}
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

              {/* Search */}
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

              {/* Actions */}
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

        {/* Results Table */}
        <Card className="mt-6">
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-lg">
                Referencias Auditadas
              </CardTitle>
              <span className="text-sm text-muted-foreground">
                {auditedReferences?.length || 0} referencias encontradas
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

                {/* Pagination */}
                {totalPages > 1 && (
                  <div className="mt-4">
                    <Pagination>
                      <PaginationContent>
                        <PaginationItem>
                          <PaginationPrevious 
                            onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                            className={currentPage === 1 ? 'pointer-events-none opacity-50' : 'cursor-pointer'}
                          />
                        </PaginationItem>
                        {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                          let pageNum: number;
                          if (totalPages <= 5) {
                            pageNum = i + 1;
                          } else if (currentPage <= 3) {
                            pageNum = i + 1;
                          } else if (currentPage >= totalPages - 2) {
                            pageNum = totalPages - 4 + i;
                          } else {
                            pageNum = currentPage - 2 + i;
                          }
                          return (
                            <PaginationItem key={pageNum}>
                              <PaginationLink
                                onClick={() => setCurrentPage(pageNum)}
                                isActive={currentPage === pageNum}
                                className="cursor-pointer"
                              >
                                {pageNum}
                              </PaginationLink>
                            </PaginationItem>
                          );
                        })}
                        <PaginationItem>
                          <PaginationNext 
                            onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                            className={currentPage === totalPages ? 'pointer-events-none opacity-50' : 'cursor-pointer'}
                          />
                        </PaginationItem>
                      </PaginationContent>
                    </Pagination>
                  </div>
                )}
              </>
            )}
          </CardContent>
        </Card>
      </main>
    </div>
  );
};

export default ExportarConteos;
