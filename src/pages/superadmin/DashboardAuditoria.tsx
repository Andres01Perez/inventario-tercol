import React, { useEffect, useState } from 'react';
import AppLayout from '@/components/layout/AppLayout';
import ReadOnlyBanner from '@/components/shared/ReadOnlyBanner';
import { Button } from '@/components/ui/button';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import AuditoriaKpiPanel, { Bodega } from '@/components/superadmin/AuditoriaKpiPanel';
import AuditoriaPtKpiPanel from '@/components/superadmin/AuditoriaPtKpiPanel';
import { supabase } from '@/integrations/supabase/client';
import { useInventory } from '@/contexts/InventoryContext';
import { Warehouse, Factory, PackageCheck } from 'lucide-react';

type Familia = 'all' | 'MP' | 'PP';
type Vista = Bodega | 'pt';

const DashboardAuditoria: React.FC = () => {
  const { inventoryId } = useInventory();
  const [vista, setVista] = useState<Vista>('almacen');
  const [familia, setFamilia] = useState<Familia>('all');
  const [piso, setPiso] = useState('all');
  const [pisos, setPisos] = useState<string[]>([]);

  useEffect(() => {
    if (vista !== 'pt' || !inventoryId) return;
    let cancelled = false;
    (async () => {
      const found = new Set<string>();
      let from = 0;
      // eslint-disable-next-line no-constant-condition
      while (true) {
        const { data, error } = await supabase
          .from('pt_locations')
          .select('piso')
          .eq('inventory_id', inventoryId)
          .range(from, from + 999);
        if (error || !data || data.length === 0) break;
        data.forEach((d) => d.piso && found.add(d.piso));
        if (data.length < 1000) break;
        from += 1000;
      }
      if (!cancelled) setPisos([...found].sort((a, b) => a.localeCompare(b, 'es', { numeric: true })));
    })();
    return () => { cancelled = true; };
  }, [vista, inventoryId]);

  return (
    <AppLayout
      title="Dashboard Auditoría"
      subtitle="Estado en vivo del conteo y del descuadre"
      showBackButton
      backPath="/dashboard"
    >
      <div className="space-y-4">
        <ReadOnlyBanner />

        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="inline-flex rounded-lg border border-border p-1 bg-muted/40">
            <Button variant={vista === 'almacen' ? 'default' : 'ghost'} size="sm" onClick={() => setVista('almacen')}>
              <Warehouse className="w-4 h-4 mr-2" />
              Almacén
            </Button>
            <Button variant={vista === 'planta' ? 'default' : 'ghost'} size="sm" onClick={() => setVista('planta')}>
              <Factory className="w-4 h-4 mr-2" />
              Planta
            </Button>
            <Button variant={vista === 'pt' ? 'default' : 'ghost'} size="sm" onClick={() => setVista('pt')}>
              <PackageCheck className="w-4 h-4 mr-2" />
              PT
            </Button>
          </div>

          {vista === 'pt' ? (
            <Select value={piso} onValueChange={setPiso}>
              <SelectTrigger className="w-[170px]"><SelectValue placeholder="Piso" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos los pisos</SelectItem>
                {pisos.map((p) => <SelectItem key={p} value={p}>Piso {p}</SelectItem>)}
              </SelectContent>
            </Select>
          ) : (
            <Tabs value={familia} onValueChange={(v) => setFamilia(v as Familia)}>
              <TabsList>
                <TabsTrigger value="all">Todas</TabsTrigger>
                <TabsTrigger value="MP">MP</TabsTrigger>
                <TabsTrigger value="PP">PP</TabsTrigger>
              </TabsList>
            </Tabs>
          )}
        </div>

        {vista === 'pt' ? (
          <AuditoriaPtKpiPanel piso={piso} />
        ) : (
          <AuditoriaKpiPanel bodega={vista} familia={familia} />
        )}
      </div>
    </AppLayout>
  );
};

export default DashboardAuditoria;
