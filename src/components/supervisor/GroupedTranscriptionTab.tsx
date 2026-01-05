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
import PrintableSheet from '@/components/supervisor/PrintableSheet';
import { toast } from 'sonner';
import { Loader2, CheckCircle2, RefreshCw, MapPin, Save, Printer } from 'lucide-react';

interface Location {
  id: string;
  master_reference: string;
  location_name: string | null;
  location_detail: string | null;
  subcategoria: string | null;
  observaciones: string | null;
  punto_referencia: string | null;
  metodo_conteo: string | null;
  inventory_master: { referencia: string; material_type: string; control: string | null; audit_round: number | null } | null;
}

interface GroupedTranscriptionTabProps {
  roundNumber: 1 | 2 | 3 | 4 | 5;
  isAdminMode?: boolean;
  controlFilter?: 'not_null' | 'null' | 'all';
}

const GroupedTranscriptionTab: React.FC<GroupedTranscriptionTabProps> = ({
  roundNumber,
  isAdminMode = false,
  controlFilter = 'all',
}) => {
  const { user, profile } = useAuth();
  const queryClient = useQueryClient();
  const [quantities, setQuantities] = useState<Record<string, string>>({});
  const [savingIds, setSavingIds] = useState<Set<string>>(new Set());
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [printDialogOpen, setPrintDialogOpen] = useState(false);
  const [printZoneData, setPrintZoneData] = useState<{ name: string; locations: Location[] } | null>(null);

  // Determine which master audit_round to filter by
  const masterAuditRound = roundNumber <= 2 ? 1 : roundNumber;

  const { data: locations = [], isLoading, refetch } = useQuery({
    queryKey: ['grouped-transcription-locations', roundNumber, user?.id, isAdminMode, controlFilter, masterAuditRound],
    queryFn: async () => {
      let query = supabase
        .from('locations')
        .select(`
          id, master_reference, location_name, location_detail,
          subcategoria, observaciones, punto_referencia, metodo_conteo,
          inventory_master!inner(referencia, material_type, control, audit_round)
        `)
        .eq('inventory_master.audit_round', masterAuditRound);

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

      // Filter out locations that already have a count for this specific round
      if (!data || data.length === 0) return [];

      const locationIds = data.map(l => l.id);
      
      const { data: existingCounts } = await supabase
        .from('inventory_counts')
        .select('location_id')
        .in('location_id', locationIds)
        .eq('audit_round', roundNumber);

      const countedLocationIds = new Set(existingCounts?.map(c => c.location_id) || []);

      // Return only locations that DON'T have a count for this round
      return (data as unknown as Location[]).filter(loc => !countedLocationIds.has(loc.id));
    },
    enabled: !!user?.id,
  });

  // Realtime subscription for inventory_counts
  useEffect(() => {
    const channel = supabase
      .channel(`inventory-counts-grouped-${roundNumber}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'inventory_counts',
        },
        (payload) => {
          if (payload.new && payload.new.audit_round === roundNumber) {
            queryClient.invalidateQueries({ queryKey: ['grouped-transcription-locations', roundNumber] });
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

  // Auto-validation functions
  const checkAndAutoValidate = async (masterReference: string) => {
    const { data: refLocations } = await supabase
      .from('locations')
      .select('id')
      .eq('master_reference', masterReference);

    if (!refLocations || refLocations.length === 0) return;

    const locationIds = refLocations.map(l => l.id);

    const { data: counts } = await supabase
      .from('inventory_counts')
      .select('audit_round')
      .in('location_id', locationIds)
      .in('audit_round', [1, 2]);

    const c1Count = counts?.filter(c => c.audit_round === 1).length || 0;
    const c2Count = counts?.filter(c => c.audit_round === 2).length || 0;

    if (c1Count === refLocations.length && c2Count === refLocations.length) {
      const { data: result } = await supabase.rpc('validate_and_close_round', {
        _reference: masterReference,
        _admin_id: user!.id,
      });

      const validationResult = result as { success?: boolean; action?: string; new_round?: number } | null;

      if (validationResult?.action === 'closed') {
        toast.success(`✅ ${masterReference} - AUDITADO automáticamente`);
      } else if (validationResult?.action === 'next_round') {
        toast.warning(`⚠️ ${masterReference} - Pasó a Conteo ${validationResult.new_round}`);
      }

      queryClient.invalidateQueries({ queryKey: ['validation-references'] });
    }
  };

  const checkAndAutoValidateHigherRounds = async (masterReference: string, currentRound: 3 | 4) => {
    try {
      const { data: refLocations } = await supabase
        .from('locations')
        .select('id')
        .eq('master_reference', masterReference)
        .is('validated_at_round', null);

      if (!refLocations || refLocations.length === 0) {
        const { data: result } = await supabase.rpc('validate_and_close_round', {
          _reference: masterReference,
          _admin_id: user!.id,
        });

        const validationResult = result as { success?: boolean; action?: string } | null;
        if (validationResult?.action === 'closed') {
          toast.success(`✅ ${masterReference} - AUDITADO automáticamente`);
          queryClient.invalidateQueries({ queryKey: ['validation-references'] });
        }
        return;
      }

      const locationIds = refLocations.map(l => l.id);

      const { data: counts } = await supabase
        .from('inventory_counts')
        .select('location_id')
        .in('location_id', locationIds)
        .eq('audit_round', currentRound);

      const countedLocationIds = new Set(counts?.map(c => c.location_id) || []);

      if (countedLocationIds.size < refLocations.length) return;

      const { data: result } = await supabase.rpc('validate_and_close_round', {
        _reference: masterReference,
        _admin_id: user!.id,
      });

      const validationResult = result as { success?: boolean; action?: string; new_round?: number } | null;

      if (validationResult?.action === 'closed') {
        toast.success(`✅ ${masterReference} - AUDITADO automáticamente`);
      } else if (validationResult?.action === 'next_round') {
        toast.warning(`⚠️ ${masterReference} - Pasó a Conteo ${validationResult.new_round}`);
      } else if (validationResult?.action === 'escalate_to_superadmin') {
        toast.error(`🚨 ${masterReference} - Escalado a SUPERADMIN (Crítico C5)`);
      }

      queryClient.invalidateQueries({ queryKey: ['validation-references'] });
      queryClient.invalidateQueries({ queryKey: ['grouped-transcription-locations'] });
    } catch (err) {
      console.error('Error en validación:', err);
    }
  };

  const saveCountMutation = useMutation({
    mutationFn: async ({ locationId, quantity }: { locationId: string; quantity: number }) => {
      const { error } = await supabase
        .from('inventory_counts')
        .insert({
          location_id: locationId,
          supervisor_id: user!.id,
          audit_round: roundNumber,
          quantity_counted: quantity,
        });
      if (error) throw error;

      const { data: location } = await supabase
        .from('locations')
        .select('master_reference')
        .eq('id', locationId)
        .single();

      return { locationId, masterReference: location?.master_reference };
    },
    onSuccess: async (result, variables) => {
      toast.success(`Conteo ${roundNumber} guardado`);
      
      queryClient.invalidateQueries({ queryKey: ['grouped-transcription-locations', roundNumber] });
      queryClient.invalidateQueries({ queryKey: ['supervisor-stats'] });
      
      setSavingIds(prev => {
        const next = new Set(prev);
        next.delete(variables.locationId);
        return next;
      });
      
      setQuantities(prev => {
        const next = { ...prev };
        delete next[variables.locationId];
        return next;
      });

      if (result.masterReference) {
        if (roundNumber <= 2) {
          await checkAndAutoValidate(result.masterReference);
        } else if (roundNumber === 3 || roundNumber === 4) {
          await checkAndAutoValidateHigherRounds(result.masterReference, roundNumber);
        }
      }
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

    setSavingIds(prev => new Set(prev).add(locationId));
    saveCountMutation.mutate({ locationId, quantity });
  };

  const handleKeyDown = (e: React.KeyboardEvent, locationId: string) => {
    if (e.key === 'Enter') {
      handleSaveCount(locationId);
    }
  };

  // Group locations by punto_referencia
  const groupedByZone = useMemo(() => {
    const groups: Record<string, { zoneName: string; locations: Location[] }> = {};

    locations.forEach(loc => {
      const key = loc.punto_referencia || 'sin_zona';
      const name = loc.punto_referencia || 'Sin Zona Asignada';

      if (!groups[key]) {
        groups[key] = { zoneName: name, locations: [] };
      }
      groups[key].locations.push(loc);
    });

    // Sort: sin_zona last, then alphabetically
    const entries = Object.entries(groups);
    entries.sort((a, b) => {
      if (a[0] === 'sin_zona') return 1;
      if (b[0] === 'sin_zona') return -1;
      return a[1].zoneName.localeCompare(b[1].zoneName);
    });

    return entries;
  }, [locations]);

  const handlePrintClick = (zoneName: string, zoneLocations: Location[]) => {
    setPrintZoneData({ name: zoneName, locations: zoneLocations });
    setPrintDialogOpen(true);
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  if (groupedByZone.length === 0) {
    return (
      <div className="text-center py-12 text-muted-foreground">
        No hay ubicaciones pendientes para transcribir en este conteo
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button 
          variant="outline" 
          size="sm" 
          onClick={handleRefresh}
          disabled={isRefreshing}
        >
          <RefreshCw className={`w-4 h-4 mr-2 ${isRefreshing ? 'animate-spin' : ''}`} />
          Actualizar
        </Button>
      </div>

      <Accordion type="multiple" className="space-y-3">
        {groupedByZone.map(([zoneKey, group]) => {
          const isNoZone = zoneKey === 'sin_zona';

          return (
            <AccordionItem
              key={zoneKey}
              value={zoneKey}
              className="border rounded-lg px-4 bg-card"
            >
              <AccordionTrigger className="hover:no-underline py-4">
                <div className="flex items-center justify-between w-full pr-4">
                  <div className="flex items-center gap-3">
                    <div className={`p-2 rounded-lg ${isNoZone ? 'bg-muted' : 'bg-primary/10'}`}>
                      <MapPin className={`w-4 h-4 ${isNoZone ? 'text-muted-foreground' : 'text-primary'}`} />
                    </div>
                    <span className={`font-medium ${isNoZone ? 'text-muted-foreground' : ''}`}>
                      {group.zoneName}
                    </span>
                    <Badge variant="secondary">
                      {group.locations.length} items
                    </Badge>
                  </div>
                  {!isNoZone && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={(e) => {
                        e.stopPropagation();
                        handlePrintClick(group.zoneName, group.locations);
                      }}
                    >
                      <Printer className="w-4 h-4 mr-2" />
                      Imprimir
                    </Button>
                  )}
                </div>
              </AccordionTrigger>

              <AccordionContent className="pt-2 pb-4">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm border-collapse">
                    <thead>
                      <tr className="border-b text-left text-muted-foreground">
                        <th className="p-2 font-medium">Tipo</th>
                        <th className="p-2 font-medium">Referencia</th>
                        <th className="p-2 font-medium">Subcategoría</th>
                        <th className="p-2 font-medium">Observaciones</th>
                        <th className="p-2 font-medium">Ubicación</th>
                        <th className="p-2 font-medium">Método</th>
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
                            <td className="p-2 text-muted-foreground">{loc.subcategoria || '-'}</td>
                            <td className="p-2 text-muted-foreground max-w-[120px] truncate" title={loc.observaciones || ''}>
                              {loc.observaciones || '-'}
                            </td>
                            <td className="p-2">{loc.location_name || '-'}</td>
                            <td className="p-2">{loc.metodo_conteo || '-'}</td>
                            <td className="p-2">
                              <Input
                                type="number"
                                min="0"
                                step="0.01"
                                placeholder="0"
                                className="w-24 text-center font-bold h-8"
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
                                variant="ghost"
                                onClick={() => handleSaveCount(loc.id)}
                                disabled={isSaving || !quantities[loc.id]}
                              >
                                {isSaving ? (
                                  <Loader2 className="w-4 h-4 animate-spin" />
                                ) : (
                                  <Save className="w-4 h-4" />
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

      {printZoneData && (
        <PrintableSheet
          open={printDialogOpen}
          onOpenChange={setPrintDialogOpen}
          zoneName={printZoneData.name}
          supervisorName={profile?.full_name || 'Supervisor'}
          locations={printZoneData.locations}
          roundNumber={roundNumber}
        />
      )}
    </div>
  );
};

export default GroupedTranscriptionTab;
