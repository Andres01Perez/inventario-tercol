import React, { useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { 
  Package, 
  Users, 
  FileSpreadsheet, 
  Settings, 
  LogOut,
  Upload,
  Shield,
  BarChart3,
  UserCog,
  Database
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import UserManagement from '@/components/superadmin/UserManagement';
import OperariosManagement from '@/components/shared/OperariosManagement';

type TabType = 'overview' | 'users' | 'operarios';

const SuperadminDashboard: React.FC = () => {
  const { profile, signOut } = useAuth();
  const [activeTab, setActiveTab] = useState<TabType>('overview');

  const stats = [
    { label: 'Usuarios Registrados', value: '0', icon: Users, color: 'bg-primary/10 text-primary' },
    { label: 'Referencias Totales', value: '0', icon: Package, color: 'bg-blue-500/10 text-blue-500' },
    { label: 'Conteos Activos', value: '0', icon: BarChart3, color: 'bg-amber-500/10 text-amber-500' },
    { label: 'Operarios Activos', value: '0', icon: UserCog, color: 'bg-green-500/10 text-green-500' },
  ];

  const quickActions = [
    { label: 'Importar Maestra', icon: Upload, description: 'Cargar inventario desde archivo' },
    { label: 'Gestionar Usuarios', icon: Users, description: 'Asignar roles y permisos', onClick: () => setActiveTab('users') },
    { label: 'Ver Reportes', icon: FileSpreadsheet, description: 'Exportar informes completos' },
    { label: 'Configuración', icon: Settings, description: 'Ajustes del sistema' },
  ];

  const tabs = [
    { id: 'overview' as TabType, label: 'Resumen', icon: BarChart3 },
    { id: 'users' as TabType, label: 'Usuarios', icon: Users },
    { id: 'operarios' as TabType, label: 'Operarios', icon: UserCog },
  ];

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b border-border bg-card">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl gradient-bg flex items-center justify-center">
                <Shield className="w-5 h-5 text-primary-foreground" />
              </div>
              <div>
                <h1 className="text-lg font-bold text-foreground">AuditMaster</h1>
                <p className="text-xs text-muted-foreground">Panel Superadmin</p>
              </div>
            </div>

            <div className="flex items-center gap-4">
              <div className="text-right hidden sm:block">
                <p className="text-sm font-medium text-foreground">{profile?.full_name || 'Superadmin'}</p>
                <p className="text-xs text-muted-foreground">{profile?.email}</p>
              </div>
              <Button variant="ghost" size="icon" onClick={signOut}>
                <LogOut className="w-5 h-5" />
              </Button>
            </div>
          </div>
        </div>
      </header>

      {/* Tabs Navigation */}
      <div className="border-b border-border bg-card/50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <nav className="flex gap-1 -mb-px">
            {tabs.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 transition-colors ${
                  activeTab === tab.id
                    ? 'border-primary text-primary'
                    : 'border-transparent text-muted-foreground hover:text-foreground hover:border-border'
                }`}
              >
                <tab.icon className="w-4 h-4" />
                {tab.label}
              </button>
            ))}
          </nav>
        </div>
      </div>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {activeTab === 'overview' && (
          <>
            {/* Welcome */}
            <div className="mb-8">
              <h2 className="text-2xl font-bold text-foreground">
                Bienvenido, {profile?.full_name?.split(' ')[0] || 'Superadmin'}
              </h2>
              <p className="text-muted-foreground">
                Control total del sistema de auditoría de inventario
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
                  onClick={action.onClick}
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
              <h3 className="text-lg font-semibold text-foreground mb-4">Actividad del Sistema</h3>
              <div className="glass-card text-center py-12">
                <Database className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
                <p className="text-muted-foreground">No hay actividad reciente</p>
                <p className="text-sm text-muted-foreground">Comienza importando la maestra de inventario</p>
              </div>
            </div>
          </>
        )}

        {activeTab === 'users' && <UserManagement />}
        {activeTab === 'operarios' && <OperariosManagement />}
      </main>
    </div>
  );
};

export default SuperadminDashboard;
