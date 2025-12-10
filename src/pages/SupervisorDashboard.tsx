import React from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { 
  Package, 
  LogOut,
  ClipboardList,
  CheckCircle2,
  AlertCircle,
  MapPin
} from 'lucide-react';
import { Button } from '@/components/ui/button';

const SupervisorDashboard: React.FC = () => {
  const { profile, signOut } = useAuth();

  const stats = [
    { label: 'Asignadas', value: '0', icon: ClipboardList, color: 'bg-primary/10 text-primary' },
    { label: 'Completadas', value: '0', icon: CheckCircle2, color: 'bg-green-500/10 text-green-500' },
    { label: 'Con Diferencias', value: '0', icon: AlertCircle, color: 'bg-amber-500/10 text-amber-500' },
    { label: 'Ubicaciones', value: '0', icon: MapPin, color: 'bg-blue-500/10 text-blue-500' },
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
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Welcome */}
        <div className="mb-8">
          <h2 className="text-2xl font-bold text-foreground">
            Hola, {profile?.full_name?.split(' ')[0] || 'Supervisor'}
          </h2>
          <p className="text-muted-foreground">
            Registra los conteos físicos de las referencias asignadas
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

        {/* Empty State */}
        <div className="glass-card text-center py-12">
          <ClipboardList className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
          <p className="text-muted-foreground">No tienes referencias asignadas</p>
          <p className="text-sm text-muted-foreground">El administrador te asignará ubicaciones para contar</p>
        </div>
      </main>
    </div>
  );
};

export default SupervisorDashboard;
