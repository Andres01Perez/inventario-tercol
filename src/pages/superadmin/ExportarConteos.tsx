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
import { ArrowLeft, Download, Search, RefreshCw, Clock, Calendar } from 'lucide-react';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { toast } from 'sonner';
import * as XLSX from 'xlsx';

const ITEMS_PER_PAGE = 20;

const ExportarConteos: React.FC = () => {
  const navigate = useNavigate();
  const { profile } = useAuth();
  const [selectedRound, setSelectedRound] = useState('1');
  const [selectedDate, setSelectedDate] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [timeFrom, setTimeFrom] = useState('00:00');
  const [timeTo, setTimeTo] = useState('23:59');
  const [searchTerm, setSearchTerm] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [isExporting, setIsExporting] = useState(false);

  // Build the status column based on round
  const statusColumn = `status_c${selectedRound}` as 'status_c1' | 'status_c2' | 'status_c3' | 'status_c4';

  // Fetch locations with status = 'contado' for selected round and time range
  const { data: locations, isLoading, refetch } = useQuery({
    queryKey: ['export-conteos', selectedRound, selectedDate, timeFrom, timeTo, searchTerm],
    queryFn: async () => {
      const startDateTime = `${selectedDate}T${timeFrom}:00`;
      const endDateTime = `${selectedDate}T${timeTo}:59`;

      let query = supabase
        .from('locations')
        .select('*')
        .eq(statusColumn, 'contado')
        .gte('updated_at', startDateTime)
        .lte('updated_at', endDateTime)
        .order('updated_at', { ascending: false });

      if (searchTerm) {
        query = query.ilike('master_reference', `%${searchTerm}%`);
      }

      const { data, error } = await query;
      if (error) throw error;
      return data || [];
    },
    staleTime: 30 * 1000,
  });

  // Pagination
  const totalPages = Math.ceil((locations?.length || 0) / ITEMS_PER_PAGE);
  const paginatedLocations = useMemo(() => {
    const start = (currentPage - 1) * ITEMS_PER_PAGE;
    return locations?.slice(start, start + ITEMS_PER_PAGE) || [];
  }, [locations, currentPage]);

  // Reset page when filters change
  React.useEffect(() => {
    setCurrentPage(1);
  }, [selectedRound, selectedDate, timeFrom, timeTo, searchTerm]);

  // Export function
  const handleExport = async () => {
    if (!locations || locations.length === 0) {
      toast.error('No hay datos para exportar');
      return;
    }

    setIsExporting(true);
    try {
      const exportData = locations.map(loc => ({
        'Referencia': loc.master_reference,
        'Ubicación': loc.location_name || '',
        'Detalle': loc.location_detail || '',
        'Subcategoría': loc.subcategoria || '',
        'Punto Ref.': loc.punto_referencia || '',
        'Método': loc.metodo_conteo || '',
        'Observaciones': loc.observaciones || '',
        'Fecha Actualización': loc.updated_at ? format(new Date(loc.updated_at), 'dd/MM/yyyy HH:mm:ss', { locale: es }) : '',
      }));

      const worksheet = XLSX.utils.json_to_sheet(exportData);
      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, `Conteo ${selectedRound}`);

      const filename = `conteos_c${selectedRound}_${selectedDate}_${timeFrom.replace(':', '')}-${timeTo.replace(':', '')}.xlsx`;
      XLSX.writeFile(workbook, filename);

      toast.success(`Exportados ${locations.length} registros`);
    } catch (error) {
      console.error('Export error:', error);
      toast.error('Error al exportar');
    } finally {
      setIsExporting(false);
    }
  };

  const formatTime = (dateString: string | null) => {
    if (!dateString) return '-';
    return format(new Date(dateString), 'HH:mm:ss', { locale: es });
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
                <p className="text-xs text-muted-foreground">Exportar ubicaciones contadas por corte horario</p>
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
            <CardTitle className="text-lg">Filtros de Exportación</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Filters Row 1 */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              {/* Round Selector */}
              <div className="space-y-1">
                <label className="text-sm font-medium text-muted-foreground">Conteo</label>
                <Select value={selectedRound} onValueChange={setSelectedRound}>
                  <SelectTrigger>
                    <SelectValue placeholder="Seleccionar conteo" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="1">Conteo 1 (C1)</SelectItem>
                    <SelectItem value="2">Conteo 2 (C2)</SelectItem>
                    <SelectItem value="3">Conteo 3 (C3)</SelectItem>
                    <SelectItem value="4">Conteo 4 (C4)</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* Date Picker */}
              <div className="space-y-1">
                <label className="text-sm font-medium text-muted-foreground flex items-center gap-1">
                  <Calendar className="w-4 h-4" />
                  Fecha
                </label>
                <Input
                  type="date"
                  value={selectedDate}
                  onChange={(e) => setSelectedDate(e.target.value)}
                />
              </div>

              {/* Time From */}
              <div className="space-y-1">
                <label className="text-sm font-medium text-muted-foreground flex items-center gap-1">
                  <Clock className="w-4 h-4" />
                  Desde
                </label>
                <Input
                  type="time"
                  value={timeFrom}
                  onChange={(e) => setTimeFrom(e.target.value)}
                />
              </div>

              {/* Time To */}
              <div className="space-y-1">
                <label className="text-sm font-medium text-muted-foreground flex items-center gap-1">
                  <Clock className="w-4 h-4" />
                  Hasta
                </label>
                <Input
                  type="time"
                  value={timeTo}
                  onChange={(e) => setTimeTo(e.target.value)}
                />
              </div>
            </div>

            {/* Filters Row 2 */}
            <div className="flex flex-col sm:flex-row gap-4 items-end">
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
                <Button onClick={handleExport} disabled={isExporting || !locations?.length}>
                  <Download className="w-4 h-4 mr-2" />
                  Exportar ({locations?.length || 0})
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
                Ubicaciones Contadas (C{selectedRound})
              </CardTitle>
              <span className="text-sm text-muted-foreground">
                {locations?.length || 0} registros encontrados
              </span>
            </div>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="flex items-center justify-center py-12">
                <RefreshCw className="w-6 h-6 animate-spin text-muted-foreground" />
              </div>
            ) : paginatedLocations.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground">
                No se encontraron ubicaciones contadas con los filtros seleccionados
              </div>
            ) : (
              <>
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Referencia</TableHead>
                        <TableHead>Ubicación</TableHead>
                        <TableHead>Detalle</TableHead>
                        <TableHead>Subcategoría</TableHead>
                        <TableHead>Método</TableHead>
                        <TableHead>Hora Actualización</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {paginatedLocations.map((loc) => (
                        <TableRow key={loc.id}>
                          <TableCell className="font-medium">{loc.master_reference}</TableCell>
                          <TableCell>{loc.location_name || '-'}</TableCell>
                          <TableCell>{loc.location_detail || '-'}</TableCell>
                          <TableCell>{loc.subcategoria || '-'}</TableCell>
                          <TableCell>{loc.metodo_conteo || '-'}</TableCell>
                          <TableCell className="font-mono text-sm">{formatTime(loc.updated_at)}</TableCell>
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
