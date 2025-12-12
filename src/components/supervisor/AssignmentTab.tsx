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
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import OperarioSelect from '@/components/shared/OperarioSelect';
import { toast } from 'sonner';
import { Loader2, Search, Users, RefreshCw } from 'lucide-react';

interface Location {
  id: string;
  master_reference: string;
  location_name: string | null;
  location_detail: string | null;
  subcategoria: string | null;
  operario_id: string | null;
  operarios: { id: string; full_name: string } | null;
  inventory_master: { referencia: string; material_type: string } | null;
}

const AssignmentTab: React.FC = () => {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [searchTerm, setSearchTerm] = useState('');
  const [bulkOperarioId, setBulkOperarioId] = useState<string | null>(null);

  const { data: locations = [], isLoading, refetch } = useQuery({
    queryKey: ['supervisor-locations', user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('locations')
        .select(`
          id, master_reference, location_name, location_detail,
          subcategoria, operario_id,
          operarios(id, full_name),
          inventory_master!inner(referencia, material_type)
        `)
        .eq('assigned_supervisor_id', user!.id);

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
      queryClient.invalidateQueries({ queryKey: ['supervisor-locations'] });
      setSelectedIds(new Set());
      setBulkOperarioId(null);
    },
    onError: (error: Error) => {
      toast.error(`Error al asignar: ${error.message}`);
    },
  });

  const filteredLocations = useMemo(() => {
    if (!searchTerm) return locations;
    const term = searchTerm.toLowerCase();
    return locations.filter(loc =>
      loc.master_reference.toLowerCase().includes(term) ||
      loc.location_name?.toLowerCase().includes(term)
    );
  }, [locations, searchTerm]);

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
      </div>

      {/* Table */}
      <div className="border rounded-lg overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-12">
                <Checkbox
                  checked={allSelected}
                  onCheckedChange={handleSelectAll}
                />
              </TableHead>
              <TableHead>Referencia</TableHead>
              <TableHead>Ubicación</TableHead>
              <TableHead>Subcategoría</TableHead>
              <TableHead className="w-[200px]">Operario</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filteredLocations.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="text-center py-8 text-muted-foreground">
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
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <span className="font-medium">{loc.master_reference}</span>
                      <Badge variant={loc.inventory_master?.material_type === 'MP' ? 'default' : 'secondary'} className="text-xs">
                        {loc.inventory_master?.material_type}
                      </Badge>
                    </div>
                  </TableCell>
                  <TableCell>
                    <span className="text-sm">
                      {loc.location_name || '-'}
                      {loc.location_detail && <span className="text-muted-foreground"> - {loc.location_detail}</span>}
                    </span>
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {loc.subcategoria || '-'}
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
