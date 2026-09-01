import React from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { useIsMobile } from '@/hooks/use-mobile';
import AppLayout from '@/components/layout/AppLayout';
import PtTranscriptionTab from '@/components/pt/PtTranscriptionTab';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { FileEdit } from 'lucide-react';

const roundLabels: Record<number, string> = {
  1: 'PT · Conteo 1 - Primer Turno',
  2: 'PT · Conteo 2 - Segundo Turno',
  3: 'PT · Conteo 3 - Desempate',
  4: 'PT · Conteo 4 - Final',
};

const ConteoRoundPT: React.FC = () => {
  const { round } = useParams<{ round: string }>();
  const navigate = useNavigate();
  const { role } = useAuth();
  const isMobile = useIsMobile();

  const parsedRound = parseInt(round || '1', 10);

  React.useEffect(() => {
    if (parsedRound < 1 || parsedRound > 4) {
      navigate('/gestion-operativa');
    }
  }, [parsedRound, navigate]);

  if (parsedRound < 1 || parsedRound > 4) return null;

  const roundNumber = parsedRound as 1 | 2 | 3 | 4;
  const isAdminMode = role !== 'supervisor';

  return (
    <AppLayout
      title={isMobile ? `PT · Conteo ${roundNumber}` : roundLabels[roundNumber]}
      subtitle={isAdminMode ? 'Todos los pisos' : 'Tus pisos asignados'}
      showBackButton
      backPath="/gestion-operativa"
      fullWidth
    >
      <div className="md:h-[calc(100vh-200px)] md:min-h-[500px]">
        <Card className="border-0 shadow-none md:border md:shadow-sm md:h-full">
          <CardHeader className="pb-2 px-2 md:px-6">
            <CardTitle className="flex items-center gap-2 text-base md:text-lg">
              <FileEdit className="h-5 w-5 text-primary shrink-0" />
              <span className="md:hidden">Conteo PT</span>
              <span className="hidden md:inline">Transcripción de Conteos — Producto Terminado</span>
            </CardTitle>
          </CardHeader>
          <CardContent className="px-2 md:px-6 md:h-[calc(100%-60px)] md:overflow-auto">
            <PtTranscriptionTab roundNumber={roundNumber} isAdminMode={isAdminMode} />
          </CardContent>
        </Card>
      </div>
    </AppLayout>
  );
};

export default ConteoRoundPT;
