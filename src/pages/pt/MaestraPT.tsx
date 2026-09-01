import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import AppLayout from '@/components/layout/AppLayout';
import ReadOnlyBanner from '@/components/shared/ReadOnlyBanner';
import InventorySelector from '@/components/shared/InventorySelector';
import PtMasterImport from '@/components/pt/PtMasterImport';
import { useInventory } from '@/contexts/InventoryContext';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';

const MaestraPT: React.FC = () => {
  const { inventoryId } = useInventory();

  const { data: stats, refetch } = useQuery({
    queryKey: ['pt-master-stats', inventoryId],
    enabled: !!inventoryId,
    queryFn: async () => {
      const { count, error } = await supabase
        .from('pt_master')
        .select('*', { count: 'exact', head: true })
        .eq('inventory_id', inventoryId!);
      if (error) throw error;

      const { count: locCount, error: locError } = await supabase
        .from('pt_locations')
        .select('*', { count: 'exact', head: true })
        .eq('inventory_id', inventoryId!);
      if (locError) throw locError;

      return { references: count ?? 0, locations: locCount ?? 0 };
    },
  });

  return (
    <AppLayout
      title="Maestra Producto Terminado"
      subtitle="Importar saldos ERP de PT"
      showBackButton
      backPath="/dashboard"
    >
      <div className="space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex gap-2">
            <Badge variant="outline">{stats?.references ?? 0} referencias PT</Badge>
            <Badge variant="outline">{stats?.locations ?? 0} ubicaciones PT</Badge>
          </div>
          <InventorySelector />
        </div>

        <ReadOnlyBanner />

        <Card>
          <CardHeader>
            <CardTitle>Importar maestra PT</CardTitle>
          </CardHeader>
          <CardContent>
            <PtMasterImport currentCount={stats?.references ?? 0} onSuccess={() => refetch()} />
          </CardContent>
        </Card>
      </div>
    </AppLayout>
  );
};

export default MaestraPT;
