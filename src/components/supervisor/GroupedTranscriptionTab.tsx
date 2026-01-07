import React, { useState, useMemo, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useIsMobile } from '@/hooks/use-mobile';
import { useDebounce } from '@/hooks/useDebounce';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import PrintableSheet from '@/components/supervisor/PrintableSheet';
import AddLocationDialog from '@/components/supervisor/AddLocationDialog';
import { toast } from 'sonner';
import { Loader2, CheckCircle2, RefreshCw, MapPin, Save, Printer, Plus, Info, Search, Bug, AlertTriangle } from 'lucide-react';

// Popover component for location info on mobile
const LocationInfoPopover: React.FC<{ location: Location }> = ({ location }) => (
  <Popover>
    <PopoverTrigger asChild>
      <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0">
        <Info className="w-4 h-4 text-muted-foreground hover:text-foreground" />
      </Button>
    </PopoverTrigger>
    <PopoverContent className="w-72" align="start">
      <div className="space-y-3">
        <h4 className="font-semibold text-sm">Información de Ubicación</h4>
        <div className="space-y-2 text-sm">
          <div>
            <span className="text-muted-foreground">Tipo:</span>{' '}
            <span className="font-medium">{location.inventory_master?.material_type || '-'}</span>
          </div>
          <div>
            <span className="text-muted-foreground">Ubicación:</span>{' '}
            <span className="font-medium">{location.location_name || '-'}</span>
          </div>
          <div>
            <span className="text-muted-foreground">Detalle:</span>{' '}
            <span className="font-medium">{location.location_detail || '-'}</span>
          </div>
          <div>
            <span className="text-muted-foreground">Subcategoría:</span>{' '}
            <span className="font-medium">{location.subcategoria || '-'}</span>
          </div>
          <div>
            <span className="text-muted-foreground">Punto de Referencia:</span>{' '}
            <span className="font-medium">{location.punto_referencia || '-'}</span>
          </div>
          <div>
            <span className="text-muted-foreground">Método de Conteo:</span>{' '}
            <span className="font-medium">{location.metodo_conteo || '-'}</span>
          </div>
          {location.observaciones && (
            <div>
              <span className="text-muted-foreground">Observaciones:</span>{' '}
              <span className="font-medium">{location.observaciones}</span>
            </div>
          )}
        </div>
      </div>
    </PopoverContent>
  </Popover>
);

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
  const { user, profile, role } = useAuth();
  const queryClient = useQueryClient();
  const isMobile = useIsMobile();
  const [quantities, setQuantities] = useState<Record<string, string>>({});
  const [savingIds, setSavingIds] = useState<Set<string>>(new Set());
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [printDialogOpen, setPrintDialogOpen] = useState(false);
  const [printZoneData, setPrintZoneData] = useState<{ name: string; locations: Location[] } | null>(null);
  const [addLocationOpen, setAddLocationOpen] = useState(false);
  
  // Lock para evitar llamadas duplicadas a validación
  const [validatingRefs, setValidatingRefs] = useState<Set<string>>(new Set());
  
  // Diagnostic panel state
  const [showDiagnostic, setShowDiagnostic] = useState(false);
  const [diagnosticRef, setDiagnosticRef] = useState('');
  const [diagnosticResult, setDiagnosticResult] = useState<any>(null);
  const [isDiagnosing, setIsDiagnosing] = useState(false);
  const [localSearchTerm, setLocalSearchTerm] = useState('');
  const debouncedSearchTerm = useDebounce(localSearchTerm, 300);

  // Determine which master audit_round to filter by
  const masterAuditRound = roundNumber <= 2 ? 1 : roundNumber;

  // Debug: Track raw data before filtering
  const [debugInfo, setDebugInfo] = useState<{
    rawCount: number;
    filteredCount: number;
    countedIds: string[];
  }>({ rawCount: 0, filteredCount: 0, countedIds: [] });

  // Paginated fetch function to overcome Supabase 1000 row limit
  const fetchAllLocations = async (): Promise<any[]> => {
    const PAGE_SIZE = 1000;
    let allData: any[] = [];
    let from = 0;
    let hasMore = true;
    let pageCount = 0;
    const statusColumn = `status_c${roundNumber}` as 'status_c1' | 'status_c2' | 'status_c3' | 'status_c4';

    while (hasMore) {
      let query = supabase
        .from('locations')
        .select(`
          id, master_reference, location_name, location_detail,
          subcategoria, observaciones, punto_referencia, metodo_conteo,
          assigned_supervisor_id,
          inventory_master!inner(referencia, material_type, control, audit_round)
        `)
        .eq('inventory_master.audit_round', masterAuditRound)
        .eq(statusColumn, 'pendiente')
        .range(from, from + PAGE_SIZE - 1);

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

      if (data && data.length > 0) {
        allData = [...allData, ...data];
        from += PAGE_SIZE;
        pageCount++;
        hasMore = data.length === PAGE_SIZE; // Continue if we got full page
      } else {
        hasMore = false;
      }
    }

    console.log(`[DEBUG] Fetched ${allData.length} total rows in ${pageCount} pages for round ${roundNumber}`);
    return allData;
  };

  const { data: locations = [], isLoading, refetch } = useQuery({
    queryKey: ['grouped-transcription-locations', roundNumber, user?.id, isAdminMode, controlFilter, masterAuditRound],
    queryFn: async () => {
      const rawData = await fetchAllLocations();
      console.log(`[DEBUG] Query returned ${rawData.length} rows for round ${roundNumber}, masterAuditRound=${masterAuditRound}`);

      // Filter out locations that already have a count for this specific round
      if (rawData.length === 0) {
        setDebugInfo({ rawCount: 0, filteredCount: 0, countedIds: [] });
        return [];
      }

      const locationIds = rawData.map(l => l.id);
      
      const { data: existingCounts } = await supabase
        .from('inventory_counts')
        .select('location_id')
        .in('location_id', locationIds)
        .eq('audit_round', roundNumber);

      const countedLocationIds = new Set(existingCounts?.map(c => c.location_id) || []);
      
      // Debug info
      setDebugInfo({
        rawCount: rawData.length,
        filteredCount: rawData.length - countedLocationIds.size,
        countedIds: Array.from(countedLocationIds) as string[]
      });

      // Return only locations that DON'T have a count for this round
      return (rawData as unknown as Location[]).filter(loc => !countedLocationIds.has(loc.id));
    },
    enabled: !!user?.id,
  });

  // Realtime subscription for inventory_counts - optimizado
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
          const payloadRound = Number(payload.new?.audit_round);
          console.log(`[REALTIME] INSERT detected for round ${payloadRound}, current view is round ${roundNumber}`);
          if (payload.new && payloadRound === roundNumber) {
            console.log(`[REALTIME] Invalidating queries for round ${roundNumber}`);
            // Solo invalidar, no refetch agresivo - dejará que el staleTime controle
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

  // Filter out locations with status_cX = 'contado' manually (fallback for realtime issues)
  const handleValidateContados = async () => {
    setIsRefreshing(true);
    const statusColumn = `status_c${roundNumber}` as 'status_c1' | 'status_c2' | 'status_c3' | 'status_c4';
    
    // Get current locations from cache
    const currentLocations = queryClient.getQueryData<Location[]>(
      ['grouped-transcription-locations', roundNumber, user?.id, isAdminMode, controlFilter, masterAuditRound]
    ) || [];
    
    const locationIds = currentLocations.map(l => l.id);
    
    if (locationIds.length === 0) {
      setIsRefreshing(false);
      toast.info('No hay referencias para filtrar');
      return;
    }
    
    // Query current status of these specific locations
    const { data: locationsStatus } = await supabase
      .from('locations')
      .select('id, status_c1, status_c2, status_c3, status_c4')
      .in('id', locationIds);
    
    // Find IDs where status_cX = 'contado'
    const contadoIds = new Set(
      locationsStatus
        ?.filter(loc => loc[statusColumn] === 'contado')
        .map(loc => loc.id) || []
    );
    
    // Keep ONLY locations with status = 'pendiente' (remove contado)
    queryClient.setQueryData(
      ['grouped-transcription-locations', roundNumber, user?.id, isAdminMode, controlFilter, masterAuditRound],
      (old: Location[] | undefined) => {
        if (!old) return [];
        const filtered = old.filter(loc => !contadoIds.has(loc.id));
        console.log(`[VALIDATE] Removed ${contadoIds.size} contado locations, ${filtered.length} remaining`);
        return filtered;
      }
    );
    
    setIsRefreshing(false);
    toast.success(`${contadoIds.size} referencias contadas removidas, quedan ${currentLocations.length - contadoIds.size} pendientes`);
  };

  // Auto-validation functions
  const checkAndAutoValidate = async (masterReference: string) => {
    // Evitar llamadas duplicadas
    if (validatingRefs.has(masterReference)) {
      console.log(`[VALIDATION] Ya se está validando ${masterReference}, omitiendo`);
      return;
    }
    
    setValidatingRefs(prev => new Set(prev).add(masterReference));
    
    try {
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
        queryClient.refetchQueries({ queryKey: ['grouped-transcription-locations'], type: 'active' });
      }
    } finally {
      setValidatingRefs(prev => {
        const next = new Set(prev);
        next.delete(masterReference);
        return next;
      });
    }
  };

  const checkAndAutoValidateHigherRounds = async (masterReference: string, currentRound: 3 | 4) => {
    // Evitar llamadas duplicadas
    if (validatingRefs.has(masterReference)) {
      console.log(`[VALIDATION] Ya se está validando ${masterReference} para ronda ${currentRound}, omitiendo`);
      return;
    }
    
    setValidatingRefs(prev => new Set(prev).add(masterReference));
    
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

      // NUEVO: Si no hay ningún conteo de la ronda actual, no llamar a validación
      if (countedLocationIds.size === 0) {
        console.log(`[VALIDATION] No hay conteos de ronda ${currentRound} aún para ${masterReference}, omitiendo validación`);
        return;
      }

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
      } else if (validationResult?.action === 'waiting_for_counts') {
        console.log(`[VALIDATION] ${masterReference} esperando conteos de ronda ${currentRound}`);
      }

      queryClient.invalidateQueries({ queryKey: ['validation-references'] });
      queryClient.refetchQueries({ queryKey: ['grouped-transcription-locations'], type: 'active' });
    } catch (err) {
      console.error('Error en validación:', err);
    } finally {
      setValidatingRefs(prev => {
        const next = new Set(prev);
        next.delete(masterReference);
        return next;
      });
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
    onSuccess: (result, variables) => {
      toast.success(`Conteo ${roundNumber} guardado`);
      
      // Limpiar estado inmediatamente para feedback visual rápido
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

      // Invalidar queries para actualizar UI
      queryClient.invalidateQueries({ queryKey: ['grouped-transcription-locations'] });
      queryClient.invalidateQueries({ queryKey: ['supervisor-stats'] });

      // Ejecutar validación de forma asíncrona sin bloquear la UI
      if (result.masterReference) {
        const validationFn = roundNumber <= 2 
          ? checkAndAutoValidate 
          : (roundNumber === 3 || roundNumber === 4) 
            ? (ref: string) => checkAndAutoValidateHigherRounds(ref, roundNumber as 3 | 4)
            : null;
        
        if (validationFn) {
          validationFn(result.masterReference)
            .catch(err => console.error('Error en validación background:', err));
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

  // Diagnostic function to investigate why a reference might be missing
  const runDiagnostic = async (reference: string) => {
    setIsDiagnosing(true);
    try {
      const refUpper = reference.toUpperCase().trim();
      
      // 1. Check inventory_master
      const { data: masterData } = await supabase
        .from('inventory_master')
        .select('referencia, material_type, control, audit_round, status_slug')
        .ilike('referencia', `%${refUpper}%`)
        .limit(10);
      
      // 2. Check locations for this reference
      const { data: locData } = await supabase
        .from('locations')
        .select('id, master_reference, punto_referencia, location_name, assigned_supervisor_id, status_c1, status_c2, status_c3, status_c4')
        .ilike('master_reference', `%${refUpper}%`)
        .limit(20);
      
      // 3. Check inventory_counts for these locations
      const locationIds = locData?.map(l => l.id) || [];
      let countsData: any[] = [];
      if (locationIds.length > 0) {
        const { data: counts } = await supabase
          .from('inventory_counts')
          .select('id, location_id, audit_round, quantity_counted, supervisor_id, created_at')
          .in('location_id', locationIds);
        countsData = counts || [];
      }

      // 4. Check if reference appears in current filtered data
      const inCurrentView = locations.filter(l => 
        l.master_reference.toUpperCase().includes(refUpper)
      );

      setDiagnosticResult({
        searchTerm: refUpper,
        masterRecords: masterData || [],
        locations: locData || [],
        counts: countsData,
        inCurrentView: inCurrentView.length,
        currentUserId: user?.id,
        currentRound: roundNumber,
        masterAuditRound,
        isAdminMode,
        controlFilter,
        reasons: generateReasons(masterData, locData, countsData, inCurrentView.length, user?.id, roundNumber, masterAuditRound, isAdminMode, controlFilter)
      });
    } catch (err) {
      console.error('Diagnostic error:', err);
      toast.error('Error al diagnosticar');
    } finally {
      setIsDiagnosing(false);
    }
  };

  // Generate human-readable reasons why a reference might be missing
  const generateReasons = (
    masterData: any[] | null,
    locData: any[] | null,
    countsData: any[],
    inViewCount: number,
    userId: string | undefined,
    round: number,
    masterRound: number,
    adminMode: boolean,
    ctrlFilter: string
  ): string[] => {
    const reasons: string[] = [];
    
    if (!masterData || masterData.length === 0) {
      reasons.push('❌ NO existe en inventory_master');
      return reasons;
    }
    
    const masterRecord = masterData[0];
    if (masterRecord.audit_round !== masterRound) {
      reasons.push(`❌ audit_round en maestra (${masterRecord.audit_round}) ≠ esperado (${masterRound})`);
    } else {
      reasons.push(`✅ audit_round en maestra = ${masterRound}`);
    }

    if (ctrlFilter === 'not_null' && !masterRecord.control) {
      reasons.push('❌ Filtro control="not_null" pero control es NULL');
    } else if (ctrlFilter === 'null' && masterRecord.control) {
      reasons.push(`❌ Filtro control="null" pero control = "${masterRecord.control}"`);
    } else {
      reasons.push(`✅ Filtro control="${ctrlFilter}" pasa (control=${masterRecord.control || 'null'})`);
    }
    
    if (!locData || locData.length === 0) {
      reasons.push('❌ NO hay locations para esta referencia');
      return reasons;
    }
    
    reasons.push(`✅ ${locData.length} location(s) encontrada(s)`);
    
    if (!adminMode) {
      const assignedToUser = locData.filter(l => l.assigned_supervisor_id === userId);
      if (assignedToUser.length === 0) {
        reasons.push(`❌ Ninguna location asignada al supervisor actual (${userId?.slice(0,8)}...)`);
      } else {
        reasons.push(`✅ ${assignedToUser.length} location(s) asignada(s) al supervisor`);
      }
    }
    
    const countsForRound = countsData.filter(c => c.audit_round === round);
    if (countsForRound.length > 0) {
      reasons.push(`⚠️ ${countsForRound.length} conteo(s) ya existen para ronda ${round} - se filtran`);
    } else {
      reasons.push(`✅ Sin conteos para ronda ${round}`);
    }
    
    if (inViewCount > 0) {
      reasons.push(`✅ VISIBLE en la vista actual (${inViewCount} items)`);
    } else {
      reasons.push('❌ NO aparece en la vista actual filtrada');
    }
    
    return reasons;
  };

  // Filter locations by local search term
  const filteredGroupedByZone = useMemo(() => {
    let filteredLocations = locations;
    
    if (debouncedSearchTerm.trim()) {
      const term = debouncedSearchTerm.toUpperCase();
      filteredLocations = locations.filter(loc =>
        loc.master_reference.toUpperCase().includes(term) ||
        (loc.punto_referencia && loc.punto_referencia.toUpperCase().includes(term)) ||
        (loc.location_name && loc.location_name.toUpperCase().includes(term))
      );
    }

    const groups: Record<string, { zoneName: string; locations: Location[] }> = {};

    filteredLocations.forEach(loc => {
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
  }, [locations, debouncedSearchTerm]);

  // Keep groupedByZone for backwards compatibility
  const groupedByZone = filteredGroupedByZone;

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

  // Show diagnostic panel even when no locations (for debugging)
  const canShowDiagnostic = role === 'superadmin' || role === 'admin_mp' || role === 'admin_pp';

  if (groupedByZone.length === 0 && !canShowDiagnostic) {
    return (
      <div className="text-center py-12 text-muted-foreground">
        No hay ubicaciones pendientes para transcribir en este conteo
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Diagnostic Panel - Only for admins */}
      {canShowDiagnostic && (
        <Collapsible open={showDiagnostic} onOpenChange={setShowDiagnostic}>
          <CollapsibleTrigger asChild>
            <Button variant="outline" size="sm" className="w-full justify-between">
              <span className="flex items-center gap-2">
                <Bug className="w-4 h-4" />
                Panel de Diagnóstico
              </span>
              <Badge variant="secondary" className="ml-2">
                {debugInfo.rawCount} raw → {locations.length} visible
              </Badge>
            </Button>
          </CollapsibleTrigger>
          <CollapsibleContent className="mt-3 p-4 border rounded-lg bg-muted/30 space-y-4">
            {/* Debug Info */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-sm">
              <div className="p-2 bg-background rounded">
                <span className="text-muted-foreground">Round:</span> {roundNumber}
              </div>
              <div className="p-2 bg-background rounded">
                <span className="text-muted-foreground">Master Round:</span> {masterAuditRound}
              </div>
              <div className="p-2 bg-background rounded">
                <span className="text-muted-foreground">Admin Mode:</span> {isAdminMode ? 'Sí' : 'No'}
              </div>
              <div className="p-2 bg-background rounded">
                <span className="text-muted-foreground">Control:</span> {controlFilter}
              </div>
            </div>

            {/* Reference Search */}
            <div className="flex gap-2">
              <Input
                placeholder="Buscar referencia para diagnosticar (ej: NEUTRO6ALET)"
                value={diagnosticRef}
                onChange={(e) => setDiagnosticRef(e.target.value)}
                className="flex-1"
              />
              <Button 
                onClick={() => runDiagnostic(diagnosticRef)}
                disabled={isDiagnosing || !diagnosticRef.trim()}
              >
                {isDiagnosing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
                Diagnosticar
              </Button>
            </div>

            {/* Diagnostic Results */}
            {diagnosticResult && (
              <div className="space-y-3 text-sm">
                <h4 className="font-semibold flex items-center gap-2">
                  Resultado para: {diagnosticResult.searchTerm}
                </h4>
                
                {/* Reasons */}
                <div className="space-y-1 p-3 bg-background rounded-lg">
                  <h5 className="font-medium text-muted-foreground mb-2">Análisis:</h5>
                  {diagnosticResult.reasons.map((reason: string, idx: number) => (
                    <div key={idx} className="flex items-start gap-2">
                      {reason}
                    </div>
                  ))}
                </div>

                {/* Master Records */}
                {diagnosticResult.masterRecords.length > 0 && (
                  <details className="p-3 bg-background rounded-lg">
                    <summary className="cursor-pointer font-medium">
                      inventory_master ({diagnosticResult.masterRecords.length})
                    </summary>
                    <pre className="mt-2 text-xs overflow-auto max-h-32">
                      {JSON.stringify(diagnosticResult.masterRecords, null, 2)}
                    </pre>
                  </details>
                )}

                {/* Locations */}
                {diagnosticResult.locations.length > 0 && (
                  <details className="p-3 bg-background rounded-lg">
                    <summary className="cursor-pointer font-medium">
                      locations ({diagnosticResult.locations.length})
                    </summary>
                    <pre className="mt-2 text-xs overflow-auto max-h-32">
                      {JSON.stringify(diagnosticResult.locations, null, 2)}
                    </pre>
                  </details>
                )}

                {/* Counts */}
                {diagnosticResult.counts.length > 0 && (
                  <details className="p-3 bg-background rounded-lg">
                    <summary className="cursor-pointer font-medium flex items-center gap-2">
                      <AlertTriangle className="w-4 h-4 text-amber-500" />
                      inventory_counts ({diagnosticResult.counts.length}) - posible causa
                    </summary>
                    <pre className="mt-2 text-xs overflow-auto max-h-32">
                      {JSON.stringify(diagnosticResult.counts, null, 2)}
                    </pre>
                  </details>
                )}
              </div>
            )}
          </CollapsibleContent>
        </Collapsible>
      )}

      {/* Local Search */}
      <div className="flex gap-2 items-center">
        <div className="relative flex-1 max-w-xs">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Buscar referencia..."
            value={localSearchTerm}
            onChange={(e) => setLocalSearchTerm(e.target.value)}
            className="pl-9"
          />
        </div>
        {localSearchTerm && (
          <Badge variant="secondary">
            {locations.filter(l => 
              l.master_reference.toUpperCase().includes(localSearchTerm.toUpperCase())
            ).length} resultados
          </Badge>
        )}
      </div>

      <div className="flex justify-between items-center">
        <Button 
          variant="default" 
          size="sm" 
          onClick={() => setAddLocationOpen(true)}
        >
          <Plus className="w-4 h-4 mr-2" />
          Agregar Referencia
        </Button>
        <div className="flex gap-2">
          <Button 
            variant="outline" 
            size="sm" 
            onClick={handleValidateContados}
            disabled={isRefreshing}
          >
            <CheckCircle2 className={`w-4 h-4 mr-2 ${isRefreshing ? 'animate-spin' : ''}`} />
            Validar Contados
          </Button>
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
      </div>

      {groupedByZone.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground">
          {localSearchTerm 
            ? `No se encontraron resultados para "${localSearchTerm}"`
            : 'No hay ubicaciones pendientes para transcribir en este conteo'
          }
        </div>
      ) : (
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
                {isMobile ? (
                  // Vista Mobile - Lista simplificada
                  <div className="space-y-3">
                    {group.locations.map(loc => {
                      const isSaving = savingIds.has(loc.id);
                      
                      return (
                        <div key={loc.id} className="p-3 border rounded-lg bg-background space-y-2">
                          {/* Línea 1: Referencia + Info */}
                          <div className="flex items-center justify-between gap-2">
                            <p className="font-semibold text-sm break-all">{loc.master_reference}</p>
                            <LocationInfoPopover location={loc} />
                          </div>
                          
                          {/* Línea 2: Ubicación + Input + Guardar */}
                          <div className="flex items-center gap-2">
                            <p className="flex-1 text-xs text-muted-foreground truncate">
                              {loc.location_name || loc.punto_referencia || '-'}
                            </p>
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
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  // Vista Desktop - Tabla completa
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
                )}
              </AccordionContent>
            </AccordionItem>
          );
        })}
        </Accordion>
      )}

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

      <AddLocationDialog 
        open={addLocationOpen} 
        onOpenChange={setAddLocationOpen} 
      />
    </div>
  );
};

export default GroupedTranscriptionTab;
