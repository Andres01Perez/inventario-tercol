import React from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { Package, LogOut, ArrowLeft, Users } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import RoundAssignmentTab from '@/components/supervisor/RoundAssignmentTab';

const Asignacion: React.FC = () => {
  const { profile, signOut } = useAuth();
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b border-border bg-card">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center gap-3">
              <Button variant="ghost" size="icon" onClick={() => navigate('/dashboard')}>
                <ArrowLeft className="w-5 h-5" />
              </Button>
              <div className="w-10 h-10 rounded-xl gradient-bg flex items-center justify-center">
                <Package className="w-5 h-5 text-primary-foreground" />
              </div>
              <div>
                <h1 className="text-lg font-bold text-foreground">Panel de Asignación</h1>
                <p className="text-xs text-muted-foreground">Asignar operarios por ronda</p>
              </div>
            </div>

            <div className="flex items-center gap-4">
              <div className="text-right hidden sm:block">
                <p className="text-sm font-medium text-foreground">{profile?.full_name || 'Supervisor'}</p>
                <p className="text-xs text-muted-foreground">{profile?.email}</p>
              </div>
              <Button variant="ghost" size="icon" onClick={signOut}>
                <LogOut className="w-5 h-5" />
              </Button>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="flex items-center gap-2 mb-6">
          <Users className="w-5 h-5 text-primary" />
          <h2 className="text-xl font-semibold text-foreground">Asignación de Operarios</h2>
        </div>

        <div className="glass-card-static">
          <Tabs defaultValue="assign-c1" className="space-y-4">
            <TabsList className="grid w-full max-w-2xl grid-cols-4">
              <TabsTrigger value="assign-c1" className="gap-1">
                <Badge variant="outline" className="bg-blue-500/10 text-blue-500 text-xs px-1">C1</Badge>
                <span className="hidden sm:inline">Turno 1</span>
              </TabsTrigger>
              <TabsTrigger value="assign-c2" className="gap-1">
                <Badge variant="outline" className="bg-purple-500/10 text-purple-500 text-xs px-1">C2</Badge>
                <span className="hidden sm:inline">Turno 2</span>
              </TabsTrigger>
              <TabsTrigger value="assign-c3" className="gap-1">
                <Badge variant="outline" className="bg-amber-500/10 text-amber-500 text-xs px-1">C3</Badge>
                <span className="hidden sm:inline">Desempate</span>
              </TabsTrigger>
              <TabsTrigger value="assign-c4" className="gap-1">
                <Badge variant="outline" className="bg-orange-500/10 text-orange-500 text-xs px-1">C4</Badge>
                <span className="hidden sm:inline">Final</span>
              </TabsTrigger>
            </TabsList>

            <TabsContent value="assign-c1">
              <RoundAssignmentTab roundNumber={1} filterTurno={1} />
            </TabsContent>
            <TabsContent value="assign-c2">
              <RoundAssignmentTab roundNumber={2} filterTurno={2} />
            </TabsContent>
            <TabsContent value="assign-c3">
              <RoundAssignmentTab roundNumber={3} />
            </TabsContent>
            <TabsContent value="assign-c4">
              <RoundAssignmentTab roundNumber={4} />
            </TabsContent>
          </Tabs>
        </div>
      </main>
    </div>
  );
};

export default Asignacion;
