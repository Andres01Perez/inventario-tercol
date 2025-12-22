import React from 'react';
import { useAuth } from '@/contexts/AuthContext';
import AppLayout from '@/components/layout/AppLayout';
import OperationalPanel from '@/components/shared/OperationalPanel';

const GestionOperativa: React.FC = () => {
  const { role } = useAuth();

  // Determine control filter based on role
  const controlFilter = React.useMemo(() => {
    switch (role) {
      case 'admin_mp':
        return 'not_null' as const;
      case 'admin_pp':
        return 'null' as const;
      default:
        return 'all' as const;
    }
  }, [role]);

  const isAdminMode = role !== 'supervisor';

  const subtitle = React.useMemo(() => {
    switch (role) {
      case 'admin_mp':
        return 'Materia Prima';
      case 'admin_pp':
        return 'Producto en Proceso';
      case 'superadmin':
        return 'Todas las referencias';
      default:
        return 'Tus ubicaciones asignadas';
    }
  }, [role]);

  return (
    <AppLayout
      title="Gestión Operativa"
      subtitle={subtitle}
      showBackButton={true}
      backPath="/dashboard"
    >
      <div className="space-y-6">
        <div>
          <h2 className="text-xl font-semibold text-foreground">Gestión de Conteos por Rondas</h2>
          <p className="text-muted-foreground">
            {role === 'supervisor'
              ? 'Asigna operarios y transcribe conteos para tus ubicaciones'
              : `Gestiona ubicaciones y transcribe conteos`
            }
          </p>
        </div>
        <OperationalPanel
          isAdminMode={isAdminMode}
          controlFilter={controlFilter}
        />
      </div>
    </AppLayout>
  );
};

export default GestionOperativa;
