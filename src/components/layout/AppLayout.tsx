import React from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { cn } from '@/lib/utils';
import { 
  ArrowLeft, 
  LogOut, 
  Package,
  Boxes, 
  Shield, 
  Settings,
  LucideIcon 
} from 'lucide-react';
import { Button } from '@/components/ui/button';

interface RoleConfig {
  label: string;
  icon: LucideIcon;
  colorClass: string;
  bgClass: string;
}

interface AppLayoutProps {
  children: React.ReactNode;
  title: string;
  subtitle?: string;
  showBackButton?: boolean;
  backPath?: string;
  roleConfig?: RoleConfig;
  fullWidth?: boolean;
}

const getRoleConfig = (role: string | null): RoleConfig => {
  switch (role) {
    case 'admin_mp':
      return {
        label: 'Admin MP',
        icon: Package,
        colorClass: 'text-orange-500',
        bgClass: 'bg-orange-500/10',
      };
    case 'admin_pp':
      return {
        label: 'Admin PP',
        icon: Boxes,
        colorClass: 'text-emerald-500',
        bgClass: 'bg-emerald-500/10',
      };
    case 'superadmin':
      return {
        label: 'Superadmin',
        icon: Shield,
        colorClass: 'text-primary',
        bgClass: 'gradient-bg',
      };
    case 'supervisor':
      return {
        label: 'Supervisor',
        icon: Package,
        colorClass: 'text-primary',
        bgClass: 'gradient-bg',
      };
    default:
      return {
        label: 'Usuario',
        icon: Settings,
        colorClass: 'text-primary',
        bgClass: 'bg-primary/10',
      };
  }
};

const AppLayout: React.FC<AppLayoutProps> = ({
  children,
  title,
  subtitle,
  showBackButton = false,
  backPath = '/dashboard',
  roleConfig: customRoleConfig,
  fullWidth = false,
}) => {
  const { profile, role, signOut } = useAuth();
  const navigate = useNavigate();
  
  const config = customRoleConfig || getRoleConfig(role);
  const IconComponent = config.icon;

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b border-border bg-card">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center gap-3">
              {showBackButton && (
                <Button 
                  variant="ghost" 
                  size="icon" 
                  onClick={() => navigate(backPath)}
                >
                  <ArrowLeft className="w-5 h-5" />
                </Button>
              )}
              <div className={`w-10 h-10 rounded-xl ${config.bgClass} flex items-center justify-center`}>
                <IconComponent className={`w-5 h-5 ${config.bgClass === 'gradient-bg' ? 'text-primary-foreground' : config.colorClass}`} />
              </div>
              <div>
                <h1 className="text-lg font-bold text-foreground">{title}</h1>
                {subtitle && <p className="text-xs text-muted-foreground">{subtitle}</p>}
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
      <main className={cn(
        "mx-auto px-4 sm:px-6 lg:px-8 py-8",
        fullWidth ? "max-w-full" : "max-w-7xl"
      )}>
        {children}
      </main>
    </div>
  );
};

export default AppLayout;
