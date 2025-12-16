import React, { useMemo } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { 
  Package, 
  LogOut,
  ClipboardList,
  AlertCircle,
  Users,
  FileCheck
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import RoundAssignmentTab from '@/components/supervisor/RoundAssignmentTab';
import RoundTranscriptionTab from '@/components/supervisor/RoundTranscriptionTab';
import ValidationPanel from '@/components/supervisor/ValidationPanel';

const SupervisorDashboard: React.FC = () => {
  const { user, profile, signOut } = useAuth();

  // Fetch locations and counts for stats
  const { data: locations = [] } = useQuery({
    queryKey: ['supervisor-stats-locations', user?.id],
    queryFn: async () => {
      const { data } = await supabase
        .from('locations')
        .select('id, operario_id')
        .eq('assigned_supervisor_id', user!.id);
      return data || [];
    },
    enabled: !!user?.id,
  });

  const locationIds = useMemo(() => locations.map(l => l.id), [locations]);

  const { data: counts = [] } = useQuery({
    queryKey: ['supervisor-stats-counts', locationIds],
    queryFn: async () => {
      if (locationIds.length === 0) return [];
      const { data } = await supabase
        .from('inventory_counts')
        .select('location_id, audit_round')
        .in('location_id', locationIds);
      return data || [];
    },
    enabled: locationIds.length > 0,
  });

  const stats = useMemo(() => {
    const c1Ids = new Set(counts.filter(c => c.audit_round === 1).map(c => c.location_id));
    const c2Ids = new Set(counts.filter(c => c.audit_round === 2).map(c => c.location_id));
    const pendingC1 = locations.filter(l => !c1Ids.has(l.id)).length;
    const pendingC2 = locations.filter(l => !c2Ids.has(l.id)).length;
    const operariosSet = new Set(locations.filter(l => l.operario_id).map(l => l.operario_id));

    return [
      { label: 'Total Asignadas', value: String(locations.length), icon: ClipboardList, color: 'bg-primary/10 text-primary' },
      { label: 'Pendientes C1', value: String(pendingC1), icon: AlertCircle, color: 'bg-blue-500/10 text-blue-500' },
      { label: 'Pendientes C2', value: String(pendingC2), icon: AlertCircle, color: 'bg-purple-500/10 text-purple-500' },
      { label: 'Operarios', value: String(operariosSet.size), icon: Users, color: 'bg-green-500/10 text-green-500' },
    ];
  }, [locations, counts]);

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b border-border bg-card">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl gradient-bg flex items-center justify-center">
                <Package className="w-5 h-5 text-primary-foreground" />
              </div>
              <div>
                <h1 className="text-lg font-bold text-foreground">AuditMaster</h1>
                <p className="text-xs text-muted-foreground">Panel de Supervisor</p>
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
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">
        {/* Welcome */}
        <div>
          <h2 className="text-2xl font-bold text-foreground">
            Hola, {profile?.full_name?.split(' ')[0] || 'Supervisor'}
          </h2>
          <p className="text-muted-foreground">
            Gestiona asignaciones y transcribe los conteos físicos por rondas
          </p>
        </div>

        {/* Stats Grid */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {stats.map((stat) => (
            <div key={stat.label} className="glass-card">
              <div className="flex items-center gap-3">
                <div className={`p-2.5 rounded-xl ${stat.color}`}>
                  <stat.icon className="w-5 h-5" />
                </div>
                <div>
                  <p className="text-xl font-bold text-foreground">{stat.value}</p>
                  <p className="text-xs text-muted-foreground">{stat.label}</p>
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* PANEL DE ASIGNACIÓN */}
        <section>
          <div className="flex items-center gap-2 mb-4">
            <Users className="w-5 h-5 text-primary" />
            <h3 className="text-lg font-semibold text-foreground">Panel de Asignación</h3>
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
        </section>

        {/* PANEL DE TRANSCRIPCIÓN */}
        <section>
          <div className="flex items-center gap-2 mb-4">
            <ClipboardList className="w-5 h-5 text-primary" />
            <h3 className="text-lg font-semibold text-foreground">Panel de Transcripción</h3>
          </div>
          <div className="glass-card-static">
            <Tabs defaultValue="trans-c1" className="space-y-4">
              <TabsList className="grid w-full max-w-2xl grid-cols-4">
                <TabsTrigger value="trans-c1" className="gap-1">
                  <Badge variant="outline" className="bg-blue-500/10 text-blue-500 text-xs px-1">C1</Badge>
                  <span className="hidden sm:inline">Turno 1</span>
                </TabsTrigger>
                <TabsTrigger value="trans-c2" className="gap-1">
                  <Badge variant="outline" className="bg-purple-500/10 text-purple-500 text-xs px-1">C2</Badge>
                  <span className="hidden sm:inline">Turno 2</span>
                </TabsTrigger>
                <TabsTrigger value="trans-c3" className="gap-1">
                  <Badge variant="outline" className="bg-amber-500/10 text-amber-500 text-xs px-1">C3</Badge>
                  <span className="hidden sm:inline">Desempate</span>
                </TabsTrigger>
                <TabsTrigger value="trans-c4" className="gap-1">
                  <Badge variant="outline" className="bg-orange-500/10 text-orange-500 text-xs px-1">C4</Badge>
                  <span className="hidden sm:inline">Final</span>
                </TabsTrigger>
              </TabsList>

              <TabsContent value="trans-c1">
                <RoundTranscriptionTab roundNumber={1} filterTurno={1} />
              </TabsContent>
              <TabsContent value="trans-c2">
                <RoundTranscriptionTab roundNumber={2} filterTurno={2} />
              </TabsContent>
              <TabsContent value="trans-c3">
                <RoundTranscriptionTab roundNumber={3} />
              </TabsContent>
              <TabsContent value="trans-c4">
                <RoundTranscriptionTab roundNumber={4} />
              </TabsContent>
            </Tabs>
          </div>
        </section>

        {/* PANEL DE VALIDACIÓN */}
        <section>
          <div className="flex items-center gap-2 mb-4">
            <FileCheck className="w-5 h-5 text-primary" />
            <h3 className="text-lg font-semibold text-foreground">Panel de Validación</h3>
          </div>
          <div className="glass-card-static">
            <ValidationPanel />
          </div>
        </section>
      </main>

      {/* Print Styles */}
      <style>{`
        @media print {
          body * {
            visibility: hidden;
          }
          #printable-sheet, #printable-sheet * {
            visibility: visible;
          }
          #printable-sheet {
            position: absolute;
            left: 0;
            top: 0;
            width: 100%;
          }
        }
      `}</style>
    </div>
  );
};

export default SupervisorDashboard;
