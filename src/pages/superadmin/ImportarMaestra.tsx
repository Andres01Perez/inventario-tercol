import React from 'react';
import AppLayout from '@/components/layout/AppLayout';
import MasterDataImport from '@/components/superadmin/MasterDataImport';

const ImportarMaestra: React.FC = () => {
  return (
    <AppLayout
      title="Importar Maestra"
      subtitle="Cargar inventario desde archivo"
      showBackButton={true}
      backPath="/dashboard"
    >
      <MasterDataImport />
    </AppLayout>
  );
};

export default ImportarMaestra;
