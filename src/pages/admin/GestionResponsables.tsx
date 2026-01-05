import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useNavigate } from 'react-router-dom';
import { 
  Users, 
  ArrowLeft, 
  Search, 
  RefreshCw,
  CheckCircle,
  Package,
  Boxes,
  X
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { useDebounce } from '@/hooks/useDebounce';
import SupervisorSelect from '@/components/shared/SupervisorSelect';
import { useSupervisors } from '@/hooks/useSupervisors';
import {
  Pagination,
  PaginationContent,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
} from '@/components/ui/pagination';

const PAGE_SIZE_OPTIONS = [50, 100, 250, 500];

interface LocationWithReference {
  id: string;
  master_reference: string;
  subcategoria: string | null;
  observaciones: string | null;
  location_name: string | null;
  location_detail: string | null;
  punto_referencia: string | null;
  metodo_conteo: string | null;
  assigned_supervisor_id: string | null;
  material_type: 'MP' | 'PP';
  control: string | null;
}

const GestionResponsables: React.FC = () => {
  const { profile, role } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  
  // Selection state
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkSupervisorId, setBulkSupervisorId] = useState<string | null>(null);
  
  // Filter states
  const [searchTerm, setSearchTerm] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [filterTipo, setFilterTipo] = useState<string>('all');
  const [filterSubcategoria, setFilterSubcategoria] = useState('');
  const [filterUbicacion, setFilterUbicacion] = useState('');
  const [filterObservacion, setFilterObservacion] = useState('');
  const [filterSupervisor, setFilterSupervisor] = useState<string>('all');
  const [filterPuntoReferencia, setFilterPuntoReferencia] = useState<string>('all');
  const [pageSize, setPageSize] = useState(500);

  const isSuperadmin = role === 'superadmin';
  const isAdminMP = role === 'admin_mp';
  const isAdminPP = role === 'admin_pp';
  
  const adminTypeLabel = isSuperadmin 
    ? 'Todas las referencias' 
    : isAdminMP ? 'Materia Prima' : 'Producto en Proceso';
  const AdminIcon = isSuperadmin ? Package : isAdminMP ? Package : Boxes;
  const adminColorClass = isSuperadmin ? 'text-primary' : isAdminMP ? 'text-orange-500' : 'text-emerald-500';
  const adminBgClass = isSuperadmin ? 'bg-primary/10' : isAdminMP ? 'bg-orange-500/10' : 'bg-emerald-500/10';
  const adminRoleLabel = isSuperadmin ? 'Superadmin' : isAdminMP ? 'Admin MP' : 'Admin PP';

  // Debounce search term for better performance
  const debouncedSearchTerm = useDebounce(searchTerm, 300);

  // Clear selection when filters change
  useEffect(() => {
    setSelectedIds(new Set());
  }, [debouncedSearchTerm, filterTipo, filterSubcategoria, filterUbicacion, filterObservacion, filterSupervisor, filterPuntoReferencia, currentPage, pageSize]);

  // Use cached supervisors hook
  const { data: supervisors } = useSupervisors();

  const hasActiveFilters = filterTipo !== 'all' || filterSubcategoria || filterUbicacion || filterObservacion || filterSupervisor !== 'all' || filterPuntoReferencia !== 'all';

  const clearFilters = () => {
    setFilterTipo('all');
    setFilterSubcategoria('');
    setFilterUbicacion('');
    setFilterObservacion('');
    setFilterSupervisor('all');
    setFilterPuntoReferencia('all');
    setCurrentPage(1);
  };

  // OPTIMIZED: Single query for all filter options with aggressive caching
  const { data: filterOptions } = useQuery({
    queryKey: ['filter-options', role, profile?.id, isSuperadmin],
    queryFn: async () => {
      let query = supabase
        .from('locations')
        .select('subcategoria, location_name, observaciones, punto_referencia');
      
      if (!isSuperadmin && profile?.id) {
        query = query.eq('assigned_admin_id', profile.id);
      }
      
      const { data, error } = await query;
      if (error) throw error;
      
      // Extract unique values in a single pass
      const subcategorias = new Set<string>();
      const ubicaciones = new Set<string>();
      const observaciones = new Set<string>();
      const puntosReferencia = new Set<string>();
      
      data?.forEach(row => {
        if (row.subcategoria) subcategorias.add(row.subcategoria);
        if (row.location_name) ubicaciones.add(row.location_name);
        if (row.observaciones) observaciones.add(row.observaciones);
        if (row.punto_referencia) puntosReferencia.add(row.punto_referencia);
      });
      
      return {
        subcategorias: [...subcategorias].sort(),
        ubicaciones: [...ubicaciones].sort(),
        observaciones: [...observaciones].sort(),
        puntosReferencia: [...puntosReferencia].sort(),
      };
    },
    staleTime: 10 * 60 * 1000, // 10 minutes - filter options don't change often
    gcTime: 30 * 60 * 1000,    // Keep in cache for 30 minutes
    enabled: !!role,
  });

  // OPTIMIZED QUERY: Start from locations with JOIN to inventory_master
  const { data, isLoading, refetch, isFetching } = useQuery({
    queryKey: ['locations-responsables', role, debouncedSearchTerm, currentPage, pageSize, filterTipo, filterSubcategoria, filterUbicacion, filterObservacion, filterSupervisor, filterPuntoReferencia],
    queryFn: async () => {
      // Single query starting from locations with inner join to inventory_master
      let query = supabase
        .from('locations')
        .select(`
          id,
          master_reference,
          subcategoria,
          observaciones,
          location_name,
          location_detail,
          punto_referencia,
          metodo_conteo,
          assigned_supervisor_id,
          inventory_master!inner(material_type, control)
        `, { count: 'exact' });

      // Superadmin ve todo, admin_mp solo ve referencias con control NOT NULL
      // admin_pp ve TODAS las referencias para poder agregarles ubicaciones
      if (!isSuperadmin && isAdminMP) {
        query = query.not('inventory_master.control', 'is', null);
      }

      // Admins solo ven sus propias ubicaciones
      if (!isSuperadmin && profile?.id) {
        query = query.eq('assigned_admin_id', profile.id);
      }

      // Filter by material type
      if (filterTipo === 'MP' || filterTipo === 'PP') {
        query = query.eq('inventory_master.material_type', filterTipo);
      }

      // Search by reference (use debounced value)
      if (debouncedSearchTerm) {
        query = query.ilike('master_reference', `%${debouncedSearchTerm}%`);
      }

      // Filter by subcategoria
      if (filterSubcategoria) {
        query = query.eq('subcategoria', filterSubcategoria);
      }

      // Filter by location name
      if (filterUbicacion) {
        query = query.eq('location_name', filterUbicacion);
      }

      // Filter by observaciones
      if (filterObservacion) {
        query = query.eq('observaciones', filterObservacion);
      }

      // Filter by supervisor
      if (filterSupervisor === 'unassigned') {
        query = query.is('assigned_supervisor_id', null);
      } else if (filterSupervisor !== 'all') {
        query = query.eq('assigned_supervisor_id', filterSupervisor);
      }

      // Filter by punto_referencia
      if (filterPuntoReferencia !== 'all') {
        query = query.eq('punto_referencia', filterPuntoReferencia);
      }

      // Pagination
      const from = (currentPage - 1) * pageSize;
      query = query
        .order('master_reference')
        .range(from, from + pageSize - 1);

      const { data: locationsData, error, count } = await query;
      if (error) throw error;

      // Map the data to our interface
      const locations: LocationWithReference[] = (locationsData || []).map((loc: any) => ({
        id: loc.id,
        master_reference: loc.master_reference,
        subcategoria: loc.subcategoria,
        observaciones: loc.observaciones,
        location_name: loc.location_name,
        location_detail: loc.location_detail,
        punto_referencia: loc.punto_referencia,
        metodo_conteo: loc.metodo_conteo,
        assigned_supervisor_id: loc.assigned_supervisor_id,
        material_type: loc.inventory_master.material_type as 'MP' | 'PP',
        control: loc.inventory_master.control
      }));

      return { locations, total: count || 0 };
    },
    staleTime: 2 * 60 * 1000, // 2 minutes - data is relatively fresh
    enabled: !!role,
  });

  // OPTIMIZED: Memoized selection calculations
  const { isAllSelected, isIndeterminate, allIds } = useMemo(() => {
    const ids = data?.locations.map(l => l.id) || [];
    const allSelected = ids.length > 0 && ids.every(id => selectedIds.has(id));
    const indeterminate = selectedIds.size > 0 && !allSelected;
    return { isAllSelected: allSelected, isIndeterminate: indeterminate, allIds: ids };
  }, [data?.locations, selectedIds]);

  // OPTIMIZED: Memoized selection functions
  const toggleSelection = useCallback((id: string) => {
    setSelectedIds(prev => {
      const newSet = new Set(prev);
      if (newSet.has(id)) {
        newSet.delete(id);
      } else {
        newSet.add(id);
      }
      return newSet;
    });
  }, []);

  const toggleSelectAll = useCallback(() => {
    setSelectedIds(isAllSelected ? new Set() : new Set(allIds));
  }, [isAllSelected, allIds]);

  // Memoized handler for supervisor changes
  const handleSupervisorChange = useCallback((locationId: string, supervisorId: string | null) => {
    updateAssignmentMutation.mutate({ locationId, supervisorId });
  }, []);

  // Bulk assignment mutation
  const bulkAssignMutation = useMutation({
    mutationFn: async ({ ids, supervisorId }: { ids: string[], supervisorId: string | null }) => {
      const { error } = await supabase
        .from('locations')
        .update({ assigned_supervisor_id: supervisorId })
        .in('id', ids);
      if (error) throw error;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['locations-responsables'] });
      queryClient.invalidateQueries({ queryKey: ['admin-inventory'] });
      setSelectedIds(new Set());
      setBulkSupervisorId(null);
      toast({ 
        title: 'Asignación completada',
        description: `Se actualizaron ${variables.ids.length} ubicaciones`
      });
    },
    onError: () => {
      toast({ 
        title: 'Error', 
        description: 'No se pudo completar la asignación',
        variant: 'destructive'
      });
    }
  });

  // Single assignment mutation
  const updateAssignmentMutation = useMutation({
    mutationFn: async ({ locationId, supervisorId }: { locationId: string, supervisorId: string | null }) => {
      const { error } = await supabase
        .from('locations')
        .update({ assigned_supervisor_id: supervisorId })
        .eq('id', locationId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['locations-responsables'] });
      queryClient.invalidateQueries({ queryKey: ['admin-inventory'] });
      toast({ title: 'Guardado', description: 'Líder asignado correctamente' });
    },
    onError: () => {
      toast({ title: 'Error', description: 'No se pudo asignar el líder', variant: 'destructive' });
    }
  });

  const totalPages = Math.ceil((data?.total || 0) / pageSize);

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b border-border bg-card">
        <div className="max-w-full mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center gap-3">
              <Button variant="ghost" size="icon" onClick={() => navigate('/dashboard')}>
                <ArrowLeft className="w-5 h-5" />
              </Button>
              <div className={`w-10 h-10 rounded-xl ${adminBgClass} flex items-center justify-center`}>
                <Users className={`w-5 h-5 ${adminColorClass}`} />
              </div>
              <div>
                <h1 className="text-lg font-bold text-foreground">Gestión de Responsables</h1>
                <p className="text-xs text-muted-foreground">{adminTypeLabel} - Asignación masiva de líderes de conteo</p>
              </div>
            </div>

            <div className="flex items-center gap-4">
              <div className="text-right hidden sm:block">
                <p className="text-sm font-medium text-foreground">{profile?.full_name}</p>
                <p className="text-xs text-muted-foreground">{adminRoleLabel}</p>
              </div>
            </div>
          </div>
        </div>
      </header>

      {/* Controls */}
      <div className="border-b border-border bg-card/50 px-4 sm:px-6 lg:px-8 py-4 space-y-4">
        {/* Search row */}
        <div className="flex items-center gap-4">
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder="Buscar por referencia..."
              value={searchTerm}
              onChange={(e) => {
                setSearchTerm(e.target.value);
                setCurrentPage(1);
              }}
              className="pl-10"
            />
          </div>
          <Button 
            variant="outline" 
            size="sm" 
            onClick={() => refetch()}
            disabled={isFetching}
            className="gap-2"
          >
            <RefreshCw className={`w-4 h-4 ${isFetching ? 'animate-spin' : ''}`} />
            Recargar
          </Button>
          <div className="flex items-center gap-2">
            <span className="text-sm text-muted-foreground">Mostrar:</span>
            <Select value={pageSize.toString()} onValueChange={(v) => { setPageSize(Number(v)); setCurrentPage(1); }}>
              <SelectTrigger className="w-[100px] h-9">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {PAGE_SIZE_OPTIONS.map(size => (
                  <SelectItem key={size} value={size.toString()}>
                    {size} filas
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <span className="text-sm text-muted-foreground">
            {data?.total || 0} ubicaciones
          </span>
        </div>

        {/* Filters row */}
        <div className="flex flex-wrap items-center gap-3">
          {/* Tipo filter */}
          <div className="flex items-center gap-2">
            <span className="text-sm text-muted-foreground">Tipo:</span>
            <Select value={filterTipo} onValueChange={(value) => { setFilterTipo(value); setCurrentPage(1); }}>
              <SelectTrigger className="w-[100px] h-9">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos</SelectItem>
                <SelectItem value="MP">MP</SelectItem>
                <SelectItem value="PP">PP</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Subcategoría filter */}
          <div className="flex items-center gap-2">
            <span className="text-sm text-muted-foreground">Subcategoría:</span>
            <Select value={filterSubcategoria || 'all'} onValueChange={(value) => { setFilterSubcategoria(value === 'all' ? '' : value); setCurrentPage(1); }}>
              <SelectTrigger className="w-[160px] h-9">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos</SelectItem>
                {filterOptions?.subcategorias?.map((sub) => (
                  <SelectItem key={sub} value={sub}>{sub}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Ubicación filter */}
          <div className="flex items-center gap-2">
            <span className="text-sm text-muted-foreground">Ubicación:</span>
            <Select value={filterUbicacion || 'all'} onValueChange={(value) => { setFilterUbicacion(value === 'all' ? '' : value); setCurrentPage(1); }}>
              <SelectTrigger className="w-[160px] h-9">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos</SelectItem>
                {filterOptions?.ubicaciones?.map((ub) => (
                  <SelectItem key={ub} value={ub}>{ub}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Observación filter */}
          <div className="flex items-center gap-2">
            <span className="text-sm text-muted-foreground">Observación:</span>
            <Select value={filterObservacion || 'all'} onValueChange={(value) => { setFilterObservacion(value === 'all' ? '' : value); setCurrentPage(1); }}>
              <SelectTrigger className="w-[160px] h-9">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos</SelectItem>
                {filterOptions?.observaciones?.map((obs) => (
                  <SelectItem key={obs} value={obs}>{obs}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Punto Referencia filter */}
          <div className="flex items-center gap-2">
            <span className="text-sm text-muted-foreground">Punto Ref:</span>
            <Select value={filterPuntoReferencia} onValueChange={(value) => { setFilterPuntoReferencia(value); setCurrentPage(1); }}>
              <SelectTrigger className="w-[160px] h-9">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos</SelectItem>
                {filterOptions?.puntosReferencia?.map((punto) => (
                  <SelectItem key={punto} value={punto}>
                    {punto}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Líder Conteo filter */}
          <div className="flex items-center gap-2">
            <span className="text-sm text-muted-foreground">Líder:</span>
            <Select value={filterSupervisor} onValueChange={(value) => { setFilterSupervisor(value); setCurrentPage(1); }}>
              <SelectTrigger className="w-[160px] h-9">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos</SelectItem>
                <SelectItem value="unassigned">Sin Asignar</SelectItem>
                {supervisors?.map((supervisor) => (
                  <SelectItem key={supervisor.id} value={supervisor.id}>
                    {supervisor.full_name || supervisor.email}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Clear filters button */}
          {hasActiveFilters && (
            <Button variant="ghost" size="sm" onClick={clearFilters} className="h-9 gap-1">
              <X className="w-4 h-4" />
              Limpiar filtros
            </Button>
          )}
        </div>
      </div>

      {/* Bulk Assignment Bar */}
      {selectedIds.size > 0 && (
        <div className="border-b border-border bg-primary/5 px-4 sm:px-6 lg:px-8 py-3">
          <div className="flex items-center gap-4 flex-wrap">
            <Badge variant="secondary" className="text-sm">
              {selectedIds.size} ubicación(es) seleccionada(s)
            </Badge>
            
            <div className="flex items-center gap-2">
              <span className="text-sm text-muted-foreground">Asignar a:</span>
              <div className="w-[200px]">
                <SupervisorSelect
                  value={bulkSupervisorId}
                  onValueChange={setBulkSupervisorId}
                  placeholder="Seleccionar líder..."
                />
              </div>
            </div>
            
            <Button 
              onClick={() => bulkAssignMutation.mutate({
                ids: Array.from(selectedIds),
                supervisorId: bulkSupervisorId
              })}
              disabled={bulkAssignMutation.isPending}
              size="sm"
              className="gap-2"
            >
              <Users className="w-4 h-4" />
              {bulkAssignMutation.isPending ? 'Asignando...' : 'Asignar líder'}
            </Button>
            
            <Button 
              variant="ghost" 
              size="sm"
              onClick={() => setSelectedIds(new Set())}
            >
              Cancelar selección
            </Button>
          </div>
        </div>
      )}

      {/* Table */}
      <main className="px-4 sm:px-6 lg:px-8 py-6">
        <div className="bg-card rounded-lg border border-border overflow-hidden">
          {(isLoading || !role) ? (
            <div className="flex items-center justify-center py-12">
              <RefreshCw className="w-6 h-6 animate-spin text-muted-foreground" />
            </div>
          ) : data?.locations.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12">
              <CheckCircle className="w-12 h-12 text-green-500 mb-4" />
              <p className="text-foreground font-medium">No hay ubicaciones configuradas</p>
              <p className="text-sm text-muted-foreground">Primero configura ubicaciones en Gestión de Ubicaciones</p>
              <Button 
                variant="outline" 
                className="mt-4"
                onClick={() => navigate('/admin/gestion-ubicacion')}
              >
                Ir a Gestión de Ubicaciones
              </Button>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[50px]">
                      <Checkbox
                        checked={isAllSelected}
                        onCheckedChange={toggleSelectAll}
                        aria-label="Seleccionar todos"
                        className={isIndeterminate ? 'data-[state=checked]:bg-primary/50' : ''}
                      />
                    </TableHead>
                    <TableHead className="w-[80px]">Tipo</TableHead>
                    <TableHead className="w-[150px]">Referencia</TableHead>
                    <TableHead>Subcategoría</TableHead>
                    <TableHead>Observaciones</TableHead>
                    <TableHead>Ubicación</TableHead>
                    <TableHead>Ubicación Detallada</TableHead>
                    <TableHead>Punto Referencia</TableHead>
                    <TableHead>Método Conteo</TableHead>
                    <TableHead className="w-[200px]">Líder Conteo</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data?.locations.map((location) => (
                    <TableRow key={location.id}>
                      <TableCell>
                        <Checkbox
                          checked={selectedIds.has(location.id)}
                          onCheckedChange={() => toggleSelection(location.id)}
                          aria-label={`Seleccionar ${location.master_reference}`}
                        />
                      </TableCell>
                      <TableCell>
                        <Badge 
                          variant="outline" 
                          className={location.material_type === 'MP' 
                            ? 'border-orange-500 text-orange-500' 
                            : 'border-emerald-500 text-emerald-500'
                          }
                        >
                          {location.material_type}
                        </Badge>
                      </TableCell>
                      <TableCell className="font-mono text-sm">{location.master_reference}</TableCell>
                      <TableCell className="text-sm">{location.subcategoria || '-'}</TableCell>
                      <TableCell className="text-sm max-w-[200px] truncate" title={location.observaciones || ''}>
                        {location.observaciones || '-'}
                      </TableCell>
                      <TableCell className="text-sm">{location.location_name || '-'}</TableCell>
                      <TableCell className="text-sm">{location.location_detail || '-'}</TableCell>
                      <TableCell className="text-sm">{location.punto_referencia || '-'}</TableCell>
                      <TableCell className="text-sm">{location.metodo_conteo || '-'}</TableCell>
                      <TableCell>
                        <SupervisorSelect
                          value={location.assigned_supervisor_id}
                          onValueChange={(value) => updateAssignmentMutation.mutate({
                            locationId: location.id,
                            supervisorId: value
                          })}
                          disabled={updateAssignmentMutation.isPending}
                        />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
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
      </main>
    </div>
  );
};

export default GestionResponsables;
