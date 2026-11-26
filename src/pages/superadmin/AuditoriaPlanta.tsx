import React from 'react';
import { useSearchParams } from 'react-router-dom';
import AppLayout from '@/components/layout/AppLayout';
import ReadOnlyBanner from '@/components/shared/ReadOnlyBanner';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import AuditoriaBodegaTable from '@/components/superadmin/AuditoriaBodegaTable';

const AuditoriaPlanta: React.FC = () => {
  const [params] = useSearchParams();
  const defaultTab = params.get('familia') === 'PP' ? 'PP' : 'MP';
  return (
    <AppLayout title="Auditoría Planta" subtitle="Referencias con ubicaciones de planta" showBackButton backPath="/dashboard">
      <div className="space-y-4">
        <ReadOnlyBanner />
        <Tabs defaultValue={defaultTab}>
        <TabsList>
          <TabsTrigger value="MP">Materia Prima</TabsTrigger>
          <TabsTrigger value="PP">Producto en Proceso</TabsTrigger>
        </TabsList>
        <TabsContent value="MP" className="mt-4">
          <AuditoriaBodegaTable bodega="planta" materialType="MP" />
        </TabsContent>
        <TabsContent value="PP" className="mt-4">
          <AuditoriaBodegaTable bodega="planta" materialType="PP" />
        </TabsContent>
      </Tabs>
    </div>
  </AppLayout>
  );
};

export default AuditoriaPlanta;
