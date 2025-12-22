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
import { Loader2, Search, Users, RefreshCw, Filter, CheckCircle2, Clock, UserCheck } from 'lucide-react';

interface Location {
  id: string;
  master_reference: string;
  location_name: string | null;
  location_detail: string | null;
  subcategoria: string | null;
  observaciones: string | null;
  punto_referencia: string | null;
  metodo_conteo: string | null;
  operario_c1_id: string | null;
  operario_c2_id: string | null;
  operario_c3_id: string | null;
  operario_c4_id: string | null;
  operario_c1: { id: string; full_name: string; turno: number | null } | null;
  operario_c2: { id: string; full_name: string; turno: number | null } | null;
  operario_c3: { id: string; full_name: string; turno: number | null } | null;
  operario_c4: { id: string; full_name: string; turno: number | null } | null;
  inventory_master: { referencia: string; material_type: string; control: string | null; audit_round: number | null } | null;
  // Added for UI state
  hasCounted?: boolean;
}

interface RoundAssignmentTabProps {
  roundNumber: 1 | 2 | 3 | 4;
  filterTurno?: 1 | 2;
  isAdminMode?: boolean;
  controlFilter?: 'not_null' | 'null' | 'all';
}

// Helper to get the operario field name for each round
const getOperarioField = (round: number): string => {
  return `operario_c${round}_id`;
};

const RoundAssignmentTab: React.FC<RoundAssignmentTabProps> = ({
  roundNumber,
  filterTurno,
  isAdminMode = false,
  controlFilter = 'all',
}) => {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [searchTerm, setSearchTerm] = useState('');
  const [bulkOperarioId, setBulkOperarioId] = useState<string | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [showOnlyPending, setShowOnlyPending] = useState(false);
  
  // Filter states
  const [filterTipo, setFilterTipo] = useState<string>('all');
  const [filterUbicacion, setFilterUbicacion] = useState('');

  // Determine which master audit_round to filter by
  // For rounds 1 and 2, master is at audit_round=1
  // For rounds 3, 4, master audit_round matches the round number
  const masterAuditRound = roundNumber <= 2 ? 1 : roundNumber;

  const { data: locations = [], isLoading, refetch } = useQuery({
    queryKey: ['round-assignment-locations', roundNumber, user?.id, isAdminMode, controlFilter, masterAuditRound],
    queryFn: async () => {
      let query = supabase
        .from('locations')
        .select(`
          id, master_reference, location_name, location_detail,
          subcategoria, observaciones, punto_referencia, metodo_conteo,
          operario_c1_id, operario_c2_id, operario_c3_id, operario_c4_id,
          operario_c1:operarios!locations_operario_c1_id_fkey(id, full_name, turno),
          operario_c2:operarios!locations_operario_c2_id_fkey(id, full_name, turno),
          operario_c3:operarios!locations_operario_c3_id_fkey(id, full_name, turno),
          operario_c4:operarios!locations_operario_c4_id_fkey(id, full_name, turno),
          inventory_master!inner(referencia, material_type, control, audit_round)
        `)
        .eq('inventory_master.audit_round', masterAuditRound);

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

      if (!data || data.length === 0) return [];

      // Get existing counts for this round to mark locations as "counted"
      const locationIds = data.map(l => l.id);
      
      const { data: existingCounts } = await supabase
        .from('inventory_counts')
        .select('location_id')
        .in('location_id', locationIds)
        .eq('audit_round', roundNumber);

      const countedLocationIds = new Set(existingCounts?.map(c => c.location_id) || []);

      // Return ALL locations but mark which ones have been counted
      return (data as unknown as Location[]).map(loc => ({
        ...loc,
        hasCounted: countedLocationIds.has(loc.id)
      }));
    },
    enabled: !!user?.id,
  });

  const assignMutation = useMutation({
    mutationFn: async ({ locationIds, operarioId }: { locationIds: string[]; operarioId: string | null }) => {
      const fieldName = getOperarioField(roundNumber);
      const updateData = { [fieldName]: operarioId };
      
      const { error } = await supabase
        .from('locations')
        .update(updateData)
        .in('id', locationIds);

      if (error) throw error;
    },
    onSuccess: () => {
      toast.success(`Operario asignado para C${roundNumber}`);
      queryClient.invalidateQueries({ queryKey: ['round-assignment-locations'] });
      queryClient.invalidateQueries({ queryKey: ['round-transcription-locations'] });
      setSelectedIds(new Set());
      setBulkOperarioId(null);
    },
    onError: (error: Error) => {
      toast.error(`Error al asignar: ${error.message}`);
    },
  });

  const filteredLocations = useMemo(() => {
    let filtered = locations;
    
    // Show only pending (not counted) if toggle is on
    if (showOnlyPending) {
      filtered = filtered.filter(loc => !loc.hasCounted);
    }
    
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
    
    return filtered;
  }, [locations, searchTerm, filterTipo, filterUbicacion, showOnlyPending]);

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

  const handleRefresh = async () => {
    setIsRefreshing(true);
    await refetch();
    setIsRefreshing(false);
    toast.success('Datos actualizados');
  };

  // Get the current operario for this round
  const getCurrentOperario = (loc: Location) => {
    switch (roundNumber) {
      case 1: return loc.operario_c1;
      case 2: return loc.operario_c2;
      case 3: return loc.operario_c3;
      case 4: return loc.operario_c4;
      default: return null;
    }
  };

  const getCurrentOperarioId = (loc: Location) => {
    switch (roundNumber) {
      case 1: return loc.operario_c1_id;
      case 2: return loc.operario_c2_id;
      case 3: return loc.operario_c3_id;
      case 4: return loc.operario_c4_id;
      default: return null;
    }
  };

  // Stats for badges
  const pendingCount = locations.filter(l => !l.hasCounted).length;
  const assignedCount = locations.filter(l => getCurrentOperarioId(l) !== null).length;
  const countedCount = locations.filter(l => l.hasCounted).length;

  // Get round-specific styling
  const getRoundConfig = () => {
    switch (roundNumber) {
      case 1:
        return { label: 'Asignar C1 (Turno 1)', color: 'bg-blue-500/10 text-blue-500', borderColor: 'border-blue-500/30' };
      case 2:
        return { label: 'Asignar C2 (Turno 2)', color: 'bg-purple-500/10 text-purple-500', borderColor: 'border-purple-500/30' };
      case 3:
        return { label: 'Asignar C3 (Desempate)', color: 'bg-amber-500/10 text-amber-500', borderColor: 'border-amber-500/30' };
      case 4:
        return { label: 'Asignar C4 (Final)', color: 'bg-orange-500/10 text-orange-500', borderColor: 'border-orange-500/30' };
    }
  };

  const roundConfig = getRoundConfig();

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  if (filteredLocations.length === 0 && locations.length === 0) {
    return (
      <div className="text-center py-12">
        <CheckCircle2 className="w-12 h-12 text-green-500 mx-auto mb-4" />
        <p className="text-muted-foreground">
          {roundNumber >= 3 
            ? `No hay referencias en ${roundConfig.label.replace('Asignar ', '')}`
            : `Todas las ubicaciones ya fueron contadas para ${roundConfig.label.replace('Asignar ', '')}`
          }
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header with Stats */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <Badge className={roundConfig.color}>
            {roundConfig.label}
          </Badge>
          <Badge variant="outline" className="gap-1">
            <Clock className="w-3 h-3" />
            {pendingCount} pendientes
          </Badge>
          <Badge variant="outline" className="gap-1 bg-green-500/10 text-green-600 border-green-500/30">
            <UserCheck className="w-3 h-3" />
            {assignedCount} asignados
          </Badge>
          <Badge variant="outline" className="gap-1 bg-blue-500/10 text-blue-600 border-blue-500/30">
            <CheckCircle2 className="w-3 h-3" />
            {countedCount} contados
          </Badge>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant={showOnlyPending ? "default" : "outline"}
            size="sm"
            onClick={() => setShowOnlyPending(!showOnlyPending)}
          >
            {showOnlyPending ? 'Ver todos' : 'Solo pendientes'}
          </Button>
          <Button variant="outline" size="sm" onClick={handleRefresh} disabled={isRefreshing}>
            <RefreshCw className={`w-4 h-4 mr-2 ${isRefreshing ? 'animate-spin' : ''}`} />
            {isRefreshing ? 'Actualizando...' : 'Recargar'}
          </Button>
        </div>
      </div>

      {/* Search and Filters */}
      <div className="flex items-center gap-4">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Buscar por referencia..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-9"
          />
        </div>
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
      </div>

      {/* Table */}
      <div className={`border rounded-lg overflow-x-auto ${roundConfig.borderColor}`}>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-12">
                <Checkbox
                  checked={allSelected}
                  onCheckedChange={handleSelectAll}
                />
              </TableHead>
              <TableHead>Estado</TableHead>
              <TableHead>Tipo</TableHead>
              <TableHead>Referencia</TableHead>
              <TableHead>Ubicación</TableHead>
              <TableHead>Ubic. Detallada</TableHead>
              <TableHead className="w-[220px]">Operario C{roundNumber}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filteredLocations.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                  No hay ubicaciones que coincidan con los filtros
                </TableCell>
              </TableRow>
            ) : (
              filteredLocations.map((loc) => {
                const currentOperario = getCurrentOperario(loc);
                const currentOperarioId = getCurrentOperarioId(loc);
                const isPending = !currentOperarioId && !loc.hasCounted;
                const isAssigned = !!currentOperarioId && !loc.hasCounted;
                const isCounted = loc.hasCounted;
                
                return (
                  <TableRow 
                    key={loc.id} 
                    className={`
                      ${selectedIds.has(loc.id) ? 'bg-primary/5' : ''}
                      ${isCounted ? 'opacity-60' : ''}
                    `}
                  >
                    <TableCell>
                      <Checkbox
                        checked={selectedIds.has(loc.id)}
                        onCheckedChange={(checked) => handleSelectRow(loc.id, !!checked)}
                        disabled={isCounted}
                      />
                    </TableCell>
                    <TableCell>
                      {isCounted ? (
                        <Badge className="bg-green-500/20 text-green-600 border-green-500/30 gap-1">
                          <CheckCircle2 className="w-3 h-3" />
                          Contado
                        </Badge>
                      ) : isAssigned ? (
                        <Badge className="bg-blue-500/20 text-blue-600 border-blue-500/30 gap-1">
                          <UserCheck className="w-3 h-3" />
                          Asignado
                        </Badge>
                      ) : (
                        <Badge variant="outline" className="bg-amber-500/10 text-amber-600 border-amber-500/30 gap-1">
                          <Clock className="w-3 h-3" />
                          Pendiente
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-sm">
                      <Badge variant="outline">{loc.inventory_master?.material_type || '-'}</Badge>
                    </TableCell>
                    <TableCell>
                      <span className="font-medium">{loc.master_reference}</span>
                    </TableCell>
                    <TableCell className="text-sm">
                      {loc.location_name || '-'}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {loc.location_detail || '-'}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <OperarioSelect
                          value={currentOperarioId}
                          onChange={(operarioId) => handleIndividualAssign(loc.id, operarioId)}
                          filterTurno={filterTurno}
                          placeholder="Seleccionar..."
                          disabled={isCounted}
                        />
                        {currentOperario && (
                          <Badge variant="secondary" className="text-xs shrink-0">
                            T{currentOperario.turno}
                          </Badge>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })
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
                filterTurno={filterTurno}
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
              Asignar C{roundNumber}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
};

export default RoundAssignmentTab;