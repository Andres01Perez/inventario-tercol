import React from 'react';
import AppLayout from '@/components/layout/AppLayout';
import ReadOnlyBanner from '@/components/shared/ReadOnlyBanner';
import AuditoriaPtTable from '@/components/superadmin/AuditoriaPtTable';

const AuditoriaPT: React.FC = () => (
  <AppLayout
    title="Auditoría PT"
    subtitle="Producto Terminado: conteos por piso, validación y descuadre"
    showBackButton
    backPath="/dashboard"
    fullWidth
  >
    <div className="space-y-4">
      <ReadOnlyBanner />
      <AuditoriaPtTable />
    </div>
  </AppLayout>
);

export default AuditoriaPT;
