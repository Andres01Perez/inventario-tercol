import React from 'react';
import { Users, ClipboardList } from 'lucide-react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import RoundAssignmentTab from '@/components/supervisor/RoundAssignmentTab';
import RoundTranscriptionTab from '@/components/supervisor/RoundTranscriptionTab';

interface OperationalPanelProps {
  isAdminMode?: boolean;
  controlFilter?: 'all' | 'not_null' | 'null';
}

const OperationalPanel: React.FC<OperationalPanelProps> = ({
  isAdminMode = false,
  controlFilter = 'all',
}) => {
  return (
    <Tabs defaultValue="asignacion" className="w-full">
      {/* Tabs principales */}
      <TabsList className="grid w-full max-w-md grid-cols-2 mb-6">
        <TabsTrigger value="asignacion" className="gap-2">
          <Users className="w-4 h-4" />
          Asignación
        </TabsTrigger>
        <TabsTrigger value="transcripcion" className="gap-2">
          <ClipboardList className="w-4 h-4" />
          Transcripción
        </TabsTrigger>
      </TabsList>

      {/* Contenido de Asignación - Full Width */}
      <TabsContent value="asignacion" className="mt-0">
        <section className="glass-card">
          <Tabs defaultValue="assign-c1" className="space-y-4">
            <TabsList className="grid w-full grid-cols-4">
              <TabsTrigger value="assign-c1" className="gap-1">
                <Badge variant="outline" className="bg-blue-500/10 text-blue-500 text-xs px-1">C1</Badge>
              </TabsTrigger>
              <TabsTrigger value="assign-c2" className="gap-1">
                <Badge variant="outline" className="bg-purple-500/10 text-purple-500 text-xs px-1">C2</Badge>
              </TabsTrigger>
              <TabsTrigger value="assign-c3" className="gap-1">
                <Badge variant="outline" className="bg-amber-500/10 text-amber-500 text-xs px-1">C3</Badge>
              </TabsTrigger>
              <TabsTrigger value="assign-c4" className="gap-1">
                <Badge variant="outline" className="bg-orange-500/10 text-orange-500 text-xs px-1">C4</Badge>
              </TabsTrigger>
            </TabsList>

            <TabsContent value="assign-c1">
              <RoundAssignmentTab roundNumber={1} filterTurno={1} isAdminMode={isAdminMode} controlFilter={controlFilter} />
            </TabsContent>
            <TabsContent value="assign-c2">
              <RoundAssignmentTab roundNumber={2} filterTurno={2} isAdminMode={isAdminMode} controlFilter={controlFilter} />
            </TabsContent>
            <TabsContent value="assign-c3">
              <RoundAssignmentTab roundNumber={3} isAdminMode={isAdminMode} controlFilter={controlFilter} />
            </TabsContent>
            <TabsContent value="assign-c4">
              <RoundAssignmentTab roundNumber={4} isAdminMode={isAdminMode} controlFilter={controlFilter} />
            </TabsContent>
          </Tabs>
        </section>
      </TabsContent>

      {/* Contenido de Transcripción - Full Width */}
      <TabsContent value="transcripcion" className="mt-0">
        <section className="glass-card">
          <Tabs defaultValue="trans-c1" className="space-y-4">
            <TabsList className="grid w-full grid-cols-4">
              <TabsTrigger value="trans-c1" className="gap-1">
                <Badge variant="outline" className="bg-blue-500/10 text-blue-500 text-xs px-1">C1</Badge>
              </TabsTrigger>
              <TabsTrigger value="trans-c2" className="gap-1">
                <Badge variant="outline" className="bg-purple-500/10 text-purple-500 text-xs px-1">C2</Badge>
              </TabsTrigger>
              <TabsTrigger value="trans-c3" className="gap-1">
                <Badge variant="outline" className="bg-amber-500/10 text-amber-500 text-xs px-1">C3</Badge>
              </TabsTrigger>
              <TabsTrigger value="trans-c4" className="gap-1">
                <Badge variant="outline" className="bg-orange-500/10 text-orange-500 text-xs px-1">C4</Badge>
              </TabsTrigger>
            </TabsList>

            <TabsContent value="trans-c1">
              <RoundTranscriptionTab roundNumber={1} filterTurno={1} isAdminMode={isAdminMode} controlFilter={controlFilter} />
            </TabsContent>
            <TabsContent value="trans-c2">
              <RoundTranscriptionTab roundNumber={2} filterTurno={2} isAdminMode={isAdminMode} controlFilter={controlFilter} />
            </TabsContent>
            <TabsContent value="trans-c3">
              <RoundTranscriptionTab roundNumber={3} isAdminMode={isAdminMode} controlFilter={controlFilter} />
            </TabsContent>
            <TabsContent value="trans-c4">
              <RoundTranscriptionTab roundNumber={4} isAdminMode={isAdminMode} controlFilter={controlFilter} />
            </TabsContent>
          </Tabs>
        </section>
      </TabsContent>
    </Tabs>
  );
};

export default OperationalPanel;
