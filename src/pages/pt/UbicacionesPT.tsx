import React, { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import AppLayout from '@/components/layout/AppLayout';
import ReadOnlyBanner from '@/components/shared/ReadOnlyBanner';
import InventorySelector from '@/components/shared/InventorySelector';
import PtLocationsImport from '@/components/pt/PtLocationsImport';
import SupervisorSelect from '@/components/shared/SupervisorSelect';
import { useInventory } from '@/contexts/InventoryContext';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Loader2, Pencil, Search, Upload } from 'lucide-react';

interface PtLocationRow {
  id: string;
  referencia: string;
  piso: string;
  prodc: string | null;
  ubic: string | null;
  linea: string | null;
  ue: number | null;
  assigned_supervisor_id: string | null;
}

const PAGE_SIZE = 1000;

const UbicacionesPT: React.FC = () => {
  const { inventoryId, isReadOnly } = useInventory();
  const { toast } = useToast();
  const [search, setSearch] = useState('');
  const [piso, setPiso] = useState<string>('all');
  const [importOpen, setImportOpen] = useState(false);
  const [editing, setEditing] = useState<PtLocationRow | null>(null);
  const [editUe, setEditUe] = useState('');
  const [editSupervisor, setEditSupervisor] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);


  const { data: locations = [], isLoading, refetch } = useQuery({
    queryKey: ['pt-locations', inventoryId],
    enabled: !!inventoryId,
    queryFn: async () => {
      const all: PtLocationRow[] = [];
      for (let from = 0; ; from += PAGE_SIZE) {
        const { data, error } = await supabase
          .from('pt_locations')
          .select('id, referencia, piso, prodc, ubic, linea, ue, assigned_supervisor_id')
          .eq('inventory_id', inventoryId!)
          .order('piso', { ascending: true })
          .order('orden', { ascending: true, nullsFirst: false })
          .range(from, from + PAGE_SIZE - 1);
        if (error) throw error;
        all.push(...((data || []) as PtLocationRow[]));
        if (!data || data.length < PAGE_SIZE) break;
      }
      return all;
    },
  });

  const { data: profiles = [] } = useQuery({
    queryKey: ['pt-supervisor-profiles'],
    queryFn: async () => {
      const { data, error } = await supabase.from('profiles').select('id, full_name, email');
      if (error) throw error;
      return data || [];
    },
  });

  const profileMap = useMemo(
    () => new Map(profiles.map((p) => [p.id, p.full_name || p.email || 'Sin nombre'])),
    [profiles]
  );

  const pisos = useMemo(
    () => [...new Set(locations.map((l) => l.piso))].sort((a, b) => a.localeCompare(b, 'es', { numeric: true })),
    [locations]
  );

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    return locations.filter((l) => {
      if (piso !== 'all' && l.piso !== piso) return false;
      if (!term) return true;
      return (
        l.referencia.toLowerCase().includes(term) ||
        (l.ubic || '').toLowerCase().includes(term) ||
        (l.linea || '').toLowerCase().includes(term)
      );
    });
  }, [locations, search, piso]);

  const openEdit = (l: PtLocationRow) => {
    setEditing(l);
    setEditUe(l.ue !== null && l.ue !== undefined ? String(l.ue) : '');
    setEditSupervisor(l.assigned_supervisor_id);
  };

  const handleSave = async () => {
    if (!editing) return;
    const trimmed = editUe.trim();
    let ueValue: number | null = null;
    if (trimmed !== '') {
      const parsed = Number(trimmed.replace(',', '.'));
      if (Number.isNaN(parsed)) {
        toast({ title: 'U.E inválida', description: 'Ingresa un número o deja el campo vacío.', variant: 'destructive' });
        return;
      }
      ueValue = parsed;
    }
    setSaving(true);
    const { error } = await supabase
      .from('pt_locations')
      .update({ ue: ueValue, assigned_supervisor_id: editSupervisor })
      .eq('id', editing.id);
    setSaving(false);
    if (error) {
      toast({ title: 'No se pudo guardar', description: error.message, variant: 'destructive' });
      return;
    }
    toast({ title: 'Ubicación actualizada' });
    setEditing(null);
    refetch();
  };


  return (
    <AppLayout
      title="Ubicaciones PT"
      subtitle="Pisos y ubicaciones de Producto Terminado"
      showBackButton
      backPath="/dashboard"
      fullWidth
    >
      <div className="space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex gap-2 flex-wrap">
            <Badge variant="outline">{locations.length} ubicaciones</Badge>
            <Badge variant="outline">{pisos.length} pisos</Badge>
          </div>
          <div className="flex items-center gap-3">
            <InventorySelector />
            <Dialog open={importOpen} onOpenChange={setImportOpen}>
              <DialogTrigger asChild>
                <Button>
                  <Upload className="w-4 h-4 mr-2" />
                  Importar ubicaciones
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
                <DialogHeader>
                  <DialogTitle>Importar ubicaciones PT</DialogTitle>
                </DialogHeader>
                <PtLocationsImport
                  onSuccess={() => {
                    refetch();
                  }}
                />
              </DialogContent>
            </Dialog>
          </div>
        </div>

        <ReadOnlyBanner />

        <Card>
          <CardContent className="p-4 space-y-4">
            <div className="flex flex-wrap gap-3">
              <div className="relative flex-1 min-w-[220px]">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                  placeholder="Buscar referencia, ubicación o línea..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="pl-9"
                />
              </div>
              <Select value={piso} onValueChange={setPiso}>
                <SelectTrigger className="w-[180px]">
                  <SelectValue placeholder="Piso" />
                </SelectTrigger>
                <SelectContent className="bg-popover z-50">
                  <SelectItem value="all">Todos los pisos</SelectItem>
                  {pisos.map((p) => (
                    <SelectItem key={p} value={p}>
                      Piso {p}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {isLoading ? (
              <div className="py-12 text-center">
                <Loader2 className="w-8 h-8 animate-spin text-primary mx-auto" />
              </div>
            ) : (
              <div className="border rounded-lg overflow-hidden">
                <div className="max-h-[60vh] overflow-y-auto">
                  <Table>
                    <TableHeader className="sticky top-0 bg-card z-10">
                      <TableRow>
                        <TableHead>Piso</TableHead>
                        <TableHead>Referencia</TableHead>
                        <TableHead>Prodc</TableHead>
                        <TableHead>Ubic</TableHead>
                        <TableHead>Línea</TableHead>
                        <TableHead className="text-right">U.E</TableHead>
                        <TableHead>Líder de conteo</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filtered.slice(0, 500).map((l) => (
                        <TableRow key={l.id}>
                          <TableCell>{l.piso}</TableCell>
                          <TableCell className="font-mono text-xs">{l.referencia}</TableCell>
                          <TableCell>{l.prodc || '-'}</TableCell>
                          <TableCell className="text-xs">{l.ubic || '-'}</TableCell>
                          <TableCell>{l.linea || '-'}</TableCell>
                          <TableCell className="text-right">{l.ue ?? '-'}</TableCell>
                          <TableCell className="text-sm">
                            {l.assigned_supervisor_id ? (
                              profileMap.get(l.assigned_supervisor_id) || 'Desconocido'
                            ) : (
                              <span className="text-muted-foreground">Sin asignar</span>
                            )}
                          </TableCell>
                        </TableRow>
                      ))}
                      {filtered.length === 0 && (
                        <TableRow>
                          <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                            No hay ubicaciones PT que coincidan.
                          </TableCell>
                        </TableRow>
                      )}
                    </TableBody>
                  </Table>
                </div>
                {filtered.length > 500 && (
                  <div className="text-center py-2 text-sm text-muted-foreground bg-muted/50">
                    Mostrando 500 de {filtered.length}. Usa los filtros para acotar.
                  </div>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </AppLayout>
  );
};

export default UbicacionesPT;
