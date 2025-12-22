import React from 'react';
import AppLayout from '@/components/layout/AppLayout';
import OperariosManagement from '@/components/shared/OperariosManagement';

const Operarios: React.FC = () => {
  return (
    <AppLayout
      title="Gestión de Operarios"
      subtitle="Administrar operarios del sistema"
      showBackButton={true}
      backPath="/dashboard"
    >
      <OperariosManagement />
    </AppLayout>
  );
};

export default Operarios;
