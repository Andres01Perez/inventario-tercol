import React, { useEffect, useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useInventory } from '@/contexts/InventoryContext';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { RefreshCw } from 'lucide-react';
import { formatQty, formatSignedQty, descuadreColorClass } from '@/lib/format';

const PAGE = 1000;

const STATUS_META: Record<string, { label: string; bar: string }> = {
  auditado: { label: 'Auditado', bar: 'bg-green-500' },
  cerrado_forzado: { label: 'Cerrado forzado', bar: 'bg-purple-500' },
  conflicto: { label: 'Conflicto', bar: 'bg-orange-500' },
  critico: { label: 'Crítico', bar: 'bg-red-500' },
  pendiente_en_progreso: { label: 'Pendiente — en progreso', bar: 'bg-yellow-500' },
  pendiente_sin_iniciar: { label: 'Pendiente — sin iniciar', bar: 'bg-yellow-300' },
  pendiente: { label: 'Pendiente', bar: 'bg-yellow-500' },
  'n/a': { label: 'N/A', bar: 'bg-muted-foreground' },
};

const nf = new Intl.NumberFormat('es-CO', { maximumFractionDigits: 0 });
const signed = formatSignedQty;

interface RefAgg {
  referencia: string;
  descripcion: string | null;
  erp: number;
  validado: number;
  status: string;
  round: number;
  descuadre: number;
  hasValidation: boolean;
  conteosHechos: number;
  conteosRequeridos: number;
}

interface FloorAgg {
  piso: string;
  ubicaciones: number;
  contadas: number;
  validadas: number;
}

interface Aggregates {
  refs: RefAgg[];
  totalRefs: number;
  activeLocations: number;
  requiredCounts: number;
  doneCounts: number;
  c1Done: number;
  c1Required: number;
  c2Done: number;
  c2Required: number;
  byStatus: { key: string; count: number }[];
  byRound: { key: string; label: string; count: number; done: number; required: number }[];
  byFloor: FloorAgg[];
  descuadreUnd: number;
  faltante: number;
  sobrante: number;
  auditadas: number;
  hasAnyValidation: boolean;
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
  piso: string;
}

const AuditoriaPtKpiPanel: React.FC<Props> = ({ piso }) => {
  const { inventoryId } = useInventory();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null);

  const { data, isLoading, isFetching, refetch } = useQuery<Aggregates>({
    queryKey: ['audit-kpi-pt', inventoryId, piso],
    enabled: !!inventoryId,
    staleTime: 30 * 1000,
    refetchInterval: 30 * 1000,
    queryFn: async () => {
      const masters = await fetchAllPages<{
        referencia: string; descripcion: string | null; cant_erp: number | null;
        status_slug: string | null; audit_round: number | null;
      }>((from, to) =>
        supabase
          .from('pt_master')
          .select('referencia, descripcion, cant_erp, status_slug, audit_round')
          .eq('inventory_id', inventoryId!)
          .order('referencia')
          .range(from, to),
      );

      const locs = await fetchAllPages<{
        id: string; referencia: string; piso: string; discovered_at_round: number | null;
      }>((from, to) => {
        let q = supabase
          .from('pt_locations')
          .select('id, referencia, piso, discovered_at_round')
          .eq('inventory_id', inventoryId!)
          .eq('activo', true)
          .order('id')
          .range(from, to);
        if (piso !== 'all') q = q.eq('piso', piso);
        return q;
      });

      const counts = await fetchAllPages<{ location_id: string; audit_round: number; quantity_counted: number }>(
        (from, to) =>
          supabase
            .from('pt_counts')
            .select('location_id, audit_round, quantity_counted')
            .eq('inventory_id', inventoryId!)
            .order('location_id')
            .range(from, to),
      );

      const validated = await fetchAllPages<{ location_id: string; referencia: string; validated_quantity: number }>(
        (from, to) =>
          supabase
            .from('pt_validated_counts')
            .select('location_id, referencia, validated_quantity')
            .eq('inventory_id', inventoryId!)
            .order('location_id')
            .range(from, to),
      );

      const locById = new Map(locs.map((l) => [l.id, l]));
      const roundsByLoc = new Map<string, Set<number>>();
      counts.forEach((c) => {
        if (!locById.has(c.location_id)) return;
        const set = roundsByLoc.get(c.location_id) || new Set<number>();
        set.add(c.audit_round);
        roundsByLoc.set(c.location_id, set);
      });

      const validatedByLoc = new Map<string, number>();
      validated.forEach((v) => {
        if (!locById.has(v.location_id)) return;
        validatedByLoc.set(v.location_id, Number(v.validated_quantity));
      });

      const locsByRef = new Map<string, typeof locs>();
      locs.forEach((l) => {
        const arr = locsByRef.get(l.referencia) || [];
        arr.push(l);
        locsByRef.set(l.referencia, arr);
      });

      let requiredCounts = 0;
      let doneCounts = 0;
      let c1Done = 0;
      let c1Required = 0;
      let c2Done = 0;
      let c2Required = 0;

      const statusCounts = new Map<string, number>();
      const roundCounts = new Map<string, number>();
      const roundProgress = new Map<string, { done: number; required: number }>();

      let descuadreUnd = 0;
      let faltante = 0;
      let sobrante = 0;
      let auditadas = 0;

      const refs: RefAgg[] = masters
        .map((m) => {
          const rows = locsByRef.get(m.referencia) || [];
          const erp = Number(m.cant_erp ?? 0);
          const round = m.audit_round || 1;
          const status = m.status_slug || 'pendiente';
          const closed = ['auditado', 'cerrado_forzado', 'n/a'].includes(status);

          let hechos = 0;
          let requeridos = 0;
          rows.forEach((l) => {
            const done = roundsByLoc.get(l.id) || new Set<number>();
            const validatedLoc = validatedByLoc.has(l.id);
            if (validatedLoc || closed) return;
            const needed = round === 1 ? ((l.discovered_at_round ?? 1) === 2 ? [2] : [1, 2]) : [round];
            needed.forEach((r) => {
              requeridos += 1;
              if (done.has(r)) hechos += 1;
              if (r === 1) { c1Required += 1; if (done.has(1)) c1Done += 1; }
              if (r === 2) { c2Required += 1; if (done.has(2)) c2Done += 1; }
            });
          });

          requiredCounts += requeridos;
          doneCounts += hechos;

          const validado = rows.reduce((acc, l) => acc + (validatedByLoc.get(l.id) ?? 0), 0);
          const hasValidation = validado > 0;

          return {
            referencia: m.referencia,
            descripcion: m.descripcion,
            erp,
            validado,
            status,
            round,
            descuadre: hasValidation ? validado - erp : 0,
            hasValidation,
            conteosHechos: hechos,
            conteosRequeridos: requeridos,
          };
        })
        .filter((r) => (piso === 'all' ? true : (locsByRef.get(r.referencia)?.length ?? 0) > 0));

      refs.forEach((r) => {
        const closed = ['auditado', 'cerrado_forzado', 'n/a'].includes(r.status);
        const statusKey = r.status === 'pendiente'
          ? (r.conteosHechos > 0 ? 'pendiente_en_progreso' : 'pendiente_sin_iniciar')
          : r.status;
        statusCounts.set(statusKey, (statusCounts.get(statusKey) || 0) + 1);

        const roundKey = closed ? 'cerrada' : `C${r.round}`;
        roundCounts.set(roundKey, (roundCounts.get(roundKey) || 0) + 1);
        const prog = roundProgress.get(roundKey) || { done: 0, required: 0 };
        prog.done += r.conteosHechos;
        prog.required += r.conteosRequeridos;
        roundProgress.set(roundKey, prog);

        if (closed) auditadas += 1;
        descuadreUnd += r.descuadre;
        if (r.descuadre < 0) faltante += r.descuadre;
        if (r.descuadre > 0) sobrante += r.descuadre;
      });

      const statusOrder = ['auditado', 'cerrado_forzado', 'conflicto', 'critico', 'pendiente_en_progreso', 'pendiente_sin_iniciar', 'n/a'];
      const byStatus = statusOrder
        .filter((s) => statusCounts.has(s))
        .map((s) => ({ key: s, count: statusCounts.get(s)! }));
      [...statusCounts.keys()]
        .filter((s) => !statusOrder.includes(s))
        .forEach((s) => byStatus.push({ key: s, count: statusCounts.get(s)! }));

      const roundOrder = ['C1', 'C2', 'C3', 'C4', 'C5', 'cerrada'];
      const byRound = roundOrder
        .filter((r) => roundCounts.has(r))
        .map((r) => ({
          key: r,
          label: r === 'cerrada' ? 'Cerrada' : r,
          count: roundCounts.get(r)!,
          done: roundProgress.get(r)?.done ?? 0,
          required: roundProgress.get(r)?.required ?? 0,
        }));

      const floorMap = new Map<string, FloorAgg>();
      locs.forEach((l) => {
        const f = floorMap.get(l.piso) || { piso: l.piso, ubicaciones: 0, contadas: 0, validadas: 0 };
        f.ubicaciones += 1;
        if ((roundsByLoc.get(l.id)?.size ?? 0) > 0) f.contadas += 1;
        if (validatedByLoc.has(l.id)) f.validadas += 1;
        floorMap.set(l.piso, f);
      });

      return {
        refs,
        totalRefs: refs.length,
        activeLocations: locs.length,
        requiredCounts,
        doneCounts,
        c1Done,
        c1Required,
        c2Done,
        c2Required,
        byStatus,
        byRound,
        byFloor: [...floorMap.values()].sort((a, b) => a.piso.localeCompare(b.piso, 'es', { numeric: true })),
        descuadreUnd,
        faltante,
        sobrante,
        auditadas,
        hasAnyValidation: refs.some((r) => r.hasValidation),
      };
    },
  });

  useEffect(() => {
    if (data) setLastUpdate(new Date());
  }, [data]);

  useEffect(() => {
    if (!inventoryId) return;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const invalidate = () => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => {
        queryClient.invalidateQueries({ queryKey: ['audit-kpi-pt', inventoryId] });
      }, 1500);
    };

    const channel = supabase
      .channel(`audit-kpi-pt-${inventoryId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'pt_counts', filter: `inventory_id=eq.${inventoryId}` }, invalidate)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'pt_validated_counts', filter: `inventory_id=eq.${inventoryId}` }, invalidate)
      .subscribe();

    return () => {
      if (timer) clearTimeout(timer);
      supabase.removeChannel(channel);
    };
  }, [inventoryId, queryClient]);

  const topDescuadres = useMemo(
    () =>
      (data?.refs ?? [])
        .filter((r) => r.hasValidation && r.descuadre !== 0)
        .sort((a, b) => Math.abs(b.descuadre) - Math.abs(a.descuadre))
        .slice(0, 10),
    [data],
  );

  if (isLoading || !data) {
    return (
      <div className="space-y-4">
        <div className="grid gap-4 grid-cols-2 lg:grid-cols-5">
          {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-24" />)}
        </div>
        <Skeleton className="h-64" />
      </div>
    );
  }

  const avance = data.requiredCounts === 0 ? 100 : Math.round((data.doneCounts / data.requiredCounts) * 100);
  const pctAuditadas = data.totalRefs ? Math.round((data.auditadas / data.totalRefs) * 100) : 0;

  const kpis: { label: string; value: string; hint: React.ReactNode; danger?: boolean }[] = [
    { label: 'Referencias PT', value: nf.format(data.totalRefs), hint: `${nf.format(data.activeLocations)} ubic. activas` },
    {
      label: 'Avance de conteo',
      value: `${avance}%`,
      hint: (
        <div className="space-y-0.5">
          <div className="flex justify-between gap-2"><span>Total</span><span>{nf.format(data.doneCounts)} / {nf.format(data.requiredCounts)}</span></div>
          <div className="flex justify-between gap-2"><span>C1</span><span>{nf.format(data.c1Done)} / {nf.format(data.c1Required)}</span></div>
          <div className="flex justify-between gap-2"><span>C2</span><span>{nf.format(data.c2Done)} / {nf.format(data.c2Required)}</span></div>
        </div>
      ),
    },
    { label: 'Auditadas', value: nf.format(data.auditadas), hint: `${pctAuditadas}% del total` },
    {
      label: 'Descuadre (und)',
      value: data.hasAnyValidation ? signed(data.descuadreUnd) : '—',
      hint: data.hasAnyValidation
        ? `Faltante ${nf.format(data.faltante)} · Sobrante ${signed(data.sobrante)}`
        : 'Sin validaciones consolidadas',
      danger: data.hasAnyValidation && data.descuadreUnd !== 0,
    },
    { label: 'Descuadre ($)', value: '—', hint: 'PT sin costo unitario cargado' },
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

      <div className="grid gap-4 grid-cols-2 lg:grid-cols-5">
        {kpis.map((k) => (
          <Card key={k.label} className="glass-card">
            <CardContent className="p-4">
              <p className="text-xs text-muted-foreground">{k.label}</p>
              <p className={`text-2xl font-bold mt-1 ${k.danger ? 'text-destructive' : 'text-foreground'}`}>{k.value}</p>
              <div className="text-[11px] text-muted-foreground mt-1">{k.hint}</div>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="glass-card">
          <CardHeader className="pb-2"><CardTitle className="text-base">Por estado</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            {data.byStatus.map((s) => {
              const meta = STATUS_META[s.key] || STATUS_META['n/a'];
              const pct = data.totalRefs ? Math.round((s.count / data.totalRefs) * 100) : 0;
              const statusParam = s.key.startsWith('pendiente') ? 'pendiente' : s.key;
              return (
                <button
                  key={s.key}
                  type="button"
                  onClick={() => navigate(`/superadmin/auditoria/pt?status=${statusParam}`)}
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
            <p className="text-[11px] text-muted-foreground pt-1">
              Una referencia solo cambia de estado cuando todas sus ubicaciones completan los conteos de la
              ronda vigente (C1 y C2 en la ronda 1).
            </p>
          </CardContent>
        </Card>

        <Card className="glass-card">
          <CardHeader className="pb-2"><CardTitle className="text-base">Por ronda vigente</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            {data.byRound.map((r) => {
              const pct = r.required ? Math.round((r.done / r.required) * 100) : 100;
              return (
                <div key={r.key}>
                  <div className="flex items-center justify-between text-sm mb-1">
                    <span>{r.label} <span className="text-muted-foreground">· {nf.format(r.count)} refs</span></span>
                    <span className="text-muted-foreground">
                      {r.required ? `${nf.format(r.done)} / ${nf.format(r.required)} conteos` : 'completo'}
                    </span>
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
        <CardHeader className="pb-2"><CardTitle className="text-base">Avance por piso</CardTitle></CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Piso</TableHead>
                <TableHead className="text-right">Ubicaciones</TableHead>
                <TableHead className="text-right">Contadas</TableHead>
                <TableHead className="text-right">Validadas</TableHead>
                <TableHead className="text-right">Avance</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.byFloor.map((f) => (
                <TableRow key={f.piso}>
                  <TableCell className="font-medium">Piso {f.piso}</TableCell>
                  <TableCell className="text-right">{nf.format(f.ubicaciones)}</TableCell>
                  <TableCell className="text-right">{nf.format(f.contadas)}</TableCell>
                  <TableCell className="text-right">{nf.format(f.validadas)}</TableCell>
                  <TableCell className="text-right">
                    {f.ubicaciones ? Math.round((f.contadas / f.ubicaciones) * 100) : 0}%
                  </TableCell>
                </TableRow>
              ))}
              {data.byFloor.length === 0 && (
                <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground">Sin ubicaciones</TableCell></TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Card className="glass-card">
        <CardHeader className="pb-2"><CardTitle className="text-base">Top 10 descuadres (unidades)</CardTitle></CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Referencia</TableHead>
                <TableHead>Descripción</TableHead>
                <TableHead className="text-right">ERP</TableHead>
                <TableHead className="text-right">Validado</TableHead>
                <TableHead className="text-right">Descuadre</TableHead>
                <TableHead>Estado</TableHead>
                <TableHead className="text-center">Ronda</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {topDescuadres.map((r) => (
                <TableRow
                  key={r.referencia}
                  className="cursor-pointer"
                  onClick={() => navigate(`/superadmin/auditoria/pt?ref=${encodeURIComponent(r.referencia)}`)}
                >
                  <TableCell className="font-medium">{r.referencia}</TableCell>
                  <TableCell className="text-muted-foreground truncate max-w-[240px]">{r.descripcion || '-'}</TableCell>
                  <TableCell className="text-right">{nf.format(r.erp)}</TableCell>
                  <TableCell className="text-right">{nf.format(r.validado)}</TableCell>
                  <TableCell className="text-right text-destructive">{signed(r.descuadre)}</TableCell>
                  <TableCell>{STATUS_META[r.status]?.label || r.status}</TableCell>
                  <TableCell className="text-center">C{r.round}</TableCell>
                </TableRow>
              ))}
              {topDescuadres.length === 0 && (
                <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground">Sin descuadres con validación consolidada</TableCell></TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
};

export default AuditoriaPtKpiPanel;
