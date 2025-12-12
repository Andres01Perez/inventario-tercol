import React, { useMemo } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { 
  Package, 
  LogOut,
  ClipboardList,
  CheckCircle2,
  AlertCircle,
  Users
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import AssignmentTab from '@/components/supervisor/AssignmentTab';
import TranscriptionTab from '@/components/supervisor/TranscriptionTab';

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
        .select('location_id')
        .in('location_id', locationIds)
        .eq('audit_round', 1);
      return data || [];
    },
    enabled: locationIds.length > 0,
  });

  const stats = useMemo(() => {
    const countedIds = new Set(counts.map(c => c.location_id));
    const completed = locations.filter(l => countedIds.has(l.id)).length;
    const pending = locations.length - completed;
    const operariosSet = new Set(locations.filter(l => l.operario_id).map(l => l.operario_id));

    return [
      { label: 'Asignadas', value: String(locations.length), icon: ClipboardList, color: 'bg-primary/10 text-primary' },
      { label: 'Completadas', value: String(completed), icon: CheckCircle2, color: 'bg-green-500/10 text-green-500' },
      { label: 'Pendientes', value: String(pending), icon: AlertCircle, color: 'bg-amber-500/10 text-amber-500' },
      { label: 'Operarios', value: String(operariosSet.size), icon: Users, color: 'bg-blue-500/10 text-blue-500' },
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
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Welcome */}
        <div className="mb-8">
          <h2 className="text-2xl font-bold text-foreground">
            Hola, {profile?.full_name?.split(' ')[0] || 'Supervisor'}
          </h2>
          <p className="text-muted-foreground">
            Gestiona operarios y transcribe los conteos físicos
          </p>
        </div>

        {/* Stats Grid */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
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

        {/* Main Tabs */}
        <Tabs defaultValue="assignment" className="space-y-6">
          <TabsList className="grid w-full max-w-md grid-cols-2">
            <TabsTrigger value="assignment" className="gap-2">
              <ClipboardList className="w-4 h-4" />
              Asignación
            </TabsTrigger>
            <TabsTrigger value="transcription" className="gap-2">
              <CheckCircle2 className="w-4 h-4" />
              Transcripción
            </TabsTrigger>
          </TabsList>

          <TabsContent value="assignment">
            <div className="glass-card-static">
              <h3 className="text-lg font-semibold mb-4">Asignar Operarios a Ubicaciones</h3>
              <AssignmentTab />
            </div>
          </TabsContent>

          <TabsContent value="transcription">
            <div className="glass-card-static">
              <h3 className="text-lg font-semibold mb-4">Transcribir Conteos por Operario</h3>
              <TranscriptionTab />
            </div>
          </TabsContent>
        </Tabs>
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
