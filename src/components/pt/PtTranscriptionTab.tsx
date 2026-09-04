import React, { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useInventory } from '@/contexts/InventoryContext';
import { useDebounce } from '@/hooks/useDebounce';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useIsMobile } from '@/hooks/use-mobile';
import { toast } from 'sonner';
import { friendlyCountError } from '@/lib/countErrorMessage';
import { Check, Loader2, RefreshCw, Save, Search, CheckCircle2 } from 'lucide-react';
import CountCalculator from '@/components/pt/CountCalculator';

const PAGE_SIZE = 1000;

interface PtLocationRow {
  id: string;
  referencia: string;
  piso: string;
  prodc: string | null;
  ubic: string | null;
  linea: string | null;
  ue: number | null;
  orden: number | null;
  descripcion?: string | null;
}

interface Props {
  roundNumber: 1 | 2 | 3 | 4;
  isAdminMode?: boolean;
}

const PtTranscriptionTab: React.FC<Props> = ({ roundNumber, isAdminMode = false }) => {
  const { user } = useAuth();
  const { inventoryId, isReadOnly } = useInventory();
  const queryClient = useQueryClient();
  const isMobile = useIsMobile();

  const [quantities, setQuantities] = useState<Record<string, string>>({});
  const [savingIds, setSavingIds] = useState<Set<string>>(new Set());
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [validatingRefs, setValidatingRefs] = useState<Set<string>>(new Set());
  const [search, setSearch] = useState('');
  const debouncedSearch = useDebounce(search, 300);

  // Las rondas 1 y 2 comparten la ronda de auditoría 1 de la maestra
  const masterAuditRound = roundNumber <= 2 ? 1 : roundNumber;
  const statusColumn = `status_c${roundNumber}` as 'status_c1' | 'status_c2' | 'status_c3' | 'status_c4';

  const queryKey = ['pt-transcription', roundNumber, user?.id, isAdminMode, inventoryId];

  const { data: locations = [], isLoading, refetch } = useQuery({
    queryKey,
    enabled: !!user?.id && !!inventoryId,
    queryFn: async (): Promise<PtLocationRow[]> => {
      // 1. Referencias PT que están en la ronda vigente
      const openRefs = new Set<string>();
      const descriptions = new Map<string, string | null>();
      for (let from = 0; ; from += PAGE_SIZE) {
        const { data, error } = await supabase
          .from('pt_master')
          .select('referencia, descripcion, audit_round, status_slug')
          .eq('inventory_id', inventoryId!)
          .eq('audit_round', masterAuditRound)
          .not('status_slug', 'in', '("auditado","cerrado_forzado","n/a")')
          .range(from, from + PAGE_SIZE - 1);
        if (error) throw error;
        (data || []).forEach((m) => {
          openRefs.add(m.referencia);
          descriptions.set(m.referencia, m.descripcion);
        });
        if (!data || data.length < PAGE_SIZE) break;
      }
      if (openRefs.size === 0) return [];

      // 2. Ubicaciones pendientes de esta ronda
      const rows: PtLocationRow[] = [];
      for (let from = 0; ; from += PAGE_SIZE) {
        let query = supabase
          .from('pt_locations')
          .select('id, referencia, piso, prodc, ubic, linea, ue, orden')
          .eq('inventory_id', inventoryId!)
          .eq('activo', true)
          .is('validated_at_round', null)
          .eq(statusColumn, 'pendiente')
          .order('piso')
          .order('orden')
          .range(from, from + PAGE_SIZE - 1);

        if (!isAdminMode) query = query.eq('assigned_supervisor_id', user!.id);

        const { data, error } = await query;
        if (error) throw error;
        rows.push(...((data || []) as PtLocationRow[]));
        if (!data || data.length < PAGE_SIZE) break;
      }

      const filtered = rows.filter((r) => openRefs.has(r.referencia));
      if (filtered.length === 0) return [];

      // 3. Excluir las que ya tienen conteo de esta ronda
      const counted = new Set<string>();
      const ids = filtered.map((r) => r.id);
      for (let i = 0; i < ids.length; i += 500) {
        const chunk = ids.slice(i, i + 500);
        const { data, error } = await supabase
          .from('pt_counts')
          .select('location_id')
          .eq('audit_round', roundNumber)
          .in('location_id', chunk);
        if (error) throw error;
        (data || []).forEach((c) => counted.add(c.location_id));
      }

      return filtered
        .filter((r) => !counted.has(r.id))
        .map((r) => ({ ...r, descripcion: descriptions.get(r.referencia) ?? null }));
    },
  });

  // Realtime: cuando otro usuario guarda un conteo de esta ronda
  useEffect(() => {
    const channel = supabase
      .channel(`pt-counts-round-${roundNumber}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'pt_counts' },
        (payload) => {
          if (Number((payload.new as { audit_round?: number })?.audit_round) === roundNumber) {
            queryClient.invalidateQueries({ queryKey: ['pt-transcription', roundNumber] });
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [roundNumber, queryClient]);

  const runValidation = async (referencia: string) => {
    if (validatingRefs.has(referencia)) return;
    setValidatingRefs((prev) => new Set(prev).add(referencia));
    try {
      const { data, error } = await supabase.rpc('pt_validate_and_close_round', {
        _inventory_id: inventoryId!,
        _referencia: referencia,
        _user_id: user!.id,
      });
      if (error) throw error;

      const res = data as unknown as { action?: string; new_round?: number; error?: string } | null;
      if (!res) return;
      if (res.error) {
        console.warn(`[PT VALIDATION] ${referencia}: ${res.error}`);
        return;
      }
      if (res.action === 'closed') {
        toast.success(`✅ ${referencia} - AUDITADO automáticamente`);
      } else if (res.action === 'next_round') {
        toast.warning(`⚠️ ${referencia} - Pasó a Conteo ${res.new_round}`);
      } else if (res.action === 'escalate_to_superadmin') {
        toast.error(`🚨 ${referencia} - Escalado a SUPERADMIN`);
      } else if (res.action === 'descuadre_sin_ubicaciones') {
        toast.error(`🚨 ${referencia} - Hay ERP pero no hay ubicaciones cargadas`);
      }
      queryClient.invalidateQueries({ queryKey: ['pt-transcription'] });
    } catch (err) {
      console.error('Error en validación PT:', err);
    } finally {
      setValidatingRefs((prev) => {
        const next = new Set(prev);
        next.delete(referencia);
        return next;
      });
    }
  };

  const saveMutation = useMutation({
    mutationFn: async ({ location, quantity }: { location: PtLocationRow; quantity: number }) => {
      const { error } = await supabase.from('pt_counts').insert({
        inventory_id: inventoryId!,
        location_id: location.id,
        supervisor_id: user!.id,
        audit_round: roundNumber,
        quantity_counted: quantity,
      });
      if (error) throw error;
      return location;
    },
    onSuccess: (location) => {
      toast.success(`Conteo ${roundNumber} guardado`);
      setSavingIds((prev) => {
        const next = new Set(prev);
        next.delete(location.id);
        return next;
      });
      setQuantities((prev) => {
        const next = { ...prev };
        delete next[location.id];
        return next;
      });
      queryClient.setQueryData<PtLocationRow[]>(queryKey, (old) =>
        (old || []).filter((l) => l.id !== location.id)
      );
      runValidation(location.referencia).catch((e) => console.error(e));
    },
    onError: (error: Error, variables) => {
      toast.error(friendlyCountError(error));
      setSavingIds((prev) => {
        const next = new Set(prev);
        next.delete(variables.location.id);
        return next;
      });
    },
  });

  const handleSave = (location: PtLocationRow) => {
    if (isReadOnly) {
      toast.error('Inventario histórico: solo lectura');
      return;
    }
    const raw = quantities[location.id];
    if (!raw || raw.trim() === '') {
      toast.error('Ingrese una cantidad');
      return;
    }
    const quantity = parseFloat(raw.replace(',', '.'));
    if (isNaN(quantity) || quantity < 0) {
      toast.error('Cantidad inválida');
      return;
    }
    setSavingIds((prev) => new Set(prev).add(location.id));
    saveMutation.mutate({ location, quantity });
  };

  const handleRefresh = async () => {
    setIsRefreshing(true);
    await refetch();
    setIsRefreshing(false);
    toast.success('Datos actualizados');
  };

  const grouped = useMemo(() => {
    const term = debouncedSearch.trim().toLowerCase();
    const filtered = term
      ? locations.filter(
          (l) =>
            l.referencia.toLowerCase().includes(term) ||
            (l.descripcion || '').toLowerCase().includes(term) ||
            (l.ubic || '').toLowerCase().includes(term)
        )
      : locations;

    const map = new Map<string, PtLocationRow[]>();
    for (const loc of filtered) {
      const list = map.get(loc.piso) || [];
      list.push(loc);
      map.set(loc.piso, list);
    }
    return [...map.entries()].sort((a, b) =>
      a[0].localeCompare(b[0], 'es', { numeric: true })
    );
  }, [locations, debouncedSearch]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-3 sm:space-y-4">
      <div className="sticky top-0 z-20 -mx-1 px-1 py-2 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80 border-b flex flex-col sm:flex-row gap-2 sm:items-center sm:justify-between">
        <div className="relative flex-1 sm:max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            className="pl-9 h-11 text-base sm:h-10 sm:text-sm"
            placeholder="Buscar referencia o ubicación..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <div className="flex items-center justify-between sm:justify-end gap-2">
          <Badge variant="secondary">{locations.length} pendientes</Badge>
          <Button
            variant="outline"
            size={isMobile ? 'icon' : 'sm'}
            className={isMobile ? 'h-11 w-11' : undefined}
            onClick={handleRefresh}
            disabled={isRefreshing}
            aria-label="Actualizar"
          >
            <RefreshCw className={`h-4 w-4 ${isRefreshing ? 'animate-spin' : ''} ${isMobile ? '' : 'mr-2'}`} />
            {!isMobile && 'Actualizar'}
          </Button>
        </div>
      </div>

      {grouped.length === 0 ? (
        debouncedSearch.trim() ? (
          <div className="flex flex-col items-center justify-center gap-3 py-16 text-center text-muted-foreground">
            <Search className="h-10 w-10 mb-1" />
            <p className="font-medium text-foreground">Sin resultados</p>
            <p className="text-sm">No se encontraron resultados para "{search}".</p>
            <Button variant="outline" size="sm" onClick={() => setSearch('')}>
              Limpiar búsqueda
            </Button>
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center py-16 text-center text-muted-foreground">
            <CheckCircle2 className="h-10 w-10 mb-3 text-primary" />
            <p className="font-medium text-foreground">No hay ubicaciones pendientes</p>
            <p className="text-sm">Todo lo asignado para este conteo ya fue transcrito.</p>
          </div>
        )
      ) : (
        <Accordion
          type="multiple"
          key={isMobile ? 'mobile' : 'desktop'}
          defaultValue={isMobile ? grouped.slice(0, 1).map(([piso]) => piso) : grouped.map(([piso]) => piso)}
          className="space-y-2"
        >
          {grouped.map(([piso, rows]) => (
            <AccordionItem key={piso} value={piso} className="border rounded-lg px-3">
              <AccordionTrigger className="hover:no-underline min-h-[44px] py-3">
                <div className="flex items-center gap-3">
                  <span className="font-semibold">Piso {piso}</span>
                  <Badge variant="outline">{rows.length} ubicaciones</Badge>
                </div>
              </AccordionTrigger>
              <AccordionContent>
                <div className="space-y-2">
                  {rows.map((loc) => (
                    <div
                      key={loc.id}
                      className="flex flex-col md:flex-row md:items-center gap-3 md:gap-4 border rounded-md p-3 bg-card"
                    >
                      <div className="flex-1 min-w-0">
                        <div className="font-medium break-words md:truncate">{loc.referencia}</div>
                        <div className="text-sm text-muted-foreground break-words md:truncate">
                          {loc.descripcion || 'Sin descripción'}
                        </div>
                        <div className="text-xs text-muted-foreground mt-1 flex flex-wrap gap-x-3 gap-y-0.5">
                          {loc.prodc && <span>PRODC: {loc.prodc}</span>}
                          {loc.ubic && <span>UBIC: {loc.ubic}</span>}
                          {loc.linea && <span>Línea: {loc.linea}</span>}
                          {loc.ue != null && <span>U.E: {loc.ue}</span>}
                        </div>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <Input
                          type="number"
                          inputMode="decimal"
                          enterKeyHint="done"
                          className="flex-1 md:flex-none md:w-32 h-12 text-base md:h-10 md:text-sm"
                          placeholder="Cantidad"
                          value={quantities[loc.id] ?? ''}
                          disabled={isReadOnly || savingIds.has(loc.id)}
                          onChange={(e) =>
                            setQuantities((prev) => ({ ...prev, [loc.id]: e.target.value }))
                          }
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') handleSave(loc);
                          }}
                        />
                        <CountCalculator
                          ue={loc.ue}
                          referencia={loc.referencia}
                          disabled={isReadOnly || savingIds.has(loc.id)}
                          onApply={(total) =>
                            setQuantities((prev) => ({ ...prev, [loc.id]: String(total) }))
                          }
                        />
                        <Button
                          size={isMobile ? 'icon' : 'sm'}
                          className={isMobile ? 'h-12 w-16 shrink-0' : undefined}
                          onClick={() => handleSave(loc)}
                          disabled={isReadOnly || savingIds.has(loc.id)}
                          aria-label="Guardar conteo"
                        >
                          {savingIds.has(loc.id) ? (
                            <Loader2 className="h-5 w-5 animate-spin" />
                          ) : isMobile ? (
                            <Check className="h-6 w-6" />
                          ) : (
                            <>
                              <Save className="h-4 w-4 mr-2" />
                              Guardar
                            </>
                          )}
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              </AccordionContent>
            </AccordionItem>
          ))}
        </Accordion>
      )}
    </div>
  );
};

export default PtTranscriptionTab;
