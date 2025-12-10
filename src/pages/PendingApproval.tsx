import React from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { Clock, LogOut, Mail } from 'lucide-react';
import { Button } from '@/components/ui/button';

const PendingApproval: React.FC = () => {
  const { profile, signOut } = useAuth();

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <div className="glass-card max-w-md w-full text-center">
        <div className="w-16 h-16 rounded-full bg-amber-500/10 flex items-center justify-center mx-auto mb-6">
          <Clock className="w-8 h-8 text-amber-500" />
        </div>
        
        <h1 className="text-2xl font-bold text-foreground mb-2">
          Cuenta Pendiente de Aprobación
        </h1>
        
        <p className="text-muted-foreground mb-6">
          Tu cuenta ha sido creada exitosamente, pero necesita ser aprobada por un administrador antes de poder acceder al sistema.
        </p>

        <div className="bg-muted/50 rounded-xl p-4 mb-6">
          <div className="flex items-center justify-center gap-2 text-sm text-muted-foreground">
            <Mail className="w-4 h-4" />
            <span>{profile?.email}</span>
          </div>
          {profile?.full_name && (
            <p className="text-sm font-medium text-foreground mt-1">
              {profile.full_name}
            </p>
          )}
        </div>

        <p className="text-sm text-muted-foreground mb-6">
          Te notificaremos cuando tu cuenta sea activada. Por favor, contacta al administrador si tienes alguna pregunta.
        </p>

        <Button 
          variant="outline" 
          onClick={signOut}
          className="w-full"
        >
          <LogOut className="w-4 h-4 mr-2" />
          Cerrar Sesión
        </Button>
      </div>
    </div>
  );
};

export default PendingApproval;
