import React, { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
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

interface Operario {
  id: string;
  full_name: string;
  document_id: string | null;
}

interface OperarioSelectProps {
  value: string | null;
  onChange: (value: string | null) => void;
  placeholder?: string;
  disabled?: boolean;
}

const OperarioSelect: React.FC<OperarioSelectProps> = ({
  value,
  onChange,
  placeholder = 'Seleccionar operario...',
  disabled = false,
}) => {
  const [open, setOpen] = useState(false);
  const [operarios, setOperarios] = useState<Operario[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchOperarios = async () => {
      try {
        const { data, error } = await supabase
          .from('operarios')
          .select('id, full_name, document_id')
          .eq('is_active', true)
          .order('full_name', { ascending: true });

        if (error) throw error;
        setOperarios(data || []);
      } catch (error) {
        console.error('Error fetching operarios:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchOperarios();
  }, []);

  const selectedOperario = operarios.find(o => o.id === value);

  if (loading) {
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
                  <div className="flex flex-col">
                    <span>{operario.full_name}</span>
                    {operario.document_id && (
                      <span className="text-xs text-muted-foreground">
                        {operario.document_id}
                      </span>
                    )}
                  </div>
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
