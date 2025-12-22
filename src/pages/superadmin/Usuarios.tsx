import React from 'react';
import AppLayout from '@/components/layout/AppLayout';
import UserManagement from '@/components/superadmin/UserManagement';

const Usuarios: React.FC = () => {
  return (
    <AppLayout
      title="Gestión de Usuarios"
      subtitle="Superadmin"
      showBackButton={true}
      backPath="/dashboard"
    >
      <UserManagement />
    </AppLayout>
  );
};

export default Usuarios;
