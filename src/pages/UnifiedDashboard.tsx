import React, { useMemo } from 'react';
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
  AlertCircle,
  FileSearch
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';

const UnifiedDashboard: React.FC = () => {
  const { profile, role, signOut } = useAuth();
  const navigate = useNavigate();

  // Role-based configuration
  const roleConfig = useMemo(() => {
    switch (role) {
      case 'admin_mp':
        return {
          label: 'Materia Prima',
          icon: Package,
          colorClass: 'text-orange-500',
          bgClass: 'bg-orange-500/10',
        };
      case 'admin_pp':
        return {
          label: 'Producto en Proceso',
          icon: Boxes,
          colorClass: 'text-emerald-500',
          bgClass: 'bg-emerald-500/10',
        };
      case 'superadmin':
        return {
          label: 'Panel Superadmin',
          icon: Shield,
          colorClass: 'text-primary',
          bgClass: 'gradient-bg',
        };
      default:
        return {
          label: 'Panel de Supervisor',
          icon: Package,
          colorClass: 'text-primary',
          bgClass: 'gradient-bg',
        };
    }
  }, [role]);

  const IconComponent = roleConfig.icon;

  // Fetch statistics with optimized staleTime for concurrent users
  const { data: stats } = useQuery({
    queryKey: ['unified-stats', profile?.id, role],
    staleTime: 30 * 1000, // 30 seconds - reduce unnecessary refetches
    queryFn: async () => {
      if (role === 'supervisor') {
        const { data: locations } = await supabase
          .from('locations')
          .select('id, status_c1, status_c2')
          .eq('assigned_supervisor_id', profile!.id);
        
        const pendingC1 = (locations || []).filter(l => l.status_c1 !== 'contado').length;
        const pendingC2 = (locations || []).filter(l => l.status_c2 !== 'contado').length;

        return {
          total: locations?.length || 0,
          pendingC1,
          pendingC2,
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

  // Type for action button
  interface ActionItem {
    label: string;
    icon: React.ComponentType<{ className?: string }>;
    description: string;
    onClick?: () => void;
    iconColor: string;
    bgColor: string;
    hoverBg: string;
    badge?: number;
    badgeLabel?: string;
    disabled?: boolean;
  }

  // Category type
  interface ActionCategory {
    name: string;
    icon: React.ComponentType<{ className?: string }>;
    actions: ActionItem[];
  }

  // Base actions definitions
  const baseActions: Record<string, ActionItem> = useMemo(() => ({
    gestionOperativa: { 
      label: 'Gestión Operativa', 
      icon: ClipboardList, 
      description: 'Transcribir conteos de inventario',
      onClick: () => navigate('/gestion-operativa'),
      iconColor: 'text-blue-500',
      bgColor: 'bg-blue-500/10',
      hoverBg: 'group-hover:bg-blue-500',
    },
    criticos: { 
      label: 'Críticos (C5)', 
      icon: AlertTriangle, 
      description: 'Referencias que requieren cierre forzado',
      onClick: () => navigate('/superadmin/criticos'),
      iconColor: 'text-red-500',
      bgColor: 'bg-red-500/10',
      hoverBg: 'group-hover:bg-red-500',
    },
    importar: { 
      label: 'Importar Maestra', 
      icon: Upload, 
      description: 'Cargar inventario desde archivo',
      onClick: () => navigate('/superadmin/importar'),
      iconColor: 'text-purple-500',
      bgColor: 'bg-purple-500/10',
      hoverBg: 'group-hover:bg-purple-500',
    },
    usuarios: { 
      label: 'Gestionar Usuarios', 
      icon: Users, 
      description: 'Asignar roles y permisos',
      onClick: () => navigate('/superadmin/usuarios'),
      iconColor: 'text-emerald-500',
      bgColor: 'bg-emerald-500/10',
      hoverBg: 'group-hover:bg-emerald-500',
    },
    operarios: { 
      label: 'Gestionar Operarios', 
      icon: UserCog, 
      description: 'Administrar operarios del sistema',
      onClick: () => navigate('/superadmin/operarios'),
      iconColor: 'text-amber-500',
      bgColor: 'bg-amber-500/10',
      hoverBg: 'group-hover:bg-amber-500',
    },
    inventarioMP: { 
      label: 'Inventario MP', 
      icon: Package, 
      description: 'CRUD Materia Prima',
      onClick: () => navigate('/superadmin/inventario-mp'),
      iconColor: 'text-orange-500',
      bgColor: 'bg-orange-500/10',
      hoverBg: 'group-hover:bg-orange-500',
    },
    inventarioPP: { 
      label: 'Inventario PP', 
      icon: Boxes, 
      description: 'CRUD Producto en Proceso',
      onClick: () => navigate('/superadmin/inventario-pp'),
      iconColor: 'text-teal-500',
      bgColor: 'bg-teal-500/10',
      hoverBg: 'group-hover:bg-teal-500',
    },
    ubicaciones: { 
      label: 'Gestionar Ubicaciones', 
      icon: MapPin, 
      description: 'Asignar ubicaciones y supervisores',
      onClick: () => navigate('/admin/gestion-ubicacion'),
      iconColor: 'text-cyan-500',
      bgColor: 'bg-cyan-500/10',
      hoverBg: 'group-hover:bg-cyan-500',
    },
    responsables: { 
      label: 'Asignar Responsables', 
      icon: Users, 
      description: 'Asignación masiva de líderes de conteo',
      onClick: () => navigate('/admin/gestion-responsables'),
      iconColor: 'text-indigo-500',
      bgColor: 'bg-indigo-500/10',
      hoverBg: 'group-hover:bg-indigo-500',
    },
    auditoria: { 
      label: 'Auditoría General', 
      icon: FileSearch, 
      description: 'Vista completa de referencias y conteos',
      onClick: () => navigate('/superadmin/auditoria'),
      iconColor: 'text-violet-500',
      bgColor: 'bg-violet-500/10',
      hoverBg: 'group-hover:bg-violet-500',
    },
  }), [navigate]);

  // Action categories based on role
  const actionCategories: ActionCategory[] = useMemo(() => {
    const categories: ActionCategory[] = [];

    // 1. ADMINISTRACIÓN (solo superadmin)
    if (role === 'superadmin') {
      categories.push({
        name: 'Administración',
        icon: Shield,
        actions: [
          baseActions.usuarios,
          baseActions.importar,
          baseActions.operarios,
        ]
      });
    }

    // 2. AUDITORÍA (solo superadmin)
    if (role === 'superadmin') {
      categories.push({
        name: 'Auditoría',
        icon: FileSearch,
        actions: [
          baseActions.inventarioMP,
          baseActions.inventarioPP,
          baseActions.auditoria,
        ]
      });
    }

    // 3. GENERAL (superadmin y admins)
    if (role === 'superadmin' || role === 'admin_mp' || role === 'admin_pp') {
      categories.push({
        name: 'General',
        icon: MapPin,
        actions: [
          baseActions.ubicaciones,
          baseActions.responsables,
        ]
      });
    }

    // 4. OPERACIÓN (todos los roles)
    const operacionActions: ActionItem[] = [];
    
    if (role === 'superadmin') {
      operacionActions.push({ ...baseActions.criticos, badge: stats?.criticos || 0 });
    }
    
    if (role === 'supervisor') {
      const pendingTotal = (stats?.pendingC1 || 0) + (stats?.pendingC2 || 0);
      operacionActions.push({
        ...baseActions.gestionOperativa,
        description: 'Transcribe conteos para tus ubicaciones asignadas',
        badge: pendingTotal,
        badgeLabel: 'pendientes',
      });
    } else {
      operacionActions.push(baseActions.gestionOperativa);
    }

    categories.push({
      name: 'Operación',
      icon: ClipboardList,
      actions: operacionActions
    });

    return categories;
  }, [role, stats, baseActions]);

  // Check if supervisor with only 1 action (for large card display)
  const isSingleActionLayout = role === 'supervisor';

  // Reusable ActionButton component
  const ActionButton = ({ action, isLarge = false }: { action: ActionItem; isLarge?: boolean }) => {
    if (isLarge) {
      return (
        <Card 
          className="cursor-pointer hover:border-primary/50 transition-all group"
          onClick={action.onClick}
        >
          <CardContent className="p-8">
            <div className="flex flex-col items-center text-center space-y-4">
              <div className={`p-4 rounded-2xl ${action.bgColor} ${action.iconColor} ${action.hoverBg} group-hover:text-white transition-colors`}>
                <action.icon className="w-12 h-12" />
              </div>
              <div>
                <h3 className="text-xl font-bold text-foreground">{action.label}</h3>
                <p className="text-muted-foreground mt-1">{action.description}</p>
              </div>
              <div className="flex items-center gap-2">
                {action.badge !== undefined && action.badge > 0 && (
                  <Badge variant="secondary" className={`${action.bgColor} ${action.iconColor}`}>
                    {action.badge} {action.badgeLabel || ''}
                  </Badge>
                )}
                <ArrowRight className="w-5 h-5 text-muted-foreground group-hover:text-primary transition-colors" />
              </div>
            </div>
          </CardContent>
        </Card>
      );
    }

    return (
      <button
        onClick={action.onClick}
        disabled={action.disabled}
        className={`glass-card-interactive text-left group ${action.disabled ? 'opacity-50 cursor-not-allowed' : 'hover:border-primary/50'}`}
      >
        <div className="flex items-start gap-4">
          <div className={`p-3 rounded-xl ${action.bgColor} ${action.iconColor} ${!action.disabled && action.hoverBg} ${!action.disabled && 'group-hover:text-white'} transition-colors`}>
            <action.icon className="w-6 h-6" />
          </div>
          <div className="flex-1">
            <div className="flex items-center gap-2">
              <p className="font-medium text-foreground">{action.label}</p>
              {action.badge !== undefined && action.badge > 0 && (
                <Badge variant="secondary" className={`${action.bgColor} ${action.iconColor}`}>
                  {action.badge}
                </Badge>
              )}
            </div>
            <p className="text-sm text-muted-foreground">{action.description}</p>
            {action.disabled && <p className="text-xs text-muted-foreground italic mt-1">Próximamente</p>}
          </div>
        </div>
      </button>
    );
  };

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

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
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
          {/* Quick Actions - Categorized */}
          <div className="space-y-6">
            {actionCategories.map((category) => (
              <div key={category.name}>
                {/* Category Header */}
                <div className="flex items-center gap-2 mb-3">
                  <category.icon className="w-5 h-5 text-muted-foreground" />
                  <h3 className="text-lg font-semibold text-foreground">{category.name}</h3>
                </div>
                
                {/* Actions Grid */}
                <div className={`grid gap-4 ${isSingleActionLayout ? 'grid-cols-1 md:grid-cols-2' : 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-3'}`}>
                  {category.actions.map((action) => (
                    <ActionButton key={action.label} action={action} isLarge={isSingleActionLayout} />
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      </main>
    </div>
  );
};

export default UnifiedDashboard;
