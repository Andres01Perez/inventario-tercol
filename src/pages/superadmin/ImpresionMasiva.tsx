import React, { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useInventory } from '@/contexts/InventoryContext';
import AppLayout from '@/components/layout/AppLayout';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Loader2, Printer, MapPin } from 'lucide-react';
import BulkPrintableSheets, {
  printBulkSheets,
  BulkLocationItem,
  BulkPrintGroup,
} from '@/components/supervisor/BulkPrintableSheets';


const BATCH = 1000;

interface LocationRow extends BulkLocationItem {
  assigned_supervisor_id: string | null;
}

const ImpresionMasiva: React.FC = () => {
  const { inventoryId } = useInventory();
  const [round, setRound] = useState<'1' | '2'>('1');
  const [supervisorFilter, setSupervisorFilter] = useState<string>('all');
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [printOpen, setPrintOpen] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ['impresion-masiva', inventoryId],
    enabled: !!inventoryId,
    queryFn: async () => {
      const rows: LocationRow[] = [];
      let from = 0;
      // eslint-disable-next-line no-constant-condition
      while (true) {
        const { data: page, error } = await supabase
          .from('locations')
          .select(
            'id, master_reference, location_name, location_detail, subcategoria, observaciones, punto_referencia, metodo_conteo, activo, terminado, assigned_supervisor_id, inventory_master:inventory_master(referencia, material_type)'
          )
          .eq('inventory_id', inventoryId!)
          .order('punto_referencia', { ascending: true })
          .order('master_reference', { ascending: true })
          .range(from, from + BATCH - 1);
        if (error) throw error;
        const batch = (page || []) as unknown as LocationRow[];
        rows.push(...batch);
        if (batch.length < BATCH) break;
        from += BATCH;
      }

      const supervisorIds = Array.from(
        new Set(rows.map((r) => r.assigned_supervisor_id).filter(Boolean) as string[])
      );
      const profilesMap: Record<string, string> = {};
      for (let i = 0; i < supervisorIds.length; i += 200) {
        const chunk = supervisorIds.slice(i, i + 200);
        const { data: profs, error: pErr } = await supabase
          .from('profiles')
          .select('id, full_name, email')
          .in('id', chunk);
        if (pErr) throw pErr;
        (profs || []).forEach((p) => {
          profilesMap[p.id] = p.full_name || p.email || 'Sin nombre';
        });
      }

      return { rows, profilesMap };
    },
  });

  const rows = data?.rows ?? [];
  const profilesMap = data?.profilesMap ?? {};

  const supervisors = useMemo(() => {
    const ids = Array.from(
      new Set(rows.map((r) => r.assigned_supervisor_id).filter(Boolean) as string[])
    );
    return ids
      .map((id) => ({ id, name: profilesMap[id] || 'Sin nombre' }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [rows, profilesMap]);

  const groups: BulkPrintGroup[] = useMemo(() => {
    let filtered = rows;
    if (supervisorFilter === 'none') {
      filtered = filtered.filter((r) => !r.assigned_supervisor_id);
    } else if (supervisorFilter !== 'all') {
      filtered = filtered.filter((r) => r.assigned_supervisor_id === supervisorFilter);
    }

    const term = search.trim().toUpperCase();
    if (term) {
      filtered = filtered.filter(
        (r) =>
          (r.punto_referencia || '').toUpperCase().includes(term) ||
          r.master_reference.toUpperCase().includes(term) ||
          (r.location_name || '').toUpperCase().includes(term)
      );
    }

    const map: Record<string, { zoneName: string; locations: LocationRow[] }> = {};
    filtered.forEach((loc) => {
      const key = loc.punto_referencia || 'sin_zona';
      const zoneName = loc.punto_referencia || 'Sin Zona Asignada';
      if (!map[key]) map[key] = { zoneName, locations: [] };
      map[key].locations.push(loc);
    });

    return Object.entries(map)
      .sort((a, b) => {
        if (a[0] === 'sin_zona') return 1;
        if (b[0] === 'sin_zona') return -1;
        return a[1].zoneName.localeCompare(b[1].zoneName);
      })
      .map(([key, g]) => {
        const names = Array.from(
          new Set(
            g.locations.map((l) =>
              l.assigned_supervisor_id ? profilesMap[l.assigned_supervisor_id] || 'Sin nombre' : null
            ).filter(Boolean) as string[]
          )
        );
        return {
          key,
          zoneName: g.zoneName,
          supervisorName: names.length ? names.join(' / ') : 'Sin asignar',
          locations: g.locations as BulkLocationItem[],
        };
      });
  }, [rows, profilesMap, supervisorFilter, search]);

  const selectedGroups = useMemo(
    () => groups.filter((g) => selected.has(g.key)),
    [groups, selected]
  );
  const selectedItems = selectedGroups.reduce((acc, g) => acc + g.locations.length, 0);

  const toggle = (key: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const selectAll = () => setSelected(new Set(groups.map((g) => g.key)));
  const clearAll = () => setSelected(new Set());

  return (
    <AppLayout
      title="Impresión Masiva"
      subtitle="Selecciona zonas e imprime todas las planillas de una sola vez"
      showBackButton
      backPath="/dashboard"
    >
      <div className="space-y-6">
        <Card className="glass-card">
          <CardHeader>
            <CardTitle className="text-base">Filtros</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4 md:grid-cols-3">
            <div className="space-y-2">
              <label className="text-sm text-muted-foreground">Conteo</label>
              <Select value={round} onValueChange={(v) => setRound(v as '1' | '2')}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="1">Conteo 1 (Turno 1)</SelectItem>
                  <SelectItem value="2">Conteo 2 (Turno 2)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <label className="text-sm text-muted-foreground">Responsable</label>
              <Select value={supervisorFilter} onValueChange={setSupervisorFilter}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos</SelectItem>
                  <SelectItem value="none">Sin asignar</SelectItem>
                  {supervisors.map((s) => (
                    <SelectItem key={s.id} value={s.id}>
                      {s.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <label className="text-sm text-muted-foreground">Buscar zona o referencia</label>
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Ej: BODEGA 1, AESTRIADAT..."
              />
            </div>
          </CardContent>
        </Card>

        <Card className="glass-card">
          <CardHeader className="flex flex-row items-center justify-between gap-4 flex-wrap">
            <CardTitle className="text-base">
              Zonas ({groups.length}) · Seleccionadas: {selectedGroups.length} ({selectedItems} ubicaciones)
            </CardTitle>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={selectAll} disabled={!groups.length}>
                Seleccionar todas
              </Button>
              <Button variant="outline" size="sm" onClick={clearAll} disabled={!selected.size}>
                Limpiar
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setPrintOpen(true)}
                disabled={!selectedGroups.length}
              >
                Vista previa
              </Button>
              <Button
                size="sm"
                onClick={printBulkSheets}
                disabled={!selectedGroups.length}
              >
                <Printer className="w-4 h-4 mr-2" />
                Imprimir seleccionadas
              </Button>
            </div>

          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="flex justify-center py-12">
                <Loader2 className="w-6 h-6 animate-spin text-primary" />
              </div>
            ) : groups.length === 0 ? (
              <p className="text-center py-12 text-muted-foreground">
                No hay ubicaciones para los filtros seleccionados
              </p>
            ) : (
              <div className="grid gap-2 md:grid-cols-2">
                {groups.map((g) => (
                  <label
                    key={g.key}
                    className="flex items-start gap-3 rounded-lg border border-border p-3 cursor-pointer hover:bg-muted/40"
                  >
                    <Checkbox
                      checked={selected.has(g.key)}
                      onCheckedChange={() => toggle(g.key)}
                      className="mt-1"
                    />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <MapPin className="w-4 h-4 text-muted-foreground shrink-0" />
                        <span className="font-medium truncate">{g.zoneName}</span>
                      </div>
                      <p className="text-xs text-muted-foreground truncate">
                        {g.supervisorName}
                      </p>
                    </div>
                    <Badge variant="secondary">{g.locations.length}</Badge>
                  </label>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <BulkPrintableSheets
        open={printOpen}
        onOpenChange={setPrintOpen}
        groups={selectedGroups}
        roundNumber={round === '1' ? 1 : 2}
      />
    </AppLayout>
  );
};

export default ImpresionMasiva;
