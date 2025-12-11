import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { User } from 'lucide-react';

interface SupervisorSelectProps {
  value: string | null | undefined;
  onValueChange: (value: string | null) => void;
  placeholder?: string;
  disabled?: boolean;
}

const SupervisorSelect: React.FC<SupervisorSelectProps> = ({
  value,
  onValueChange,
  placeholder = 'Seleccionar supervisor',
  disabled = false
}) => {
  const { data: supervisors, isLoading } = useQuery({
    queryKey: ['supervisors'],
    queryFn: async () => {
      // Get all users with supervisor role
      const { data: roles, error: rolesError } = await supabase
        .from('user_roles')
        .select('user_id')
        .eq('role', 'supervisor');

      if (rolesError) throw rolesError;
      if (!roles || roles.length === 0) return [];

      const userIds = roles.map(r => r.user_id);

      // Get profiles for these users
      const { data: profiles, error: profilesError } = await supabase
        .from('profiles')
        .select('id, full_name, email')
        .in('id', userIds);

      if (profilesError) throw profilesError;
      return profiles || [];
    }
  });

  return (
    <Select
      value={value || 'none'}
      onValueChange={(val) => onValueChange(val === 'none' ? null : val)}
      disabled={disabled || isLoading}
    >
      <SelectTrigger className="h-8 text-sm">
        <SelectValue placeholder={isLoading ? 'Cargando...' : placeholder} />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="none">
          <span className="text-muted-foreground">Sin asignar</span>
        </SelectItem>
        {supervisors?.map((supervisor) => (
          <SelectItem key={supervisor.id} value={supervisor.id}>
            <div className="flex items-center gap-2">
              <User className="w-3 h-3" />
              <span>{supervisor.full_name || supervisor.email}</span>
            </div>
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
};

export default SupervisorSelect;
