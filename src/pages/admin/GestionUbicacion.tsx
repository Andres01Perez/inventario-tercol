import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useNavigate } from 'react-router-dom';
import { 
  MapPin, 
  ArrowLeft, 
  Search, 
  RefreshCw,
  CheckCircle,
  Package,
  Boxes,
  X,
  Plus,
  Trash2,
  Users,
  Upload
} from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import LocationsImport from '@/components/shared/LocationsImport';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
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
import EditableCell from '@/components/shared/EditableCell';
import SupervisorSelect from '@/components/shared/SupervisorSelect';
import {
  Pagination,
  PaginationContent,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
} from '@/components/ui/pagination';

const ITEMS_PER_PAGE = 200;

interface LocationData {
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
}

interface LocationRow {
  referencia: string;
  material_type: 'MP' | 'PP';
  control: string | null;
  location: LocationData | null;
  isFirstOfGroup: boolean;
  groupSize: number;
  hasNoLocations?: boolean;
}

const GestionUbicacion: React.FC = () => {
  const { profile, role } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  
  const [searchTerm, setSearchTerm] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  
  // Filter states
  const [filterTipo, setFilterTipo] = useState<string>('all');
  const [filterSubcategoria, setFilterSubcategoria] = useState('');
  const [filterUbicacion, setFilterUbicacion] = useState('');
  const [filterObservacion, setFilterObservacion] = useState('');
  const [filterSupervisor, setFilterSupervisor] = useState<string>('all');
  const [showImportDialog, setShowImportDialog] = useState(false);

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

  // Fetch supervisors for the filter dropdown
  const { data: supervisors } = useQuery({
    queryKey: ['supervisors-filter'],
    queryFn: async () => {
      const { data: roles, error: rolesError } = await supabase
        .from('user_roles')
        .select('user_id')
        .eq('role', 'supervisor');
      
      if (rolesError) throw rolesError;
      if (!roles || roles.length === 0) return [];

      const userIds = roles.map(r => r.user_id);

      const { data: profiles, error: profilesError } = await supabase
        .from('profiles')
        .select('id, full_name, email')
        .in('id', userIds);

      if (profilesError) throw profilesError;
      return profiles || [];
    }
  });

  const hasActiveFilters = filterTipo !== 'all' || filterSubcategoria || filterUbicacion || filterObservacion || filterSupervisor !== 'all';

  const clearFilters = () => {
    setFilterTipo('all');
    setFilterSubcategoria('');
    setFilterUbicacion('');
    setFilterObservacion('');
    setFilterSupervisor('all');
    setCurrentPage(1);
  };

  // Fetch inventory items with their associated locations - supporting 1:N relationship
  const { data, isLoading, refetch, isFetching } = useQuery({
    queryKey: ['admin-inventory', profile?.id, role, searchTerm, currentPage, filterTipo, filterSubcategoria, filterUbicacion, filterObservacion, filterSupervisor],
    queryFn: async () => {
      let query = supabase
        .from('inventory_master')
        .select('referencia, material_type, control', { count: 'exact' });

      // Superadmin ve todo, admin_mp solo ve referencias con control NOT NULL
      // admin_pp ve TODAS las referencias para poder agregarles ubicaciones
      if (!isSuperadmin && isAdminMP) {
        query = query.not('control', 'is', null);
      }

      if (filterTipo !== 'all') {
        query = query.eq('material_type', filterTipo as 'MP' | 'PP');
      }

      if (searchTerm) {
        query = query.ilike('referencia', `%${searchTerm}%`);
      }

      query = query.order('referencia');

      const from = (currentPage - 1) * ITEMS_PER_PAGE;
      query = query.range(from, from + ITEMS_PER_PAGE - 1);

      const { data: inventoryData, error: inventoryError, count } = await query;
      if (inventoryError) throw inventoryError;

      if (!inventoryData || inventoryData.length === 0) {
        return { rows: [], total: count || 0 };
      }

      // Fetch ALL locations for the paginated inventory items
      const referencias = inventoryData.map(i => i.referencia);
      const { data: locationsData, error: locationsError } = await supabase
        .from('locations')
        .select('*')
        .in('master_reference', referencias);

      if (locationsError) throw locationsError;

      // Group locations by master_reference (1:N relationship)
      const locationsMap = new Map<string, LocationData[]>();
      locationsData?.forEach(location => {
        const existing = locationsMap.get(location.master_reference) || [];
        existing.push(location);
        locationsMap.set(location.master_reference, existing);
      });

      // Build rows: one per location (no separate add rows)
      let rows: LocationRow[] = [];
      
      inventoryData.forEach(inv => {
        let locations = locationsMap.get(inv.referencia) || [];
        
        // Apply client-side filters
        if (filterSubcategoria) {
          locations = locations.filter(loc => 
            loc.subcategoria?.toLowerCase().includes(filterSubcategoria.toLowerCase())
          );
        }
        if (filterUbicacion) {
          locations = locations.filter(loc => 
            loc.location_name?.toLowerCase().includes(filterUbicacion.toLowerCase())
          );
        }
        if (filterObservacion) {
          locations = locations.filter(loc => 
            loc.observaciones?.toLowerCase().includes(filterObservacion.toLowerCase())
          );
        }
        if (filterSupervisor !== 'all') {
          locations = locations.filter(loc => 
            loc.assigned_supervisor_id === filterSupervisor
          );
        }

        if (locations.length === 0) {
          // Reference with no locations - show row with add button only
          rows.push({
            referencia: inv.referencia,
            material_type: inv.material_type as 'MP' | 'PP',
            control: inv.control,
            location: null,
            isFirstOfGroup: true,
            groupSize: 1,
            hasNoLocations: true
          });
        } else {
          // Add a row for each existing location
          locations.forEach((loc, index) => {
            rows.push({
              referencia: inv.referencia,
              material_type: inv.material_type as 'MP' | 'PP',
              control: inv.control,
              location: loc,
              isFirstOfGroup: index === 0,
              groupSize: locations.length
            });
          });
        }
      });

      return { rows, total: count || 0 };
    },
    enabled: !!role,
  });

  // Update existing location
  const updateLocationMutation = useMutation({
    mutationFn: async ({ 
      locationId, 
      field, 
      value 
    }: { 
      locationId: string; 
      field: string; 
      value: string | null; 
    }) => {
      const { error } = await supabase
        .from('locations')
        .update({ [field]: value } as any)
        .eq('id', locationId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-inventory'] });
      toast({ title: 'Guardado', description: 'Campo actualizado correctamente' });
    },
    onError: (error) => {
      toast({ title: 'Error', description: 'No se pudo guardar el cambio', variant: 'destructive' });
      console.error('Update error:', error);
    }
  });

  // Add new location
  const addLocationMutation = useMutation({
    mutationFn: async (referencia: string) => {
      const { error } = await supabase
        .from('locations')
        .insert({
          master_reference: referencia,
          assigned_admin_id: profile?.id
        });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-inventory'] });
      toast({ title: 'Ubicación agregada', description: 'Nueva ubicación creada para la referencia' });
    },
    onError: (error) => {
      toast({ title: 'Error', description: 'No se pudo agregar la ubicación', variant: 'destructive' });
      console.error('Add location error:', error);
    }
  });

  // Delete location
  const deleteLocationMutation = useMutation({
    mutationFn: async (locationId: string) => {
      const { error } = await supabase
        .from('locations')
        .delete()
        .eq('id', locationId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-inventory'] });
      toast({ title: 'Ubicación eliminada', description: 'La ubicación fue eliminada correctamente' });
    },
    onError: (error) => {
      toast({ title: 'Error', description: 'No se pudo eliminar la ubicación', variant: 'destructive' });
      console.error('Delete location error:', error);
    }
  });

  const handleSave = async (locationId: string, field: string, value: string | null) => {
    await updateLocationMutation.mutateAsync({ locationId, field, value });
  };

  const handleAddLocation = async (referencia: string) => {
    await addLocationMutation.mutateAsync(referencia);
  };

  const handleDeleteLocation = async (locationId: string) => {
    await deleteLocationMutation.mutateAsync(locationId);
  };

  const totalPages = Math.ceil((data?.total || 0) / ITEMS_PER_PAGE);

  // Track alternating group colors
  let groupIndex = 0;
  let lastReferencia = '';

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
                <MapPin className={`w-5 h-5 ${adminColorClass}`} />
              </div>
              <div>
                <h1 className="text-lg font-bold text-foreground">Gestión de Ubicaciones</h1>
                <p className="text-xs text-muted-foreground">{adminTypeLabel} - Asignar ubicaciones y supervisores</p>
              </div>
            </div>

            <div className="flex items-center gap-3">
              <Button 
                variant="outline" 
                size="sm" 
                onClick={() => setShowImportDialog(true)}
                className="gap-2"
              >
                <Upload className="w-4 h-4" />
                Importar
              </Button>
              <Button 
                variant="outline" 
                size="sm" 
                onClick={() => navigate('/admin/gestion-responsables')}
                className="gap-2"
              >
                <Users className="w-4 h-4" />
                Asignar Responsables
              </Button>
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
          <span className="text-sm text-muted-foreground">
            {data?.total || 0} referencias
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
            <Input
              placeholder="Filtrar..."
              value={filterSubcategoria}
              onChange={(e) => { setFilterSubcategoria(e.target.value); setCurrentPage(1); }}
              className="w-[140px] h-9"
            />
          </div>

          {/* Ubicación filter */}
          <div className="flex items-center gap-2">
            <span className="text-sm text-muted-foreground">Ubicación:</span>
            <Input
              placeholder="Filtrar..."
              value={filterUbicacion}
              onChange={(e) => { setFilterUbicacion(e.target.value); setCurrentPage(1); }}
              className="w-[140px] h-9"
            />
          </div>

          {/* Observación filter */}
          <div className="flex items-center gap-2">
            <span className="text-sm text-muted-foreground">Observación:</span>
            <Input
              placeholder="Filtrar..."
              value={filterObservacion}
              onChange={(e) => { setFilterObservacion(e.target.value); setCurrentPage(1); }}
              className="w-[140px] h-9"
            />
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

      {/* Table */}
      <main className="px-4 sm:px-6 lg:px-8 py-6">
        <div className="bg-card rounded-lg border border-border overflow-hidden">
          {(isLoading || !role) ? (
            <div className="flex items-center justify-center py-12">
              <RefreshCw className="w-6 h-6 animate-spin text-muted-foreground" />
            </div>
          ) : data?.rows.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12">
              <CheckCircle className="w-12 h-12 text-green-500 mb-4" />
              <p className="text-foreground font-medium">¡Todo configurado!</p>
              <p className="text-sm text-muted-foreground">No hay referencias que coincidan con los filtros</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[80px]">Tipo</TableHead>
                    <TableHead className="w-[120px]">Referencia</TableHead>
                    <TableHead>Subcategoría</TableHead>
                    <TableHead>Observaciones</TableHead>
                    <TableHead>Ubicación</TableHead>
                    <TableHead>Ubicación Detallada</TableHead>
                    <TableHead>Punto Referencia</TableHead>
                    <TableHead>Método Conteo</TableHead>
                    <TableHead className="w-[180px]">Líder Conteo</TableHead>
                    <TableHead className="w-[100px]">Acciones</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data?.rows.map((row, index) => {
                    // Track group index for alternating colors
                    if (row.referencia !== lastReferencia) {
                      groupIndex++;
                      lastReferencia = row.referencia;
                    }
                    const isEvenGroup = groupIndex % 2 === 0;
                    const rowKey = row.location?.id || `${row.referencia}-add-${index}`;

                    // Reference without locations - show row with add button only
                    if (row.hasNoLocations) {
                      return (
                        <TableRow 
                          key={rowKey} 
                          className={isEvenGroup ? 'bg-muted/30' : ''}
                        >
                          <TableCell>
                            <Badge variant="outline" className={row.material_type === 'MP' ? 'border-orange-500 text-orange-500' : 'border-emerald-500 text-emerald-500'}>
                              {row.material_type}
                            </Badge>
                          </TableCell>
                          <TableCell className="font-medium">{row.referencia}</TableCell>
                          <TableCell colSpan={7} className="text-muted-foreground text-sm italic">
                            Sin ubicaciones asignadas
                          </TableCell>
                          <TableCell>
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => handleAddLocation(row.referencia)}
                              disabled={addLocationMutation.isPending}
                              className="text-primary hover:text-primary hover:bg-primary/10"
                              title="Agregar ubicación"
                            >
                              <Plus className="w-4 h-4" />
                            </Button>
                          </TableCell>
                        </TableRow>
                      );
                    }

                    // Regular location row
                    return (
                      <TableRow 
                        key={rowKey}
                        className={isEvenGroup ? 'bg-muted/30' : ''}
                      >
                        <TableCell>
                          {row.isFirstOfGroup && (
                            <Badge variant="outline" className={row.material_type === 'MP' ? 'border-orange-500 text-orange-500' : 'border-emerald-500 text-emerald-500'}>
                              {row.material_type}
                            </Badge>
                          )}
                        </TableCell>
                        <TableCell className="font-medium">
                          {row.isFirstOfGroup && row.referencia}
                        </TableCell>
                        <TableCell className="py-1">
                          <EditableCell
                            value={row.location?.subcategoria}
                            onSave={(value) => handleSave(row.location!.id, 'subcategoria', value)}
                            placeholder="Ingresar..."
                          />
                        </TableCell>
                        <TableCell className="py-1">
                          <EditableCell
                            value={row.location?.observaciones}
                            onSave={(value) => handleSave(row.location!.id, 'observaciones', value)}
                            placeholder="Ingresar..."
                          />
                        </TableCell>
                        <TableCell className="py-1">
                          <EditableCell
                            value={row.location?.location_name}
                            onSave={(value) => handleSave(row.location!.id, 'location_name', value)}
                            placeholder="Ingresar..."
                          />
                        </TableCell>
                        <TableCell className="py-1">
                          <EditableCell
                            value={row.location?.location_detail}
                            onSave={(value) => handleSave(row.location!.id, 'location_detail', value)}
                            placeholder="Ingresar..."
                          />
                        </TableCell>
                        <TableCell className="py-1">
                          <EditableCell
                            value={row.location?.punto_referencia}
                            onSave={(value) => handleSave(row.location!.id, 'punto_referencia', value)}
                            placeholder="Ingresar..."
                          />
                        </TableCell>
                        <TableCell className="py-1">
                          <EditableCell
                            value={row.location?.metodo_conteo}
                            onSave={(value) => handleSave(row.location!.id, 'metodo_conteo', value)}
                            placeholder="Ingresar..."
                          />
                        </TableCell>
                        <TableCell>
                          <SupervisorSelect
                            value={row.location?.assigned_supervisor_id}
                            onValueChange={(value) => handleSave(row.location!.id, 'assigned_supervisor_id', value)}
                          />
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-1">
                            {row.isFirstOfGroup && (
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => handleAddLocation(row.referencia)}
                                disabled={addLocationMutation.isPending}
                                className="text-primary hover:text-primary hover:bg-primary/10"
                                title="Agregar ubicación"
                              >
                                <Plus className="w-4 h-4" />
                              </Button>
                            )}
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => handleDeleteLocation(row.location!.id)}
                              disabled={deleteLocationMutation.isPending}
                              className="text-destructive hover:text-destructive hover:bg-destructive/10"
                              title="Eliminar ubicación"
                            >
                              <Trash2 className="w-4 h-4" />
                            </Button>
                          </div>
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
          <div className="mt-4 flex justify-center">
            <Pagination>
              <PaginationContent>
                <PaginationItem>
                  <PaginationPrevious 
                    onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                    className={currentPage === 1 ? 'pointer-events-none opacity-50' : 'cursor-pointer'}
                  />
                </PaginationItem>
                {[...Array(Math.min(5, totalPages))].map((_, i) => {
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

      {/* Dialog de importación */}
      <Dialog open={showImportDialog} onOpenChange={setShowImportDialog}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Importar Ubicaciones</DialogTitle>
          </DialogHeader>
          <LocationsImport 
            onSuccess={() => { refetch(); }}
            onClose={() => setShowImportDialog(false)}
          />
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default GestionUbicacion;
