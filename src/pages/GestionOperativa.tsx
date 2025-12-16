import React from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useNavigate } from 'react-router-dom';
import { 
  ArrowLeft,
  Package, 
  Boxes,
  Settings,
  ClipboardList
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import AssignmentTab from '@/components/supervisor/AssignmentTab';

const GestionOperativa: React.FC = () => {
  const { profile, role } = useAuth();
  const navigate = useNavigate();

  // Determine control filter based on role
  const getControlFilter = (): 'not_null' | 'null' | 'all' => {
    if (role === 'admin_mp') return 'not_null';
    if (role === 'admin_pp') return 'null';
    return 'all'; // superadmin sees everything
  };

  // Get UI configuration based on role
  const getRoleConfig = () => {
    if (role === 'admin_mp') {
      return { 
        label: 'Materia Prima', 
        icon: Package, 
        colorClass: 'text-orange-500', 
        bgClass: 'bg-orange-500/10',
        description: 'Gestiona ubicaciones con referencias de Materia Prima'
      };
    }
    if (role === 'admin_pp') {
      return { 
        label: 'Producto en Proceso', 
        icon: Boxes, 
        colorClass: 'text-emerald-500', 
        bgClass: 'bg-emerald-500/10',
        description: 'Gestiona ubicaciones con referencias de Producto en Proceso'
      };
    }
    return { 
      label: 'Todos los Materiales', 
      icon: Settings, 
      colorClass: 'text-primary', 
      bgClass: 'bg-primary/10',
      description: 'Gestiona todas las ubicaciones del sistema'
    };
  };

  const config = getRoleConfig();
  const IconComponent = config.icon;

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b border-border bg-card">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center gap-3">
              <Button 
                variant="ghost" 
                size="icon" 
                onClick={() => navigate('/dashboard')}
              >
                <ArrowLeft className="w-5 h-5" />
              </Button>
              <div className={`w-10 h-10 rounded-xl ${config.bgClass} flex items-center justify-center`}>
                <ClipboardList className={`w-5 h-5 ${config.colorClass}`} />
              </div>
              <div>
                <h1 className="text-lg font-bold text-foreground">Gestión Operativa</h1>
                <p className="text-xs text-muted-foreground">{config.label}</p>
              </div>
            </div>

            <div className="flex items-center gap-4">
              <div className={`px-3 py-1.5 rounded-full ${config.bgClass} flex items-center gap-2`}>
                <IconComponent className={`w-4 h-4 ${config.colorClass}`} />
                <span className={`text-sm font-medium ${config.colorClass}`}>{config.label}</span>
              </div>
              <div className="text-right hidden sm:block">
                <p className="text-sm font-medium text-foreground">{profile?.full_name}</p>
                <p className="text-xs text-muted-foreground">{profile?.email}</p>
              </div>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="mb-6">
          <h2 className="text-xl font-semibold text-foreground">Asignar Operarios a Ubicaciones</h2>
          <p className="text-muted-foreground">{config.description}</p>
        </div>

        <div className="glass-card">
          <AssignmentTab 
            isAdminMode={true} 
            controlFilter={getControlFilter()}
          />
        </div>
      </main>
    </div>
  );
};

export default GestionOperativa;
