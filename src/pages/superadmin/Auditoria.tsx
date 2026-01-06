import React, { useState, useMemo, useCallback } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import AppLayout from '@/components/layout/AppLayout';
import { toast } from 'sonner';
import { 
  Search, 
  ChevronDown,
  ChevronRight,
  MoreVertical,
  CheckCircle2,
  XCircle,
  Edit3,
  History,
  FileSearch,
  Info,
  Loader2
} from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { Skeleton } from '@/components/ui/skeleton';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';

interface AuditRow {
  locationId: string;
  referencia: string;
  materialType: string;
  locationName: string | null;
  locationDetail: string | null;
  subcategoria: string | null;
  puntoReferencia: string | null;
  metodoConteo: string | null;
  observaciones: string | null;
  cantTotalErp: number;
  statusSlug: string;
  auditRound: number;
  countHistory: any;
  validatedAtRound: number | null;
  validatedQuantity: number | null;
  discoveredAtRound: number | null;
  counts: {
    c1: number | null;
    c2: number | null;
    c3: number | null;
    c4: number | null;
    c5: number | null;
  };
}

interface GroupedReference {
  referencia: string;
  materialType: string;
  cantTotalErp: number;
  statusSlug: string;
  auditRound: number;
  countHistory: any;
  rows: AuditRow[];
  totals: {
    c1: number | null;
    c2: number | null;
    c3: number | null;
    c4: number | null;
    c5: number | null;
  };
}

const STATUS_CONFIG: Record<string, { label: string; className: string }> = {
  pendiente: { 
    label: 'Pendiente', 
    className: 'bg-yellow-100 text-yellow-800 border-yellow-300 dark:bg-yellow-900/30 dark:text-yellow-400 dark:border-yellow-700' 
  },
  auditado: { 
    label: 'Auditado', 
    className: 'bg-green-100 text-green-800 border-green-300 dark:bg-green-900/30 dark:text-green-400 dark:border-green-700' 
  },
  conflicto: { 
    label: 'Conflicto', 
    className: 'bg-orange-100 text-orange-800 border-orange-300 dark:bg-orange-900/30 dark:text-orange-400 dark:border-orange-700' 
  },
  critico: { 
    label: 'Crítico', 
    className: 'bg-red-100 text-red-800 border-red-300 dark:bg-red-900/30 dark:text-red-400 dark:border-red-700' 
  },
  cerrado_forzado: { 
    label: 'Cerrado Forzado', 
    className: 'bg-purple-100 text-purple-800 border-purple-300 dark:bg-purple-900/30 dark:text-purple-400 dark:border-purple-700' 
  },
};

const LocationInfoPopover: React.FC<{ row: AuditRow }> = ({ row }) => (
  <Popover>
    <PopoverTrigger asChild>
      <Button variant="ghost" size="icon" className="h-7 w-7">
        <Info className="w-4 h-4 text-muted-foreground hover:text-foreground" />
      </Button>
    </PopoverTrigger>
    <PopoverContent className="w-72" align="start">
      <div className="space-y-3">
        <h4 className="font-semibold text-sm">Información de Ubicación</h4>
        <div className="space-y-2 text-sm">
          <div>
            <span className="text-muted-foreground">Ubicación:</span>{' '}
            <span className="font-medium">{row.locationName || '-'}</span>
          </div>
          <div>
            <span className="text-muted-foreground">Detalle:</span>{' '}
            <span className="font-medium">{row.locationDetail || '-'}</span>
          </div>
          <div>
            <span className="text-muted-foreground">Subcategoría:</span>{' '}
            <span className="font-medium">{row.subcategoria || '-'}</span>
          </div>
          <div>
            <span className="text-muted-foreground">Punto de Referencia:</span>{' '}
            <span className="font-medium">{row.puntoReferencia || '-'}</span>
          </div>
          <div>
            <span className="text-muted-foreground">Método de Conteo:</span>{' '}
            <span className="font-medium">{row.metodoConteo || '-'}</span>
          </div>
          {row.observaciones && (
            <div>
              <span className="text-muted-foreground">Observaciones:</span>{' '}
              <span className="font-medium">{row.observaciones}</span>
            </div>
          )}
        </div>
      </div>
    </PopoverContent>
  </Popover>
);

const Auditoria: React.FC = () => {
  const { user } = useAuth();
  const [searchQuery, setSearchQuery] = useState('');
  const [materialTypeFilter, setMaterialTypeFilter] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [locationFilter, setLocationFilter] = useState<string>('all');
  const [historyDialogOpen, setHistoryDialogOpen] = useState(false);
  const [selectedHistory, setSelectedHistory] = useState<{ referencia: string; history: any[] } | null>(null);
  const [expandedRefs, setExpandedRefs] = useState<Set<string>>(new Set());
  
  // Dialog states for actions
  const [validateDialogOpen, setValidateDialogOpen] = useState(false);
  const [forceCloseDialogOpen, setForceCloseDialogOpen] = useState(false);
  const [editCountDialogOpen, setEditCountDialogOpen] = useState(false);
  const [selectedReference, setSelectedReference] = useState<GroupedReference | null>(null);
  const [validateQuantity, setValidateQuantity] = useState('');
  const [forceCloseReason, setForceCloseReason] = useState('');
  const [editingCounts, setEditingCounts] = useState<Record<string, { c1?: string; c2?: string; c3?: string; c4?: string; c5?: string }>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Debounced search for server-side filtering
  const [debouncedSearch, setDebouncedSearch] = useState(searchQuery);
  
  React.useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(searchQuery), 300);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  // Query for unique location names (for filter dropdown)
  const { data: locationOptions } = useQuery({
    queryKey: ['audit-location-options'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('locations')
        .select('location_name');
      
      if (error) throw error;
      return [...new Set(data?.map(d => d.location_name).filter(Boolean))] as string[];
    },
    staleTime: 10 * 60 * 1000,
  });

  const { data: auditData, isLoading, isFetching } = useQuery({
    queryKey: ['audit-full-view', debouncedSearch, materialTypeFilter, statusFilter, locationFilter],
    queryFn: async () => {
      // 1. Build query with filters on inventory_master - limit to 500 for performance
      let masterQuery = supabase
        .from('inventory_master')
        .select('referencia, material_type, cant_total_erp, status_slug, audit_round, count_history')
        .order('referencia')
        .limit(500);
      
      // Apply filters
      if (debouncedSearch) {
        masterQuery = masterQuery.ilike('referencia', `%${debouncedSearch}%`);
      }
      if (materialTypeFilter !== 'all') {
        masterQuery = masterQuery.eq('material_type', materialTypeFilter as 'MP' | 'PP');
      }
      if (statusFilter !== 'all') {
        masterQuery = masterQuery.eq('status_slug', statusFilter);
      }
      
      const { data: masters, error: masterError } = await masterQuery;
      if (masterError) throw masterError;
      if (!masters || masters.length === 0) return { rows: [], totalReferences: 0, totalLocations: 0 };
      
      // 2. Get locations for all references in a single batch
      const refs = masters.map(m => m.referencia);
      
      let locationsQuery = supabase
        .from('locations')
        .select('id, master_reference, location_name, location_detail, subcategoria, punto_referencia, metodo_conteo, observaciones, validated_at_round, validated_quantity, discovered_at_round')
        .in('master_reference', refs);
      
      if (locationFilter !== 'all') {
        locationsQuery = locationsQuery.eq('location_name', locationFilter);
      }
      
      const { data: allLocations, error: locError } = await locationsQuery;
      if (locError) throw locError;
      if (!allLocations || allLocations.length === 0) return { rows: [], totalReferences: masters.length, totalLocations: 0 };
      
      // 3. Get counts for all locations in a single query
      const locationIds = allLocations.map(l => l.id);
      const { data: allCounts, error: countsError } = await supabase
        .from('inventory_counts')
        .select('location_id, audit_round, quantity_counted')
        .in('location_id', locationIds);
      
      if (countsError) throw countsError;
      
      // 4. Build counts map
      const countsMap = new Map<string, { c1: number | null; c2: number | null; c3: number | null; c4: number | null; c5: number | null }>();
      allLocations.forEach(loc => {
        countsMap.set(loc.id, { c1: null, c2: null, c3: null, c4: null, c5: null });
      });
      (allCounts || []).forEach(count => {
        const existing = countsMap.get(count.location_id);
        if (existing) {
          const key = `c${count.audit_round}` as keyof typeof existing;
          if (key in existing) {
            existing[key] = count.quantity_counted;
          }
        }
      });
      
      // 5. Group by reference
      const locationsMap = new Map<string, typeof allLocations>();
      allLocations.forEach(loc => {
        const existing = locationsMap.get(loc.master_reference) || [];
        existing.push(loc);
        locationsMap.set(loc.master_reference, existing);
      });
      
      // 6. Build grouped rows maintaining master order
      const rows: AuditRow[] = [];
      masters.forEach(master => {
        const locs = locationsMap.get(master.referencia) || [];
        locs.forEach(loc => {
          rows.push({
            locationId: loc.id,
            referencia: master.referencia,
            materialType: master.material_type || 'MP',
            locationName: loc.location_name,
            locationDetail: loc.location_detail,
            subcategoria: loc.subcategoria,
            puntoReferencia: loc.punto_referencia,
            metodoConteo: loc.metodo_conteo,
            observaciones: loc.observaciones,
            cantTotalErp: master.cant_total_erp || 0,
            statusSlug: master.status_slug || 'pendiente',
            auditRound: master.audit_round || 1,
            countHistory: master.count_history || [],
            validatedAtRound: loc.validated_at_round,
            validatedQuantity: loc.validated_quantity,
            discoveredAtRound: loc.discovered_at_round,
            counts: countsMap.get(loc.id) || { c1: null, c2: null, c3: null, c4: null, c5: null },
          });
        });
      });
      
      return { rows, totalReferences: masters.length, totalLocations: allLocations.length };
    },
    staleTime: 60 * 1000, // 1 minuto
  });

  const groupedData = useMemo(() => {
    if (!auditData?.rows) return [];
    
    const groups = new Map<string, AuditRow[]>();
    auditData.rows.forEach(row => {
      const existing = groups.get(row.referencia) || [];
      existing.push(row);
      groups.set(row.referencia, existing);
    });

    const calculateSum = (rows: AuditRow[], key: keyof AuditRow['counts']): number | null => {
      const validCounts = rows.map(r => r.counts[key]).filter(v => v !== null) as number[];
      return validCounts.length > 0 ? validCounts.reduce((a, b) => a + b, 0) : null;
    };

    return Array.from(groups.entries()).map(([referencia, rows]): GroupedReference => ({
      referencia,
      materialType: rows[0].materialType,
      cantTotalErp: rows[0].cantTotalErp,
      statusSlug: rows[0].statusSlug,
      auditRound: rows[0].auditRound,
      countHistory: rows[0].countHistory,
      rows,
      totals: {
        c1: calculateSum(rows, 'c1'),
        c2: calculateSum(rows, 'c2'),
        c3: calculateSum(rows, 'c3'),
        c4: calculateSum(rows, 'c4'),
        c5: calculateSum(rows, 'c5'),
      },
    }));
  }, [auditData?.rows]);

  const handleViewHistory = useCallback((referencia: string, history: any[]) => {
    setSelectedHistory({ referencia, history });
    setHistoryDialogOpen(true);
  }, []);

  const toggleExpand = useCallback((referencia: string) => {
    setExpandedRefs(prev => {
      const next = new Set(prev);
      if (next.has(referencia)) {
        next.delete(referencia);
      } else {
        next.add(referencia);
      }
      return next;
    });
  }, []);

  // Open validate dialog
  const openValidateDialog = useCallback((group: GroupedReference) => {
    setSelectedReference(group);
    const sumValidated = group.rows.reduce((acc, r) => acc + (r.validatedQuantity || 0), 0);
    setValidateQuantity(sumValidated > 0 ? sumValidated.toString() : group.cantTotalErp.toString());
    setValidateDialogOpen(true);
  }, []);

  // Open force close dialog
  const openForceCloseDialog = useCallback((group: GroupedReference) => {
    setSelectedReference(group);
    setForceCloseReason('');
    setForceCloseDialogOpen(true);
  }, []);

  // Open edit count dialog
  const openEditCountDialog = useCallback((group: GroupedReference) => {
    setSelectedReference(group);
    const initial: typeof editingCounts = {};
    group.rows.forEach(row => {
      initial[row.locationId] = {
        c1: row.counts.c1?.toString() ?? '',
        c2: row.counts.c2?.toString() ?? '',
        c3: row.counts.c3?.toString() ?? '',
        c4: row.counts.c4?.toString() ?? '',
        c5: row.counts.c5?.toString() ?? '',
      };
    });
    setEditingCounts(initial);
    setEditCountDialogOpen(true);
  }, []);

  // Handle validate manually
  const handleValidateManually = async () => {
    if (!selectedReference || !user) return;
    setIsSubmitting(true);

    try {
      const locationIds = selectedReference.rows.map(r => r.locationId);
      const qty = parseFloat(validateQuantity);
      const perLocation = qty / locationIds.length;

      const { error: locError } = await supabase
        .from('locations')
        .update({
          validated_quantity: perLocation,
          validated_at_round: selectedReference.auditRound,
        })
        .in('id', locationIds);

      if (locError) throw locError;

      const { error: masterError } = await supabase
        .from('inventory_master')
        .update({ status_slug: 'auditado' })
        .eq('referencia', selectedReference.referencia);

      if (masterError) throw masterError;

      await supabase.from('audit_logs').insert({
        action_type: 'validacion_manual',
        master_reference: selectedReference.referencia,
        new_data: { validated_quantity: qty },
        round_number: selectedReference.auditRound,
        user_id: user.id,
      });

      toast.success('Referencia validada correctamente');
      setValidateDialogOpen(false);
      window.location.reload();
    } catch (error: any) {
      toast.error('Error al validar: ' + error.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  // Handle force close
  const handleForceClose = async () => {
    if (!selectedReference || !user) return;
    if (!forceCloseReason.trim()) {
      toast.error('Debes ingresar un motivo');
      return;
    }
    setIsSubmitting(true);

    try {
      const existingHistory = Array.isArray(selectedReference.countHistory) ? selectedReference.countHistory : [];
      const newHistory = [
        ...existingHistory,
        {
          action: 'cierre_forzado',
          reason: forceCloseReason,
          timestamp: new Date().toISOString(),
          user_id: user.id,
        },
      ];

      const { error: masterError } = await supabase
        .from('inventory_master')
        .update({
          status_slug: 'cerrado_forzado',
          count_history: newHistory,
        })
        .eq('referencia', selectedReference.referencia);

      if (masterError) throw masterError;

      await supabase.from('audit_logs').insert({
        action_type: 'cierre_forzado',
        master_reference: selectedReference.referencia,
        new_data: { reason: forceCloseReason },
        round_number: selectedReference.auditRound,
        user_id: user.id,
      });

      toast.success('Referencia cerrada forzadamente');
      setForceCloseDialogOpen(false);
      window.location.reload();
    } catch (error: any) {
      toast.error('Error al cerrar: ' + error.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  // Handle save edited counts
  const handleSaveEditedCounts = async () => {
    if (!selectedReference || !user) return;
    setIsSubmitting(true);

    try {
      const upserts: { location_id: string; audit_round: number; quantity_counted: number; supervisor_id: string }[] = [];

      for (const row of selectedReference.rows) {
        const edited = editingCounts[row.locationId];
        if (!edited) continue;

        for (let round = 1; round <= 5; round++) {
          const key = `c${round}` as 'c1' | 'c2' | 'c3' | 'c4' | 'c5';
          const value = edited[key];

          if (value !== '' && value !== undefined) {
            upserts.push({
              location_id: row.locationId,
              audit_round: round,
              quantity_counted: parseFloat(value),
              supervisor_id: user.id,
            });
          }
        }
      }

      if (upserts.length > 0) {
        const { error } = await supabase
          .from('inventory_counts')
          .upsert(upserts, { onConflict: 'location_id,audit_round' });

        if (error) throw error;
      }

      await supabase.from('audit_logs').insert({
        action_type: 'edicion_conteo',
        master_reference: selectedReference.referencia,
        new_data: editingCounts,
        user_id: user.id,
      });

      toast.success('Conteos actualizados correctamente');
      setEditCountDialogOpen(false);
      window.location.reload();
    } catch (error: any) {
      toast.error('Error al guardar: ' + error.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  const renderCountCell = (value: number | null, erp: number, round: number, currentRound: number, discoveredAtRound: number | null = null) => {
    if (discoveredAtRound !== null && round < discoveredAtRound) {
      return <span className="text-muted-foreground/50">-</span>;
    }
    
    if (value === null) {
      return <span className="text-muted-foreground">-</span>;
    }

    const matchesErp = value === erp;
    const isCurrentRound = round <= currentRound;

    return (
      <span className={`font-medium ${matchesErp ? 'text-green-600 dark:text-green-400' : isCurrentRound ? 'text-foreground' : 'text-muted-foreground'}`}>
        {value}
      </span>
    );
  };

  const getStatusBadge = (status: string) => {
    const config = STATUS_CONFIG[status] || STATUS_CONFIG.pendiente;
    return (
      <Badge variant="outline" className={`whitespace-nowrap text-xs ${config.className}`}>
        {config.label}
      </Badge>
    );
  };

  const renderMainRow = (group: GroupedReference) => {
    const hasMultipleLocations = group.rows.length > 1;
    const isExpanded = expandedRefs.has(group.referencia);
    const row = group.rows[0];

    return (
      <div 
        key={group.referencia}
        className={`flex items-center h-11 border-b border-border hover:bg-muted/30 ${hasMultipleLocations ? 'cursor-pointer' : ''}`}
        onClick={() => hasMultipleLocations && toggleExpand(group.referencia)}
      >
        {/* Referencia */}
        <div className="w-[180px] min-w-[180px] px-3 font-medium flex items-center gap-2 truncate">
          {hasMultipleLocations && (
            isExpanded ? (
              <ChevronDown className="w-4 h-4 text-muted-foreground flex-shrink-0" />
            ) : (
              <ChevronRight className="w-4 h-4 text-muted-foreground flex-shrink-0" />
            )
          )}
          <span className="truncate">{group.referencia}</span>
          {hasMultipleLocations && (
            <Badge variant="secondary" className="text-xs flex-shrink-0">
              {group.rows.length}
            </Badge>
          )}
        </div>
        
        {/* Tipo */}
        <div className="w-[60px] min-w-[60px] px-2">
          <Badge variant="outline" className={`text-xs ${group.materialType === 'MP' ? 'border-orange-500/50 text-orange-600' : 'border-emerald-500/50 text-emerald-600'}`}>
            {group.materialType}
          </Badge>
        </div>
        
        {/* Info */}
        <div className="w-[50px] min-w-[50px] px-2" onClick={e => e.stopPropagation()}>
          {!hasMultipleLocations && <LocationInfoPopover row={row} />}
        </div>
        
        {/* ERP */}
        <div className="w-[80px] min-w-[80px] px-2 text-right font-bold">{group.cantTotalErp}</div>
        
        {/* C1-C5 */}
        <div className="w-[60px] min-w-[60px] px-2 text-right">{renderCountCell(group.totals.c1, group.cantTotalErp, 1, group.auditRound)}</div>
        <div className="w-[60px] min-w-[60px] px-2 text-right">{renderCountCell(group.totals.c2, group.cantTotalErp, 2, group.auditRound)}</div>
        <div className="w-[60px] min-w-[60px] px-2 text-right">{renderCountCell(group.totals.c3, group.cantTotalErp, 3, group.auditRound)}</div>
        <div className="w-[60px] min-w-[60px] px-2 text-right">{renderCountCell(group.totals.c4, group.cantTotalErp, 4, group.auditRound)}</div>
        <div className="w-[60px] min-w-[60px] px-2 text-right">{renderCountCell(group.totals.c5, group.cantTotalErp, 5, group.auditRound)}</div>
        
        {/* Estado */}
        <div className="w-[110px] min-w-[110px] px-2">{getStatusBadge(group.statusSlug)}</div>
        
        {/* Acciones */}
        <div className="w-[50px] min-w-[50px] px-2" onClick={e => e.stopPropagation()}>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="h-7 w-7">
                <MoreVertical className="w-4 h-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => handleViewHistory(group.referencia, group.countHistory)}>
                <History className="w-4 h-4 mr-2" />
                Ver Historial
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => openValidateDialog(group)}>
                <CheckCircle2 className="w-4 h-4 mr-2 text-green-600" />
                Validar Manualmente
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => openForceCloseDialog(group)}>
                <XCircle className="w-4 h-4 mr-2 text-red-600" />
                Cerrar Forzado
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => openEditCountDialog(group)}>
                <Edit3 className="w-4 h-4 mr-2" />
                Editar Conteo
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
    );
  };

  const renderSubRow = (group: GroupedReference, row: AuditRow, subIndex: number) => {
    const isValidated = row.validatedAtRound !== null;
    const isDiscovered = row.discoveredAtRound !== null;

    return (
      <div 
        key={row.locationId}
        className={`flex items-center h-11 border-b border-border ${isValidated ? 'bg-green-500/10' : isDiscovered ? 'bg-amber-500/10' : 'bg-muted/20'} hover:bg-muted/40`}
      >
        {/* Referencia - sub row */}
        <div className="w-[180px] min-w-[180px] px-3 pl-10">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-muted-foreground text-sm">
              {subIndex === group.rows.length - 1 ? '└' : '├'} Ubic {subIndex + 1}
            </span>
            {isDiscovered && (
              <Badge className="bg-amber-500/20 text-amber-600 border-amber-500/30 text-[10px]">
                C{row.discoveredAtRound}
              </Badge>
            )}
            {isValidated && (
              <Badge className="bg-green-500/20 text-green-600 border-green-500/30 text-[10px] gap-1">
                <CheckCircle2 className="w-3 h-3" />
                C{row.validatedAtRound}
              </Badge>
            )}
          </div>
        </div>
        
        {/* Tipo - empty */}
        <div className="w-[60px] min-w-[60px] px-2"></div>
        
        {/* Info */}
        <div className="w-[50px] min-w-[50px] px-2">
          <LocationInfoPopover row={row} />
        </div>
        
        {/* ERP - empty */}
        <div className="w-[80px] min-w-[80px] px-2 text-right text-muted-foreground">-</div>
        
        {/* C1-C5 */}
        <div className="w-[60px] min-w-[60px] px-2 text-right">{renderCountCell(row.counts.c1, row.cantTotalErp, 1, row.auditRound, row.discoveredAtRound)}</div>
        <div className="w-[60px] min-w-[60px] px-2 text-right">{renderCountCell(row.counts.c2, row.cantTotalErp, 2, row.auditRound, row.discoveredAtRound)}</div>
        <div className="w-[60px] min-w-[60px] px-2 text-right">{renderCountCell(row.counts.c3, row.cantTotalErp, 3, row.auditRound, row.discoveredAtRound)}</div>
        <div className="w-[60px] min-w-[60px] px-2 text-right">{renderCountCell(row.counts.c4, row.cantTotalErp, 4, row.auditRound, row.discoveredAtRound)}</div>
        <div className="w-[60px] min-w-[60px] px-2 text-right">{renderCountCell(row.counts.c5, row.cantTotalErp, 5, row.auditRound, row.discoveredAtRound)}</div>
        
        {/* Estado - empty */}
        <div className="w-[110px] min-w-[110px] px-2"></div>
        
        {/* Acciones - empty */}
        <div className="w-[50px] min-w-[50px] px-2"></div>
      </div>
    );
  };

  return (
    <AppLayout title="Auditoría General" showBackButton>
      <div className="space-y-4">
        {/* Filters */}
        <div className="flex flex-col lg:flex-row gap-4">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder="Buscar por referencia..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9"
            />
          </div>

          <div className="flex flex-wrap gap-2">
            <Select value={materialTypeFilter} onValueChange={setMaterialTypeFilter}>
              <SelectTrigger className="w-[140px]">
                <SelectValue placeholder="Tipo" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos los tipos</SelectItem>
                <SelectItem value="MP">Materia Prima</SelectItem>
                <SelectItem value="PP">Producto Proceso</SelectItem>
              </SelectContent>
            </Select>

            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-[160px]">
                <SelectValue placeholder="Estado" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos los estados</SelectItem>
                <SelectItem value="pendiente">Pendiente</SelectItem>
                <SelectItem value="auditado">Auditado</SelectItem>
                <SelectItem value="conflicto">Conflicto</SelectItem>
                <SelectItem value="critico">Crítico</SelectItem>
                <SelectItem value="cerrado_forzado">Cerrado Forzado</SelectItem>
              </SelectContent>
            </Select>

            <Select value={locationFilter} onValueChange={setLocationFilter}>
              <SelectTrigger className="w-[180px]">
                <SelectValue placeholder="Ubicación" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todas las ubicaciones</SelectItem>
                {locationOptions?.map(loc => (
                  <SelectItem key={loc} value={loc}>{loc}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* Stats bar */}
        <div className="flex items-center justify-between py-2 px-4 bg-muted/30 rounded-lg border border-border">
          <div className="flex items-center gap-4">
            <span className="text-sm font-medium">
              {auditData?.totalReferences || 0} referencias
            </span>
            <span className="text-sm text-muted-foreground">
              ({auditData?.totalLocations || 0} ubicaciones)
            </span>
          </div>
          <div className="flex items-center gap-3">
            {isFetching && (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="w-4 h-4 animate-spin" />
                Actualizando...
              </div>
            )}
            {(debouncedSearch || materialTypeFilter !== 'all' || statusFilter !== 'all' || locationFilter !== 'all') && (
              <Button 
                variant="ghost" 
                size="sm"
                onClick={() => {
                  setSearchQuery('');
                  setMaterialTypeFilter('all');
                  setStatusFilter('all');
                  setLocationFilter('all');
                }}
              >
                Limpiar filtros
              </Button>
            )}
          </div>
        </div>

        {/* Excel-like Table */}
        <div className="rounded-lg border border-border overflow-hidden">
          {/* Header */}
          <div className="flex items-center bg-muted/50 border-b border-border font-semibold text-sm sticky top-0 z-10">
            <div className="w-[180px] min-w-[180px] px-3 py-3">Referencia</div>
            <div className="w-[60px] min-w-[60px] px-2 py-3">Tipo</div>
            <div className="w-[50px] min-w-[50px] px-2 py-3">Info</div>
            <div className="w-[80px] min-w-[80px] px-2 py-3 text-right">ERP</div>
            <div className="w-[60px] min-w-[60px] px-2 py-3 text-right">C1</div>
            <div className="w-[60px] min-w-[60px] px-2 py-3 text-right">C2</div>
            <div className="w-[60px] min-w-[60px] px-2 py-3 text-right">C3</div>
            <div className="w-[60px] min-w-[60px] px-2 py-3 text-right">C4</div>
            <div className="w-[60px] min-w-[60px] px-2 py-3 text-right">C5</div>
            <div className="w-[110px] min-w-[110px] px-2 py-3">Estado</div>
            <div className="w-[50px] min-w-[50px] px-2 py-3">Acción</div>
          </div>

          {/* Body with scroll */}
          {isLoading ? (
            <div className="p-4 space-y-2">
              {Array.from({ length: 15 }).map((_, i) => (
                <Skeleton key={i} className="h-10 w-full" />
              ))}
            </div>
          ) : groupedData.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
              <FileSearch className="w-12 h-12 mb-4" />
              <span className="text-lg">No se encontraron registros</span>
            </div>
          ) : (
            <ScrollArea className="h-[calc(100vh-320px)]">
              <div className="min-w-fit">
                {groupedData.map(group => (
                  <React.Fragment key={group.referencia}>
                    {renderMainRow(group)}
                    {expandedRefs.has(group.referencia) && group.rows.length > 1 && 
                      group.rows.map((row, idx) => renderSubRow(group, row, idx))
                    }
                  </React.Fragment>
                ))}
              </div>
            </ScrollArea>
          )}
        </div>
      </div>

      {/* History Dialog */}
      <Dialog open={historyDialogOpen} onOpenChange={setHistoryDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Historial de Conteos - {selectedHistory?.referencia}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 max-h-[400px] overflow-y-auto">
            {selectedHistory?.history && selectedHistory.history.length > 0 ? (
              selectedHistory.history.map((entry, idx) => (
                <div key={idx} className="p-4 rounded-lg bg-muted/50 border border-border">
                  <div className="flex items-center justify-between mb-2">
                    <Badge variant="outline">{entry.action || `Ronda ${entry.round}`}</Badge>
                    {entry.closed_by_superadmin && (
                      <Badge variant="destructive">Cerrado por Superadmin</Badge>
                    )}
                  </div>
                  {entry.reason && (
                    <p className="text-sm text-muted-foreground mb-2">{entry.reason}</p>
                  )}
                  <div className="grid grid-cols-2 gap-2 text-sm">
                    {entry.sum_c1 !== undefined && (
                      <div>
                        <span className="text-muted-foreground">C1:</span>{' '}
                        <span className="font-medium">{entry.sum_c1}</span>
                      </div>
                    )}
                    {entry.sum_c2 !== undefined && (
                      <div>
                        <span className="text-muted-foreground">C2:</span>{' '}
                        <span className="font-medium">{entry.sum_c2}</span>
                      </div>
                    )}
                    {entry.sum !== undefined && (
                      <div>
                        <span className="text-muted-foreground">Suma:</span>{' '}
                        <span className="font-medium">{entry.sum}</span>
                      </div>
                    )}
                    {entry.erp !== undefined && (
                      <div>
                        <span className="text-muted-foreground">ERP:</span>{' '}
                        <span className="font-medium">{entry.erp}</span>
                      </div>
                    )}
                  </div>
                </div>
              ))
            ) : (
              <div className="text-center py-8 text-muted-foreground">
                No hay historial de conteos registrado
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* Validate Dialog */}
      <Dialog open={validateDialogOpen} onOpenChange={setValidateDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Validar Referencia: {selectedReference?.referencia}</DialogTitle>
            <DialogDescription>
              Ingresa la cantidad validada para cerrar esta referencia.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label className="text-muted-foreground text-xs">Cantidad ERP</Label>
                <div className="text-2xl font-bold">{selectedReference?.cantTotalErp}</div>
              </div>
              <div>
                <Label className="text-muted-foreground text-xs">Última Suma</Label>
                <div className="text-2xl font-bold">
                  {selectedReference?.totals.c5 ?? selectedReference?.totals.c4 ?? selectedReference?.totals.c3 ?? selectedReference?.totals.c2 ?? selectedReference?.totals.c1 ?? '-'}
                </div>
              </div>
            </div>
            <div>
              <Label htmlFor="validateQty">Cantidad Validada</Label>
              <Input
                id="validateQty"
                type="number"
                value={validateQuantity}
                onChange={(e) => setValidateQuantity(e.target.value)}
                placeholder="Ingrese cantidad"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setValidateDialogOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={handleValidateManually} disabled={isSubmitting}>
              {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Validar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Force Close Dialog */}
      <Dialog open={forceCloseDialogOpen} onOpenChange={setForceCloseDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Cerrar Forzado: {selectedReference?.referencia}</DialogTitle>
            <DialogDescription>
              Esta acción cerrará la referencia sin completar el proceso de auditoría. No se puede deshacer.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="grid grid-cols-3 gap-4 text-center">
              <div>
                <Label className="text-muted-foreground text-xs">ERP</Label>
                <div className="text-xl font-bold">{selectedReference?.cantTotalErp}</div>
              </div>
              <div>
                <Label className="text-muted-foreground text-xs">Ronda Actual</Label>
                <div className="text-xl font-bold">{selectedReference?.auditRound}</div>
              </div>
              <div>
                <Label className="text-muted-foreground text-xs">Estado</Label>
                <div className="pt-1">{selectedReference && getStatusBadge(selectedReference.statusSlug)}</div>
              </div>
            </div>
            <div>
              <Label htmlFor="reason">Motivo del cierre *</Label>
              <Textarea
                id="reason"
                placeholder="Describe el motivo del cierre forzado..."
                value={forceCloseReason}
                onChange={(e) => setForceCloseReason(e.target.value)}
                rows={3}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setForceCloseDialogOpen(false)}>
              Cancelar
            </Button>
            <Button variant="destructive" onClick={handleForceClose} disabled={isSubmitting}>
              {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Cerrar Referencia
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Count Dialog */}
      <Dialog open={editCountDialogOpen} onOpenChange={setEditCountDialogOpen}>
        <DialogContent className="max-w-4xl max-h-[80vh]">
          <DialogHeader>
            <DialogTitle>Editar Conteos: {selectedReference?.referencia}</DialogTitle>
            <DialogDescription>
              Modifica los valores de conteo para cada ubicación.
            </DialogDescription>
          </DialogHeader>
          <ScrollArea className="max-h-[50vh]">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Ubicación</TableHead>
                  <TableHead className="w-20 text-center">C1</TableHead>
                  <TableHead className="w-20 text-center">C2</TableHead>
                  <TableHead className="w-20 text-center">C3</TableHead>
                  <TableHead className="w-20 text-center">C4</TableHead>
                  <TableHead className="w-20 text-center">C5</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {selectedReference?.rows.map((row) => (
                  <TableRow key={row.locationId}>
                    <TableCell className="font-medium">
                      {row.locationName || row.locationDetail || 'Sin nombre'}
                    </TableCell>
                    {[1, 2, 3, 4, 5].map((round) => {
                      const key = `c${round}` as 'c1' | 'c2' | 'c3' | 'c4' | 'c5';
                      return (
                        <TableCell key={round}>
                          <Input
                            type="number"
                            className="w-20 text-center"
                            value={editingCounts[row.locationId]?.[key] ?? ''}
                            onChange={(e) =>
                              setEditingCounts((prev) => ({
                                ...prev,
                                [row.locationId]: {
                                  ...prev[row.locationId],
                                  [key]: e.target.value,
                                },
                              }))
                            }
                            placeholder="-"
                          />
                        </TableCell>
                      );
                    })}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </ScrollArea>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditCountDialogOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={handleSaveEditedCounts} disabled={isSubmitting}>
              {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Guardar Cambios
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AppLayout>
  );
};

export default Auditoria;
