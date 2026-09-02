import React, { useState, useMemo, useCallback } from 'react';
import { useInfiniteQuery, useQuery, useQueryClient } from '@tanstack/react-query';
import { useSearchParams } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useInventory } from '@/contexts/InventoryContext';
import { useAuth } from '@/contexts/AuthContext';
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
  Loader2,
  Download,
} from 'lucide-react';
import { useExportToExcel } from '@/hooks/useExportToExcel';
import { formatQty, formatSignedQty, descuadreColorClass } from '@/lib/format';
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
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Skeleton } from '@/components/ui/skeleton';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Switch } from '@/components/ui/switch';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';

const PAGE_SIZE = 200;
const ID_BATCH = 100;

interface PtLocRow {
  locationId: string;
  referencia: string;
  piso: string;
  prodc: string | null;
  ubic: string | null;
  linea: string | null;
  ue: number | null;
  discoveredAtRound: number | null;
  validatedQuantity: number | null;
  validatedAtRound: number | null;
  validationReason: string | null;
  counts: { c1: number | null; c2: number | null; c3: number | null; c4: number | null };
}

interface PtGroupedRef {
  referencia: string;
  descripcion: string | null;
  erp: number;
  status: string;
  round: number;
  countHistory: unknown;
  rows: PtLocRow[];
  totals: { c1: number | null; c2: number | null; c3: number | null; c4: number | null };
  totalValidado: number;
  descuadre: number;
}

const STATUS_CONFIG: Record<string, { label: string; className: string }> = {
  pendiente: { label: 'Pendiente', className: 'bg-yellow-100 text-yellow-800 border-yellow-300 dark:bg-yellow-900/30 dark:text-yellow-400 dark:border-yellow-700' },
  auditado: { label: 'Auditado', className: 'bg-green-100 text-green-800 border-green-300 dark:bg-green-900/30 dark:text-green-400 dark:border-green-700' },
  conflicto: { label: 'Conflicto', className: 'bg-orange-100 text-orange-800 border-orange-300 dark:bg-orange-900/30 dark:text-orange-400 dark:border-orange-700' },
  critico: { label: 'Crítico', className: 'bg-red-100 text-red-800 border-red-300 dark:bg-red-900/30 dark:text-red-400 dark:border-red-700' },
  cerrado_forzado: { label: 'Cerrado Forzado', className: 'bg-purple-100 text-purple-800 border-purple-300 dark:bg-purple-900/30 dark:text-purple-400 dark:border-purple-700' },
  'n/a': { label: 'N/A', className: 'bg-muted text-muted-foreground border-border' },
};

const LocationInfoPopover: React.FC<{ row: PtLocRow }> = ({ row }) => (
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
          <div><span className="text-muted-foreground">Piso:</span> <span className="font-medium">{row.piso}</span></div>
          <div><span className="text-muted-foreground">Prodc:</span> <span className="font-medium">{row.prodc || '-'}</span></div>
          <div><span className="text-muted-foreground">Ubic:</span> <span className="font-medium">{row.ubic || '-'}</span></div>
          <div><span className="text-muted-foreground">Línea:</span> <span className="font-medium">{row.linea || '-'}</span></div>
          <div><span className="text-muted-foreground">U.E:</span> <span className="font-medium">{row.ue ?? '-'}</span></div>
        </div>
      </div>
    </PopoverContent>
  </Popover>
);

const AuditoriaPtTable: React.FC = () => {
  const { user, role } = useAuth();
  const canEdit = role !== 'visualizador';

  const queryClient = useQueryClient();
  const { inventoryId, isReadOnly } = useInventory();
  const { isExporting, exportAuditoriaPT } = useExportToExcel();
  const [searchParams] = useSearchParams();
  const initialStatus = searchParams.get('status') || 'all';
  const initialRef = searchParams.get('ref') || '';

  const [searchQuery, setSearchQuery] = useState(initialRef);
  const [debouncedSearch, setDebouncedSearch] = useState(initialRef);
  const [statusFilter, setStatusFilter] = useState(initialStatus);
  const [pisoFilter, setPisoFilter] = useState('all');
  const [multiFloorOnly, setMultiFloorOnly] = useState(false);
  const [expandedRefs, setExpandedRefs] = useState<Set<string>>(new Set());

  const [historyDialogOpen, setHistoryDialogOpen] = useState(false);
  const [selectedHistory, setSelectedHistory] = useState<{ referencia: string; history: any[] } | null>(null);
  const [forceCloseDialogOpen, setForceCloseDialogOpen] = useState(false);
  const [editCountDialogOpen, setEditCountDialogOpen] = useState(false);
  const [selectedReference, setSelectedReference] = useState<PtGroupedRef | null>(null);
  const [forceCloseReason, setForceCloseReason] = useState('');
  const [editingCounts, setEditingCounts] = useState<Record<string, { c1?: string; c2?: string; c3?: string; c4?: string }>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);

  React.useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(searchQuery), 300);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  const queryKeyBase = ['audit-pt', inventoryId, debouncedSearch, statusFilter, pisoFilter];

  const { data: pisoOptions } = useQuery({
    queryKey: ['audit-pt-pisos', inventoryId],
    enabled: !!inventoryId,
    staleTime: 10 * 60 * 1000,
    queryFn: async () => {
      const pisos = new Set<string>();
      let from = 0;
      // eslint-disable-next-line no-constant-condition
      while (true) {
        const { data, error } = await supabase
          .from('pt_locations')
          .select('piso')
          .eq('inventory_id', inventoryId!)
          .range(from, from + 999);
        if (error) throw error;
        if (!data || data.length === 0) break;
        data.forEach((d) => d.piso && pisos.add(d.piso));
        if (data.length < 1000) break;
        from += 1000;
      }
      return [...pisos].sort((a, b) => a.localeCompare(b, 'es', { numeric: true }));
    },
  });

  const { data: totalRefs } = useQuery({
    queryKey: [...queryKeyBase, 'count'],
    enabled: !!inventoryId,
    queryFn: async () => {
      let q = supabase
        .from('pt_master')
        .select('id', { count: 'exact', head: true })
        .eq('inventory_id', inventoryId!);
      if (debouncedSearch) q = q.or(`referencia.ilike.%${debouncedSearch}%,descripcion.ilike.%${debouncedSearch}%`);
      if (statusFilter !== 'all') q = q.eq('status_slug', statusFilter);
      const { count, error } = await q;
      if (error) throw error;
      return count || 0;
    },
  });

  const {
    data,
    isLoading,
    isFetching,
    isFetchingNextPage,
    hasNextPage,
    fetchNextPage,
  } = useInfiniteQuery({
    queryKey: queryKeyBase,
    enabled: !!inventoryId,
    initialPageParam: 0,
    staleTime: 60 * 1000,
    getNextPageParam: (lastPage: { groups: PtGroupedRef[]; nextOffset: number | null }) => lastPage.nextOffset,
    queryFn: async ({ pageParam }) => {
      const offset = pageParam as number;
      let q = supabase
        .from('pt_master')
        .select('referencia, descripcion, cant_erp, status_slug, audit_round, count_history')
        .eq('inventory_id', inventoryId!)
        .order('referencia')
        .range(offset, offset + PAGE_SIZE - 1);

      if (debouncedSearch) q = q.or(`referencia.ilike.%${debouncedSearch}%,descripcion.ilike.%${debouncedSearch}%`);
      if (statusFilter !== 'all') q = q.eq('status_slug', statusFilter);

      const { data: masters, error } = await q;
      if (error) throw error;
      if (!masters || masters.length === 0) return { groups: [], nextOffset: null };

      const refs = masters.map((m) => m.referencia);

      // Ubicaciones
      const locs: {
        id: string; referencia: string; piso: string; prodc: string | null; ubic: string | null;
        linea: string | null; ue: number | null; discovered_at_round: number | null;
      }[] = [];
      for (let i = 0; i < refs.length; i += ID_BATCH) {
        let lq = supabase
          .from('pt_locations')
          .select('id, referencia, piso, prodc, ubic, linea, ue, discovered_at_round, orden')
          .eq('inventory_id', inventoryId!)
          .eq('activo', true)
          .in('referencia', refs.slice(i, i + ID_BATCH))
          .order('piso')
          .order('orden');
        if (pisoFilter !== 'all') lq = lq.eq('piso', pisoFilter);
        const { data: batch, error: lErr } = await lq;
        if (lErr) throw lErr;
        if (batch) locs.push(...batch);
      }

      const locationIds = locs.map((l) => l.id);

      // Conteos
      const counts: { location_id: string; audit_round: number; quantity_counted: number }[] = [];
      for (let i = 0; i < locationIds.length; i += ID_BATCH) {
        const { data: batch, error: cErr } = await supabase
          .from('pt_counts')
          .select('location_id, audit_round, quantity_counted')
          .eq('inventory_id', inventoryId!)
          .in('location_id', locationIds.slice(i, i + ID_BATCH));
        if (cErr) throw cErr;
        if (batch) counts.push(...batch);
      }

      // Validaciones
      const validated: { location_id: string; validated_quantity: number; audit_round: number; reason: string }[] = [];
      for (let i = 0; i < locationIds.length; i += ID_BATCH) {
        const { data: batch, error: vErr } = await supabase
          .from('pt_validated_counts')
          .select('location_id, validated_quantity, audit_round, reason')
          .eq('inventory_id', inventoryId!)
          .in('location_id', locationIds.slice(i, i + ID_BATCH));
        if (vErr) throw vErr;
        if (batch) validated.push(...batch);
      }
      const validatedMap = new Map(validated.map((v) => [v.location_id, v]));

      const countsMap = new Map<string, PtLocRow['counts']>();
      locationIds.forEach((id) => countsMap.set(id, { c1: null, c2: null, c3: null, c4: null }));
      counts.forEach((c) => {
        const entry = countsMap.get(c.location_id);
        if (!entry) return;
        const key = `c${c.audit_round}` as keyof PtLocRow['counts'];
        if (key in entry) entry[key] = Number(c.quantity_counted);
      });

      const rowsByRef = new Map<string, PtLocRow[]>();
      locs.forEach((l) => {
        const v = validatedMap.get(l.id);
        const row: PtLocRow = {
          locationId: l.id,
          referencia: l.referencia,
          piso: l.piso,
          prodc: l.prodc,
          ubic: l.ubic,
          linea: l.linea,
          ue: l.ue !== null && l.ue !== undefined ? Number(l.ue) : null,
          discoveredAtRound: l.discovered_at_round,
          validatedQuantity: v ? Number(v.validated_quantity) : null,
          validatedAtRound: v ? v.audit_round : null,
          validationReason: v ? v.reason : null,
          counts: countsMap.get(l.id) || { c1: null, c2: null, c3: null, c4: null },
        };
        const arr = rowsByRef.get(l.referencia) || [];
        arr.push(row);
        rowsByRef.set(l.referencia, arr);
      });

      const sum = (rows: PtLocRow[], key: keyof PtLocRow['counts']) => {
        const vals = rows.map((r) => r.counts[key]).filter((v) => v !== null) as number[];
        return vals.length > 0 ? vals.reduce((a, b) => a + b, 0) : null;
      };

      const groups: PtGroupedRef[] = masters
        .map((m) => {
          const rows = rowsByRef.get(m.referencia) || [];
          const erp = Number(m.cant_erp ?? 0);
          const totalValidado = rows.reduce((acc, r) => acc + (r.validatedQuantity ?? 0), 0);
          return {
            referencia: m.referencia,
            descripcion: m.descripcion,
            erp,
            status: m.status_slug || 'pendiente',
            round: m.audit_round || 1,
            countHistory: m.count_history ?? [],
            rows,
            totals: {
              c1: sum(rows, 'c1'),
              c2: sum(rows, 'c2'),
              c3: sum(rows, 'c3'),
              c4: sum(rows, 'c4'),
            },
            totalValidado,
            descuadre: totalValidado - erp,
          };
        })
        // si hay filtro de piso, solo referencias con ubicaciones en ese piso
        .filter((g) => (pisoFilter === 'all' ? true : g.rows.length > 0));

      return {
        groups,
        nextOffset: masters.length < PAGE_SIZE ? null : offset + PAGE_SIZE,
      };
    },
  });

  const groupedData = useMemo<PtGroupedRef[]>(() => {
    const all = data?.pages.flatMap((p) => p.groups) ?? [];
    return multiFloorOnly ? all.filter((g) => new Set(g.rows.map((r) => r.piso)).size > 1) : all;
  }, [data, multiFloorOnly]);

  const loadedRefs = data?.pages.reduce((acc, p) => acc + p.groups.length, 0) || 0;

  const toggleExpand = useCallback((referencia: string) => {
    setExpandedRefs((prev) => {
      const next = new Set(prev);
      next.has(referencia) ? next.delete(referencia) : next.add(referencia);
      return next;
    });
  }, []);

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['audit-pt'] });

  const handleValidateNow = async (group: PtGroupedRef) => {
    if (!user || !inventoryId) return;
    if (isReadOnly) { toast.error('Inventario histórico: solo lectura'); return; }
    try {
      const { data: res, error } = await supabase.rpc('pt_validate_and_close_round', {
        _inventory_id: inventoryId,
        _referencia: group.referencia,
        _user_id: user.id,
      });
      if (error) throw error;
      const r = res as any;
      if (r?.success === false) {
        if (r.action === 'waiting_for_counts') {
          toast.warning(`Faltan ${r.missing_locations} ubicación(es) por contar en C${r.round}`);
        } else {
          toast.error(r?.error || 'No fue posible validar');
        }
      } else if (r?.action === 'closed') {
        toast.success(`Referencia cerrada (${r.reason}) · total ${r.total} vs ERP ${r.erp}`);
      } else if (r?.action === 'next_round') {
        toast.info(`Pasa a Conteo ${r.new_round} · ${r.pending_locations} ubicación(es) en conflicto`);
      } else if (r?.action === 'escalate_to_superadmin') {
        toast.warning('Referencia escalada: requiere cierre forzado');
      } else {
        toast.info(r?.reason || 'Sin cambios');
      }
      await invalidate();
    } catch (error: any) {
      toast.error('Error al validar: ' + error.message);
    }
  };

  const handleForceClose = async () => {
    if (!selectedReference || !user || !inventoryId) return;
    if (isReadOnly) { toast.error('Inventario histórico: solo lectura'); return; }
    if (!forceCloseReason.trim()) { toast.error('Debes ingresar un motivo'); return; }
    setIsSubmitting(true);
    try {
      for (const row of selectedReference.rows) {
        if (row.validatedAtRound !== null) continue;
        const qty = row.counts.c4 ?? row.counts.c3 ?? row.counts.c2 ?? row.counts.c1 ?? 0;
        const round = row.counts.c4 !== null ? 4 : row.counts.c3 !== null ? 3 : row.counts.c2 !== null ? 2 : 1;

        const { error: rpcError } = await supabase.rpc('pt_upsert_validated_count', {
          _inventory_id: inventoryId,
          _referencia: selectedReference.referencia,
          _location_id: row.locationId,
          _quantity: qty,
          _round: round,
          _reason: `cierre_forzado: ${forceCloseReason}`,
          _validated_by: user.id,
        });
        if (rpcError) throw rpcError;

        const { error: locError } = await supabase
          .from('pt_locations')
          .update({ validated_at_round: round, validated_quantity: qty, terminado: true })
          .eq('id', row.locationId);
        if (locError) throw locError;
      }

      const existingHistory = Array.isArray(selectedReference.countHistory) ? selectedReference.countHistory : [];
      const newHistory = [...existingHistory, {
        action: 'cierre_forzado',
        reason: forceCloseReason,
        timestamp: new Date().toISOString(),
        user_id: user.id,
      }];

      const { error: masterError } = await supabase
        .from('pt_master')
        .update({ status_slug: 'cerrado_forzado', count_history: newHistory })
        .eq('inventory_id', inventoryId)
        .eq('referencia', selectedReference.referencia);
      if (masterError) throw masterError;

      await supabase.from('audit_logs').insert({
        action_type: 'pt_cierre_forzado',
        master_reference: selectedReference.referencia,
        new_data: { reason: forceCloseReason, inventory_id: inventoryId },
        round_number: selectedReference.round,
        user_id: user.id,
      });

      toast.success('Referencia cerrada forzadamente');
      setForceCloseDialogOpen(false);
      await invalidate();
    } catch (error: any) {
      toast.error('Error al cerrar: ' + error.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSaveEditedCounts = async () => {
    if (!selectedReference || !user || !inventoryId) return;
    if (isReadOnly) { toast.error('Inventario histórico: solo lectura'); return; }
    setIsSubmitting(true);
    try {
      const upserts: {
        inventory_id: string; location_id: string; audit_round: number;
        quantity_counted: number; supervisor_id: string;
      }[] = [];

      for (const row of selectedReference.rows) {
        const edited = editingCounts[row.locationId];
        if (!edited) continue;
        for (let round = 1; round <= 4; round++) {
          const key = `c${round}` as 'c1' | 'c2' | 'c3' | 'c4';
          const value = edited[key];
          if (value === '' || value === undefined) continue;
          const parsed = parseFloat(value);
          if (isNaN(parsed)) continue;
          if (parsed === row.counts[key]) continue;
          upserts.push({
            inventory_id: inventoryId,
            location_id: row.locationId,
            audit_round: round,
            quantity_counted: parsed,
            supervisor_id: user.id,
          });
        }
      }

      if (upserts.length > 0) {
        const { error } = await supabase
          .from('pt_counts')
          .upsert(upserts, { onConflict: 'location_id,audit_round' });
        if (error) throw error;
      }

      await supabase.from('audit_logs').insert({
        action_type: 'pt_edicion_conteo',
        master_reference: selectedReference.referencia,
        new_data: { cambios: upserts.length, inventory_id: inventoryId },
        user_id: user.id,
      });

      toast.success('Conteos actualizados');
      setEditCountDialogOpen(false);
      await handleValidateNow(selectedReference);
      await invalidate();
    } catch (error: any) {
      toast.error('Error al guardar: ' + error.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  const renderCountCell = (value: number | null, erp: number, round: number, currentRound: number, discoveredAtRound: number | null = null) => {
    if (discoveredAtRound !== null && round < discoveredAtRound) return <span className="text-muted-foreground/50">-</span>;
    if (value === null) return <span className="text-muted-foreground">-</span>;
    const matchesErp = value === erp;
    const isCurrentRound = round <= currentRound;
    return (
      <span className={`font-medium ${matchesErp ? 'text-green-600 dark:text-green-400' : isCurrentRound ? 'text-foreground' : 'text-muted-foreground'}`}>
        {formatQty(value)}
      </span>
    );
  };

  const getStatusBadge = (status: string) => {
    const config = STATUS_CONFIG[status] || STATUS_CONFIG.pendiente;
    return <Badge variant="outline" className={`whitespace-nowrap text-xs ${config.className}`}>{config.label}</Badge>;
  };

  const renderMainRow = (group: PtGroupedRef) => {
    const hasLocations = group.rows.length > 0;
    const isExpanded = expandedRefs.has(group.referencia);
    const hasValidation = group.totalValidado > 0;

    return (
      <div
        key={group.referencia}
        className={`flex items-center h-11 border-b border-border hover:bg-muted/30 ${hasLocations ? 'cursor-pointer' : ''}`}
        onClick={() => hasLocations && toggleExpand(group.referencia)}
      >
        <div className="w-[170px] min-w-[170px] px-3 font-medium flex items-center gap-2 truncate">
          {hasLocations && (isExpanded ? <ChevronDown className="w-4 h-4 text-muted-foreground flex-shrink-0" /> : <ChevronRight className="w-4 h-4 text-muted-foreground flex-shrink-0" />)}
          <span className="truncate">{group.referencia}</span>
          {group.rows.length > 0 && <Badge variant="secondary" className="text-xs flex-shrink-0">{group.rows.length}</Badge>}
        </div>
        <div className="w-[220px] min-w-[220px] px-2 text-sm text-muted-foreground truncate" title={group.descripcion || ''}>
          {group.descripcion || '-'}
        </div>
        <div className="w-[100px] min-w-[100px] px-2 text-right font-bold">{formatQty(group.erp)}</div>
        <div className="w-[70px] min-w-[70px] px-2 text-right">{renderCountCell(group.totals.c1, group.erp, 1, group.round)}</div>
        <div className="w-[70px] min-w-[70px] px-2 text-right">{renderCountCell(group.totals.c2, group.erp, 2, group.round)}</div>
        <div className="w-[70px] min-w-[70px] px-2 text-right">{renderCountCell(group.totals.c3, group.erp, 3, group.round)}</div>
        <div className="w-[70px] min-w-[70px] px-2 text-right">{renderCountCell(group.totals.c4, group.erp, 4, group.round)}</div>
        <div className="w-[90px] min-w-[90px] px-2 text-right font-medium">{hasValidation ? formatQty(group.totalValidado) : '-'}</div>
        <div className="w-[90px] min-w-[90px] px-2 text-right">
          {hasValidation ? (
            <span className={`font-medium ${descuadreColorClass(group.descuadre)}`}>
              {formatSignedQty(group.descuadre)}
            </span>
          ) : (
            <span className="text-muted-foreground">—</span>
          )}
        </div>
        <div className="w-[110px] min-w-[110px] px-2 text-right text-sm text-muted-foreground" title="PT aún no tiene costo unitario cargado">—</div>
        <div className="w-[110px] min-w-[110px] px-2">{getStatusBadge(group.status)}</div>
        <div className="w-[60px] min-w-[60px] px-2 text-center text-sm text-muted-foreground">C{group.round}</div>
        {canEdit && (
        <div className="w-[50px] min-w-[50px] px-2" onClick={(e) => e.stopPropagation()}>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="h-7 w-7"><MoreVertical className="w-4 h-4" /></Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => { setSelectedHistory({ referencia: group.referencia, history: Array.isArray(group.countHistory) ? group.countHistory : [] }); setHistoryDialogOpen(true); }}>
                <History className="w-4 h-4 mr-2" />Ver Historial
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => handleValidateNow(group)}>
                <CheckCircle2 className="w-4 h-4 mr-2 text-green-600" />Validar ahora
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => { setSelectedReference(group); setForceCloseReason(''); setForceCloseDialogOpen(true); }}>
                <XCircle className="w-4 h-4 mr-2 text-red-600" />Cerrar Forzado
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                disabled={!hasLocations}
                onClick={() => {
                  setSelectedReference(group);
                  const initial: typeof editingCounts = {};
                  group.rows.forEach((r) => {
                    initial[r.locationId] = {
                      c1: r.counts.c1?.toString() ?? '',
                      c2: r.counts.c2?.toString() ?? '',
                      c3: r.counts.c3?.toString() ?? '',
                      c4: r.counts.c4?.toString() ?? '',
                    };
                  });
                  setEditingCounts(initial);
                  setEditCountDialogOpen(true);
                }}
              >
                <Edit3 className="w-4 h-4 mr-2" />Editar Conteo
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
        )}
      </div>
    );
  };

  const renderSubRow = (group: PtGroupedRef, row: PtLocRow, subIndex: number) => {
    const isValidated = row.validatedAtRound !== null;
    const isDiscovered = (row.discoveredAtRound ?? 1) > 1;

    return (
      <div
        key={row.locationId}
        className={`flex items-center h-11 border-b border-border ${isValidated ? 'bg-green-500/10' : isDiscovered ? 'bg-amber-500/10' : 'bg-muted/20'} hover:bg-muted/40`}
      >
        <div className="w-[170px] min-w-[170px] px-3 pl-8">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-muted-foreground text-sm">{subIndex === group.rows.length - 1 ? '└' : '├'} Piso {row.piso}</span>
            {isDiscovered && <Badge className="bg-amber-500/20 text-amber-600 border-amber-500/30 text-[10px]">C{row.discoveredAtRound}</Badge>}
            {isValidated && <Badge className="bg-green-500/20 text-green-600 border-green-500/30 text-[10px] gap-1"><CheckCircle2 className="w-3 h-3" />C{row.validatedAtRound}</Badge>}
          </div>
        </div>
        <div className="w-[220px] min-w-[220px] px-2 text-sm text-muted-foreground flex items-center gap-2 truncate">
          <LocationInfoPopover row={row} />
          <span className="truncate">
            {[row.prodc, row.ubic, row.linea].filter(Boolean).join(' · ') || 'Sin detalle'}
            {row.ue ? ` · U.E ${row.ue}` : ''}
          </span>
        </div>
        <div className="w-[100px] min-w-[100px] px-2 text-right text-muted-foreground">-</div>
        <div className="w-[70px] min-w-[70px] px-2 text-right">{renderCountCell(row.counts.c1, group.erp, 1, group.round, row.discoveredAtRound)}</div>
        <div className="w-[70px] min-w-[70px] px-2 text-right">{renderCountCell(row.counts.c2, group.erp, 2, group.round, row.discoveredAtRound)}</div>
        <div className="w-[70px] min-w-[70px] px-2 text-right">{renderCountCell(row.counts.c3, group.erp, 3, group.round, row.discoveredAtRound)}</div>
        <div className="w-[70px] min-w-[70px] px-2 text-right">{renderCountCell(row.counts.c4, group.erp, 4, group.round, row.discoveredAtRound)}</div>
        <div className="w-[90px] min-w-[90px] px-2 text-right">{row.validatedQuantity !== null ? formatQty(row.validatedQuantity) : '-'}</div>
        <div className="w-[90px] min-w-[90px] px-2 text-right text-muted-foreground text-xs truncate" title={row.validationReason || ''}>{row.validationReason || '-'}</div>
        <div className="w-[110px] min-w-[110px] px-2"></div>
        <div className="w-[110px] min-w-[110px] px-2"></div>
        <div className="w-[60px] min-w-[60px] px-2"></div>
        {canEdit && <div className="w-[50px] min-w-[50px] px-2"></div>}
      </div>
    );
  };

  return (
    <div className="space-y-4">
      {/* Filtros */}
      <div className="flex flex-col lg:flex-row gap-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input placeholder="Buscar por referencia o descripción..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} className="pl-9" />
        </div>
        <div className="flex flex-wrap gap-2">
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-[160px]"><SelectValue placeholder="Estado" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos los estados</SelectItem>
              <SelectItem value="pendiente">Pendiente</SelectItem>
              <SelectItem value="auditado">Auditado</SelectItem>
              <SelectItem value="conflicto">Conflicto</SelectItem>
              <SelectItem value="critico">Crítico</SelectItem>
              <SelectItem value="cerrado_forzado">Cerrado Forzado</SelectItem>
              <SelectItem value="n/a">N/A</SelectItem>
            </SelectContent>
          </Select>
          <Select value={pisoFilter} onValueChange={setPisoFilter}>
            <SelectTrigger className="w-[150px]"><SelectValue placeholder="Piso" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos los pisos</SelectItem>
              {pisoOptions?.map((p) => <SelectItem key={p} value={p}>Piso {p}</SelectItem>)}
            </SelectContent>
          </Select>
          <div className="flex items-center gap-2 px-3 py-2 border rounded-lg bg-background">
            <Switch id="pt-multifloor" checked={multiFloorOnly} onCheckedChange={setMultiFloorOnly} />
            <Label htmlFor="pt-multifloor" className="text-sm cursor-pointer whitespace-nowrap">Varios pisos</Label>
          </div>
        </div>
      </div>

      {/* Barra de estado */}
      <div className="flex items-center justify-between py-2 px-4 bg-muted/30 rounded-lg border border-border">
        <div className="flex items-center gap-4">
          <span className="text-sm font-medium">{groupedData.length} referencias</span>
          <span className="text-sm text-muted-foreground">
            ({loadedRefs}{typeof totalRefs === 'number' ? ` de ${totalRefs}` : ''} cargadas)
          </span>
        </div>
        <div className="flex items-center gap-3">
          <Button
            variant="outline"
            size="sm"
            onClick={() => exportAuditoriaPT({ searchTerm: debouncedSearch, status: statusFilter, piso: pisoFilter })}
            disabled={isExporting}
          >
            <Download className="w-4 h-4 mr-2" />
            {isExporting ? 'Exportando...' : 'Exportar'}
          </Button>
          {isFetching && !isFetchingNextPage && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="w-4 h-4 animate-spin" />Actualizando...
            </div>
          )}
        </div>
      </div>

      {/* Tabla */}
      <div className="rounded-lg border border-border overflow-hidden">
        <ScrollArea className="w-full">
          <div className="min-w-fit">
            <div className="flex items-center bg-muted/50 border-b border-border font-semibold text-sm">
              <div className="w-[170px] min-w-[170px] px-3 py-3">Referencia</div>
              <div className="w-[220px] min-w-[220px] px-2 py-3">Descripción / Ubicación</div>
              <div className="w-[100px] min-w-[100px] px-2 py-3 text-right">ERP</div>
              <div className="w-[70px] min-w-[70px] px-2 py-3 text-right">C1</div>
              <div className="w-[70px] min-w-[70px] px-2 py-3 text-right">C2</div>
              <div className="w-[70px] min-w-[70px] px-2 py-3 text-right">C3</div>
              <div className="w-[70px] min-w-[70px] px-2 py-3 text-right">C4</div>
              <div className="w-[90px] min-w-[90px] px-2 py-3 text-right">Validado</div>
              <div className="w-[90px] min-w-[90px] px-2 py-3 text-right">Desc. (und)</div>
              <div className="w-[110px] min-w-[110px] px-2 py-3 text-right">Desc. ($)</div>
              <div className="w-[110px] min-w-[110px] px-2 py-3">Estado</div>
              <div className="w-[60px] min-w-[60px] px-2 py-3 text-center">Ronda</div>
              {canEdit && <div className="w-[50px] min-w-[50px] px-2 py-3">Acción</div>}
            </div>

            {isLoading ? (
              <div className="p-4 space-y-2">
                {Array.from({ length: 12 }).map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}
              </div>
            ) : groupedData.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
                <FileSearch className="w-12 h-12 mb-4" />
                <span className="text-lg">No hay referencias de Producto Terminado</span>
              </div>
            ) : (
              <ScrollArea className="h-[calc(100vh-380px)]">
                <div>
                  {groupedData.map((group) => (
                    <React.Fragment key={group.referencia}>
                      {renderMainRow(group)}
                      {expandedRefs.has(group.referencia) &&
                        group.rows.map((row, idx) => renderSubRow(group, row, idx))}
                    </React.Fragment>
                  ))}
                </div>
              </ScrollArea>
            )}
          </div>
        </ScrollArea>
      </div>

      {/* Cargar más */}
      {hasNextPage && (
        <div className="flex items-center justify-center gap-3 py-2">
          <Button variant="outline" size="sm" onClick={() => fetchNextPage()} disabled={isFetchingNextPage}>
            {isFetchingNextPage && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
            Cargar más
          </Button>
          <Button
            variant="ghost"
            size="sm"
            disabled={isFetchingNextPage}
            onClick={async () => {
              let guard = 0;
              while (guard < 200) {
                const res = await fetchNextPage();
                const pages = res.data?.pages;
                if (!pages || pages[pages.length - 1]?.nextOffset === null) break;
                guard++;
              }
            }}
          >
            Cargar todas
          </Button>
        </div>
      )}

      {/* Historial */}
      <Dialog open={historyDialogOpen} onOpenChange={setHistoryDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>Historial - {selectedHistory?.referencia}</DialogTitle></DialogHeader>
          <div className="space-y-4 max-h-[400px] overflow-y-auto">
            {selectedHistory?.history && selectedHistory.history.length > 0 ? (
              selectedHistory.history.map((entry: any, idx: number) => (
                <div key={idx} className="p-4 rounded-lg bg-muted/50 border border-border text-sm">
                  <div className="flex items-center justify-between mb-2">
                    <Badge variant="outline">{entry.action || `Registro ${idx + 1}`}</Badge>
                    {entry.round && <Badge variant="secondary">C{entry.round}</Badge>}
                  </div>
                  {entry.reason && <p className="text-muted-foreground mb-2">{entry.reason}</p>}
                  <pre className="text-xs whitespace-pre-wrap text-muted-foreground">{JSON.stringify(entry, null, 2)}</pre>
                </div>
              ))
            ) : (
              <div className="text-center py-8 text-muted-foreground">No hay historial registrado</div>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* Cierre forzado */}
      <Dialog open={forceCloseDialogOpen} onOpenChange={setForceCloseDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Cerrar Forzado: {selectedReference?.referencia}</DialogTitle>
            <DialogDescription>
              Fija como validada la última cantidad contada en cada ubicación pendiente y cierra la referencia.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="grid grid-cols-3 gap-4 text-center">
              <div>
                <Label className="text-muted-foreground text-xs">ERP</Label>
                <div className="text-xl font-bold">{selectedReference?.erp}</div>
              </div>
              <div>
                <Label className="text-muted-foreground text-xs">Ronda</Label>
                <div className="text-xl font-bold">C{selectedReference?.round}</div>
              </div>
              <div>
                <Label className="text-muted-foreground text-xs">Estado</Label>
                <div className="pt-1">{selectedReference && getStatusBadge(selectedReference.status)}</div>
              </div>
            </div>
            <div>
              <Label htmlFor="pt-reason">Motivo del cierre *</Label>
              <Textarea id="pt-reason" placeholder="Describe el motivo..." value={forceCloseReason} onChange={(e) => setForceCloseReason(e.target.value)} rows={3} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setForceCloseDialogOpen(false)}>Cancelar</Button>
            <Button variant="destructive" onClick={handleForceClose} disabled={isSubmitting}>
              {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Cerrar referencia
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Editar conteos */}
      <Dialog open={editCountDialogOpen} onOpenChange={setEditCountDialogOpen}>
        <DialogContent className="max-w-3xl max-h-[80vh]">
          <DialogHeader>
            <DialogTitle>Editar Conteos: {selectedReference?.referencia}</DialogTitle>
            <DialogDescription>Al guardar se vuelve a ejecutar la validación automática de la referencia.</DialogDescription>
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
                </TableRow>
              </TableHeader>
              <TableBody>
                {selectedReference?.rows.map((row) => (
                  <TableRow key={row.locationId}>
                    <TableCell className="font-medium">
                      Piso {row.piso}
                      <span className="text-muted-foreground text-xs block">
                        {[row.prodc, row.ubic, row.linea].filter(Boolean).join(' · ') || 'Sin detalle'}
                      </span>
                    </TableCell>
                    {[1, 2, 3, 4].map((round) => {
                      const key = `c${round}` as 'c1' | 'c2' | 'c3' | 'c4';
                      return (
                        <TableCell key={round}>
                          <Input
                            type="number"
                            inputMode="decimal"
                            className="w-20 text-center"
                            value={editingCounts[row.locationId]?.[key] ?? ''}
                            onChange={(e) => setEditingCounts((prev) => ({
                              ...prev,
                              [row.locationId]: { ...prev[row.locationId], [key]: e.target.value },
                            }))}
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
            <Button variant="outline" onClick={() => setEditCountDialogOpen(false)}>Cancelar</Button>
            <Button onClick={handleSaveEditedCounts} disabled={isSubmitting}>
              {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Guardar Cambios
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default AuditoriaPtTable;
