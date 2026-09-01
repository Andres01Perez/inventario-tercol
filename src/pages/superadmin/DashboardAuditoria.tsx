import React, { useState } from 'react';
import AppLayout from '@/components/layout/AppLayout';
import ReadOnlyBanner from '@/components/shared/ReadOnlyBanner';
import { Button } from '@/components/ui/button';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import AuditoriaKpiPanel, { Bodega } from '@/components/superadmin/AuditoriaKpiPanel';
import { Warehouse, Factory } from 'lucide-react';

type Familia = 'all' | 'MP' | 'PP';

const DashboardAuditoria: React.FC = () => {
  const [bodega, setBodega] = useState<Bodega>('almacen');
  const [familia, setFamilia] = useState<Familia>('all');

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
            <Button
              variant={bodega === 'almacen' ? 'default' : 'ghost'}
              size="sm"
              onClick={() => setBodega('almacen')}
            >
              <Warehouse className="w-4 h-4 mr-2" />
              Almacén
            </Button>
            <Button
              variant={bodega === 'planta' ? 'default' : 'ghost'}
              size="sm"
              onClick={() => setBodega('planta')}
            >
              <Factory className="w-4 h-4 mr-2" />
              Planta
            </Button>
          </div>

          <Tabs value={familia} onValueChange={(v) => setFamilia(v as Familia)}>
            <TabsList>
              <TabsTrigger value="all">Todas</TabsTrigger>
              <TabsTrigger value="MP">MP</TabsTrigger>
              <TabsTrigger value="PP">PP</TabsTrigger>
            </TabsList>
          </Tabs>
        </div>

        <AuditoriaKpiPanel bodega={bodega} familia={familia} />
      </div>
    </AppLayout>
  );
};

export default DashboardAuditoria;
