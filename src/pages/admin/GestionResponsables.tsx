import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useInventory } from '@/contexts/InventoryContext';
import ReadOnlyBanner from '@/components/shared/ReadOnlyBanner';
import AppLayout from '@/components/layout/AppLayout';
import { useAuth } from '@/contexts/AuthContext';
import { useNavigate } from 'react-router-dom';
import { 
  Users, 
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

type Bodega = 'almacen' | 'planta';

interface LocationWithReference {
  kind: 'location';
  id: string;
  master_reference: string;
  subcategoria: string | null;
  observaciones: string | null;
  location_name: string | null;
  location_detail: string | null;
  punto_referencia: string | null;
  metodo_conteo: string | null;
  assigned_supervisor_id: string | null;
  assigned_admin_id: string | null;
  bodega: Bodega | null;
  material_type: 'MP' | 'PP';
  control: string | null;
}

interface NoLocationRow {
  kind: 'no-location';
  master_reference: string;
  material_type: 'MP' | 'PP';
  control: string | null;
}

type ResponsablesRow = LocationWithReference | NoLocationRow;

const GestionResponsables: React.FC = () => {
  const { profile, role } = useAuth();
  const { inventoryId } = useInventory();
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
  const [filterBodega, setFilterBodega] = useState<string>('all');
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
  }, [debouncedSearchTerm, filterTipo, filterSubcategoria, filterUbicacion, filterObservacion, filterSupervisor, filterPuntoReferencia, filterBodega, currentPage, pageSize]);

  // Use cached supervisors hook
  const { data: supervisors } = useSupervisors();

  // Map material type to the admin that owns the bucket (MP → admin_mp, PP → admin_pp)
  // and resolve the bodega of every location from its assigned_admin_id.
  const { data: adminBodega } = useQuery({
    queryKey: ['admin-bodega-map'],
    queryFn: async () => {
      const { data: roles, error } = await supabase
        .from('user_roles')
        .select('user_id, role')
        .in('role', ['admin_mp', 'admin_pp']);
      if (error) throw error;
      const byRole = new Map<string, string>();
      const byUser = new Map<string, Bodega>();
      const mpIds: string[] = [];
      const ppIds: string[] = [];
      roles?.forEach((r) => {
        if (!byRole.has(r.role)) byRole.set(r.role, r.user_id);
        const bodega: Bodega = r.role === 'admin_mp' ? 'almacen' : 'planta';
        byUser.set(r.user_id, bodega);
        (r.role === 'admin_mp' ? mpIds : ppIds).push(r.user_id);
      });
      return { byRole, byUser, mpIds, ppIds };
    },
    staleTime: 5 * 60 * 1000,
    enabled: !!role,
  });

  const hasActiveFilters = filterTipo !== 'all' || filterSubcategoria || filterUbicacion || filterObservacion || filterSupervisor !== 'all' || filterPuntoReferencia !== 'all' || filterBodega !== 'all';

  const clearFilters = () => {
    setFilterTipo('all');
    setFilterSubcategoria('');
    setFilterUbicacion('');
    setFilterObservacion('');
    setFilterSupervisor('all');
    setFilterPuntoReferencia('all');
    setFilterBodega('all');
    setCurrentPage(1);
  };

  // OPTIMIZED: Use RPC function for filter options (single efficient query)
  const { data: filterOptions } = useQuery({
    queryKey: ['filter-options-rpc', role, inventoryId],
    queryFn: async () => {
      // Use optimized SQL function that returns only distinct values
      const materialType = isAdminMP ? 'MP' : isAdminPP ? 'PP' : null;
      const { data, error } = await supabase.rpc('get_filter_options', {
        _material_type: materialType,
        _inventory_id: inventoryId!,
      });
      
      if (error) {
        console.error('Error fetching filter options:', error);
        // Fallback to direct query if RPC fails
        const { data: fallbackData } = await supabase
          .from('locations')
          .select('subcategoria, location_name, observaciones, punto_referencia')
          .eq('inventory_id', inventoryId!);
        
        const subcategorias = new Set<string>();
        const ubicaciones = new Set<string>();
        const observaciones = new Set<string>();
        const puntosReferencia = new Set<string>();
        
        fallbackData?.forEach(row => {
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
      }
      
      // Cast data to expected shape
      const typedData = data as {
        subcategorias: string[] | null;
        ubicaciones: string[] | null;
        observaciones: string[] | null;
        puntos_referencia: string[] | null;
      };
      
      return {
        subcategorias: (typedData?.subcategorias || []).filter(Boolean),
        ubicaciones: (typedData?.ubicaciones || []).filter(Boolean),
        observaciones: (typedData?.observaciones || []).filter(Boolean),
        puntosReferencia: (typedData?.puntos_referencia || []).filter(Boolean),
      };
    },
    staleTime: 10 * 60 * 1000, // 10 minutes - filter options don't change often
    gcTime: 30 * 60 * 1000,    // Keep in cache for 30 minutes
    enabled: !!role && !!inventoryId,
  });

  // Query from inventory_master so references without locations are visible.
  const { data, isLoading, refetch, isFetching } = useQuery({
    queryKey: ['locations-responsables', role, debouncedSearchTerm, currentPage, pageSize, filterTipo, filterSubcategoria, filterUbicacion, filterObservacion, filterSupervisor, filterPuntoReferencia, filterBodega, inventoryId],
    queryFn: async () => {
      const hasLocationFilter = filterSubcategoria || filterUbicacion || filterObservacion || filterSupervisor !== 'all' || filterPuntoReferencia !== 'all' || filterBodega !== 'all';
      const locationRelation = hasLocationFilter ? 'locations!inner' : 'locations';

      let query = supabase
        .from('inventory_master')
        .select(`
          referencia,
          material_type,
          control,
          ${locationRelation}(
            id,
            master_reference,
            subcategoria,
            observaciones,
            location_name,
            location_detail,
            punto_referencia,
            metodo_conteo,
            assigned_supervisor_id,
            assigned_admin_id
          )
        `, { count: 'exact' })
        .eq('inventory_id', inventoryId!);

      // Role-based filtering on the reference bucket
      if (!isSuperadmin && isAdminMP) {
        query = query.not('control', 'is', null).eq('material_type', 'MP');
      }
      if (!isSuperadmin && isAdminPP) {
        query = query.eq('material_type', 'PP');
      }

      // Filter by material type
      if (filterTipo === 'MP' || filterTipo === 'PP') {
        query = query.eq('material_type', filterTipo);
      }

      // Search by reference (use debounced value)
      if (debouncedSearchTerm) {
        query = query.ilike('referencia', `%${debouncedSearchTerm}%`);
      }

      // Filter by subcategoria
      if (filterSubcategoria) {
        query = query.ilike('locations.subcategoria', `%${filterSubcategoria}%`);
      }

      // Filter by location name
      if (filterUbicacion) {
        query = query.ilike('locations.location_name', `%${filterUbicacion}%`);
      }

      // Filter by observaciones
      if (filterObservacion) {
        query = query.ilike('locations.observaciones', `%${filterObservacion}%`);
      }

      // Filter by supervisor
      if (filterSupervisor === 'unassigned') {
        query = query.is('locations.assigned_supervisor_id', null);
      } else if (filterSupervisor !== 'all') {
        query = query.eq('locations.assigned_supervisor_id', filterSupervisor);
      }

      // Filter by punto_referencia
      if (filterPuntoReferencia !== 'all') {
        query = query.ilike('locations.punto_referencia', `%${filterPuntoReferencia}%`);
      }

      // Filter by bodega (derived from the location's admin role)
      if (filterBodega !== 'all') {
        const mpIds = adminBodega?.mpIds ?? [];
        const ppIds = adminBodega?.ppIds ?? [];
        if (filterBodega === 'almacen') {
          query = mpIds.length > 0
            ? query.in('locations.assigned_admin_id', mpIds)
            : query.is('locations.assigned_admin_id', null).eq('locations.assigned_admin_id', '00000000-0000-0000-0000-000000000000');
        } else if (filterBodega === 'planta') {
          query = ppIds.length > 0
            ? query.in('locations.assigned_admin_id', ppIds)
            : query.is('locations.assigned_admin_id', null).eq('locations.assigned_admin_id', '00000000-0000-0000-0000-000000000000');
        } else if (filterBodega === 'sin-bodega') {
          const allIds = [...mpIds, ...ppIds];
          query = allIds.length > 0
            ? query.or(`assigned_admin_id.is.null,assigned_admin_id.not.in.(${allIds.join(',')})`, { referencedTable: 'locations' })
            : query;
        }
      }

      // Pagination
      const from = (currentPage - 1) * pageSize;
      query = query
        .order('referencia')
        .range(from, from + pageSize - 1);

      const { data: masterData, error, count } = await query;
      if (error) throw error;

      // Build rows: existing locations + one synthetic row for references without visible locations.
      const rows: ResponsablesRow[] = [];

      (masterData || []).forEach((inv: any) => {
        const referencia = inv.referencia as string;
        const material_type = inv.material_type as 'MP' | 'PP';
        const control = inv.control as string | null;
        const allLocations: any[] = inv.locations || [];

        const visibleLocations = isSuperadmin
          ? allLocations
          : allLocations.filter((loc) => !loc.assigned_admin_id || loc.assigned_admin_id === profile?.id);

        if (visibleLocations.length === 0) {
          rows.push({ kind: 'no-location', master_reference: referencia, material_type, control });
          return;
        }

        visibleLocations.forEach((loc: any) => {
          rows.push({
            kind: 'location',
            id: loc.id,
            master_reference: referencia,
            subcategoria: loc.subcategoria,
            observaciones: loc.observaciones,
            location_name: loc.location_name,
            location_detail: loc.location_detail,
            punto_referencia: loc.punto_referencia,
            metodo_conteo: loc.metodo_conteo,
            assigned_supervisor_id: loc.assigned_supervisor_id,
            material_type,
            control,
          });
        });
      });

      return { rows, total: count || 0 };
    },
    staleTime: 2 * 60 * 1000, // 2 minutes - data is relatively fresh
    enabled: !!role && !!inventoryId,
  });

  // OPTIMIZED: Memoized selection calculations (only existing locations are selectable)
  const { isAllSelected, isIndeterminate, allIds } = useMemo(() => {
    const ids = data?.rows.filter((r): r is LocationWithReference => r.kind === 'location').map(l => l.id) || [];
    const allSelected = ids.length > 0 && ids.every(id => selectedIds.has(id));
    const indeterminate = selectedIds.size > 0 && !allSelected;
    return { isAllSelected: allSelected, isIndeterminate: indeterminate, allIds: ids };
  }, [data?.rows, selectedIds]);

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
  const handleSupervisorChange = useCallback((row: ResponsablesRow, supervisorId: string | null) => {
    handleAssign(row, supervisorId);
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

  // Create a location for a reference that doesn't have one, then assign supervisor
  const createAndAssignMutation = useMutation({
    mutationFn: async ({ masterReference, materialType, supervisorId }: { masterReference: string, materialType: 'MP' | 'PP', supervisorId: string | null }) => {
      if (!inventoryId) throw new Error('No hay inventario activo');
      const targetRole = materialType === 'MP' ? 'admin_mp' : 'admin_pp';
      const assignedAdminId = isSuperadmin
        ? adminMap?.get(targetRole)
        : profile?.id;
      if (!assignedAdminId) throw new Error(`No hay un admin configurado para ${targetRole}`);

      const { error } = await supabase.from('locations').insert({
        inventory_id: inventoryId,
        master_reference: masterReference,
        assigned_admin_id: assignedAdminId,
        assigned_supervisor_id: supervisorId,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['locations-responsables'] });
      queryClient.invalidateQueries({ queryKey: ['admin-inventory'] });
      toast({ title: 'Guardado', description: 'Ubicación creada y líder asignado' });
    },
    onError: (error) => {
      toast({ title: 'Error', description: error instanceof Error ? error.message : 'No se pudo crear la ubicación', variant: 'destructive' });
    }
  });

  const handleAssign = (row: ResponsablesRow, supervisorId: string | null) => {
    if (row.kind === 'location') {
      updateAssignmentMutation.mutate({ locationId: row.id, supervisorId });
    } else {
      createAndAssignMutation.mutate({ masterReference: row.master_reference, materialType: row.material_type, supervisorId });
    }
  };

  const totalPages = Math.ceil((data?.total || 0) / pageSize);

  return (
    <AppLayout
      title="Gestión de Responsables"
      subtitle={`${adminTypeLabel} - Asignación masiva de líderes de conteo`}
      showBackButton
      backPath="/dashboard"
      fullWidth
      roleConfig={{ label: adminRoleLabel, icon: Users, colorClass: adminColorClass, bgClass: adminBgClass }}
    >
      <ReadOnlyBanner />

      {/* Controls */}
      <div className="border border-border rounded-xl bg-card/50 px-4 py-4 space-y-4 mb-6">
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
      <main>
        <div className="bg-card rounded-lg border border-border overflow-hidden">
          {(isLoading || !role) ? (
            <div className="flex items-center justify-center py-12">
              <RefreshCw className="w-6 h-6 animate-spin text-muted-foreground" />
            </div>
          ) : data?.rows.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12">
              <CheckCircle className="w-12 h-12 text-green-500 mb-4" />
              <p className="text-foreground font-medium">No hay referencias que coincidan con los filtros</p>
              <p className="text-sm text-muted-foreground">Ajusta los filtros o importa ubicaciones desde Gestión de Ubicaciones</p>
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
                  {data?.rows.map((row) => {
                    if (row.kind === 'no-location') {
                      return (
                        <TableRow key={`${row.master_reference}-no-location`}>
                          <TableCell>
                            <span className="text-muted-foreground">—</span>
                          </TableCell>
                          <TableCell>
                            <Badge 
                              variant="outline" 
                              className={row.material_type === 'MP' 
                                ? 'border-orange-500 text-orange-500' 
                                : 'border-emerald-500 text-emerald-500'
                              }
                            >
                              {row.material_type}
                            </Badge>
                          </TableCell>
                          <TableCell className="font-mono text-sm">{row.master_reference}</TableCell>
                          <TableCell colSpan={6} className="text-muted-foreground text-sm italic">
                            Sin ubicaciones asignadas
                          </TableCell>
                          <TableCell>
                            <SupervisorSelect
                              value={null}
                              onValueChange={(value) => handleAssign(row, value)}
                              placeholder="Asignar líder..."
                              disabled={createAndAssignMutation.isPending}
                            />
                          </TableCell>
                        </TableRow>
                      );
                    }

                    return (
                      <TableRow key={row.id}>
                        <TableCell>
                          <Checkbox
                            checked={selectedIds.has(row.id)}
                            onCheckedChange={() => toggleSelection(row.id)}
                            aria-label={`Seleccionar ${row.master_reference}`}
                          />
                        </TableCell>
                        <TableCell>
                          <Badge 
                            variant="outline" 
                            className={row.material_type === 'MP' 
                              ? 'border-orange-500 text-orange-500' 
                              : 'border-emerald-500 text-emerald-500'
                            }
                          >
                            {row.material_type}
                          </Badge>
                        </TableCell>
                        <TableCell className="font-mono text-sm">{row.master_reference}</TableCell>
                        <TableCell className="text-sm">{row.subcategoria || '-'}</TableCell>
                        <TableCell className="text-sm max-w-[200px] truncate" title={row.observaciones || ''}>
                          {row.observaciones || '-'}
                        </TableCell>
                        <TableCell className="text-sm">{row.location_name || '-'}</TableCell>
                        <TableCell className="text-sm">{row.location_detail || '-'}</TableCell>
                        <TableCell className="text-sm">{row.punto_referencia || '-'}</TableCell>
                        <TableCell className="text-sm">{row.metodo_conteo || '-'}</TableCell>
                        <TableCell>
                          <SupervisorSelect
                            value={row.assigned_supervisor_id}
                            onValueChange={(value) => handleAssign(row, value)}
                            disabled={updateAssignmentMutation.isPending || createAndAssignMutation.isPending}
                          />
                        </TableCell>
                      </TableRow>
                    );
                  })}
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
    </AppLayout>
  );
};

export default GestionResponsables;
