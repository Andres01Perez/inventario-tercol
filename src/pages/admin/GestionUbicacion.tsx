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
  X
} from 'lucide-react';
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

const ITEMS_PER_PAGE = 15;

interface CountTask {
  id: string;
  master_reference: string;
  subcategoria: string | null;
  location_name: string | null;
  location_detail: string | null;
  punto_referencia: string | null;
  metodo_conteo: string | null;
  assigned_supervisor_id: string | null;
  assigned_admin_id: string | null;
}

interface InventoryWithTask {
  referencia: string;
  material_type: 'MP' | 'PP';
  control: string | null;
  task: CountTask | null;
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
  const [filterSupervisor, setFilterSupervisor] = useState<string>('all');

  const isAdminMP = role === 'admin_mp';
  const adminTypeLabel = isAdminMP ? 'Materia Prima' : 'Producto en Proceso';
  const AdminIcon = isAdminMP ? Package : Boxes;
  const adminColorClass = isAdminMP ? 'text-orange-500' : 'text-emerald-500';
  const adminBgClass = isAdminMP ? 'bg-orange-500/10' : 'bg-emerald-500/10';

  // Fetch supervisors for the filter dropdown
  const { data: supervisors } = useQuery({
    queryKey: ['supervisors-filter'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('user_roles')
        .select('user_id, profiles!inner(id, full_name, email)')
        .eq('role', 'supervisor');
      if (error) throw error;
      return data || [];
    }
  });

  const hasActiveFilters = filterTipo !== 'all' || filterSubcategoria || filterUbicacion || filterSupervisor !== 'all';

  const clearFilters = () => {
    setFilterTipo('all');
    setFilterSubcategoria('');
    setFilterUbicacion('');
    setFilterSupervisor('all');
    setCurrentPage(1);
  };

  // Fetch inventory items with their associated tasks
  const { data, isLoading, refetch } = useQuery({
    queryKey: ['admin-inventory', role, searchTerm, currentPage, filterTipo, filterSubcategoria, filterUbicacion, filterSupervisor],
    queryFn: async () => {
      // admin_mp: control IS NOT NULL
      // admin_pp: control IS NULL
      let query = supabase
        .from('inventory_master')
        .select('referencia, material_type, control', { count: 'exact' });

      if (isAdminMP) {
        query = query.not('control', 'is', null);
      } else {
        query = query.is('control', null);
      }

      // Apply tipo filter
      if (filterTipo !== 'all') {
        query = query.eq('material_type', filterTipo as 'MP' | 'PP');
      }

      if (searchTerm) {
        query = query.ilike('referencia', `%${searchTerm}%`);
      }

      query = query.order('referencia');

      const { data: inventoryData, error: inventoryError, count } = await query;
      if (inventoryError) throw inventoryError;

      if (!inventoryData || inventoryData.length === 0) {
        return { items: [], total: 0 };
      }

      // Fetch associated tasks
      const referencias = inventoryData.map(i => i.referencia);
      let tasksQuery = supabase
        .from('count_tasks')
        .select('*')
        .in('master_reference', referencias);

      const { data: tasksData, error: tasksError } = await tasksQuery;
      if (tasksError) throw tasksError;

      // Map tasks to inventory
      const tasksMap = new Map<string, CountTask>();
      tasksData?.forEach(task => {
        tasksMap.set(task.master_reference, task);
      });

      let items: InventoryWithTask[] = inventoryData.map(inv => ({
        referencia: inv.referencia,
        material_type: inv.material_type as 'MP' | 'PP',
        control: inv.control,
        task: tasksMap.get(inv.referencia) || null
      }));

      // Apply client-side filters for task-related fields
      if (filterSubcategoria) {
        items = items.filter(item => 
          item.task?.subcategoria?.toLowerCase().includes(filterSubcategoria.toLowerCase())
        );
      }

      if (filterUbicacion) {
        items = items.filter(item => 
          item.task?.location_name?.toLowerCase().includes(filterUbicacion.toLowerCase())
        );
      }

      if (filterSupervisor !== 'all') {
        items = items.filter(item => 
          item.task?.assigned_supervisor_id === filterSupervisor
        );
      }

      // Paginate after client-side filtering
      const totalFiltered = items.length;
      const from = (currentPage - 1) * ITEMS_PER_PAGE;
      const paginatedItems = items.slice(from, from + ITEMS_PER_PAGE);

      return { items: paginatedItems, total: totalFiltered };
    }
  });

  // Create or update task
  const upsertTaskMutation = useMutation({
    mutationFn: async ({ 
      referencia, 
      field, 
      value, 
      existingTaskId 
    }: { 
      referencia: string; 
      field: string; 
      value: string | null; 
      existingTaskId: string | null;
    }) => {
      if (existingTaskId) {
        const { error } = await supabase
          .from('count_tasks')
          .update({ [field]: value } as any)
          .eq('id', existingTaskId);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from('count_tasks')
          .insert([{
            master_reference: referencia,
            assigned_admin_id: profile?.id,
            [field]: value
          }] as any);
        if (error) throw error;
      }
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

  const handleSave = async (referencia: string, field: string, value: string | null, existingTaskId: string | null) => {
    await upsertTaskMutation.mutateAsync({ referencia, field, value, existingTaskId });
  };

  const totalPages = Math.ceil((data?.total || 0) / ITEMS_PER_PAGE);

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

            <div className="flex items-center gap-4">
              <div className="text-right hidden sm:block">
                <p className="text-sm font-medium text-foreground">{profile?.full_name}</p>
                <p className="text-xs text-muted-foreground">Admin {isAdminMP ? 'MP' : 'PP'}</p>
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
          <Button variant="outline" size="icon" onClick={() => refetch()}>
            <RefreshCw className="w-4 h-4" />
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

          {/* Líder Conteo filter */}
          <div className="flex items-center gap-2">
            <span className="text-sm text-muted-foreground">Líder:</span>
            <Select value={filterSupervisor} onValueChange={(value) => { setFilterSupervisor(value); setCurrentPage(1); }}>
              <SelectTrigger className="w-[160px] h-9">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos</SelectItem>
                {supervisors?.map((s: any) => (
                  <SelectItem key={s.user_id} value={s.user_id}>
                    {s.profiles?.full_name || s.profiles?.email}
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
          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <RefreshCw className="w-6 h-6 animate-spin text-muted-foreground" />
            </div>
          ) : data?.items.length === 0 ? (
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
                    <TableHead>Ubicación</TableHead>
                    <TableHead>Ubicación Detallada</TableHead>
                    <TableHead>Punto Referencia</TableHead>
                    <TableHead>Método Conteo</TableHead>
                    <TableHead className="w-[180px]">Líder Conteo</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data?.items.map((item) => (
                    <TableRow key={item.referencia}>
                      <TableCell>
                        <Badge variant="outline" className={item.material_type === 'MP' ? 'border-orange-500 text-orange-500' : 'border-emerald-500 text-emerald-500'}>
                          {item.material_type}
                        </Badge>
                      </TableCell>
                      <TableCell className="font-medium">{item.referencia}</TableCell>
                      <TableCell className="py-1">
                        <EditableCell
                          value={item.task?.subcategoria}
                          onSave={(value) => handleSave(item.referencia, 'subcategoria', value, item.task?.id || null)}
                          placeholder="Ingresar..."
                        />
                      </TableCell>
                      <TableCell className="py-1">
                        <EditableCell
                          value={item.task?.location_name}
                          onSave={(value) => handleSave(item.referencia, 'location_name', value, item.task?.id || null)}
                          placeholder="Ingresar..."
                        />
                      </TableCell>
                      <TableCell className="py-1">
                        <EditableCell
                          value={item.task?.location_detail}
                          onSave={(value) => handleSave(item.referencia, 'location_detail', value, item.task?.id || null)}
                          placeholder="Ingresar..."
                        />
                      </TableCell>
                      <TableCell className="py-1">
                        <EditableCell
                          value={item.task?.punto_referencia}
                          onSave={(value) => handleSave(item.referencia, 'punto_referencia', value, item.task?.id || null)}
                          placeholder="Ingresar..."
                        />
                      </TableCell>
                      <TableCell className="py-1">
                        <EditableCell
                          value={item.task?.metodo_conteo}
                          onSave={(value) => handleSave(item.referencia, 'metodo_conteo', value, item.task?.id || null)}
                          placeholder="Ingresar..."
                        />
                      </TableCell>
                      <TableCell>
                        <SupervisorSelect
                          value={item.task?.assigned_supervisor_id}
                          onValueChange={(value) => handleSave(item.referencia, 'assigned_supervisor_id', value, item.task?.id || null)}
                        />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="border-t border-border p-4">
              <Pagination>
                <PaginationContent>
                  <PaginationItem>
                    <PaginationPrevious
                      onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                      className={currentPage === 1 ? 'pointer-events-none opacity-50' : 'cursor-pointer'}
                    />
                  </PaginationItem>
                  {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                    const page = currentPage <= 3 ? i + 1 : currentPage - 2 + i;
                    if (page > totalPages) return null;
                    return (
                      <PaginationItem key={page}>
                        <PaginationLink
                          onClick={() => setCurrentPage(page)}
                          isActive={page === currentPage}
                          className="cursor-pointer"
                        >
                          {page}
                        </PaginationLink>
                      </PaginationItem>
                    );
                  })}
                  <PaginationItem>
                    <PaginationNext
                      onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                      className={currentPage === totalPages ? 'pointer-events-none opacity-50' : 'cursor-pointer'}
                    />
                  </PaginationItem>
                </PaginationContent>
              </Pagination>
            </div>
          )}
        </div>
      </main>
    </div>
  );
};

export default GestionUbicacion;
