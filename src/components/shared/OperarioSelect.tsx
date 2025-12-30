import React, { useState } from 'react';
import { Check, ChevronsUpDown, Loader2, UserCog } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { useOperarios } from '@/hooks/useOperarios';

interface OperarioSelectProps {
  value: string | null;
  onChange: (value: string | null) => void;
  placeholder?: string;
  disabled?: boolean;
  filterTurno?: number;
}

const OperarioSelect: React.FC<OperarioSelectProps> = ({
  value,
  onChange,
  placeholder = 'Seleccionar operario...',
  disabled = false,
  filterTurno,
}) => {
  const [open, setOpen] = useState(false);
  const { data: operarios = [], isLoading } = useOperarios(filterTurno);

  const selectedOperario = operarios.find(o => o.id === value);

  if (isLoading) {
    return (
      <Button variant="outline" disabled className="w-full justify-start">
        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
        Cargando...
      </Button>
    );
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          disabled={disabled}
          className="w-full justify-between"
        >
          <span className="flex items-center gap-2 truncate">
            {selectedOperario ? (
              <>
                <UserCog className="h-4 w-4 shrink-0" />
                {selectedOperario.full_name}
              </>
            ) : (
              <span className="text-muted-foreground">{placeholder}</span>
            )}
          </span>
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[300px] p-0">
        <Command>
          <CommandInput placeholder="Buscar operario..." />
          <CommandList>
            <CommandEmpty>No se encontraron operarios</CommandEmpty>
            <CommandGroup>
              {value && (
                <CommandItem
                  value="__clear__"
                  onSelect={() => {
                    onChange(null);
                    setOpen(false);
                  }}
                  className="text-muted-foreground"
                >
                  <span>Sin asignar</span>
                </CommandItem>
              )}
              {operarios.map((operario) => (
                <CommandItem
                  key={operario.id}
                  value={operario.full_name}
                  onSelect={() => {
                    onChange(operario.id);
                    setOpen(false);
                  }}
                >
                  <Check
                    className={cn(
                      'mr-2 h-4 w-4',
                      value === operario.id ? 'opacity-100' : 'opacity-0'
                    )}
                  />
                  <span>{operario.full_name}</span>
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
};

export default OperarioSelect;
