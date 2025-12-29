import React, { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import AppLayout from '@/components/layout/AppLayout';
import RoundAssignmentTab from '@/components/supervisor/RoundAssignmentTab';
import RoundTranscriptionTab from '@/components/supervisor/RoundTranscriptionTab';
import { ResizablePanelGroup, ResizablePanel, ResizableHandle } from '@/components/ui/resizable';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { PanelLeftClose, PanelRightClose, Columns2, ClipboardList, FileEdit } from 'lucide-react';

type PanelView = 'both' | 'assignment' | 'transcription';

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
  const [panelView, setPanelView] = useState<PanelView>('both');

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
      <div className="space-y-4 h-full">
        {/* Panel Toggle Controls */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Button
              variant={panelView === 'assignment' ? 'default' : 'outline'}
              size="sm"
              onClick={() => setPanelView('assignment')}
              className="gap-2"
            >
              <ClipboardList className="h-4 w-4" />
              Solo Asignación
            </Button>
            <Button
              variant={panelView === 'both' ? 'default' : 'outline'}
              size="sm"
              onClick={() => setPanelView('both')}
              className="gap-2"
            >
              <Columns2 className="h-4 w-4" />
              Ambos
            </Button>
            <Button
              variant={panelView === 'transcription' ? 'default' : 'outline'}
              size="sm"
              onClick={() => setPanelView('transcription')}
              className="gap-2"
            >
              <FileEdit className="h-4 w-4" />
              Solo Transcripción
            </Button>
          </div>
        </div>

        {/* Panels */}
        <div className="h-[calc(100vh-250px)] min-h-[500px]">
          {panelView === 'both' ? (
            <ResizablePanelGroup direction="horizontal" className="rounded-lg border">
              <ResizablePanel defaultSize={50} minSize={25}>
                <div className="h-full overflow-auto p-4">
                  <div className="flex items-center gap-2 mb-4">
                    <ClipboardList className="h-5 w-5 text-primary" />
                    <h3 className="text-lg font-semibold">Asignación de Operarios</h3>
                  </div>
                  <RoundAssignmentTab 
                    roundNumber={roundNumber} 
                    isAdminMode={isAdminMode}
                    controlFilter={controlFilter}
                  />
                </div>
              </ResizablePanel>
              
              <ResizableHandle withHandle />
              
              <ResizablePanel defaultSize={50} minSize={25}>
                <div className="h-full overflow-auto p-4">
                  <div className="flex items-center gap-2 mb-4">
                    <FileEdit className="h-5 w-5 text-primary" />
                    <h3 className="text-lg font-semibold">Transcripción de Conteos</h3>
                  </div>
                  <RoundTranscriptionTab 
                    roundNumber={roundNumber}
                    isAdminMode={isAdminMode}
                    controlFilter={controlFilter}
                  />
                </div>
              </ResizablePanel>
            </ResizablePanelGroup>
          ) : panelView === 'assignment' ? (
            <Card className="h-full">
              <CardHeader className="pb-2">
                <CardTitle className="flex items-center gap-2">
                  <ClipboardList className="h-5 w-5 text-primary" />
                  Asignación de Operarios
                </CardTitle>
              </CardHeader>
              <CardContent className="h-[calc(100%-60px)] overflow-auto">
                <RoundAssignmentTab 
                  roundNumber={roundNumber} 
                  isAdminMode={isAdminMode}
                  controlFilter={controlFilter}
                />
              </CardContent>
            </Card>
          ) : (
            <Card className="h-full">
              <CardHeader className="pb-2">
                <CardTitle className="flex items-center gap-2">
                  <FileEdit className="h-5 w-5 text-primary" />
                  Transcripción de Conteos
                </CardTitle>
              </CardHeader>
              <CardContent className="h-[calc(100%-60px)] overflow-auto">
                <RoundTranscriptionTab 
                  roundNumber={roundNumber}
                  isAdminMode={isAdminMode}
                  controlFilter={controlFilter}
                />
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </AppLayout>
  );
};

export default ConteoRound;
