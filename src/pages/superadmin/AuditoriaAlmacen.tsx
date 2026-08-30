import React from 'react';
import AppLayout from '@/components/layout/AppLayout';
import ReadOnlyBanner from '@/components/shared/ReadOnlyBanner';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import AuditoriaBodegaTable from '@/components/superadmin/AuditoriaBodegaTable';

const AuditoriaAlmacen: React.FC = () => (
  <AppLayout title="Auditoría Almacén" subtitle="Referencias con ubicaciones de almacén" showBackButton backPath="/dashboard">
    <div className="space-y-4">
      <ReadOnlyBanner />
      <Tabs defaultValue="MP">
        <TabsList>
          <TabsTrigger value="MP">Materia Prima</TabsTrigger>
          <TabsTrigger value="PP">Producto en Proceso</TabsTrigger>
        </TabsList>
        <TabsContent value="MP" className="mt-4">
          <AuditoriaBodegaTable bodega="almacen" materialType="MP" />
        </TabsContent>
        <TabsContent value="PP" className="mt-4">
          <AuditoriaBodegaTable bodega="almacen" materialType="PP" />
        </TabsContent>
      </Tabs>
    </div>
  </AppLayout>
);

export default AuditoriaAlmacen;
