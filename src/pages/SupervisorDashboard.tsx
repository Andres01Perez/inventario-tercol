import React, { useMemo } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { 
  Package, 
  LogOut,
  ClipboardList,
  AlertCircle,
  Users,
  ArrowRight
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';

const SupervisorDashboard: React.FC = () => {
  const { user, profile, signOut } = useAuth();
  const navigate = useNavigate();

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
    const withOperario = locations.filter(l => l.operario_id).length;
    const withoutOperario = locations.length - withOperario;

    return {
      total: locations.length,
      pendingC1,
      pendingC2,
      withOperario,
      withoutOperario,
    };
  }, [locations, counts]);

  const statCards = [
    { label: 'Total Asignadas', value: stats.total, icon: ClipboardList, color: 'bg-primary/10 text-primary' },
    { label: 'Pendientes C1', value: stats.pendingC1, icon: AlertCircle, color: 'bg-blue-500/10 text-blue-500' },
    { label: 'Pendientes C2', value: stats.pendingC2, icon: AlertCircle, color: 'bg-purple-500/10 text-purple-500' },
    { label: 'Sin Operario', value: stats.withoutOperario, icon: Users, color: 'bg-amber-500/10 text-amber-500' },
  ];

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
            Selecciona una opción para gestionar el inventario
          </p>
        </div>

        {/* Stats Grid */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {statCards.map((stat) => (
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

        {/* Navigation Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Asignación Card */}
          <Card 
            className="cursor-pointer hover:border-primary/50 transition-all group"
            onClick={() => navigate('/dashboard/asignacion')}
          >
            <CardContent className="p-8">
              <div className="flex flex-col items-center text-center space-y-4">
                <div className="p-4 rounded-2xl bg-primary/10 text-primary group-hover:bg-primary group-hover:text-primary-foreground transition-colors">
                  <Users className="w-12 h-12" />
                </div>
                <div>
                  <h3 className="text-xl font-bold text-foreground">Asignación de Operarios</h3>
                  <p className="text-muted-foreground mt-1">
                    Asigna operarios a las ubicaciones para cada ronda de conteo
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  {stats.withoutOperario > 0 && (
                    <Badge variant="secondary" className="bg-amber-500/10 text-amber-500">
                      {stats.withoutOperario} sin asignar
                    </Badge>
                  )}
                  <ArrowRight className="w-5 h-5 text-muted-foreground group-hover:text-primary transition-colors" />
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Transcripción Card */}
          <Card 
            className="cursor-pointer hover:border-primary/50 transition-all group"
            onClick={() => navigate('/dashboard/transcripcion')}
          >
            <CardContent className="p-8">
              <div className="flex flex-col items-center text-center space-y-4">
                <div className="p-4 rounded-2xl bg-primary/10 text-primary group-hover:bg-primary group-hover:text-primary-foreground transition-colors">
                  <ClipboardList className="w-12 h-12" />
                </div>
                <div>
                  <h3 className="text-xl font-bold text-foreground">Transcripción de Conteos</h3>
                  <p className="text-muted-foreground mt-1">
                    Transcribe los conteos físicos realizados por los operarios
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  {(stats.pendingC1 > 0 || stats.pendingC2 > 0) && (
                    <Badge variant="secondary" className="bg-blue-500/10 text-blue-500">
                      {stats.pendingC1 + stats.pendingC2} pendientes
                    </Badge>
                  )}
                  <ArrowRight className="w-5 h-5 text-muted-foreground group-hover:text-primary transition-colors" />
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </main>
    </div>
  );
};

export default SupervisorDashboard;
