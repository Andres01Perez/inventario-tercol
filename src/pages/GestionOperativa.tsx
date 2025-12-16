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
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import AssignmentTab from '@/components/supervisor/AssignmentTab';
import RoundTranscriptionTab from '@/components/supervisor/RoundTranscriptionTab';

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
  const controlFilter = getControlFilter();

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
          <h2 className="text-xl font-semibold text-foreground">Gestión de Conteos por Rondas</h2>
          <p className="text-muted-foreground">{config.description}</p>
        </div>

        <Tabs defaultValue="assignment" className="space-y-6">
          <TabsList className="grid w-full max-w-3xl grid-cols-5">
            <TabsTrigger value="assignment" className="gap-1">
              <ClipboardList className="w-4 h-4 hidden sm:inline" />
              <span className="hidden sm:inline">Asignación</span>
              <span className="sm:hidden">Asig.</span>
            </TabsTrigger>
            <TabsTrigger value="count1" className="gap-1">
              <Badge variant="outline" className="bg-blue-500/10 text-blue-500 text-xs px-1">C1</Badge>
              <span className="hidden lg:inline">Turno 1</span>
            </TabsTrigger>
            <TabsTrigger value="count2" className="gap-1">
              <Badge variant="outline" className="bg-purple-500/10 text-purple-500 text-xs px-1">C2</Badge>
              <span className="hidden lg:inline">Turno 2</span>
            </TabsTrigger>
            <TabsTrigger value="count3" className="gap-1">
              <Badge variant="outline" className="bg-amber-500/10 text-amber-500 text-xs px-1">C3</Badge>
              <span className="hidden lg:inline">Desempate</span>
            </TabsTrigger>
            <TabsTrigger value="count4" className="gap-1">
              <Badge variant="outline" className="bg-orange-500/10 text-orange-500 text-xs px-1">C4</Badge>
              <span className="hidden lg:inline">Final</span>
            </TabsTrigger>
          </TabsList>

          <TabsContent value="assignment">
            <div className="glass-card">
              <h3 className="text-lg font-semibold mb-4">Asignar Operarios a Ubicaciones</h3>
              <AssignmentTab isAdminMode={true} controlFilter={controlFilter} />
            </div>
          </TabsContent>

          <TabsContent value="count1">
            <div className="glass-card">
              <RoundTranscriptionTab 
                roundNumber={1} 
                filterTurno={1}
                isAdminMode={true}
                controlFilter={controlFilter}
              />
            </div>
          </TabsContent>

          <TabsContent value="count2">
            <div className="glass-card">
              <RoundTranscriptionTab 
                roundNumber={2} 
                filterTurno={2}
                isAdminMode={true}
                controlFilter={controlFilter}
              />
            </div>
          </TabsContent>

          <TabsContent value="count3">
            <div className="glass-card">
              <RoundTranscriptionTab 
                roundNumber={3}
                isAdminMode={true}
                controlFilter={controlFilter}
              />
            </div>
          </TabsContent>

          <TabsContent value="count4">
            <div className="glass-card">
              <RoundTranscriptionTab 
                roundNumber={4}
                isAdminMode={true}
                controlFilter={controlFilter}
              />
            </div>
          </TabsContent>
        </Tabs>
      </main>
    </div>
  );
};

export default GestionOperativa;
