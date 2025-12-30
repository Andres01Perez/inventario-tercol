import React from 'react';
import { useSupervisors } from '@/hooks/useSupervisors';
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
  const { data: supervisors, isLoading } = useSupervisors();

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
