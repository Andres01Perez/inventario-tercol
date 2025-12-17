import React, { useState, useMemo, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import OperarioSelect from '@/components/shared/OperarioSelect';
import { toast } from 'sonner';
import { Loader2, CheckCircle2, RefreshCw, User, Save, AlertCircle } from 'lucide-react';

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
  inventory_master: { referencia: string; material_type: string; control: string | null; audit_round: number | null } | null;
}

interface RoundTranscriptionTabProps {
  roundNumber: 1 | 2 | 3 | 4 | 5;
  filterTurno?: 1 | 2;
  isAdminMode?: boolean;
  controlFilter?: 'not_null' | 'null' | 'all';
  isSuperadminOnly?: boolean;
}

const RoundTranscriptionTab: React.FC<RoundTranscriptionTabProps> = ({
  roundNumber,
  filterTurno,
  isAdminMode = false,
  controlFilter = 'all',
  isSuperadminOnly = false,
}) => {
  const { user, role } = useAuth();
  const queryClient = useQueryClient();
  const [quantities, setQuantities] = useState<Record<string, string>>({});
  const [operarioSelections, setOperarioSelections] = useState<Record<string, string | null>>({});
  const [savingIds, setSavingIds] = useState<Set<string>>(new Set());
  const [isRefreshing, setIsRefreshing] = useState(false);

  // Determine which master audit_round to filter by
  // For rounds 1 and 2, master is still at audit_round=1
  // For rounds 3, 4, 5, master audit_round matches the round number
  const masterAuditRound = roundNumber <= 2 ? 1 : roundNumber;

  // Fetch locations based on round logic
  const { data: locations = [], isLoading, refetch } = useQuery({
    queryKey: ['round-transcription-locations', roundNumber, user?.id, isAdminMode, controlFilter, masterAuditRound],
    queryFn: async () => {
      // Build query for locations with their master reference
      // IMPORTANT: Only show locations that HAVE an operario assigned
      let query = supabase
        .from('locations')
        .select(`
          id, master_reference, location_name, location_detail,
          subcategoria, observaciones, punto_referencia, metodo_conteo,
          operario_id,
          operarios(id, full_name, turno),
          inventory_master!inner(referencia, material_type, control, audit_round)
        `)
        .eq('inventory_master.audit_round', masterAuditRound)
        .not('operario_id', 'is', null); // Only locations WITH operario assigned

      // If not admin mode, filter by supervisor
      if (!isAdminMode) {
        query = query.eq('assigned_supervisor_id', user!.id);
      }

      // Apply control filter for admins
      if (controlFilter === 'not_null') {
        query = query.not('inventory_master.control', 'is', null);
      } else if (controlFilter === 'null') {
        query = query.is('inventory_master.control', null);
      }

      const { data, error } = await query;
      if (error) throw error;

      // Now filter out locations that already have a count for this specific round
      if (!data || data.length === 0) return [];

      const locationIds = data.map(l => l.id);
      
      const { data: existingCounts } = await supabase
        .from('inventory_counts')
        .select('location_id')
        .in('location_id', locationIds)
        .eq('audit_round', roundNumber);

      const countedLocationIds = new Set(existingCounts?.map(c => c.location_id) || []);

      // Return only locations that DON'T have a count for this round AND have operario
      return (data as Location[]).filter(loc => !countedLocationIds.has(loc.id));
    },
    enabled: !!user?.id,
  });

  // Realtime subscription for inventory_counts
  useEffect(() => {
    const channel = supabase
      .channel(`inventory-counts-round-${roundNumber}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'inventory_counts',
        },
        (payload) => {
          // When a new count is inserted, refresh the data
          if (payload.new && payload.new.audit_round === roundNumber) {
            queryClient.invalidateQueries({ queryKey: ['round-transcription-locations', roundNumber] });
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [roundNumber, queryClient]);

  const handleRefresh = async () => {
    setIsRefreshing(true);
    await refetch();
    setIsRefreshing(false);
    toast.success('Datos actualizados');
  };

  const saveCountMutation = useMutation({
    mutationFn: async ({ locationId, quantity, operarioId }: { locationId: string; quantity: number; operarioId?: string | null }) => {
      const { error } = await supabase
        .from('inventory_counts')
        .insert({
          location_id: locationId,
          supervisor_id: user!.id,
          audit_round: roundNumber,
          quantity_counted: quantity,
          operario_id: operarioId || null,
        });
      if (error) throw error;
    },
    onSuccess: (_, variables) => {
      toast.success(`Conteo ${roundNumber} guardado`);
      queryClient.invalidateQueries({ queryKey: ['round-locations'] });
      queryClient.invalidateQueries({ queryKey: ['supervisor-stats'] });
      setSavingIds(prev => {
        const next = new Set(prev);
        next.delete(variables.locationId);
        return next;
      });
      // Clear the input
      setQuantities(prev => {
        const next = { ...prev };
        delete next[variables.locationId];
        return next;
      });
    },
    onError: (error: Error, variables) => {
      toast.error(`Error: ${error.message}`);
      setSavingIds(prev => {
        const next = new Set(prev);
        next.delete(variables.locationId);
        return next;
      });
    },
  });

  const handleSaveCount = (locationId: string) => {
    const value = quantities[locationId];
    if (!value || value.trim() === '') {
      toast.error('Ingrese una cantidad');
      return;
    }

    const quantity = parseFloat(value);
    if (isNaN(quantity) || quantity < 0) {
      toast.error('Cantidad inválida');
      return;
    }

    const operarioId = operarioSelections[locationId];
    setSavingIds(prev => new Set(prev).add(locationId));
    saveCountMutation.mutate({ locationId, quantity, operarioId });
  };

  const handleKeyDown = (e: React.KeyboardEvent, locationId: string) => {
    if (e.key === 'Enter') {
      handleSaveCount(locationId);
    }
  };

  // Group locations by operario
  const groupedByOperario = useMemo(() => {
    const groups: Record<string, { operarioName: string; turno: number | null; locations: Location[] }> = {};

    locations.forEach(loc => {
      const key = loc.operario_id || 'unassigned';
      const name = loc.operarios?.full_name || 'Sin Operario Asignado';
      const turno = loc.operarios?.turno || null;

      if (!groups[key]) {
        groups[key] = { operarioName: name, turno, locations: [] };
      }
      groups[key].locations.push(loc);
    });

    const entries = Object.entries(groups);
    entries.sort((a, b) => {
      if (a[0] === 'unassigned') return 1;
      if (b[0] === 'unassigned') return -1;
      return a[1].operarioName.localeCompare(b[1].operarioName);
    });

    return entries;
  }, [locations]);

  // Get round-specific styling and labels
  const getRoundConfig = () => {
    switch (roundNumber) {
      case 1:
        return { label: 'Conteo 1 (Turno 1)', color: 'bg-blue-500/10 text-blue-500', borderColor: 'border-blue-500/30' };
      case 2:
        return { label: 'Conteo 2 (Turno 2)', color: 'bg-purple-500/10 text-purple-500', borderColor: 'border-purple-500/30' };
      case 3:
        return { label: 'Conteo 3 (Desempate)', color: 'bg-amber-500/10 text-amber-500', borderColor: 'border-amber-500/30' };
      case 4:
        return { label: 'Conteo 4 (Final)', color: 'bg-orange-500/10 text-orange-500', borderColor: 'border-orange-500/30' };
      case 5:
        return { label: 'Conteo 5 (Crítico)', color: 'bg-red-500/10 text-red-500', borderColor: 'border-red-500/30' };
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

  if (groupedByOperario.length === 0) {
    return (
      <div className="text-center py-12">
        <CheckCircle2 className="w-12 h-12 text-green-500 mx-auto mb-4" />
        <p className="text-muted-foreground">
          {roundNumber === 5 
            ? 'No hay referencias críticas pendientes'
            : `No hay ubicaciones pendientes para ${roundConfig.label}`
          }
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <div className="flex items-center gap-2">
          <Badge className={roundConfig.color}>
            {roundConfig.label}
          </Badge>
          <span className="text-sm text-muted-foreground">
            {locations.length} ubicación(es) pendiente(s)
          </span>
        </div>
        <Button variant="outline" size="sm" onClick={handleRefresh} disabled={isRefreshing}>
          <RefreshCw className={`w-4 h-4 mr-2 ${isRefreshing ? 'animate-spin' : ''}`} />
          {isRefreshing ? 'Actualizando...' : 'Recargar'}
        </Button>
      </div>

      {roundNumber === 5 && (
        <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-4 flex items-start gap-3">
          <AlertCircle className="w-5 h-5 text-red-500 shrink-0 mt-0.5" />
          <div>
            <p className="font-medium text-red-600 dark:text-red-400">Referencias Críticas</p>
            <p className="text-sm text-muted-foreground">
              Estas referencias no coincidieron en ningún conteo previo. Requieren tu intervención personal para el cierre forzado.
            </p>
          </div>
        </div>
      )}

      <Accordion type="multiple" className="space-y-3">
        {groupedByOperario.map(([operarioId, group]) => {
          const isUnassigned = operarioId === 'unassigned';

          return (
            <AccordionItem
              key={operarioId}
              value={operarioId}
              className={`border rounded-lg px-4 bg-card ${roundConfig.borderColor}`}
            >
              <AccordionTrigger className="hover:no-underline py-4">
                <div className="flex items-center justify-between w-full pr-4">
                  <div className="flex items-center gap-3">
                    <div className={`p-2 rounded-lg ${isUnassigned ? 'bg-muted' : roundConfig.color}`}>
                      <User className={`w-4 h-4 ${isUnassigned ? 'text-muted-foreground' : ''}`} />
                    </div>
                    <span className={`font-medium ${isUnassigned ? 'text-muted-foreground' : ''}`}>
                      {group.operarioName}
                      {group.turno && <span className="text-xs ml-1 text-muted-foreground">(T{group.turno})</span>}
                    </span>
                    <Badge variant="secondary">
                      {group.locations.length} items
                    </Badge>
                  </div>
                </div>
              </AccordionTrigger>

              <AccordionContent className="pt-2 pb-4">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm border-collapse">
                    <thead>
                      <tr className="border-b text-left text-muted-foreground">
                        <th className="p-2 font-medium">Tipo</th>
                        <th className="p-2 font-medium">Referencia</th>
                        <th className="p-2 font-medium">Ubicación</th>
                        <th className="p-2 font-medium">Detalle</th>
                        {(roundNumber >= 3 || isUnassigned) && (
                          <th className="p-2 font-medium">Operario</th>
                        )}
                        <th className="p-2 font-medium text-center">Cantidad</th>
                        <th className="p-2"></th>
                      </tr>
                    </thead>
                    <tbody>
                      {group.locations.map(loc => {
                        const isSaving = savingIds.has(loc.id);

                        return (
                          <tr key={loc.id} className="border-b hover:bg-muted/50">
                            <td className="p-2">
                              <Badge variant="outline" className="text-xs">
                                {loc.inventory_master?.material_type || '-'}
                              </Badge>
                            </td>
                            <td className="p-2 font-medium">{loc.master_reference}</td>
                            <td className="p-2">{loc.location_name || '-'}</td>
                            <td className="p-2 text-muted-foreground">{loc.location_detail || '-'}</td>
                            {(roundNumber >= 3 || isUnassigned) && (
                              <td className="p-2 min-w-[200px]">
                                <OperarioSelect
                                  value={operarioSelections[loc.id] ?? loc.operario_id}
                                  onChange={(val) => setOperarioSelections(prev => ({ ...prev, [loc.id]: val }))}
                                  filterTurno={filterTurno}
                                  placeholder="Seleccionar..."
                                />
                              </td>
                            )}
                            <td className="p-2">
                              <Input
                                type="number"
                                min="0"
                                step="0.01"
                                placeholder="0"
                                className="w-24 text-center font-bold h-9"
                                value={quantities[loc.id] || ''}
                                onChange={(e) => setQuantities(prev => ({
                                  ...prev,
                                  [loc.id]: e.target.value
                                }))}
                                onKeyDown={(e) => handleKeyDown(e, loc.id)}
                                disabled={isSaving}
                              />
                            </td>
                            <td className="p-2">
                              <Button
                                size="sm"
                                onClick={() => handleSaveCount(loc.id)}
                                disabled={isSaving || !quantities[loc.id]}
                              >
                                {isSaving ? (
                                  <Loader2 className="w-4 h-4 animate-spin" />
                                ) : (
                                  <>
                                    <Save className="w-4 h-4 mr-1" />
                                    Guardar
                                  </>
                                )}
                              </Button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </AccordionContent>
            </AccordionItem>
          );
        })}
      </Accordion>
    </div>
  );
};

export default RoundTranscriptionTab;
