import React, { useState, useMemo } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { 
  Package, 
  Users, 
  LogOut,
  Upload,
  Shield,
  BarChart3,
  UserCog,
  Boxes,
  MapPin,
  ClipboardList,
  AlertTriangle,
  ArrowRight,
  FileSpreadsheet,
  AlertCircle
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import UserManagement from '@/components/superadmin/UserManagement';
import OperariosManagement from '@/components/shared/OperariosManagement';
import MasterDataImport from '@/components/superadmin/MasterDataImport';
import RoundTranscriptionTab from '@/components/supervisor/RoundTranscriptionTab';

import OperationalPanel from '@/components/shared/OperationalPanel';

type TabType = 'overview' | 'operativo' | 'ubicaciones' | 'responsables' | 'users' | 'operarios' | 'import' | 'critico' | 'inventario-mp' | 'inventario-pp';

const UnifiedDashboard: React.FC = () => {
  const { profile, role, signOut } = useAuth();
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState<TabType>('overview');

  // Role-based configuration
  const roleConfig = useMemo(() => {
    switch (role) {
      case 'admin_mp':
        return {
          label: 'Materia Prima',
          icon: Package,
          colorClass: 'text-orange-500',
          bgClass: 'bg-orange-500/10',
          controlFilter: 'not_null' as const,
        };
      case 'admin_pp':
        return {
          label: 'Producto en Proceso',
          icon: Boxes,
          colorClass: 'text-emerald-500',
          bgClass: 'bg-emerald-500/10',
          controlFilter: 'null' as const,
        };
      case 'superadmin':
        return {
          label: 'Panel Superadmin',
          icon: Shield,
          colorClass: 'text-primary',
          bgClass: 'gradient-bg',
          controlFilter: 'all' as const,
        };
      default:
        return {
          label: 'Panel de Supervisor',
          icon: Package,
          colorClass: 'text-primary',
          bgClass: 'gradient-bg',
          controlFilter: 'all' as const,
        };
    }
  }, [role]);

  const IconComponent = roleConfig.icon;

  // Tabs available per role
  const availableTabs = useMemo(() => {
    const baseTabs = [
      { id: 'overview' as TabType, label: 'Resumen', icon: BarChart3 },
      { id: 'operativo' as TabType, label: 'Gestión Operativa', icon: ClipboardList },
    ];

    if (role === 'admin_mp' || role === 'admin_pp') {
      return [
        ...baseTabs,
        { id: 'ubicaciones' as TabType, label: 'Ubicaciones', icon: MapPin },
        { id: 'responsables' as TabType, label: 'Responsables', icon: Users },
      ];
    }

    if (role === 'superadmin') {
      return [
        ...baseTabs,
        { id: 'critico' as TabType, label: 'Críticos', icon: AlertTriangle },
        { id: 'import' as TabType, label: 'Importar', icon: Upload },
        { id: 'users' as TabType, label: 'Usuarios', icon: Users },
        { id: 'operarios' as TabType, label: 'Operarios', icon: UserCog },
      ];
    }

    // Supervisor tabs
    return baseTabs;
  }, [role]);

  // Fetch statistics
  const { data: stats } = useQuery({
    queryKey: ['unified-stats', profile?.id, role],
    queryFn: async () => {
      if (role === 'supervisor') {
        // Supervisor stats
        const { data: locations } = await supabase
          .from('locations')
          .select('id, operario_id')
          .eq('assigned_supervisor_id', profile!.id);
        
        const locationIds = locations?.map(l => l.id) || [];
        
        const { data: counts } = locationIds.length > 0 
          ? await supabase
              .from('inventory_counts')
              .select('location_id, audit_round')
              .in('location_id', locationIds)
          : { data: [] };
        
        const c1Ids = new Set((counts || []).filter(c => c.audit_round === 1).map(c => c.location_id));
        const c2Ids = new Set((counts || []).filter(c => c.audit_round === 2).map(c => c.location_id));
        const pendingC1 = (locations || []).filter(l => !c1Ids.has(l.id)).length;
        const pendingC2 = (locations || []).filter(l => !c2Ids.has(l.id)).length;
        const withOperario = (locations || []).filter(l => l.operario_id).length;
        const withoutOperario = (locations || []).length - withOperario;

        return {
          total: locations?.length || 0,
          pendingC1,
          pendingC2,
          withOperario,
          withoutOperario,
        };
      }

      if (role === 'admin_mp' || role === 'admin_pp') {
        const isAdminMP = role === 'admin_mp';
        let refQuery = supabase.from('inventory_master').select('referencia', { count: 'exact', head: true });
        if (isAdminMP) {
          refQuery = refQuery.not('control', 'is', null);
        } else {
          refQuery = refQuery.is('control', null);
        }
        const { count: refCount } = await refQuery;

        const { data: locationsWithSupervisors } = await supabase
          .from('locations')
          .select('assigned_supervisor_id, inventory_master!inner(control)')
          .not('assigned_supervisor_id', 'is', null);
        
        const relevantLocations = locationsWithSupervisors?.filter(l => {
          const inv = l.inventory_master as any;
          return isAdminMP ? inv.control !== null : inv.control === null;
        }) || [];
        const uniqueSupervisors = new Set(relevantLocations.map(l => l.assigned_supervisor_id));

        const { count: locationsCount } = await supabase
          .from('locations')
          .select('id', { count: 'exact', head: true });

        return {
          referencias: refCount || 0,
          supervisores: uniqueSupervisors.size,
          ubicaciones: locationsCount || 0,
          diferencias: 0,
        };
      }

      // Superadmin stats
      const { count: usersCount } = await supabase
        .from('profiles')
        .select('id', { count: 'exact', head: true });

      const { count: referencesCount } = await supabase
        .from('inventory_master')
        .select('referencia', { count: 'exact', head: true });

      const { count: locationsCount } = await supabase
        .from('locations')
        .select('id', { count: 'exact', head: true });

      const { count: operariosCount } = await supabase
        .from('operarios')
        .select('id', { count: 'exact', head: true })
        .eq('is_active', true);

      const { count: criticosCount } = await supabase
        .from('inventory_master')
        .select('referencia', { count: 'exact', head: true })
        .eq('audit_round', 5);

      return {
        usuarios: usersCount || 0,
        referencias: referencesCount || 0,
        ubicaciones: locationsCount || 0,
        operarios: operariosCount || 0,
        criticos: criticosCount || 0,
      };
    },
    enabled: !!profile?.id,
  });

  // Stats display based on role
  const statsDisplay = useMemo(() => {
    if (role === 'supervisor') {
      return [
        { label: 'Total Asignadas', value: stats?.total || 0, icon: ClipboardList, color: 'bg-primary/10 text-primary' },
        { label: 'Pendientes C1', value: stats?.pendingC1 || 0, icon: AlertCircle, color: 'bg-blue-500/10 text-blue-500' },
        { label: 'Pendientes C2', value: stats?.pendingC2 || 0, icon: AlertCircle, color: 'bg-purple-500/10 text-purple-500' },
        { label: 'Sin Operario', value: stats?.withoutOperario || 0, icon: Users, color: 'bg-amber-500/10 text-amber-500' },
      ];
    }

    if (role === 'admin_mp' || role === 'admin_pp') {
      const isAdminMP = role === 'admin_mp';
      return [
        { label: 'Referencias Cargadas', value: stats?.referencias || 0, icon: isAdminMP ? Package : Boxes, color: `${roleConfig.bgClass} ${roleConfig.colorClass}` },
        { label: 'Supervisores Asignados', value: stats?.supervisores || 0, icon: Users, color: 'bg-blue-500/10 text-blue-500' },
        { label: 'Ubicaciones Configuradas', value: stats?.ubicaciones || 0, icon: MapPin, color: 'bg-amber-500/10 text-amber-500' },
        { label: 'Diferencias', value: stats?.diferencias || 0, icon: BarChart3, color: 'bg-destructive/10 text-destructive' },
      ];
    }

    // Superadmin
    return [
      { label: 'Usuarios Registrados', value: stats?.usuarios || 0, icon: Users, color: 'bg-primary/10 text-primary' },
      { label: 'Referencias Totales', value: stats?.referencias || 0, icon: Package, color: 'bg-blue-500/10 text-blue-500' },
      { label: 'Ubicaciones Configuradas', value: stats?.ubicaciones || 0, icon: MapPin, color: 'bg-amber-500/10 text-amber-500' },
      { label: 'Operarios Activos', value: stats?.operarios || 0, icon: UserCog, color: 'bg-green-500/10 text-green-500' },
    ];
  }, [role, stats, roleConfig]);

  // Quick actions based on role
  const quickActions = useMemo(() => {
    if (role === 'supervisor') {
      return [
        { 
          label: 'Asignación de Operarios', 
          icon: Users, 
          description: 'Asigna operarios a las ubicaciones para cada ronda de conteo',
          onClick: () => setActiveTab('operativo'),
          badge: stats?.withoutOperario || 0,
          badgeColor: 'bg-amber-500/10 text-amber-500',
        },
        { 
          label: 'Transcripción de Conteos', 
          icon: ClipboardList, 
          description: 'Transcribe los conteos físicos realizados por los operarios',
          onClick: () => setActiveTab('operativo'),
          badge: (stats?.pendingC1 || 0) + (stats?.pendingC2 || 0),
          badgeColor: 'bg-blue-500/10 text-blue-500',
        },
      ];
    }

    if (role === 'admin_mp' || role === 'admin_pp') {
      return [
        { label: 'Gestión Operativa', icon: ClipboardList, description: 'Asignar operarios y transcribir conteos', onClick: () => setActiveTab('operativo') },
        { label: 'Gestionar Ubicaciones', icon: MapPin, description: 'Asignar ubicaciones y supervisores', onClick: () => navigate('/admin/gestion-ubicacion') },
        { label: 'Asignar Responsables', icon: Users, description: 'Asignación masiva de líderes de conteo', onClick: () => navigate('/admin/gestion-responsables') },
        { label: 'Ver Conteos', icon: ClipboardList, description: 'Monitorear progreso de conteos', disabled: true },
        { label: 'Ver Reportes', icon: FileSpreadsheet, description: 'Exportar informes de inventario', disabled: true },
      ];
    }

    // Superadmin
    return [
      { label: 'Gestión Operativa', icon: ClipboardList, description: 'Asignar operarios a ubicaciones', onClick: () => setActiveTab('operativo') },
      { label: 'Importar Maestra', icon: Upload, description: 'Cargar inventario desde archivo', onClick: () => setActiveTab('import') },
      { label: 'Gestionar Usuarios', icon: Users, description: 'Asignar roles y permisos', onClick: () => setActiveTab('users') },
      { label: 'Inventario MP', icon: Package, description: 'CRUD Materia Prima', onClick: () => navigate('/superadmin/inventario-mp') },
      { label: 'Inventario PP', icon: Boxes, description: 'CRUD Producto en Proceso', onClick: () => navigate('/superadmin/inventario-pp') },
    ];
  }, [role, stats, navigate]);

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b border-border bg-card">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center gap-3">
              <div className={`w-10 h-10 rounded-xl ${roleConfig.bgClass} flex items-center justify-center`}>
                <IconComponent className={`w-5 h-5 ${roleConfig.bgClass === 'gradient-bg' ? 'text-primary-foreground' : roleConfig.colorClass}`} />
              </div>
              <div>
                <h1 className="text-lg font-bold text-foreground">AuditMaster</h1>
                <p className="text-xs text-muted-foreground">{roleConfig.label}</p>
              </div>
            </div>

            <div className="flex items-center gap-4">
              <div className="text-right hidden sm:block">
                <p className="text-sm font-medium text-foreground">{profile?.full_name || 'Usuario'}</p>
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
          <nav className="flex gap-1 -mb-px overflow-x-auto">
            {availableTabs.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
                  activeTab === tab.id
                    ? tab.id === 'critico' 
                      ? 'border-red-500 text-red-500'
                      : 'border-primary text-primary'
                    : 'border-transparent text-muted-foreground hover:text-foreground hover:border-border'
                }`}
              >
                <tab.icon className="w-4 h-4" />
                {tab.label}
                {tab.id === 'critico' && stats?.criticos && stats.criticos > 0 && (
                  <Badge variant="destructive" className="ml-1 text-xs px-1.5 py-0">
                    {stats.criticos}
                  </Badge>
                )}
              </button>
            ))}
          </nav>
        </div>
      </div>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* OVERVIEW TAB */}
        {activeTab === 'overview' && (
          <div className="space-y-8">
            {/* Welcome */}
            <div>
              <h2 className="text-2xl font-bold text-foreground">
                Hola, {profile?.full_name?.split(' ')[0] || 'Usuario'}
              </h2>
              <p className="text-muted-foreground">
                {role === 'supervisor' 
                  ? 'Selecciona una opción para gestionar el inventario'
                  : role === 'superadmin'
                    ? 'Control total del sistema de auditoría de inventario'
                    : `Gestiona el inventario de ${roleConfig.label} y supervisa el proceso de auditoría`
                }
              </p>
            </div>

            {/* Stats Grid */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              {statsDisplay.map((stat) => (
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

            {/* Critical Alert (Superadmin only) */}
            {role === 'superadmin' && stats?.criticos && stats.criticos > 0 && (
              <div 
                className="bg-red-500/10 border border-red-500/30 rounded-lg p-4 flex items-center justify-between cursor-pointer hover:bg-red-500/20 transition-colors"
                onClick={() => setActiveTab('critico')}
              >
                <div className="flex items-center gap-3">
                  <AlertTriangle className="w-6 h-6 text-red-500" />
                  <div>
                    <p className="font-semibold text-red-600 dark:text-red-400">
                      {stats.criticos} Referencia(s) Crítica(s)
                    </p>
                    <p className="text-sm text-muted-foreground">
                      Requieren tu intervención para cierre forzado (Conteo 5)
                    </p>
                  </div>
                </div>
                <Badge variant="destructive">Ver ahora</Badge>
              </div>
            )}

            {/* Quick Actions */}
            <div>
              <h3 className="text-lg font-semibold text-foreground mb-4">Acciones Rápidas</h3>
              {role === 'supervisor' ? (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  {quickActions.map((action) => (
                    <Card 
                      key={action.label}
                      className="cursor-pointer hover:border-primary/50 transition-all group"
                      onClick={action.onClick}
                    >
                      <CardContent className="p-8">
                        <div className="flex flex-col items-center text-center space-y-4">
                          <div className="p-4 rounded-2xl bg-primary/10 text-primary group-hover:bg-primary group-hover:text-primary-foreground transition-colors">
                            <action.icon className="w-12 h-12" />
                          </div>
                          <div>
                            <h3 className="text-xl font-bold text-foreground">{action.label}</h3>
                            <p className="text-muted-foreground mt-1">{action.description}</p>
                          </div>
                          <div className="flex items-center gap-2">
                            {action.badge && action.badge > 0 && (
                              <Badge variant="secondary" className={action.badgeColor}>
                                {action.badge} {action.label.includes('Operarios') ? 'sin asignar' : 'pendientes'}
                              </Badge>
                            )}
                            <ArrowRight className="w-5 h-5 text-muted-foreground group-hover:text-primary transition-colors" />
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                  {quickActions.map((action) => (
                    <button
                      key={action.label}
                      onClick={action.onClick}
                      disabled={action.disabled}
                      className={`glass-card text-left transition-all group ${action.disabled ? 'opacity-50 cursor-not-allowed' : 'hover:border-primary/50'}`}
                    >
                      <div className="flex items-start gap-4">
                        <div className={`p-3 rounded-xl ${roleConfig.bgClass} ${roleConfig.colorClass} ${!action.disabled && 'group-hover:bg-primary group-hover:text-primary-foreground'} transition-colors`}>
                          <action.icon className="w-6 h-6" />
                        </div>
                        <div>
                          <p className="font-medium text-foreground">{action.label}</p>
                          <p className="text-sm text-muted-foreground">{action.description}</p>
                          {action.disabled && <p className="text-xs text-muted-foreground italic mt-1">Próximamente</p>}
                        </div>
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* GESTIÓN OPERATIVA TAB */}
        {activeTab === 'operativo' && (
          <div className="space-y-6">
            <div>
              <h2 className="text-xl font-semibold text-foreground">Gestión de Conteos por Rondas</h2>
              <p className="text-muted-foreground">
                {role === 'supervisor' 
                  ? 'Asigna operarios y transcribe conteos para tus ubicaciones'
                  : `Gestiona ubicaciones con referencias de ${roleConfig.label}`
                }
              </p>
            </div>
            <OperationalPanel 
              isAdminMode={role !== 'supervisor'}
              controlFilter={roleConfig.controlFilter}
            />
          </div>
        )}


        {/* CRÍTICOS TAB (Superadmin only) */}
        {activeTab === 'critico' && role === 'superadmin' && (
          <div className="space-y-6">
            <div>
              <h2 className="text-xl font-semibold text-foreground flex items-center gap-2">
                <AlertTriangle className="w-6 h-6 text-red-500" />
                Referencias Críticas (Conteo 5)
              </h2>
              <p className="text-muted-foreground">
                Estas referencias no coincidieron en ningún conteo previo y requieren tu intervención personal para el cierre forzado.
              </p>
            </div>
            <div className="glass-card">
              <RoundTranscriptionTab 
                roundNumber={5}
                isAdminMode={true}
                controlFilter="all"
                isSuperadminOnly={true}
              />
            </div>
          </div>
        )}

        {/* IMPORT TAB (Superadmin only) */}
        {activeTab === 'import' && role === 'superadmin' && <MasterDataImport />}

        {/* USERS TAB (Superadmin only) */}
        {activeTab === 'users' && role === 'superadmin' && <UserManagement />}

        {/* OPERARIOS TAB (Superadmin only) */}
        {activeTab === 'operarios' && role === 'superadmin' && <OperariosManagement />}

        {/* UBICACIONES TAB (Admin only) - Navigate to existing page */}
        {activeTab === 'ubicaciones' && (role === 'admin_mp' || role === 'admin_pp') && (
          <div className="text-center py-12">
            <MapPin className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
            <p className="text-muted-foreground mb-4">Gestionar ubicaciones y asignar supervisores</p>
            <Button onClick={() => navigate('/admin/gestion-ubicacion')}>
              Ir a Gestión de Ubicaciones
            </Button>
          </div>
        )}

        {/* RESPONSABLES TAB (Admin only) - Navigate to existing page */}
        {activeTab === 'responsables' && (role === 'admin_mp' || role === 'admin_pp') && (
          <div className="text-center py-12">
            <Users className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
            <p className="text-muted-foreground mb-4">Asignación masiva de líderes de conteo</p>
            <Button onClick={() => navigate('/admin/gestion-responsables')}>
              Ir a Gestión de Responsables
            </Button>
          </div>
        )}
      </main>
    </div>
  );
};

export default UnifiedDashboard;
