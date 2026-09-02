import React, { useState, useMemo, useCallback } from 'react';
import { useInfiniteQuery, useQuery, useQueryClient } from '@tanstack/react-query';
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
  RotateCcw,
} from 'lucide-react';
import { useExportToExcel } from '@/hooks/useExportToExcel';
import { formatQty, formatSignedQty, formatMoney, formatSignedMoney, descuadreColorClass } from '@/lib/format';
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

export type Bodega = 'almacen' | 'planta';

const PAGE_SIZE = 400;
const ID_BATCH = 100;

interface LocRow {
  locationId: string;
  referencia: string;
  materialType: string;
  locationName: string | null;
  locationDetail: string | null;
  subcategoria: string | null;
  puntoReferencia: string | null;
  metodoConteo: string | null;
  observaciones: string | null;
  bodegaErp: number;
  bodegaStatus: string;
  bodegaRound: number;
  discoveredAtRound: number | null;
  validatedQuantity: number | null;
  validatedAtRound: number | null;
  validationReason: string | null;
  counts: { c1: number | null; c2: number | null; c3: number | null; c4: number | null; c5: number | null };
}

interface GroupedRef {
  referencia: string;
  materialType: string;
  bodegaErp: number;
  bodegaStatus: string;
  bodegaRound: number;
  costoUnitario: number | null;
  countHistory: unknown;
  rows: LocRow[];
  totals: { c1: number | null; c2: number | null; c3: number | null; c4: number | null; c5: number | null };
  totalValidado: number;
  descuadre: number;
  descuadreValor: number | null;
}

const STATUS_CONFIG: Record<string, { label: string; className: string }> = {
  pendiente: { label: 'Pendiente', className: 'bg-yellow-100 text-yellow-800 border-yellow-300 dark:bg-yellow-900/30 dark:text-yellow-400 dark:border-yellow-700' },
  auditado: { label: 'Auditado', className: 'bg-green-100 text-green-800 border-green-300 dark:bg-green-900/30 dark:text-green-400 dark:border-green-700' },
  conflicto: { label: 'Conflicto', className: 'bg-orange-100 text-orange-800 border-orange-300 dark:bg-orange-900/30 dark:text-orange-400 dark:border-orange-700' },
  critico: { label: 'Crítico', className: 'bg-red-100 text-red-800 border-red-300 dark:bg-red-900/30 dark:text-red-400 dark:border-red-700' },
  cerrado_forzado: { label: 'Cerrado Forzado', className: 'bg-purple-100 text-purple-800 border-purple-300 dark:bg-purple-900/30 dark:text-purple-400 dark:border-purple-700' },
  'n/a': { label: 'N/A', className: 'bg-muted text-muted-foreground border-border' },
};


const LocationInfoPopover: React.FC<{ row: LocRow }> = ({ row }) => (
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
          <div><span className="text-muted-foreground">Ubicación:</span> <span className="font-medium">{row.locationName || '-'}</span></div>
          <div><span className="text-muted-foreground">Detalle:</span> <span className="font-medium">{row.locationDetail || '-'}</span></div>
          <div><span className="text-muted-foreground">Subcategoría:</span> <span className="font-medium">{row.subcategoria || '-'}</span></div>
          <div><span className="text-muted-foreground">Punto de Referencia:</span> <span className="font-medium">{row.puntoReferencia || '-'}</span></div>
          <div><span className="text-muted-foreground">Método de Conteo:</span> <span className="font-medium">{row.metodoConteo || '-'}</span></div>
          {row.observaciones && (
            <div><span className="text-muted-foreground">Observaciones:</span> <span className="font-medium">{row.observaciones}</span></div>
          )}
        </div>
      </div>
    </PopoverContent>
  </Popover>
);

interface Props {
  bodega: Bodega;
  materialType: 'MP' | 'PP';
}

const AuditoriaBodegaTable: React.FC<Props> = ({ bodega, materialType }) => {
  const { user, role } = useAuth();
  const canEdit = role !== 'visualizador';
  const isSuperadmin = role === 'superadmin';

  const queryClient = useQueryClient();
  const { inventoryId, isReadOnly } = useInventory();
  const { isExporting, exportAuditoriaBodega } = useExportToExcel();

  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [locationFilter, setLocationFilter] = useState('all');
  const [sharedLocationsOnly, setSharedLocationsOnly] = useState(false);
  const [expandedRefs, setExpandedRefs] = useState<Set<string>>(new Set());

  const [historyDialogOpen, setHistoryDialogOpen] = useState(false);
  const [selectedHistory, setSelectedHistory] = useState<{ referencia: string; history: any[] } | null>(null);
  const [validateDialogOpen, setValidateDialogOpen] = useState(false);
  const [forceCloseDialogOpen, setForceCloseDialogOpen] = useState(false);
  const [editCountDialogOpen, setEditCountDialogOpen] = useState(false);
  const [reopenDialogOpen, setReopenDialogOpen] = useState(false);
  const [reopenReason, setReopenReason] = useState('');
  const [selectedReference, setSelectedReference] = useState<GroupedRef | null>(null);
  const [validateQuantity, setValidateQuantity] = useState('');
  const [forceCloseReason, setForceCloseReason] = useState('');
  const [editingCounts, setEditingCounts] = useState<Record<string, { c1?: string; c2?: string; c3?: string; c4?: string; c5?: string }>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);


  React.useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(searchQuery), 300);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  const queryKeyBase = ['audit-bodega', bodega, materialType, inventoryId, debouncedSearch, statusFilter, locationFilter];

  // Ubicaciones disponibles para el filtro (solo de esta bodega/familia)
  const { data: locationOptions } = useQuery({
    queryKey: ['audit-bodega-locations', bodega, materialType, inventoryId],
    enabled: !!inventoryId,
    staleTime: 10 * 60 * 1000,
    queryFn: async () => {
      const names = new Set<string>();
      let from = 0;
      while (true) {
        const { data, error } = await supabase
          .from('locations_bodega_view')
          .select('location_name')
          .eq('inventory_id', inventoryId!)
          .eq('bodega', bodega)
          .eq('material_type', materialType)
          .range(from, from + 999);
        if (error) throw error;
        if (!data || data.length === 0) break;
        data.forEach((d) => d.location_name && names.add(d.location_name));
        if (data.length < 1000) break;
        from += 1000;
      }
      return [...names].sort();
    },
  });

  // Total de ubicaciones (para saber cuánto falta por cargar)
  const { data: totalLocations } = useQuery({
    queryKey: [...queryKeyBase, 'count'],
    enabled: !!inventoryId,
    queryFn: async () => {
      let q = supabase
        .from('locations_bodega_view')
        .select('id', { count: 'exact', head: true })
        .eq('inventory_id', inventoryId!)
        .eq('bodega', bodega)
        .eq('material_type', materialType);
      if (debouncedSearch) q = q.ilike('master_reference', `%${debouncedSearch}%`);
      if (statusFilter !== 'all') q = q.eq('bodega_status', statusFilter);
      if (locationFilter !== 'all') q = q.eq('location_name', locationFilter);
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
    getNextPageParam: (lastPage: { rows: LocRow[]; masters: Record<string, { costo: number | null; history: unknown }>; nextOffset: number | null }) =>
      lastPage.nextOffset,
    queryFn: async ({ pageParam }) => {
      const offset = pageParam as number;
      let q = supabase
        .from('locations_bodega_view')
        .select('id, master_reference, material_type, location_name, location_detail, subcategoria, punto_referencia, metodo_conteo, observaciones, discovered_at_round, bodega_erp, bodega_round, bodega_status')
        .eq('inventory_id', inventoryId!)
        .eq('bodega', bodega)
        .eq('material_type', materialType)
        .order('master_reference')
        .order('id')
        .range(offset, offset + PAGE_SIZE - 1);

      if (debouncedSearch) q = q.ilike('master_reference', `%${debouncedSearch}%`);
      if (statusFilter !== 'all') q = q.eq('bodega_status', statusFilter);
      if (locationFilter !== 'all') q = q.eq('location_name', locationFilter);

      const { data: locs, error } = await q;
      if (error) throw error;
      if (!locs || locs.length === 0) return { rows: [], masters: {}, nextOffset: null };

      const locationIds = locs.map((l) => l.id);
      const refs = [...new Set(locs.map((l) => l.master_reference))];

      // Conteos
      const counts: { location_id: string; audit_round: number; quantity_counted: number }[] = [];
      for (let i = 0; i < locationIds.length; i += ID_BATCH) {
        const { data: batch, error: cErr } = await supabase
          .from('inventory_counts')
          .select('location_id, audit_round, quantity_counted')
          .eq('inventory_id', inventoryId!)
          .in('location_id', locationIds.slice(i, i + ID_BATCH));
        if (cErr) throw cErr;
        if (batch) counts.push(...batch);
      }

      // Validaciones persistidas
      const validated: { location_id: string; validated_quantity: number; audit_round: number; reason: string }[] = [];
      for (let i = 0; i < locationIds.length; i += ID_BATCH) {
        const { data: batch, error: vErr } = await supabase
          .from('validated_counts')
          .select('location_id, validated_quantity, audit_round, reason')
          .eq('inventory_id', inventoryId!)
          .in('location_id', locationIds.slice(i, i + ID_BATCH));
        if (vErr) throw vErr;
        if (batch) validated.push(...batch);
      }
      const validatedMap = new Map(validated.map((v) => [v.location_id, v]));

      // Costos e historial por referencia
      const masters: Record<string, { costo: number | null; history: unknown }> = {};
      for (let i = 0; i < refs.length; i += ID_BATCH) {
        const { data: batch, error: mErr } = await supabase
          .from('inventory_master')
          .select('referencia, costo_u_mp, costo_u_pp, count_history')
          .eq('inventory_id', inventoryId!)
          .in('referencia', refs.slice(i, i + ID_BATCH));
        if (mErr) throw mErr;
        batch?.forEach((m) => {
          masters[m.referencia] = {
            costo: materialType === 'MP' ? m.costo_u_mp : m.costo_u_pp,
            history: m.count_history,
          };
        });
      }

      const countsMap = new Map<string, LocRow['counts']>();
      locationIds.forEach((id) => countsMap.set(id, { c1: null, c2: null, c3: null, c4: null, c5: null }));
      counts.forEach((c) => {
        const entry = countsMap.get(c.location_id);
        if (!entry) return;
        const key = `c${c.audit_round}` as keyof LocRow['counts'];
        if (key in entry) entry[key] = c.quantity_counted;
      });

      const rows: LocRow[] = locs.map((l) => {
        const v = validatedMap.get(l.id);
        return {
          locationId: l.id,
          referencia: l.master_reference,
          materialType: l.material_type || materialType,
          locationName: l.location_name,
          locationDetail: l.location_detail,
          subcategoria: l.subcategoria,
          puntoReferencia: l.punto_referencia,
          metodoConteo: l.metodo_conteo,
          observaciones: l.observaciones,
          bodegaErp: Number(l.bodega_erp ?? 0),
          bodegaStatus: l.bodega_status || 'pendiente',
          bodegaRound: l.bodega_round || 1,
          discoveredAtRound: l.discovered_at_round,
          validatedQuantity: v ? Number(v.validated_quantity) : null,
          validatedAtRound: v ? v.audit_round : null,
          validationReason: v ? v.reason : null,
          counts: countsMap.get(l.id) || { c1: null, c2: null, c3: null, c4: null, c5: null },
        };
      });

      return {
        rows,
        masters,
        nextOffset: locs.length < PAGE_SIZE ? null : offset + PAGE_SIZE,
      };
    },
  });

  const groupedData = useMemo<GroupedRef[]>(() => {
    if (!data) return [];
    const allRows = data.pages.flatMap((p) => p.rows);
    const masters = Object.assign({}, ...data.pages.map((p) => p.masters)) as Record<string, { costo: number | null; history: unknown }>;

    const groups = new Map<string, LocRow[]>();
    allRows.forEach((row) => {
      const existing = groups.get(row.referencia) || [];
      existing.push(row);
      groups.set(row.referencia, existing);
    });

    const sum = (rows: LocRow[], key: keyof LocRow['counts']) => {
      const vals = rows.map((r) => r.counts[key]).filter((v) => v !== null) as number[];
      return vals.length > 0 ? vals.reduce((a, b) => a + b, 0) : null;
    };

    let result = [...groups.entries()].map(([referencia, rows]): GroupedRef => {
      const erp = rows[0].bodegaErp;
      const totalValidado = rows.reduce((acc, r) => acc + (r.validatedQuantity ?? 0), 0);
      const costo = masters[referencia]?.costo ?? null;
      const descuadre = totalValidado - erp;
      return {
        referencia,
        materialType: rows[0].materialType,
        bodegaErp: erp,
        bodegaStatus: rows[0].bodegaStatus,
        bodegaRound: rows[0].bodegaRound,
        costoUnitario: costo,
        countHistory: masters[referencia]?.history ?? [],
        rows,
        totals: {
          c1: sum(rows, 'c1'),
          c2: sum(rows, 'c2'),
          c3: sum(rows, 'c3'),
          c4: sum(rows, 'c4'),
          c5: sum(rows, 'c5'),
        },
        totalValidado,
        descuadre,
        descuadreValor: costo !== null ? descuadre * costo : null,
      };
    });

    if (sharedLocationsOnly) result = result.filter((g) => g.rows.length > 1);
    return result;
  }, [data, sharedLocationsOnly]);

  const loadedLocations = data?.pages.reduce((acc, p) => acc + p.rows.length, 0) || 0;

  const toggleExpand = useCallback((referencia: string) => {
    setExpandedRefs((prev) => {
      const next = new Set(prev);
      next.has(referencia) ? next.delete(referencia) : next.add(referencia);
      return next;
    });
  }, []);

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['audit-bodega'] });

  

  const handleValidateManually = async () => {
    if (!selectedReference || !user) return;
    if (isReadOnly) { toast.error('Inventario histórico: solo lectura'); return; }
    setIsSubmitting(true);
    try {
      const qty = parseFloat(validateQuantity);
      if (isNaN(qty)) throw new Error('Cantidad inválida');
      const rows = selectedReference.rows;
      const perLocation = qty / rows.length;

      // Usar la ronda real donde existe el último conteo de cada ubicación
      // (no la ronda actual del bloque), para que la exportación sea coherente.
      const roundOf = (r: (typeof rows)[number]): number => {
        for (let round = 5; round >= 1; round--) {
          if (r.counts[`c${round}` as keyof typeof r.counts] !== null) return round;
        }
        return selectedReference.bodegaRound;
      };

      for (const row of rows) {
        const round = roundOf(row);
        const { error: locError } = await supabase
          .from('locations')
          .update({ validated_quantity: perLocation, validated_at_round: round })
          .eq('id', row.locationId);
        if (locError) throw locError;

        const { error: vcError } = await supabase
          .from('validated_counts')
          .upsert({
            inventory_id: inventoryId!,
            master_reference: selectedReference.referencia,
            location_id: row.locationId,
            validated_quantity: perLocation,
            audit_round: round,
            reason: `${bodega === 'almacen' ? 'ALM' : 'PL'}:manual_edit`,
            validated_by: user.id,
          }, { onConflict: 'inventory_id,location_id' });
        if (vcError) throw vcError;
      }

      const { error: masterError } = await supabase
        .from('inventory_master')
        .update(bodega === 'almacen' ? { status_alm: 'auditado' } : { status_pl: 'auditado' })
        .eq('inventory_id', inventoryId!)
        .eq('referencia', selectedReference.referencia);
      if (masterError) throw masterError;

      await supabase.from('audit_logs').insert({
        action_type: 'validacion_manual',
        master_reference: selectedReference.referencia,
        new_data: { validated_quantity: qty, bodega },
        round_number: selectedReference.bodegaRound,
        user_id: user.id,
      });

      toast.success(`Referencia validada en ${bodega}`);
      setValidateDialogOpen(false);
      await invalidate();
    } catch (error: any) {
      toast.error('Error al validar: ' + error.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleForceClose = async () => {
    if (!selectedReference || !user) return;
    if (isReadOnly) { toast.error('Inventario histórico: solo lectura'); return; }
    if (!forceCloseReason.trim()) { toast.error('Debes ingresar un motivo'); return; }
    setIsSubmitting(true);
    try {
      // Persistir el valor físico por ubicación para que la exportación tenga datos:
      // mejor conteo disponible (C5→C1) y su ronda real.
      for (const row of selectedReference.rows) {
        if (row.validatedAtRound !== null) continue;
        const qty = row.counts.c5 ?? row.counts.c4 ?? row.counts.c3 ?? row.counts.c2 ?? row.counts.c1 ?? 0;
        const round =
          row.counts.c5 !== null ? 5 :
          row.counts.c4 !== null ? 4 :
          row.counts.c3 !== null ? 3 :
          row.counts.c2 !== null ? 2 : 1;

        const { error: locError } = await supabase
          .from('locations')
          .update({ validated_quantity: qty, validated_at_round: round })
          .eq('id', row.locationId);
        if (locError) throw locError;

        const { error: vcError } = await supabase
          .from('validated_counts')
          .upsert({
            inventory_id: inventoryId!,
            master_reference: selectedReference.referencia,
            location_id: row.locationId,
            validated_quantity: qty,
            audit_round: round,
            reason: `${bodega === 'almacen' ? 'ALM' : 'PL'}:cierre_forzado: ${forceCloseReason.trim()}`,
            validated_by: user.id,
          }, { onConflict: 'inventory_id,location_id' });
        if (vcError) throw vcError;
      }

      const existingHistory = Array.isArray(selectedReference.countHistory) ? selectedReference.countHistory : [];
      const newHistory = [...existingHistory, {
        action: 'cierre_forzado',
        bodega,
        reason: forceCloseReason,
        timestamp: new Date().toISOString(),
        user_id: user.id,
      }];

      const { error: masterError } = await supabase
        .from('inventory_master')
        .update(bodega === 'almacen'
          ? { status_alm: 'cerrado_forzado', count_history: newHistory }
          : { status_pl: 'cerrado_forzado', count_history: newHistory })
        .eq('inventory_id', inventoryId!)
        .eq('referencia', selectedReference.referencia);
      if (masterError) throw masterError;

      await supabase.from('audit_logs').insert({
        action_type: 'cierre_forzado',
        master_reference: selectedReference.referencia,
        new_data: { reason: forceCloseReason, bodega },
        round_number: selectedReference.bodegaRound,
        user_id: user.id,
      });

      toast.success('Bloque cerrado forzadamente');
      setForceCloseDialogOpen(false);
      await invalidate();
    } catch (error: any) {
      toast.error('Error al cerrar: ' + error.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleReopen = async () => {
    if (!selectedReference || !user || !inventoryId) return;
    if (isReadOnly) { toast.error('Inventario histórico: solo lectura'); return; }
    if (!reopenReason.trim()) { toast.error('Debes ingresar un motivo'); return; }
    setIsSubmitting(true);
    try {
      const { error } = await supabase.rpc('reopen_reference', {
        _inventory_id: inventoryId,
        _reference: selectedReference.referencia,
        _bodega: bodega,
        _reason: reopenReason.trim(),
        _user_id: user.id,
      });
      if (error) throw error;
      toast.success(`${selectedReference.referencia} reabierta: vuelve a Conteo 1`);
      setReopenDialogOpen(false);
      setReopenReason('');
      await invalidate();
    } catch (error: any) {
      toast.error('Error al reabrir: ' + error.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSaveEditedCounts = async () => {
    if (!selectedReference || !user) return;
    if (isReadOnly) { toast.error('Inventario histórico: solo lectura'); return; }
    setIsSubmitting(true);
    try {
      const locationIds = selectedReference.rows.map((r) => r.locationId);
      const { data: existingCounts, error: fetchError } = await supabase
        .from('inventory_counts')
        .select('id, location_id, audit_round')
        .in('location_id', locationIds);
      if (fetchError) throw fetchError;

      const existingMap = new Map<string, string>();
      existingCounts?.forEach((c) => existingMap.set(`${c.location_id}-${c.audit_round}`, c.id));

      const inserts: { location_id: string; audit_round: number; quantity_counted: number; supervisor_id: string }[] = [];

      for (const row of selectedReference.rows) {
        const edited = editingCounts[row.locationId];
        if (!edited) continue;
        for (let round = 1; round <= 5; round++) {
          const key = `c${round}` as 'c1' | 'c2' | 'c3' | 'c4' | 'c5';
          const value = edited[key];
          if (value === '' || value === undefined) continue;
          const existingId = existingMap.get(`${row.locationId}-${round}`);
          if (existingId) {
            const { error } = await supabase
              .from('inventory_counts')
              .update({ quantity_counted: parseFloat(value), supervisor_id: user.id })
              .eq('id', existingId);
            if (error) throw error;
          } else {
            inserts.push({
              location_id: row.locationId,
              audit_round: round,
              quantity_counted: parseFloat(value),
              supervisor_id: user.id,
            });
          }
        }
      }

      if (inserts.length > 0) {
        const { error } = await supabase
          .from('inventory_counts')
          .upsert(inserts, { onConflict: 'location_id,audit_round' });
        if (error) throw error;
      }

      await supabase.from('audit_logs').insert({
        action_type: 'edicion_conteo',
        master_reference: selectedReference.referencia,
        new_data: { ...editingCounts, bodega },
        user_id: user.id,
      });

      toast.success('Conteos actualizados correctamente');
      setEditCountDialogOpen(false);
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

  const renderDescuadre = (group: GroupedRef) => {
    return (
      <span className={`font-medium ${descuadreColorClass(group.descuadre)}`}>
        {formatSignedQty(group.descuadre)}
      </span>
    );
  };

  const renderMainRow = (group: GroupedRef) => {
    const hasMultipleLocations = group.rows.length > 1;
    const isExpanded = expandedRefs.has(group.referencia);
    const row = group.rows[0];

    return (
      <div
        key={group.referencia}
        className={`flex items-center h-11 border-b border-border hover:bg-muted/30 ${hasMultipleLocations ? 'cursor-pointer' : ''}`}
        onClick={() => hasMultipleLocations && toggleExpand(group.referencia)}
      >
        <div className="w-[180px] min-w-[180px] px-3 font-medium flex items-center gap-2 truncate">
          {hasMultipleLocations && (isExpanded ? <ChevronDown className="w-4 h-4 text-muted-foreground flex-shrink-0" /> : <ChevronRight className="w-4 h-4 text-muted-foreground flex-shrink-0" />)}
          <span className="truncate">{group.referencia}</span>
          {hasMultipleLocations && <Badge variant="secondary" className="text-xs flex-shrink-0">{group.rows.length}</Badge>}
        </div>
        <div className="w-[50px] min-w-[50px] px-2" onClick={(e) => e.stopPropagation()}>
          {!hasMultipleLocations && <LocationInfoPopover row={row} />}
        </div>
        <div className="w-[90px] min-w-[90px] px-2 text-right font-bold">{formatQty(group.bodegaErp)}</div>
        <div className="w-[60px] min-w-[60px] px-2 text-right">{renderCountCell(group.totals.c1, group.bodegaErp, 1, group.bodegaRound)}</div>
        <div className="w-[60px] min-w-[60px] px-2 text-right">{renderCountCell(group.totals.c2, group.bodegaErp, 2, group.bodegaRound)}</div>
        <div className="w-[60px] min-w-[60px] px-2 text-right">{renderCountCell(group.totals.c3, group.bodegaErp, 3, group.bodegaRound)}</div>
        <div className="w-[60px] min-w-[60px] px-2 text-right">{renderCountCell(group.totals.c4, group.bodegaErp, 4, group.bodegaRound)}</div>
        <div className="w-[60px] min-w-[60px] px-2 text-right">{renderCountCell(group.totals.c5, group.bodegaErp, 5, group.bodegaRound)}</div>
        <div className="w-[90px] min-w-[90px] px-2 text-right font-medium">{group.totalValidado ? formatQty(group.totalValidado) : '-'}</div>
        <div className="w-[90px] min-w-[90px] px-2 text-right">{renderDescuadre(group)}</div>
        <div className="w-[120px] min-w-[120px] px-2 text-right text-sm">
          {group.costoUnitario === null || group.costoUnitario === 0 ? (
            <span className="text-muted-foreground" title="Sin costo cargado en la maestra">sin costo</span>
          ) : (
            <span className={descuadreColorClass(group.descuadreValor)}>
              {formatSignedMoney(group.descuadreValor || 0)}
            </span>
          )}
        </div>
        <div className="w-[110px] min-w-[110px] px-2">{getStatusBadge(group.bodegaStatus)}</div>
        <div className="w-[60px] min-w-[60px] px-2 text-center text-sm text-muted-foreground">C{group.bodegaRound}</div>
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
              <DropdownMenuItem onClick={() => {
                setSelectedReference(group);
                setValidateQuantity(group.totalValidado > 0 ? group.totalValidado.toString() : group.bodegaErp.toString());
                setValidateDialogOpen(true);
              }}>
                <CheckCircle2 className="w-4 h-4 mr-2 text-green-600" />Validar Manualmente
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => { setSelectedReference(group); setForceCloseReason(''); setForceCloseDialogOpen(true); }}>
                <XCircle className="w-4 h-4 mr-2 text-red-600" />Cerrar Forzado
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => {
                setSelectedReference(group);
                const initial: typeof editingCounts = {};
                group.rows.forEach((r) => {
                  initial[r.locationId] = {
                    c1: r.counts.c1?.toString() ?? '',
                    c2: r.counts.c2?.toString() ?? '',
                    c3: r.counts.c3?.toString() ?? '',
                    c4: r.counts.c4?.toString() ?? '',
                    c5: r.counts.c5?.toString() ?? '',
                  };
                });
                setEditingCounts(initial);
                setEditCountDialogOpen(true);
              }}>
                <Edit3 className="w-4 h-4 mr-2" />Editar Conteo
              </DropdownMenuItem>
              {isSuperadmin && !isReadOnly && (
                <>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={() => { setSelectedReference(group); setReopenReason(''); setReopenDialogOpen(true); }}>
                    <RotateCcw className="w-4 h-4 mr-2 text-amber-600" />Reabrir conteo
                  </DropdownMenuItem>
                </>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
        )}

      </div>
    );
  };

  const renderSubRow = (group: GroupedRef, row: LocRow, subIndex: number) => {
    const isValidated = row.validatedAtRound !== null;
    const isDiscovered = row.discoveredAtRound !== null;

    return (
      <div
        key={row.locationId}
        className={`flex items-center h-11 border-b border-border ${isValidated ? 'bg-green-500/10' : isDiscovered ? 'bg-amber-500/10' : 'bg-muted/20'} hover:bg-muted/40`}
      >
        <div className="w-[180px] min-w-[180px] px-3 pl-10">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-muted-foreground text-sm">{subIndex === group.rows.length - 1 ? '└' : '├'} Ubic {subIndex + 1}</span>
            {isDiscovered && <Badge className="bg-amber-500/20 text-amber-600 border-amber-500/30 text-[10px]">C{row.discoveredAtRound}</Badge>}
            {isValidated && <Badge className="bg-green-500/20 text-green-600 border-green-500/30 text-[10px] gap-1"><CheckCircle2 className="w-3 h-3" />C{row.validatedAtRound}</Badge>}
          </div>
        </div>
        <div className="w-[50px] min-w-[50px] px-2"><LocationInfoPopover row={row} /></div>
        <div className="w-[90px] min-w-[90px] px-2 text-right text-muted-foreground">-</div>
        <div className="w-[60px] min-w-[60px] px-2 text-right">{renderCountCell(row.counts.c1, row.bodegaErp, 1, row.bodegaRound, row.discoveredAtRound)}</div>
        <div className="w-[60px] min-w-[60px] px-2 text-right">{renderCountCell(row.counts.c2, row.bodegaErp, 2, row.bodegaRound, row.discoveredAtRound)}</div>
        <div className="w-[60px] min-w-[60px] px-2 text-right">{renderCountCell(row.counts.c3, row.bodegaErp, 3, row.bodegaRound, row.discoveredAtRound)}</div>
        <div className="w-[60px] min-w-[60px] px-2 text-right">{renderCountCell(row.counts.c4, row.bodegaErp, 4, row.bodegaRound, row.discoveredAtRound)}</div>
        <div className="w-[60px] min-w-[60px] px-2 text-right">{renderCountCell(row.counts.c5, row.bodegaErp, 5, row.bodegaRound, row.discoveredAtRound)}</div>
        <div className="w-[90px] min-w-[90px] px-2 text-right">{row.validatedQuantity !== null ? formatQty(row.validatedQuantity) : '-'}</div>
        <div className="w-[90px] min-w-[90px] px-2 text-right text-muted-foreground text-xs truncate" title={row.validationReason || ''}>{row.validationReason || '-'}</div>
        <div className="w-[120px] min-w-[120px] px-2"></div>
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
          <Input placeholder="Buscar por referencia..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} className="pl-9" />
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
          <Select value={locationFilter} onValueChange={setLocationFilter}>
            <SelectTrigger className="w-[180px]"><SelectValue placeholder="Ubicación" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todas las ubicaciones</SelectItem>
              {locationOptions?.map((loc) => <SelectItem key={loc} value={loc}>{loc}</SelectItem>)}
            </SelectContent>
          </Select>
          <div className="flex items-center gap-2 px-3 py-2 border rounded-lg bg-background">
            <Switch id={`shared-${bodega}-${materialType}`} checked={sharedLocationsOnly} onCheckedChange={setSharedLocationsOnly} />
            <Label htmlFor={`shared-${bodega}-${materialType}`} className="text-sm cursor-pointer whitespace-nowrap">Solo compartidas</Label>
          </div>
        </div>
      </div>

      {/* Barra de estado */}
      <div className="flex items-center justify-between py-2 px-4 bg-muted/30 rounded-lg border border-border">
        <div className="flex items-center gap-4">
          <span className="text-sm font-medium">{groupedData.length} referencias</span>
          <span className="text-sm text-muted-foreground">
            ({loadedLocations}{typeof totalLocations === 'number' ? ` de ${totalLocations}` : ''} ubicaciones cargadas)
          </span>
        </div>
        <div className="flex items-center gap-3">
          <Button
            variant="outline"
            size="sm"
            onClick={() => exportAuditoriaBodega({
              bodega,
              materialType,
              searchTerm: debouncedSearch,
              status: statusFilter,
              location: locationFilter,
            })}
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
              <div className="w-[180px] min-w-[180px] px-3 py-3">Referencia</div>
              <div className="w-[50px] min-w-[50px] px-2 py-3">Info</div>
              <div className="w-[90px] min-w-[90px] px-2 py-3 text-right">ERP {bodega === 'almacen' ? 'Alm' : 'Planta'}</div>
              <div className="w-[60px] min-w-[60px] px-2 py-3 text-right">C1</div>
              <div className="w-[60px] min-w-[60px] px-2 py-3 text-right">C2</div>
              <div className="w-[60px] min-w-[60px] px-2 py-3 text-right">C3</div>
              <div className="w-[60px] min-w-[60px] px-2 py-3 text-right">C4</div>
              <div className="w-[60px] min-w-[60px] px-2 py-3 text-right">C5</div>
              <div className="w-[90px] min-w-[90px] px-2 py-3 text-right">Validado</div>
              <div className="w-[90px] min-w-[90px] px-2 py-3 text-right">Desc. (und)</div>
              <div className="w-[120px] min-w-[120px] px-2 py-3 text-right">Desc. ($)</div>
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
                <span className="text-lg">No hay referencias con ubicaciones de {bodega === 'almacen' ? 'almacén' : 'planta'}</span>
              </div>
            ) : (
              <ScrollArea className="h-[calc(100vh-380px)]">
                <div>
                  {groupedData.map((group) => (
                    <React.Fragment key={group.referencia}>
                      {renderMainRow(group)}
                      {expandedRefs.has(group.referencia) && group.rows.length > 1 &&
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
                    <Badge variant="outline">{entry.action || entry.timestamp || `Registro ${idx + 1}`}</Badge>
                    {entry.bodega && <Badge variant="secondary">{entry.bodega}</Badge>}
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

      {/* Validar */}
      <Dialog open={validateDialogOpen} onOpenChange={setValidateDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Validar en {bodega === 'almacen' ? 'Almacén' : 'Planta'}: {selectedReference?.referencia}</DialogTitle>
            <DialogDescription>La cantidad se reparte entre las ubicaciones de esta bodega.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label className="text-muted-foreground text-xs">ERP {bodega === 'almacen' ? 'Almacén' : 'Planta'}</Label>
                <div className="text-2xl font-bold">{selectedReference?.bodegaErp}</div>
              </div>
              <div>
                <Label className="text-muted-foreground text-xs">Última suma</Label>
                <div className="text-2xl font-bold">
                  {selectedReference?.totals.c5 ?? selectedReference?.totals.c4 ?? selectedReference?.totals.c3 ?? selectedReference?.totals.c2 ?? selectedReference?.totals.c1 ?? '-'}
                </div>
              </div>
            </div>
            <div>
              <Label htmlFor="validateQty">Cantidad validada</Label>
              <Input id="validateQty" type="number" value={validateQuantity} onChange={(e) => setValidateQuantity(e.target.value)} placeholder="Ingrese cantidad" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setValidateDialogOpen(false)}>Cancelar</Button>
            <Button onClick={handleValidateManually} disabled={isSubmitting}>
              {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Validar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Cierre forzado */}
      <Dialog open={forceCloseDialogOpen} onOpenChange={setForceCloseDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Cerrar Forzado: {selectedReference?.referencia}</DialogTitle>
            <DialogDescription>Cierra el bloque de {bodega === 'almacen' ? 'almacén' : 'planta'} sin completar la auditoría.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="grid grid-cols-3 gap-4 text-center">
              <div>
                <Label className="text-muted-foreground text-xs">ERP</Label>
                <div className="text-xl font-bold">{selectedReference?.bodegaErp}</div>
              </div>
              <div>
                <Label className="text-muted-foreground text-xs">Ronda</Label>
                <div className="text-xl font-bold">C{selectedReference?.bodegaRound}</div>
              </div>
              <div>
                <Label className="text-muted-foreground text-xs">Estado</Label>
                <div className="pt-1">{selectedReference && getStatusBadge(selectedReference.bodegaStatus)}</div>
              </div>
            </div>
            <div>
              <Label htmlFor="reason">Motivo del cierre *</Label>
              <Textarea id="reason" placeholder="Describe el motivo..." value={forceCloseReason} onChange={(e) => setForceCloseReason(e.target.value)} rows={3} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setForceCloseDialogOpen(false)}>Cancelar</Button>
            <Button variant="destructive" onClick={handleForceClose} disabled={isSubmitting}>
              {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Cerrar bloque
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Reabrir conteo */}
      <Dialog open={reopenDialogOpen} onOpenChange={setReopenDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reabrir conteo: {selectedReference?.referencia}</DialogTitle>
            <DialogDescription>
              Se borrará la validación guardada de {bodega === 'almacen' ? 'Almacén' : 'Planta'}, las
              ubicaciones quedarán disponibles para volver a contar y la referencia regresa a Conteo 1
              en estado pendiente.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="reopen-reason">Motivo *</Label>
            <Textarea
              id="reopen-reason"
              placeholder="Describe por qué se reabre la referencia..."
              value={reopenReason}
              onChange={(e) => setReopenReason(e.target.value)}
              rows={3}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setReopenDialogOpen(false)}>Cancelar</Button>
            <Button onClick={handleReopen} disabled={isSubmitting}>
              {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Reabrir
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>


      {/* Editar conteos */}
      <Dialog open={editCountDialogOpen} onOpenChange={setEditCountDialogOpen}>
        <DialogContent className="max-w-4xl max-h-[80vh]">
          <DialogHeader>
            <DialogTitle>Editar Conteos: {selectedReference?.referencia}</DialogTitle>
            <DialogDescription>Solo se muestran las ubicaciones de {bodega === 'almacen' ? 'almacén' : 'planta'}.</DialogDescription>
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
                    <TableCell className="font-medium">{row.locationName || row.locationDetail || 'Sin nombre'}</TableCell>
                    {[1, 2, 3, 4, 5].map((round) => {
                      const key = `c${round}` as 'c1' | 'c2' | 'c3' | 'c4' | 'c5';
                      return (
                        <TableCell key={round}>
                          <Input
                            type="number"
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

export default AuditoriaBodegaTable;
