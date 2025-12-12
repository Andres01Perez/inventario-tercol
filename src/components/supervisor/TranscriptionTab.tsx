import React, { useState, useMemo } from 'react';
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
import PrintableSheet from './PrintableSheet';
import { toast } from 'sonner';
import { Loader2, Printer, CheckCircle2, RefreshCw, User } from 'lucide-react';

interface Location {
  id: string;
  master_reference: string;
  location_name: string | null;
  location_detail: string | null;
  operario_id: string | null;
  operarios: { id: string; full_name: string } | null;
}

interface Count {
  location_id: string;
  quantity_counted: number;
}

const TranscriptionTab: React.FC = () => {
  const { user, profile } = useAuth();
  const queryClient = useQueryClient();
  const [quantities, setQuantities] = useState<Record<string, string>>({});
  const [savingIds, setSavingIds] = useState<Set<string>>(new Set());
  const [printDialog, setPrintDialog] = useState<{ open: boolean; operarioName: string; locations: Location[] }>({
    open: false,
    operarioName: '',
    locations: [],
  });

  const { data: locations = [], isLoading, refetch } = useQuery({
    queryKey: ['supervisor-locations-transcription', user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('locations')
        .select(`
          id, master_reference, location_name, location_detail, operario_id,
          operarios(id, full_name)
        `)
        .eq('assigned_supervisor_id', user!.id);

      if (error) throw error;
      return data as Location[];
    },
    enabled: !!user?.id,
  });

  const locationIds = useMemo(() => locations.map(l => l.id), [locations]);

  const { data: counts = [] } = useQuery({
    queryKey: ['supervisor-counts', locationIds],
    queryFn: async () => {
      if (locationIds.length === 0) return [];
      const { data, error } = await supabase
        .from('inventory_counts')
        .select('location_id, quantity_counted')
        .in('location_id', locationIds)
        .eq('audit_round', 1);

      if (error) throw error;
      return data as Count[];
    },
    enabled: locationIds.length > 0,
  });

  const countsMap = useMemo(() => {
    return new Map(counts.map(c => [c.location_id, c.quantity_counted]));
  }, [counts]);

  const saveCountMutation = useMutation({
    mutationFn: async ({ locationId, quantity }: { locationId: string; quantity: number }) => {
      // Check if count exists for this location and round
      const { data: existing } = await supabase
        .from('inventory_counts')
        .select('id')
        .eq('location_id', locationId)
        .eq('audit_round', 1)
        .maybeSingle();

      if (existing) {
        // Update existing
        const { error } = await supabase
          .from('inventory_counts')
          .update({ quantity_counted: quantity, updated_at: new Date().toISOString() })
          .eq('id', existing.id);
        if (error) throw error;
      } else {
        // Insert new
        const { error } = await supabase
          .from('inventory_counts')
          .insert({
            location_id: locationId,
            supervisor_id: user!.id,
            audit_round: 1,
            quantity_counted: quantity,
          });
        if (error) throw error;
      }
    },
    onSuccess: (_, variables) => {
      toast.success('Conteo guardado');
      queryClient.invalidateQueries({ queryKey: ['supervisor-counts'] });
      setSavingIds(prev => {
        const next = new Set(prev);
        next.delete(variables.locationId);
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
    if (!value || value.trim() === '') return;

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

  // Group locations by operario
  const groupedByOperario = useMemo(() => {
    const groups: Record<string, { operarioName: string; locations: Location[] }> = {};

    locations.forEach(loc => {
      const key = loc.operario_id || 'unassigned';
      const name = loc.operarios?.full_name || 'Sin Operario Asignado';

      if (!groups[key]) {
        groups[key] = { operarioName: name, locations: [] };
      }
      groups[key].locations.push(loc);
    });

    // Sort: unassigned last
    const entries = Object.entries(groups);
    entries.sort((a, b) => {
      if (a[0] === 'unassigned') return 1;
      if (b[0] === 'unassigned') return -1;
      return a[1].operarioName.localeCompare(b[1].operarioName);
    });

    return entries;
  }, [locations]);

  const handlePrint = (operarioName: string, locs: Location[]) => {
    setPrintDialog({ open: true, operarioName, locations: locs });
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  if (groupedByOperario.length === 0) {
    return (
      <div className="text-center py-12 text-muted-foreground">
        No hay ubicaciones asignadas para transcribir
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button variant="outline" size="sm" onClick={() => refetch()}>
          <RefreshCw className="w-4 h-4 mr-2" />
          Recargar
        </Button>
      </div>

      <Accordion type="multiple" className="space-y-3">
        {groupedByOperario.map(([operarioId, group]) => {
          const countedCount = group.locations.filter(l => countsMap.has(l.id)).length;
          const isUnassigned = operarioId === 'unassigned';

          return (
            <AccordionItem
              key={operarioId}
              value={operarioId}
              className="border rounded-lg px-4 bg-card"
            >
              <AccordionTrigger className="hover:no-underline py-4">
                <div className="flex items-center justify-between w-full pr-4">
                  <div className="flex items-center gap-3">
                    <div className={`p-2 rounded-lg ${isUnassigned ? 'bg-muted' : 'bg-primary/10'}`}>
                      <User className={`w-4 h-4 ${isUnassigned ? 'text-muted-foreground' : 'text-primary'}`} />
                    </div>
                    <span className={`font-medium ${isUnassigned ? 'text-muted-foreground' : ''}`}>
                      {group.operarioName}
                    </span>
                    <Badge variant="secondary">
                      {countedCount}/{group.locations.length} items
                    </Badge>
                  </div>
                  {!isUnassigned && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={(e) => {
                        e.stopPropagation();
                        handlePrint(group.operarioName, group.locations);
                      }}
                    >
                      <Printer className="w-4 h-4 mr-2" />
                      Imprimir Planilla
                    </Button>
                  )}
                </div>
              </AccordionTrigger>

              <AccordionContent className="pt-2 pb-4">
                <div className="space-y-2">
                  {group.locations.map(loc => {
                    const isCounted = countsMap.has(loc.id);
                    const countedValue = countsMap.get(loc.id);
                    const isSaving = savingIds.has(loc.id);

                    return (
                      <div
                        key={loc.id}
                        className={`flex items-center gap-4 p-3 rounded-lg border ${isCounted ? 'bg-green-50 border-green-200 dark:bg-green-950/20 dark:border-green-900' : 'bg-muted/30'}`}
                      >
                        <div className="flex-1 min-w-0">
                          <p className="font-medium truncate">{loc.master_reference}</p>
                          <p className="text-sm text-muted-foreground truncate">
                            {loc.location_name || '-'}
                            {loc.location_detail && ` - ${loc.location_detail}`}
                          </p>
                        </div>

                        <div className="flex items-center gap-2 shrink-0">
                          {isCounted ? (
                            <div className="flex items-center gap-2 px-3">
                              <CheckCircle2 className="w-5 h-5 text-green-500" />
                              <span className="font-bold text-green-700 dark:text-green-400">
                                {countedValue}
                              </span>
                            </div>
                          ) : null}

                          <Input
                            type="number"
                            min="0"
                            step="0.01"
                            placeholder={isCounted ? String(countedValue) : '0'}
                            className="w-24 text-center font-bold"
                            value={quantities[loc.id] || ''}
                            onChange={(e) => setQuantities(prev => ({
                              ...prev,
                              [loc.id]: e.target.value
                            }))}
                            onBlur={() => handleSaveCount(loc.id)}
                            onKeyDown={(e) => handleKeyDown(e, loc.id)}
                            disabled={isSaving}
                          />

                          {isSaving && (
                            <Loader2 className="w-4 h-4 animate-spin text-primary" />
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </AccordionContent>
            </AccordionItem>
          );
        })}
      </Accordion>

      <PrintableSheet
        open={printDialog.open}
        onOpenChange={(open) => setPrintDialog(prev => ({ ...prev, open }))}
        operarioName={printDialog.operarioName}
        supervisorName={profile?.full_name || 'Supervisor'}
        locations={printDialog.locations}
      />
    </div>
  );
};

export default TranscriptionTab;
