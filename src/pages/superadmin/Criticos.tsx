import React from 'react';
import { AlertTriangle } from 'lucide-react';
import AppLayout from '@/components/layout/AppLayout';
import RoundTranscriptionTab from '@/components/supervisor/RoundTranscriptionTab';

const Criticos: React.FC = () => {
  return (
    <AppLayout
      title="Referencias Críticas"
      subtitle="Conteo 5 - Cierre Forzado"
      showBackButton={true}
      backPath="/dashboard"
    >
      <div className="space-y-6">
        <div>
          <h2 className="text-xl font-semibold text-foreground flex items-center gap-2">
            <AlertTriangle className="w-6 h-6 text-red-500" />
            Referencias Críticas (Conteo 5)
          </h2>
          <p className="text-muted-foreground">
            Estas referencias no coincidieron en ningún conteo previo y requieren tu intervención personal para el cierre forzado.
          </p>
        </div>
        <div className="glass-card">
          <RoundTranscriptionTab
            roundNumber={5}
            isAdminMode={true}
            controlFilter="all"
            isSuperadminOnly={true}
          />
        </div>
      </div>
    </AppLayout>
  );
};

export default Criticos;
