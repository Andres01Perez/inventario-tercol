import React from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useNavigate } from 'react-router-dom';
import { 
  ArrowLeft,
  Package, 
  Boxes,
  Settings,
  ClipboardList,
  Users,
  FileCheck
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import RoundAssignmentTab from '@/components/supervisor/RoundAssignmentTab';
import RoundTranscriptionTab from '@/components/supervisor/RoundTranscriptionTab';
import ValidationPanel from '@/components/supervisor/ValidationPanel';

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
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">
        <div>
          <h2 className="text-xl font-semibold text-foreground">Gestión de Conteos por Rondas</h2>
          <p className="text-muted-foreground">{config.description}</p>
        </div>

        {/* PANEL DE ASIGNACIÓN */}
        <section>
          <div className="flex items-center gap-2 mb-4">
            <Users className="w-5 h-5 text-primary" />
            <h3 className="text-lg font-semibold text-foreground">Panel de Asignación</h3>
          </div>
          <div className="glass-card">
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
                <RoundAssignmentTab roundNumber={1} filterTurno={1} isAdminMode={true} controlFilter={controlFilter} />
              </TabsContent>
              <TabsContent value="assign-c2">
                <RoundAssignmentTab roundNumber={2} filterTurno={2} isAdminMode={true} controlFilter={controlFilter} />
              </TabsContent>
              <TabsContent value="assign-c3">
                <RoundAssignmentTab roundNumber={3} isAdminMode={true} controlFilter={controlFilter} />
              </TabsContent>
              <TabsContent value="assign-c4">
                <RoundAssignmentTab roundNumber={4} isAdminMode={true} controlFilter={controlFilter} />
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
          <div className="glass-card">
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
                <RoundTranscriptionTab roundNumber={1} filterTurno={1} isAdminMode={true} controlFilter={controlFilter} />
              </TabsContent>
              <TabsContent value="trans-c2">
                <RoundTranscriptionTab roundNumber={2} filterTurno={2} isAdminMode={true} controlFilter={controlFilter} />
              </TabsContent>
              <TabsContent value="trans-c3">
                <RoundTranscriptionTab roundNumber={3} isAdminMode={true} controlFilter={controlFilter} />
              </TabsContent>
              <TabsContent value="trans-c4">
                <RoundTranscriptionTab roundNumber={4} isAdminMode={true} controlFilter={controlFilter} />
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
          <div className="glass-card">
            <ValidationPanel isAdminMode={true} controlFilter={controlFilter} />
          </div>
        </section>
      </main>
    </div>
  );
};

export default GestionOperativa;
