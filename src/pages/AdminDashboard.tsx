import React from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { 
  Package, 
  Users, 
  FileSpreadsheet, 
  Settings, 
  LogOut,
  Upload,
  MapPin,
  ClipboardCheck,
  BarChart3
} from 'lucide-react';
import { Button } from '@/components/ui/button';

const AdminDashboard: React.FC = () => {
  const { profile, signOut } = useAuth();

  const stats = [
    { label: 'Referencias Cargadas', value: '0', icon: Package, color: 'bg-primary/10 text-primary' },
    { label: 'Supervisores Asignados', value: '0', icon: Users, color: 'bg-blue-500/10 text-blue-500' },
    { label: 'Conteos Pendientes', value: '0', icon: ClipboardCheck, color: 'bg-amber-500/10 text-amber-500' },
    { label: 'Diferencias', value: '0', icon: BarChart3, color: 'bg-destructive/10 text-destructive' },
  ];

  const quickActions = [
    { label: 'Cargar Maestra', icon: Upload, description: 'Importar referencias desde Excel' },
    { label: 'Asignar Ubicaciones', icon: MapPin, description: 'Asignar zonas a supervisores' },
    { label: 'Ver Reportes', icon: FileSpreadsheet, description: 'Exportar informes de inventario' },
    { label: 'Configuración', icon: Settings, description: 'Ajustar tolerancias y parámetros' },
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
                <p className="text-xs text-muted-foreground">Panel de Administración</p>
              </div>
            </div>

            <div className="flex items-center gap-4">
              <div className="text-right hidden sm:block">
                <p className="text-sm font-medium text-foreground">{profile?.full_name || 'Administrador'}</p>
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
            Bienvenido, {profile?.full_name?.split(' ')[0] || 'Administrador'}
          </h2>
          <p className="text-muted-foreground">
            Gestiona el inventario y supervisa el proceso de auditoría
          </p>
        </div>

        {/* Stats Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
          {stats.map((stat) => (
            <div key={stat.label} className="glass-card">
              <div className="flex items-center gap-4">
                <div className={`p-3 rounded-xl ${stat.color}`}>
                  <stat.icon className="w-6 h-6" />
                </div>
                <div>
                  <p className="text-2xl font-bold text-foreground">{stat.value}</p>
                  <p className="text-sm text-muted-foreground">{stat.label}</p>
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* Quick Actions */}
        <h3 className="text-lg font-semibold text-foreground mb-4">Acciones Rápidas</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {quickActions.map((action) => (
            <button
              key={action.label}
              className="glass-card text-left hover:border-primary/50 transition-all group"
            >
              <div className="flex items-start gap-4">
                <div className="p-3 rounded-xl bg-primary/10 text-primary group-hover:bg-primary group-hover:text-primary-foreground transition-colors">
                  <action.icon className="w-6 h-6" />
                </div>
                <div>
                  <p className="font-medium text-foreground">{action.label}</p>
                  <p className="text-sm text-muted-foreground">{action.description}</p>
                </div>
              </div>
            </button>
          ))}
        </div>

        {/* Empty State for Recent Activity */}
        <div className="mt-8">
          <h3 className="text-lg font-semibold text-foreground mb-4">Actividad Reciente</h3>
          <div className="glass-card text-center py-12">
            <Package className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
            <p className="text-muted-foreground">No hay actividad reciente</p>
            <p className="text-sm text-muted-foreground">Comienza cargando la maestra de inventario</p>
          </div>
        </div>
      </main>
    </div>
  );
};

export default AdminDashboard;
