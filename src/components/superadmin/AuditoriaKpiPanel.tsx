import React, { useEffect, useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useInventory } from '@/contexts/InventoryContext';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { AlertTriangle, RefreshCw } from 'lucide-react';

export type Bodega = 'almacen' | 'planta';
type Familia = 'all' | 'MP' | 'PP';

const PAGE = 1000;

const STATUS_META: Record<string, { label: string; bar: string; badge: string }> = {
  auditado: { label: 'Auditado', bar: 'bg-green-500', badge: 'bg-green-100 text-green-800 border-green-300 dark:bg-green-900/30 dark:text-green-400 dark:border-green-700' },
  pendiente: { label: 'Pendiente', bar: 'bg-yellow-500', badge: 'bg-yellow-100 text-yellow-800 border-yellow-300 dark:bg-yellow-900/30 dark:text-yellow-400 dark:border-yellow-700' },
  pendiente_en_progreso: { label: 'Pendiente — en progreso', bar: 'bg-yellow-500', badge: 'bg-yellow-100 text-yellow-800 border-yellow-300 dark:bg-yellow-900/30 dark:text-yellow-400 dark:border-yellow-700' },
  pendiente_sin_iniciar: { label: 'Pendiente — sin iniciar', bar: 'bg-yellow-300', badge: 'bg-yellow-50 text-yellow-700 border-yellow-200 dark:bg-yellow-900/20 dark:text-yellow-300 dark:border-yellow-800' },

  conflicto: { label: 'Conflicto', bar: 'bg-orange-500', badge: 'bg-orange-100 text-orange-800 border-orange-300 dark:bg-orange-900/30 dark:text-orange-400 dark:border-orange-700' },
  critico: { label: 'Crítico', bar: 'bg-red-500', badge: 'bg-red-100 text-red-800 border-red-300 dark:bg-red-900/30 dark:text-red-400 dark:border-red-700' },
  cerrado_forzado: { label: 'Cerrado forzado', bar: 'bg-purple-500', badge: 'bg-purple-100 text-purple-800 border-purple-300 dark:bg-purple-900/30 dark:text-purple-400 dark:border-purple-700' },
  'n/a': { label: 'N/A', bar: 'bg-muted-foreground', badge: 'bg-muted text-muted-foreground border-border' },
};

const nf = new Intl.NumberFormat('es-CO', { maximumFractionDigits: 0 });
const money = (v: number) =>
  new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 }).format(v);
const signed = (v: number) => `${v > 0 ? '+' : ''}${nf.format(v)}`;

interface RefAgg {
  referencia: string;
  materialType: string;
  erp: number;
  validado: number;
  status: string;
  round: number;
  costo: number | null;
  descuadre: number;
  descuadreValor: number;
  sinCosto: boolean;
  conteosHechos: number;
  conteosRequeridos: number;
}

interface RoundProgress {
  key: string;
  label: string;
  count: number;
  done: number;
  required: number;
}

interface Aggregates {
  refs: RefAgg[];
  totalRefs: number;
  activeLocations: number;
  countedLocations: number;
  requiredCounts: number;
  doneCounts: number;
  c1Done: number;
  c1Required: number;
  c2Done: number;
  c2Required: number;
  byStatus: { key: string; count: number }[];
  byRound: RoundProgress[];
  byFamily: { familia: string; erp: number; validado: number; descuadre: number; valor: number }[];
  descuadreUnd: number;
  descuadreValor: number;
  faltante: number;
  sobrante: number;
  auditadas: number;
  refsSinCosto: number;
}


async function fetchAllPages<T>(
  build: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>,
): Promise<T[]> {
  const out: T[] = [];
  let from = 0;
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const { data, error } = await build(from, from + PAGE - 1);
    if (error) throw new Error(error.message);
    if (!data || data.length === 0) break;
    out.push(...(data as T[]));
    if (data.length < PAGE) break;
    from += PAGE;
  }
  return out;
}

interface Props {
  bodega: Bodega;
  familia: Familia;
}

const AuditoriaKpiPanel: React.FC<Props> = ({ bodega, familia }) => {
  const { inventoryId } = useInventory();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null);

  const queryKey = ['audit-kpi', inventoryId, bodega, familia];

  const { data, isLoading, isFetching, refetch } = useQuery<Aggregates>({
    queryKey,
    enabled: !!inventoryId,
    staleTime: 30 * 1000,
    refetchInterval: 30 * 1000,
    queryFn: async () => {
      const locs = await fetchAllPages<{
        id: string;
        master_reference: string;
        material_type: string | null;
        bodega_erp: number | null;
        bodega_status: string | null;
        bodega_round: number | null;
        activo: boolean | null;
        discovered_at_round: number | null;
      }>((from, to) => {
        let q = supabase
          .from('locations_bodega_view')
          .select('id, master_reference, material_type, bodega_erp, bodega_status, bodega_round, activo, discovered_at_round')

          .eq('inventory_id', inventoryId!)
          .eq('bodega', bodega)
          .order('id')
          .range(from, to);
        if (familia !== 'all') q = q.eq('material_type', familia);
        return q;
      });

      const validated = await fetchAllPages<{ location_id: string; validated_quantity: number }>((from, to) =>
        supabase
          .from('validated_counts')
          .select('location_id, validated_quantity')
          .eq('inventory_id', inventoryId!)
          .order('location_id')
          .range(from, to),
      );

      const counts = await fetchAllPages<{ location_id: string; audit_round: number }>((from, to) =>
        supabase
          .from('inventory_counts')
          .select('location_id, audit_round')
          .eq('inventory_id', inventoryId!)
          .order('location_id')
          .range(from, to),
      );

      const refSet = new Set(locs.map((l) => l.master_reference));
      const masters = await fetchAllPages<{
        referencia: string;
        material_type: string;
        costo_u_mp: number | null;
        costo_u_pp: number | null;
      }>((from, to) =>
        supabase
          .from('inventory_master')
          .select('referencia, material_type, costo_u_mp, costo_u_pp')
          .eq('inventory_id', inventoryId!)
          .order('referencia')
          .range(from, to),
      );
      const costMap = new Map<string, number | null>();
      masters.forEach((m) => {
        if (!refSet.has(m.referencia)) return;
        costMap.set(m.referencia, m.material_type === 'MP' ? m.costo_u_mp : m.costo_u_pp);
      });

      const validatedMap = new Map<string, number>();
      validated.forEach((v) => validatedMap.set(v.location_id, Number(v.validated_quantity)));

      const countRounds = new Map<string, Set<number>>();
      counts.forEach((c) => {
        const s = countRounds.get(c.location_id) ?? new Set<number>();
        s.add(c.audit_round);
        countRounds.set(c.location_id, s);
      });

      const byRef = new Map<string, RefAgg>();
      let activeLocations = 0;
      let countedLocations = 0;
      let requiredCounts = 0;
      let doneCounts = 0;
      let c1Done = 0;
      let c1Required = 0;
      let c2Done = 0;
      let c2Required = 0;
      const roundProgress = new Map<string, { done: number; required: number }>();

      locs.forEach((l) => {
        const status = l.bodega_status || 'pendiente';
        const round = l.bodega_round || 1;
        const isClosed = status === 'auditado' || status === 'cerrado_forzado';
        const rounds = countRounds.get(l.id);

        // Conteos requeridos/hechos de esta ubicación en su ronda vigente
        let req = 0;
        let done = 0;
        if (l.activo !== false && !isClosed) {
          if (round === 1) {
            const discoveredAtC2 = l.discovered_at_round === 2;
            if (discoveredAtC2) {
              req = 1;
              done = rounds?.has(2) ? 1 : 0;
              c2Required += 1;
              if (rounds?.has(2)) c2Done += 1;
            } else {
              req = 2;
              done = (rounds?.has(1) ? 1 : 0) + (rounds?.has(2) ? 1 : 0);
              c1Required += 1;
              c2Required += 1;
              if (rounds?.has(1)) c1Done += 1;
              if (rounds?.has(2)) c2Done += 1;
            }
          } else {
            req = 1;
            done = rounds?.has(round) ? 1 : 0;
          }

          activeLocations += 1;
          requiredCounts += req;
          doneCounts += done;
          if (done >= req) countedLocations += 1;

          const rk = `C${round}`;
          const rp = roundProgress.get(rk) || { done: 0, required: 0 };
          rp.done += done;
          rp.required += req;
          roundProgress.set(rk, rp);
        }

        let agg = byRef.get(l.master_reference);
        if (!agg) {
          const costo = costMap.get(l.master_reference) ?? null;
          agg = {
            referencia: l.master_reference,
            materialType: l.material_type || '',
            erp: Number(l.bodega_erp ?? 0),
            validado: 0,
            status,
            round,
            costo,
            descuadre: 0,
            descuadreValor: 0,
            sinCosto: !costo,
            conteosHechos: 0,
            conteosRequeridos: 0,
          };
          byRef.set(l.master_reference, agg);
        }
        agg.validado += validatedMap.get(l.id) ?? 0;
        agg.conteosHechos += done;
        agg.conteosRequeridos += req;
      });

      const refs = [...byRef.values()].map((r) => {
        const descuadre = r.validado - r.erp;
        return {
          ...r,
          descuadre,
          descuadreValor: descuadre * (r.costo ?? 0),
        };
      });

      const statusCounts = new Map<string, number>();
      const roundCounts = new Map<string, number>();
      const familyMap = new Map<string, { erp: number; validado: number; descuadre: number; valor: number }>();

      let descuadreUnd = 0;
      let descuadreValor = 0;
      let faltante = 0;
      let sobrante = 0;
      let auditadas = 0;
      let refsSinCosto = 0;

      refs.forEach((r) => {
        const closed = r.status === 'auditado' || r.status === 'cerrado_forzado';
        const statusKey =
          r.status === 'pendiente'
            ? r.conteosHechos > 0
              ? 'pendiente_en_progreso'
              : 'pendiente_sin_iniciar'
            : r.status;
        statusCounts.set(statusKey, (statusCounts.get(statusKey) || 0) + 1);
        const roundKey = closed ? 'cerrada' : `C${r.round}`;
        roundCounts.set(roundKey, (roundCounts.get(roundKey) || 0) + 1);
        if (closed) auditadas += 1;
        descuadreUnd += r.descuadre;
        descuadreValor += r.descuadreValor;
        if (r.descuadre < 0) faltante += r.descuadre;
        if (r.descuadre > 0) sobrante += r.descuadre;
        if (r.sinCosto && r.descuadre !== 0) refsSinCosto += 1;

        const fam = r.materialType || 'N/A';
        const f = familyMap.get(fam) || { erp: 0, validado: 0, descuadre: 0, valor: 0 };
        f.erp += r.erp;
        f.validado += r.validado;
        f.descuadre += r.descuadre;
        f.valor += r.descuadreValor;
        familyMap.set(fam, f);
      });

      const statusOrder = [
        'auditado',
        'cerrado_forzado',
        'conflicto',
        'critico',
        'pendiente_en_progreso',
        'pendiente_sin_iniciar',
        'n/a',
      ];
      const byStatus = statusOrder
        .filter((s) => statusCounts.has(s))
        .map((s) => ({ key: s, count: statusCounts.get(s)! }));
      [...statusCounts.keys()]
        .filter((s) => !statusOrder.includes(s))
        .forEach((s) => byStatus.push({ key: s, count: statusCounts.get(s)! }));

      const roundOrder = ['C1', 'C2', 'C3', 'C4', 'C5', 'cerrada'];
      const byRound: RoundProgress[] = roundOrder
        .filter((r) => roundCounts.has(r))
        .map((r) => ({
          key: r,
          label: r === 'cerrada' ? 'Cerrada' : r,
          count: roundCounts.get(r)!,
          done: roundProgress.get(r)?.done ?? 0,
          required: roundProgress.get(r)?.required ?? 0,
        }));

      return {
        refs,
        totalRefs: refs.length,
        activeLocations,
        countedLocations,
        requiredCounts,
        doneCounts,
        c1Done,
        c1Required,
        c2Done,
        c2Required,
        byStatus,
        byRound,
        byFamily: [...familyMap.entries()]
          .sort((a, b) => a[0].localeCompare(b[0]))
          .map(([f, v]) => ({ familia: f, ...v })),
        descuadreUnd,
        descuadreValor,
        faltante,
        sobrante,
        auditadas,
        refsSinCosto,
      };

    },
  });

  useEffect(() => {
    if (data) setLastUpdate(new Date());
  }, [data]);

  // Realtime: refrescar cuando cambian conteos o validaciones
  useEffect(() => {
    if (!inventoryId) return;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const invalidate = () => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => {
        queryClient.invalidateQueries({ queryKey: ['audit-kpi', inventoryId] });
      }, 1500);
    };

    const channel = supabase
      .channel(`audit-kpi-${inventoryId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'inventory_counts', filter: `inventory_id=eq.${inventoryId}` }, invalidate)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'validated_counts', filter: `inventory_id=eq.${inventoryId}` }, invalidate)
      .subscribe();

    return () => {
      if (timer) clearTimeout(timer);
      supabase.removeChannel(channel);
    };
  }, [inventoryId, queryClient]);

  const topDescuadres = useMemo(
    () =>
      (data?.refs ?? [])
        .filter((r) => r.descuadre !== 0)
        .sort((a, b) => Math.abs(b.descuadreValor) - Math.abs(a.descuadreValor) || Math.abs(b.descuadre) - Math.abs(a.descuadre))
        .slice(0, 10),
    [data],
  );

  const auditPath = `/superadmin/auditoria/${bodega}`;

  if (isLoading || !data) {
    return (
      <div className="space-y-4">
        <div className="grid gap-4 grid-cols-2 lg:grid-cols-5">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-24" />
          ))}
        </div>
        <Skeleton className="h-64" />
      </div>
    );
  }

  const avance = data.activeLocations + data.countedLocations === 0
    ? 100
    : Math.round((data.countedLocations / Math.max(data.activeLocations, 1)) * 100);
  const pctAuditadas = data.totalRefs ? Math.round((data.auditadas / data.totalRefs) * 100) : 0;

  const kpis = [
    { label: 'Referencias', value: nf.format(data.totalRefs), hint: `${nf.format(data.activeLocations)} ubic. abiertas` },
    { label: 'Avance de conteo', value: `${avance}%`, hint: `${nf.format(data.countedLocations)} de ${nf.format(data.activeLocations)} ubic.` },
    { label: 'Auditadas', value: nf.format(data.auditadas), hint: `${pctAuditadas}% del total` },
    {
      label: 'Descuadre (und)',
      value: signed(data.descuadreUnd),
      hint: `Faltante ${nf.format(data.faltante)} · Sobrante ${signed(data.sobrante)}`,
      danger: data.descuadreUnd !== 0,
    },
    {
      label: 'Descuadre ($)',
      value: money(data.descuadreValor),
      hint: data.refsSinCosto > 0 ? `${data.refsSinCosto} refs sin costo cargado` : 'Costos cargados',
      danger: data.descuadreValor !== 0,
    },
  ];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <p className="text-xs text-muted-foreground">
          {lastUpdate ? `Actualizado ${lastUpdate.toLocaleTimeString('es-CO')}` : 'Cargando...'}
        </p>
        <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isFetching}>
          <RefreshCw className={`w-4 h-4 mr-2 ${isFetching ? 'animate-spin' : ''}`} />
          Actualizar
        </Button>
      </div>

      {data.refsSinCosto > 0 && (
        <div className="flex items-start gap-2 rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-200">
          <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
          <span>
            {data.refsSinCosto} referencia(s) con descuadre no tienen costo unitario cargado: el valor en $ está subestimado.
          </span>
        </div>
      )}

      <div className="grid gap-4 grid-cols-2 lg:grid-cols-5">
        {kpis.map((k) => (
          <Card key={k.label} className="glass-card">
            <CardContent className="p-4">
              <p className="text-xs text-muted-foreground">{k.label}</p>
              <p className={`text-2xl font-bold mt-1 ${k.danger ? 'text-destructive' : 'text-foreground'}`}>{k.value}</p>
              <p className="text-[11px] text-muted-foreground mt-1">{k.hint}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="glass-card">
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Por estado</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {data.byStatus.map((s) => {
              const meta = STATUS_META[s.key] || STATUS_META['n/a'];
              const pct = data.totalRefs ? Math.round((s.count / data.totalRefs) * 100) : 0;
              return (
                <button
                  key={s.key}
                  type="button"
                  onClick={() => navigate(`${auditPath}?status=${s.key}`)}
                  className="w-full text-left group"
                >
                  <div className="flex items-center justify-between text-sm mb-1">
                    <span className="group-hover:underline">{meta.label}</span>
                    <span className="text-muted-foreground">{nf.format(s.count)} · {pct}%</span>
                  </div>
                  <div className="h-2 rounded-full bg-muted overflow-hidden">
                    <div className={`h-full ${meta.bar}`} style={{ width: `${pct}%` }} />
                  </div>
                </button>
              );
            })}
            {data.byStatus.length === 0 && <p className="text-sm text-muted-foreground">Sin datos.</p>}
          </CardContent>
        </Card>

        <Card className="glass-card">
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Por ronda vigente</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {data.byRound.map((r) => {
              const pct = data.totalRefs ? Math.round((r.count / data.totalRefs) * 100) : 0;
              return (
                <div key={r.key}>
                  <div className="flex items-center justify-between text-sm mb-1">
                    <span>{r.label}</span>
                    <span className="text-muted-foreground">{nf.format(r.count)} · {pct}%</span>
                  </div>
                  <div className="h-2 rounded-full bg-muted overflow-hidden">
                    <div className="h-full bg-primary" style={{ width: `${pct}%` }} />
                  </div>
                </div>
              );
            })}
            {data.byRound.length === 0 && <p className="text-sm text-muted-foreground">Sin datos.</p>}
          </CardContent>
        </Card>
      </div>

      <Card className="glass-card">
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Descuadre por familia</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Familia</TableHead>
                <TableHead className="text-right">ERP bodega</TableHead>
                <TableHead className="text-right">Validado</TableHead>
                <TableHead className="text-right">Descuadre</TableHead>
                <TableHead className="text-right">Descuadre ($)</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.byFamily.map((f) => (
                <TableRow key={f.familia}>
                  <TableCell className="font-medium">{f.familia}</TableCell>
                  <TableCell className="text-right">{nf.format(f.erp)}</TableCell>
                  <TableCell className="text-right">{nf.format(f.validado)}</TableCell>
                  <TableCell className={`text-right ${f.descuadre !== 0 ? 'text-destructive font-medium' : ''}`}>{signed(f.descuadre)}</TableCell>
                  <TableCell className={`text-right ${f.valor !== 0 ? 'text-destructive font-medium' : ''}`}>{money(f.valor)}</TableCell>
                </TableRow>
              ))}
              {data.byFamily.length > 0 && (
                <TableRow className="bg-muted/40 font-semibold">
                  <TableCell>Total</TableCell>
                  <TableCell className="text-right">{nf.format(data.byFamily.reduce((a, f) => a + f.erp, 0))}</TableCell>
                  <TableCell className="text-right">{nf.format(data.byFamily.reduce((a, f) => a + f.validado, 0))}</TableCell>
                  <TableCell className="text-right">{signed(data.descuadreUnd)}</TableCell>
                  <TableCell className="text-right">{money(data.descuadreValor)}</TableCell>
                </TableRow>
              )}
              {data.byFamily.length === 0 && (
                <TableRow>
                  <TableCell colSpan={5} className="text-center text-muted-foreground py-6">Sin datos.</TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Card className="glass-card">
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Top 10 descuadres</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Referencia</TableHead>
                <TableHead>Familia</TableHead>
                <TableHead className="text-right">ERP</TableHead>
                <TableHead className="text-right">Validado</TableHead>
                <TableHead className="text-right">Descuadre</TableHead>
                <TableHead className="text-right">Descuadre ($)</TableHead>
                <TableHead>Estado</TableHead>
                <TableHead className="text-right">Ronda</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {topDescuadres.map((r) => {
                const meta = STATUS_META[r.status] || STATUS_META['n/a'];
                return (
                  <TableRow
                    key={r.referencia}
                    className="cursor-pointer"
                    onClick={() => navigate(`${auditPath}?search=${encodeURIComponent(r.referencia)}`)}
                  >
                    <TableCell className="font-medium">{r.referencia}</TableCell>
                    <TableCell>{r.materialType}</TableCell>
                    <TableCell className="text-right">{nf.format(r.erp)}</TableCell>
                    <TableCell className="text-right">{nf.format(r.validado)}</TableCell>
                    <TableCell className="text-right text-destructive font-medium">{signed(r.descuadre)}</TableCell>
                    <TableCell className="text-right text-destructive font-medium">
                      {r.sinCosto ? 'Sin costo' : money(r.descuadreValor)}
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className={meta.badge}>{meta.label}</Badge>
                    </TableCell>
                    <TableCell className="text-right">{r.status === 'auditado' || r.status === 'cerrado_forzado' ? 'Cerrada' : `C${r.round}`}</TableCell>
                  </TableRow>
                );
              })}
              {topDescuadres.length === 0 && (
                <TableRow>
                  <TableCell colSpan={8} className="text-center text-muted-foreground py-6">
                    No hay descuadres registrados.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
};

export default AuditoriaKpiPanel;
