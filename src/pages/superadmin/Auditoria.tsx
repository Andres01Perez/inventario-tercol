import React from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useInventory } from '@/contexts/InventoryContext';
import AppLayout from '@/components/layout/AppLayout';
import ReadOnlyBanner from '@/components/shared/ReadOnlyBanner';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Warehouse, Factory, ChevronRight } from 'lucide-react';

const useBodegaCounts = (bodega: 'almacen' | 'planta') => {
  const { inventoryId } = useInventory();
  return useQuery({
    queryKey: ['audit-bodega-summary', bodega, inventoryId],
    enabled: !!inventoryId,
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      const counts = await Promise.all(
        (['MP', 'PP'] as const).map(async (mt) => {
          const { count, error } = await supabase
            .from('locations_bodega_view')
            .select('id', { count: 'exact', head: true })
            .eq('inventory_id', inventoryId!)
            .eq('bodega', bodega)
            .eq('material_type', mt);
          if (error) throw error;
          return count || 0;
        })
      );
      return { mp: counts[0], pp: counts[1] };
    },
  });
};

const BodegaCard: React.FC<{
  title: string;
  description: string;
  icon: React.ElementType;
  accent: string;
  bodega: 'almacen' | 'planta';
  path: string;
}> = ({ title, description, icon: Icon, accent, bodega, path }) => {
  const navigate = useNavigate();
  const { data } = useBodegaCounts(bodega);

  return (
    <Card className="glass-card-interactive cursor-pointer" onClick={() => navigate(path)}>
      <CardHeader>
        <div className="flex items-start justify-between">
          <div className={`p-3 rounded-xl ${accent}`}>
            <Icon className="w-6 h-6" />
          </div>
          <ChevronRight className="w-5 h-5 text-muted-foreground" />
        </div>
        <CardTitle className="mt-4">{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="flex gap-2">
          <Badge variant="outline" className="border-orange-500/50 text-orange-600">
            MP: {data?.mp ?? '—'} ubic.
          </Badge>
          <Badge variant="outline" className="border-emerald-500/50 text-emerald-600">
            PP: {data?.pp ?? '—'} ubic.
          </Badge>
        </div>
      </CardContent>
    </Card>
  );
};

const Auditoria: React.FC = () => (
  <AppLayout title="Auditoría" subtitle="Selecciona la bodega a auditar" showBackButton backPath="/dashboard">
    <div className="space-y-6">
      <ReadOnlyBanner />
      <div className="grid gap-4 md:grid-cols-2">
        <BodegaCard
          title="Auditoría Almacén"
          description="Ubicaciones gestionadas por el admin de almacén. ERP = Cant. Almacén."
          icon={Warehouse}
          accent="bg-cyan-500/10 text-cyan-500"
          bodega="almacen"
          path="/superadmin/auditoria/almacen"
        />
        <BodegaCard
          title="Auditoría Planta"
          description="Ubicaciones gestionadas por el admin de planta. ERP = Cant. PLd + Cant. PLr."
          icon={Factory}
          accent="bg-violet-500/10 text-violet-500"
          bodega="planta"
          path="/superadmin/auditoria/planta"
        />
      </div>
      <p className="text-sm text-muted-foreground">
        Cada bodega avanza de ronda por separado: una referencia puede estar auditada en almacén y en conflicto en planta.
      </p>
    </div>
  </AppLayout>
);

export default Auditoria;
