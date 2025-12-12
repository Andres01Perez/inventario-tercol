import React from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { 
  Package, 
  Users, 
  FileSpreadsheet, 
  LogOut,
  MapPin,
  ClipboardCheck,
  BarChart3,
  Boxes
} from 'lucide-react';
import { Button } from '@/components/ui/button';

const AdminDashboard: React.FC = () => {
  const { profile, role, signOut } = useAuth();
  const navigate = useNavigate();

  const isAdminMP = role === 'admin_mp';
  const adminTypeLabel = isAdminMP ? 'Materia Prima' : 'Producto en Proceso';
  const AdminIcon = isAdminMP ? Package : Boxes;
  const adminColorClass = isAdminMP ? 'text-orange-500' : 'text-emerald-500';
  const adminBgClass = isAdminMP ? 'bg-orange-500/10' : 'bg-emerald-500/10';

  // Fetch real statistics
  const { data: stats } = useQuery({
    queryKey: ['admin-stats', role],
    queryFn: async () => {
      // Get references count
      let refQuery = supabase.from('inventory_master').select('referencia', { count: 'exact', head: true });
      if (isAdminMP) {
        refQuery = refQuery.not('control', 'is', null);
      } else {
        refQuery = refQuery.is('control', null);
      }
      const { count: refCount } = await refQuery;

      // Get assigned supervisors count (unique supervisors with tasks for this admin type)
      const { data: tasksWithSupervisors } = await supabase
        .from('count_tasks')
        .select('assigned_supervisor_id, inventory_master!inner(control)')
        .not('assigned_supervisor_id', 'is', null);
      
      const relevantTasks = tasksWithSupervisors?.filter(t => {
        const inv = t.inventory_master as any;
        return isAdminMP ? inv.control !== null : inv.control === null;
      }) || [];
      const uniqueSupervisors = new Set(relevantTasks.map(t => t.assigned_supervisor_id));

      // Get pending counts (tasks not completed)
      const { data: pendingTasks } = await supabase
        .from('count_tasks')
        .select('id, is_completed, inventory_master!inner(control)')
        .eq('is_completed', false);
      
      const pendingCount = pendingTasks?.filter(t => {
        const inv = t.inventory_master as any;
        return isAdminMP ? inv.control !== null : inv.control === null;
      }).length || 0;

      // Get differences (tasks with quantity_counted != 0 that might need review)
      const { data: differenceTasks } = await supabase
        .from('count_tasks')
        .select('id, quantity_counted, inventory_master!inner(control, cant_total_erp)')
        .eq('is_completed', true)
        .not('quantity_counted', 'is', null);
      
      const diffCount = differenceTasks?.filter(t => {
        const inv = t.inventory_master as any;
        const isRelevant = isAdminMP ? inv.control !== null : inv.control === null;
        return isRelevant && t.quantity_counted !== inv.cant_total_erp;
      }).length || 0;

      return {
        referencias: refCount || 0,
        supervisores: uniqueSupervisors.size,
        pendientes: pendingCount,
        diferencias: diffCount
      };
    }
  });

  const statsDisplay = [
    { label: 'Referencias Cargadas', value: stats?.referencias?.toString() || '0', icon: isAdminMP ? Package : Boxes, color: `${adminBgClass} ${adminColorClass}` },
    { label: 'Supervisores Asignados', value: stats?.supervisores?.toString() || '0', icon: Users, color: 'bg-blue-500/10 text-blue-500' },
    { label: 'Conteos Pendientes', value: stats?.pendientes?.toString() || '0', icon: ClipboardCheck, color: 'bg-amber-500/10 text-amber-500' },
    { label: 'Diferencias', value: stats?.diferencias?.toString() || '0', icon: BarChart3, color: 'bg-destructive/10 text-destructive' },
  ];

  const quickActions = [
    { label: 'Gestionar Ubicaciones', icon: MapPin, description: 'Asignar ubicaciones y supervisores', onClick: () => navigate('/admin/gestion-ubicacion') },
    { label: 'Ver Conteos', icon: ClipboardCheck, description: 'Monitorear progreso de conteos', disabled: true },
    { label: 'Ver Reportes', icon: FileSpreadsheet, description: 'Exportar informes de inventario', disabled: true },
  ];

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b border-border bg-card">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center gap-3">
              <div className={`w-10 h-10 rounded-xl ${adminBgClass} flex items-center justify-center`}>
                <AdminIcon className={`w-5 h-5 ${adminColorClass}`} />
              </div>
              <div>
                <h1 className="text-lg font-bold text-foreground">AuditMaster</h1>
                <p className="text-xs text-muted-foreground">Admin - {adminTypeLabel}</p>
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
            Gestiona el inventario de <span className={`font-medium ${adminColorClass}`}>{adminTypeLabel}</span> y supervisa el proceso de auditoría
          </p>
        </div>

        {/* Stats Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
          {statsDisplay.map((stat) => (
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
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {quickActions.map((action) => (
            <button
              key={action.label}
              onClick={action.onClick}
              disabled={action.disabled}
              className={`glass-card text-left transition-all group ${action.disabled ? 'opacity-50 cursor-not-allowed' : 'hover:border-primary/50'}`}
            >
              <div className="flex items-start gap-4">
                <div className={`p-3 rounded-xl ${adminBgClass} ${adminColorClass} ${!action.disabled && 'group-hover:bg-primary group-hover:text-primary-foreground'} transition-colors`}>
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

        {/* Empty State for Recent Activity */}
        <div className="mt-8">
          <h3 className="text-lg font-semibold text-foreground mb-4">Actividad Reciente</h3>
          <div className="glass-card text-center py-12">
            <AdminIcon className={`w-12 h-12 ${adminColorClass} mx-auto mb-4 opacity-50`} />
            <p className="text-muted-foreground">No hay actividad reciente</p>
            <p className="text-sm text-muted-foreground">Comienza asignando ubicaciones a las referencias</p>
          </div>
        </div>
      </main>
    </div>
  );
};

export default AdminDashboard;
