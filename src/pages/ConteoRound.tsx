import React from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import AppLayout from '@/components/layout/AppLayout';
import GroupedTranscriptionTab from '@/components/supervisor/GroupedTranscriptionTab';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { FileEdit } from 'lucide-react';

const roundLabels: Record<number, { title: string; color: string }> = {
  1: { title: 'Conteo 1 - Primer Turno', color: 'text-blue-500' },
  2: { title: 'Conteo 2 - Segundo Turno', color: 'text-purple-500' },
  3: { title: 'Conteo 3 - Desempate', color: 'text-amber-500' },
  4: { title: 'Conteo 4 - Final', color: 'text-orange-500' },
};

const ConteoRound: React.FC = () => {
  const { round } = useParams<{ round: string }>();
  const navigate = useNavigate();
  const { role } = useAuth();
  
  const parsedRound = parseInt(round || '1', 10);
  const roundNumber = (parsedRound >= 1 && parsedRound <= 4 ? parsedRound : 1) as 1 | 2 | 3 | 4;

  // Validate round number
  if (parsedRound < 1 || parsedRound > 4) {
    navigate('/gestion-operativa');
    return null;
  }

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

  const roundConfig = roundLabels[roundNumber] || roundLabels[1];

  return (
    <AppLayout
      title={roundConfig.title}
      subtitle={subtitle}
      showBackButton={true}
      backPath="/gestion-operativa"
      fullWidth={true}
    >
      <div className="h-[calc(100vh-200px)] min-h-[500px]">
        <Card className="h-full">
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2">
              <FileEdit className="h-5 w-5 text-primary" />
              Transcripción de Conteos
            </CardTitle>
          </CardHeader>
          <CardContent className="h-[calc(100%-60px)] overflow-auto">
            <GroupedTranscriptionTab 
              roundNumber={roundNumber}
              isAdminMode={isAdminMode}
              controlFilter={controlFilter}
            />
          </CardContent>
        </Card>
      </div>
    </AppLayout>
  );
};

export default ConteoRound;
