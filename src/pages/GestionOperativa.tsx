import React from 'react';
import { useAuth } from '@/contexts/AuthContext';
import AppLayout from '@/components/layout/AppLayout';
import RoundSelectorCards from '@/components/shared/RoundSelectorCards';

const GestionOperativa: React.FC = () => {
  const { role } = useAuth();

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
          <h2 className="text-xl font-semibold text-foreground">Selecciona una Ronda de Conteo</h2>
          <p className="text-muted-foreground">
            {role === 'supervisor'
              ? 'Asigna operarios y transcribe conteos para tus ubicaciones'
              : 'Gestiona ubicaciones y transcribe conteos'
            }
          </p>
        </div>
        <RoundSelectorCards />
      </div>
    </AppLayout>
  );
};

export default GestionOperativa;
