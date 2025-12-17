import React, { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
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
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import OperarioSelect from '@/components/shared/OperarioSelect';
import { toast } from 'sonner';
import { Loader2, Search, Users, RefreshCw, Filter } from 'lucide-react';

interface Location {
  id: string;
  master_reference: string;
  location_name: string | null;
  location_detail: string | null;
  subcategoria: string | null;
  observaciones: string | null;
  punto_referencia: string | null;
  metodo_conteo: string | null;
  operario_id: string | null;
  operarios: { id: string; full_name: string; turno: number | null } | null;
  inventory_master: { referencia: string; material_type: string; control: string | null } | null;
}

interface AssignmentTabProps {
  isAdminMode?: boolean;
  controlFilter?: 'not_null' | 'null' | 'all';
}

const AssignmentTab: React.FC<AssignmentTabProps> = ({ isAdminMode = false, controlFilter = 'all' }) => {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [searchTerm, setSearchTerm] = useState('');
  const [bulkOperarioId, setBulkOperarioId] = useState<string | null>(null);
  
  // Filter states
  const [filterTipo, setFilterTipo] = useState<string>('all');
  const [filterUbicacion, setFilterUbicacion] = useState('');
  const [filterUbicacionDetallada, setFilterUbicacionDetallada] = useState('');

  const { data: locations = [], isLoading, refetch } = useQuery({
    queryKey: ['assignment-locations', user?.id, isAdminMode, controlFilter],
    queryFn: async () => {
      let query = supabase
        .from('locations')
        .select(`
          id, master_reference, location_name, location_detail,
          subcategoria, observaciones, punto_referencia, metodo_conteo,
          operario_id,
          operarios:operarios!locations_operario_id_fkey(id, full_name, turno),
          inventory_master!inner(referencia, material_type, control)
        `);

      // Only filter by supervisor if NOT admin mode
      if (!isAdminMode) {
        query = query.eq('assigned_supervisor_id', user!.id);
      }

      // Apply control filter based on role
      if (controlFilter === 'not_null') {
        query = query.not('inventory_master.control', 'is', null);
      } else if (controlFilter === 'null') {
        query = query.is('inventory_master.control', null);
      }

      const { data, error } = await query;
      if (error) throw error;
      return data as Location[];
    },
    enabled: !!user?.id,
  });

  const assignMutation = useMutation({
    mutationFn: async ({ locationIds, operarioId }: { locationIds: string[]; operarioId: string | null }) => {
      const { error } = await supabase
        .from('locations')
        .update({ operario_id: operarioId })
        .in('id', locationIds);

      if (error) throw error;
    },
    onSuccess: () => {
      toast.success('Operario asignado correctamente');
      queryClient.invalidateQueries({ queryKey: ['assignment-locations'] });
      setSelectedIds(new Set());
      setBulkOperarioId(null);
    },
    onError: (error: Error) => {
      toast.error(`Error al asignar: ${error.message}`);
    },
  });

  const filteredLocations = useMemo(() => {
    let filtered = locations;
    
    // Search term filter
    if (searchTerm) {
      const term = searchTerm.toLowerCase();
      filtered = filtered.filter(loc =>
        loc.master_reference.toLowerCase().includes(term) ||
        loc.location_name?.toLowerCase().includes(term)
      );
    }
    
    // Tipo filter
    if (filterTipo !== 'all') {
      filtered = filtered.filter(loc => 
        loc.inventory_master?.material_type === filterTipo
      );
    }
    
    // Ubicación filter
    if (filterUbicacion) {
      const term = filterUbicacion.toLowerCase();
      filtered = filtered.filter(loc =>
        loc.location_name?.toLowerCase().includes(term)
      );
    }
    
    // Ubicación Detallada filter
    if (filterUbicacionDetallada) {
      const term = filterUbicacionDetallada.toLowerCase();
      filtered = filtered.filter(loc =>
        loc.location_detail?.toLowerCase().includes(term)
      );
    }
    
    return filtered;
  }, [locations, searchTerm, filterTipo, filterUbicacion, filterUbicacionDetallada]);

  const handleSelectAll = (checked: boolean) => {
    if (checked) {
      setSelectedIds(new Set(filteredLocations.map(l => l.id)));
    } else {
      setSelectedIds(new Set());
    }
  };

  const handleSelectRow = (id: string, checked: boolean) => {
    const newSet = new Set(selectedIds);
    if (checked) {
      newSet.add(id);
    } else {
      newSet.delete(id);
    }
    setSelectedIds(newSet);
  };

  const handleBulkAssign = () => {
    if (selectedIds.size === 0) return;
    assignMutation.mutate({
      locationIds: Array.from(selectedIds),
      operarioId: bulkOperarioId,
    });
  };

  const handleIndividualAssign = (locationId: string, operarioId: string | null) => {
    assignMutation.mutate({
      locationIds: [locationId],
      operarioId,
    });
  };

  const allSelected = filteredLocations.length > 0 && filteredLocations.every(l => selectedIds.has(l.id));

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Search and Actions */}
      <div className="flex items-center justify-between gap-4">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Buscar por referencia..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-9"
          />
        </div>
        <Button variant="outline" size="sm" onClick={() => refetch()}>
          <RefreshCw className="w-4 h-4 mr-2" />
          Recargar
        </Button>
        <span className="text-sm text-muted-foreground">
          {filteredLocations.length} de {locations.length} ubicaciones
        </span>
      </div>

      {/* Filters row */}
      <div className="flex flex-wrap items-center gap-3 p-3 bg-muted/30 rounded-lg">
        <Filter className="w-4 h-4 text-muted-foreground" />
        
        {/* Tipo filter */}
        <div className="flex items-center gap-2">
          <span className="text-sm text-muted-foreground">Tipo:</span>
          <Select value={filterTipo} onValueChange={setFilterTipo}>
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

        {/* Ubicación filter */}
        <div className="flex items-center gap-2">
          <span className="text-sm text-muted-foreground">Ubicación:</span>
          <Input
            placeholder="Filtrar..."
            value={filterUbicacion}
            onChange={(e) => setFilterUbicacion(e.target.value)}
            className="w-[140px] h-9"
          />
        </div>

        {/* Ubicación Detallada filter */}
        <div className="flex items-center gap-2">
          <span className="text-sm text-muted-foreground">Ubic. Detallada:</span>
          <Input
            placeholder="Filtrar..."
            value={filterUbicacionDetallada}
            onChange={(e) => setFilterUbicacionDetallada(e.target.value)}
            className="w-[140px] h-9"
          />
        </div>
      </div>

      {/* Table */}
      <div className="border rounded-lg overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-12">
                <Checkbox
                  checked={allSelected}
                  onCheckedChange={handleSelectAll}
                />
              </TableHead>
              <TableHead>Tipo</TableHead>
              <TableHead>Referencia</TableHead>
              <TableHead>Subcategoría</TableHead>
              <TableHead>Observaciones</TableHead>
              <TableHead>Ubicación</TableHead>
              <TableHead>Ubic. Detallada</TableHead>
              <TableHead>Punto Ref.</TableHead>
              <TableHead>Método Conteo</TableHead>
              <TableHead className="w-[200px]">Operario</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filteredLocations.length === 0 ? (
              <TableRow>
                <TableCell colSpan={10} className="text-center py-8 text-muted-foreground">
                  No hay ubicaciones asignadas
                </TableCell>
              </TableRow>
            ) : (
              filteredLocations.map((loc) => (
                <TableRow key={loc.id} className={selectedIds.has(loc.id) ? 'bg-primary/5' : ''}>
                  <TableCell>
                    <Checkbox
                      checked={selectedIds.has(loc.id)}
                      onCheckedChange={(checked) => handleSelectRow(loc.id, !!checked)}
                    />
                  </TableCell>
                  <TableCell className="text-sm">
                    <Badge variant="outline">{loc.inventory_master?.material_type || '-'}</Badge>
                  </TableCell>
                  <TableCell>
                    <span className="font-medium">{loc.master_reference}</span>
                  </TableCell>
                  <TableCell className="text-sm">
                    {loc.subcategoria || '-'}
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground max-w-[150px] truncate">
                    {loc.observaciones || '-'}
                  </TableCell>
                  <TableCell className="text-sm">
                    {loc.location_name || '-'}
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {loc.location_detail || '-'}
                  </TableCell>
                  <TableCell className="text-sm">
                    {loc.punto_referencia || '-'}
                  </TableCell>
                  <TableCell className="text-sm">
                    {loc.metodo_conteo || '-'}
                  </TableCell>
                  <TableCell>
                    <OperarioSelect
                      value={loc.operario_id}
                      onChange={(operarioId) => handleIndividualAssign(loc.id, operarioId)}
                      placeholder="Seleccionar..."
                    />
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {/* Bulk Action Bar */}
      {selectedIds.size > 0 && (
        <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-50">
          <div className="flex items-center gap-3 bg-card border border-border shadow-lg rounded-xl px-4 py-3">
            <Badge variant="secondary" className="text-sm">
              <Users className="w-3 h-3 mr-1" />
              {selectedIds.size} seleccionados
            </Badge>
            <div className="w-[200px]">
              <OperarioSelect
                value={bulkOperarioId}
                onChange={setBulkOperarioId}
                placeholder="Elegir operario..."
              />
            </div>
            <Button
              onClick={handleBulkAssign}
              disabled={assignMutation.isPending}
            >
              {assignMutation.isPending ? (
                <Loader2 className="w-4 h-4 animate-spin mr-2" />
              ) : null}
              Asignar a Selección
            </Button>
          </div>
        </div>
      )}
    </div>
  );
};

export default AssignmentTab;