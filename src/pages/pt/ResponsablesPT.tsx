import React, { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import AppLayout from '@/components/layout/AppLayout';
import ReadOnlyBanner from '@/components/shared/ReadOnlyBanner';
import InventorySelector from '@/components/shared/InventorySelector';
import { useInventory } from '@/contexts/InventoryContext';
import { useToast } from '@/hooks/use-toast';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Loader2, Users } from 'lucide-react';

const UNASSIGNED = 'none';
const PAGE_SIZE = 1000;

interface FloorRow {
  piso: string;
  locations: number;
  references: number;
  supervisor_id: string | null;
}

const ResponsablesPT: React.FC = () => {
  const { inventoryId, isReadOnly } = useInventory();
  const { toast } = useToast();
  const [saving, setSaving] = useState<string | null>(null);

  const { data: supervisors = [] } = useQuery({
    queryKey: ['pt-supervisors'],
    queryFn: async () => {
      const { data: roles, error } = await supabase
        .from('user_roles')
        .select('user_id')
        .eq('role', 'supervisor');
      if (error) throw error;
      const ids = (roles || []).map((r) => r.user_id);
      if (!ids.length) return [];
      const { data: profiles, error: pError } = await supabase
        .from('profiles')
        .select('id, full_name, email')
        .in('id', ids);
      if (pError) throw pError;
      return (profiles || []).sort((a, b) =>
        (a.full_name || a.email || '').localeCompare(b.full_name || b.email || '', 'es')
      );
    },
  });

  const { data: floors = [], isLoading, refetch } = useQuery({
    queryKey: ['pt-floors', inventoryId],
    enabled: !!inventoryId,
    queryFn: async () => {
      const rows: { piso: string; referencia: string; assigned_supervisor_id: string | null }[] = [];
      for (let from = 0; ; from += PAGE_SIZE) {
        const { data, error } = await supabase
          .from('pt_locations')
          .select('piso, referencia, assigned_supervisor_id')
          .eq('inventory_id', inventoryId!)
          .range(from, from + PAGE_SIZE - 1);
        if (error) throw error;
        rows.push(...(data || []));
        if (!data || data.length < PAGE_SIZE) break;
      }

      const { data: assignments, error: aError } = await supabase
        .from('pt_floor_assignments')
        .select('piso, supervisor_id')
        .eq('inventory_id', inventoryId!);
      if (aError) throw aError;
      const assignMap = new Map((assignments || []).map((a) => [a.piso, a.supervisor_id]));

      const map = new Map<string, { locations: number; refs: Set<string>; supervisor: string | null }>();
      for (const r of rows) {
        const entry = map.get(r.piso) || { locations: 0, refs: new Set<string>(), supervisor: null };
        entry.locations += 1;
        entry.refs.add(r.referencia);
        if (!entry.supervisor) entry.supervisor = r.assigned_supervisor_id;
        map.set(r.piso, entry);
      }

      const result: FloorRow[] = [...map.entries()].map(([piso, v]) => ({
        piso,
        locations: v.locations,
        references: v.refs.size,
        supervisor_id: assignMap.get(piso) ?? v.supervisor ?? null,
      }));

      return result.sort((a, b) => a.piso.localeCompare(b.piso, 'es', { numeric: true }));
    },
  });

  const supervisorMap = useMemo(
    () => new Map(supervisors.map((s) => [s.id, s.full_name || s.email || 'Sin nombre'])),
    [supervisors]
  );

  const assign = async (piso: string, value: string) => {
    if (!inventoryId) return;
    const supervisorId = value === UNASSIGNED ? null : value;
    setSaving(piso);
    try {
      if (supervisorId) {
        const { error } = await supabase
          .from('pt_floor_assignments')
          .upsert(
            { inventory_id: inventoryId, piso, supervisor_id: supervisorId },
            { onConflict: 'inventory_id,piso' }
          );
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from('pt_floor_assignments')
          .delete()
          .eq('inventory_id', inventoryId)
          .eq('piso', piso);
        if (error) throw error;
      }

      const { error: locError } = await supabase
        .from('pt_locations')
        .update({ assigned_supervisor_id: supervisorId })
        .eq('inventory_id', inventoryId)
        .eq('piso', piso);
      if (locError) throw locError;

      toast({
        title: 'Asignación actualizada',
        description: supervisorId
          ? `Piso ${piso} → ${supervisorMap.get(supervisorId)}`
          : `Piso ${piso} sin líder de conteo`,
      });
      refetch();
    } catch (error) {
      console.error('[PT-ASSIGN]', error);
      toast({
        title: 'Error al asignar',
        description: error instanceof Error ? error.message : 'Intenta de nuevo',
        variant: 'destructive',
      });
    } finally {
      setSaving(null);
    }
  };

  const assigned = floors.filter((f) => f.supervisor_id).length;

  return (
    <AppLayout
      title="Responsables PT"
      subtitle="Asignar líderes de conteo por piso"
      showBackButton
      backPath="/dashboard"
    >
      <div className="space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex gap-2">
            <Badge variant="outline">{floors.length} pisos</Badge>
            <Badge variant="outline" className="bg-green-500/10 text-green-600 border-green-500/30">
              {assigned} asignados
            </Badge>
          </div>
          <InventorySelector />
        </div>

        <ReadOnlyBanner />

        <Card>
          <CardContent className="p-4">
            {isLoading ? (
              <div className="py-12 text-center">
                <Loader2 className="w-8 h-8 animate-spin text-primary mx-auto" />
              </div>
            ) : floors.length === 0 ? (
              <div className="py-12 text-center text-muted-foreground">
                <Users className="w-10 h-10 mx-auto mb-3 opacity-50" />
                No hay ubicaciones PT importadas en este inventario.
              </div>
            ) : (
              <div className="border rounded-lg overflow-hidden">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Piso</TableHead>
                      <TableHead className="text-right">Ubicaciones</TableHead>
                      <TableHead className="text-right">Referencias</TableHead>
                      <TableHead className="w-[300px]">Líder de conteo</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {floors.map((f) => (
                      <TableRow key={f.piso}>
                        <TableCell className="font-medium">Piso {f.piso}</TableCell>
                        <TableCell className="text-right">{f.locations}</TableCell>
                        <TableCell className="text-right">{f.references}</TableCell>
                        <TableCell>
                          <Select
                            value={f.supervisor_id ?? UNASSIGNED}
                            onValueChange={(v) => assign(f.piso, v)}
                            disabled={isReadOnly || saving === f.piso}
                          >
                            <SelectTrigger>
                              <SelectValue placeholder="Sin asignar" />
                            </SelectTrigger>
                            <SelectContent className="bg-popover z-50">
                              <SelectItem value={UNASSIGNED}>Sin asignar</SelectItem>
                              {supervisors.map((s) => (
                                <SelectItem key={s.id} value={s.id}>
                                  {s.full_name || s.email}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </AppLayout>
  );
};

export default ResponsablesPT;
