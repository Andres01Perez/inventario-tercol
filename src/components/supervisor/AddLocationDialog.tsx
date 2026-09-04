import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useInventory } from '@/contexts/InventoryContext';
import { useAuth } from '@/contexts/AuthContext';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';
import { friendlyCountError } from '@/lib/countErrorMessage';
import { Loader2, Check, ChevronsUpDown } from 'lucide-react';
import { cn } from '@/lib/utils';

interface AddLocationDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const AddLocationDialog: React.FC<AddLocationDialogProps> = ({
  open,
  onOpenChange,
}) => {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  // Form state
  const [bodega, setBodega] = useState<'planta' | 'almacen'>('planta');
  const [referencia, setReferencia] = useState('');
  const [ubicacion, setUbicacion] = useState('');
  const [puntoReferencia, setPuntoReferencia] = useState('');
  const [cantidad, setCantidad] = useState('');

  // Combobox state
  const [comboboxOpen, setComboboxOpen] = useState(false);
  const { inventoryId, isReadOnly } = useInventory();

  // Fetch ALL references (validated against inventory_master) - fetch in batches to avoid 1000 row limit
  const { data: references = [], isLoading: loadingRefs } = useQuery({
    queryKey: ['all-inventory-references', inventoryId],
    queryFn: async () => {
      let allData: { referencia: string; material_type: string }[] = [];
      let from = 0;
      const batchSize = 1000;

      while (true) {
        const { data, error } = await supabase
          .from('inventory_master')
          .select('referencia, material_type')
          .eq('inventory_id', inventoryId!)
          .order('referencia')
          .range(from, from + batchSize - 1);

        if (error) throw error;
        if (!data || data.length === 0) break;

        allData.push(...data);
        if (data.length < batchSize) break;
        from += batchSize;
      }

      return allData;
    },
    enabled: open && !!inventoryId,
  });

  const resetForm = () => {
    setBodega('planta');
    setReferencia('');
    setUbicacion('');
    setPuntoReferencia('');
    setCantidad('');
  };

  const addLocationMutation = useMutation({
    mutationFn: async () => {
      if (!referencia || !ubicacion || !puntoReferencia) {
        throw new Error('Referencia, ubicación y punto de referencia son requeridos');
      }
      if (isReadOnly) {
        throw new Error('Inventario histórico: solo lectura');
      }

      // 1. Get current audit_round from inventory_master
      const { data: master, error: masterError } = await supabase
        .from('inventory_master')
        .select('audit_round')
        .eq('inventory_id', inventoryId!)
        .eq('referencia', referencia)
        .single();

      if (masterError) throw masterError;

      const currentAuditRound = master?.audit_round || 1;

      // 2. Resolve assigned_admin_id for the selected bodega
      const { data: adminId, error: adminError } = await supabase
        .rpc('get_bodega_admin', { _bodega: bodega });

      if (adminError) throw adminError;
      if (!adminId) {
        throw new Error(`No se encontró un administrador para la bodega ${bodega === 'planta' ? 'Planta' : 'Almacén'}`);
      }

      // 3. Insert location with discovered_at_round if adding in later rounds
      const { data: newLocation, error: locError } = await supabase
        .from('locations')
        .insert({
          inventory_id: inventoryId!,
          master_reference: referencia,
          location_name: ubicacion,
          punto_referencia: puntoReferencia || null,
          assigned_supervisor_id: user!.id,
          assigned_admin_id: adminId,
          // Set discovered_at_round if adding location after round 1
          discovered_at_round: currentAuditRound > 1 ? currentAuditRound : null,
          activo: true,
          terminado: false,
        })
        .select('id')
        .single();

      if (locError) throw locError;

      // 4. Insert initial count if quantity provided (use current audit_round)
      const qty = parseFloat(cantidad);
      if (!isNaN(qty) && qty >= 0) {
        const { error: countError } = await supabase
          .from('inventory_counts')
          .upsert({
            location_id: newLocation.id,
            supervisor_id: user!.id,
            audit_round: currentAuditRound,
            quantity_counted: qty,
          }, { onConflict: 'location_id,audit_round' });

        if (countError) throw countError;
      }

      return { newLocation, currentAuditRound };
    },
    onSuccess: () => {
      toast.success('Item agregado correctamente');
      queryClient.invalidateQueries({ queryKey: ['supervisor-locations-transcription'] });
      queryClient.invalidateQueries({ queryKey: ['supervisor-counts'] });
      resetForm();
      onOpenChange(false);
    },
    onError: (error: Error) => {
      toast.error(`Error al agregar: ${friendlyCountError(error)}`);
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    addLocationMutation.mutate();
  };

  const isSubmitting = addLocationMutation.isPending;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Agregar Nuevo Item</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Bodega - defaults to Planta */}
          <div className="space-y-2">
            <Label>Bodega *</Label>
            <Select value={bodega} onValueChange={(v) => setBodega(v as 'planta' | 'almacen')}>
              <SelectTrigger>
                <SelectValue placeholder="Seleccione bodega" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="planta">Planta</SelectItem>
                <SelectItem value="almacen">Almacén</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Referencia - Combobox with search (validated against maestra) */}
          <div className="space-y-2">
            <Label>Referencia *</Label>
            <Popover open={comboboxOpen} onOpenChange={setComboboxOpen}>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  role="combobox"
                  aria-expanded={comboboxOpen}
                  className="w-full justify-between"
                >
                  {referencia || "Buscar referencia..."}
                  <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-full p-0 bg-popover" align="start">
                <Command>
                  <CommandInput placeholder="Buscar referencia..." />
                  <CommandList>
                    <CommandEmpty>
                      {loadingRefs ? 'Cargando...' : 'No se encontró la referencia en la maestra.'}
                    </CommandEmpty>
                    <CommandGroup className="max-h-60 overflow-y-auto">
                      {references.map((ref) => (
                        <CommandItem
                          key={ref.referencia}
                          value={ref.referencia}
                          onSelect={() => {
                            setReferencia(ref.referencia);
                            setComboboxOpen(false);
                          }}
                        >
                          <Check
                            className={cn(
                              "mr-2 h-4 w-4",
                              referencia === ref.referencia ? "opacity-100" : "opacity-0"
                            )}
                          />
                          {ref.referencia}
                        </CommandItem>
                      ))}
                    </CommandGroup>
                  </CommandList>
                </Command>
              </PopoverContent>
            </Popover>
          </div>

          {/* Ubicación */}
          <div className="space-y-2">
            <Label htmlFor="ubicacion">Ubicación *</Label>
            <Input
              id="ubicacion"
              value={ubicacion}
              onChange={(e) => setUbicacion(e.target.value.toUpperCase())}
              placeholder="Ej: BODEGA1, BODEGA2..."
              required
            />
            <p className="text-xs text-muted-foreground">
              Ingrese la bodega en mayúsculas seguida del número. Ejemplos: BODEGA1, BODEGA2, BODEGA3
            </p>
          </div>

          {/* Punto de Referencia */}
          <div className="space-y-2">
            <Label htmlFor="puntoReferencia">Punto de Referencia *</Label>
            <Input
              id="puntoReferencia"
              value={puntoReferencia}
              onChange={(e) => setPuntoReferencia(e.target.value.toUpperCase())}
              placeholder="Ej: AA, V, S..."
              required
            />
            <p className="text-xs text-muted-foreground">
              Ubicación exacta o punto exacto donde se encuentra el material. Ejemplos: AA, V, S
            </p>
          </div>

          {/* Cantidad */}
          <div className="space-y-2">
            <Label htmlFor="cantidad">Cantidad Encontrada</Label>
            <Input
              id="cantidad"
              type="number"
              min="0"
              step="0.01"
              value={cantidad}
              onChange={(e) => setCantidad(e.target.value)}
              placeholder="0"
            />
          </div>

          <DialogFooter className="gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={isSubmitting}
            >
              Cancelar
            </Button>
            <Button type="submit" disabled={isSubmitting || !referencia || !ubicacion || !puntoReferencia}>
              {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Guardar
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
};

export default AddLocationDialog;
