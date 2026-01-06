import React, { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
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
import { Textarea } from '@/components/ui/textarea';
import { toast } from 'sonner';
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
  // Removed tipo state - all references are now shown
  const [referencia, setReferencia] = useState('');
  const [subcategoria, setSubcategoria] = useState('');
  const [observaciones, setObservaciones] = useState('');
  const [ubicacion, setUbicacion] = useState('');
  const [ubicacionDetallada, setUbicacionDetallada] = useState('');
  const [puntoReferencia, setPuntoReferencia] = useState('');
  const [metodoConteo, setMetodoConteo] = useState('');
  const [cantidad, setCantidad] = useState('');
  
  // Combobox state
  const [comboboxOpen, setComboboxOpen] = useState(false);

  // Fetch ALL references (no filter by type)
  const { data: references = [], isLoading: loadingRefs } = useQuery({
    queryKey: ['all-inventory-references'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('inventory_master')
        .select('referencia, material_type')
        .order('referencia')
        .limit(10000);
      
      if (error) throw error;
      return data;
    },
    enabled: open,
  });

  const resetForm = () => {
    setReferencia('');
    setSubcategoria('');
    setObservaciones('');
    setUbicacion('');
    setUbicacionDetallada('');
    setPuntoReferencia('');
    setMetodoConteo('');
    setCantidad('');
  };

  const addLocationMutation = useMutation({
    mutationFn: async () => {
      if (!referencia || !ubicacion || !puntoReferencia) {
        throw new Error('Referencia, ubicación y punto de referencia son requeridos');
      }

      // 1. Get current audit_round from inventory_master
      const { data: master, error: masterError } = await supabase
        .from('inventory_master')
        .select('audit_round')
        .eq('referencia', referencia)
        .single();

      if (masterError) throw masterError;

      const currentAuditRound = master?.audit_round || 1;
      
      // 2. Insert location with discovered_at_round if adding in later rounds
      const { data: newLocation, error: locError } = await supabase
        .from('locations')
        .insert({
          master_reference: referencia,
          location_name: ubicacion,
          location_detail: ubicacionDetallada || null,
          subcategoria: subcategoria || null,
          observaciones: observaciones || null,
          punto_referencia: puntoReferencia || null,
          metodo_conteo: metodoConteo || null,
          assigned_supervisor_id: user!.id,
          // Set discovered_at_round if adding location after round 1
          discovered_at_round: currentAuditRound > 1 ? currentAuditRound : null,
        })
        .select('id')
        .single();

      if (locError) throw locError;

      // 3. Insert initial count if quantity provided (use current audit_round)
      const qty = parseFloat(cantidad);
      if (!isNaN(qty) && qty >= 0) {
        const { error: countError } = await supabase
          .from('inventory_counts')
          .insert({
            location_id: newLocation.id,
            supervisor_id: user!.id,
            audit_round: currentAuditRound <= 2 ? currentAuditRound : currentAuditRound,
            quantity_counted: qty,
          });

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
      toast.error(`Error al agregar: ${error.message}`);
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
          {/* Referencia - Combobox with search */}
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
                      {loadingRefs ? 'Cargando...' : 'No se encontró la referencia.'}
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

          {/* Subcategoría */}
          <div className="space-y-2">
            <Label htmlFor="subcategoria">Subcategoría</Label>
            <Input
              id="subcategoria"
              value={subcategoria}
              onChange={(e) => setSubcategoria(e.target.value)}
              placeholder="Subcategoría opcional"
            />
          </div>

          {/* Observaciones */}
          <div className="space-y-2">
            <Label htmlFor="observaciones">Observaciones</Label>
            <Textarea
              id="observaciones"
              value={observaciones}
              onChange={(e) => setObservaciones(e.target.value)}
              placeholder="Observaciones opcionales"
              rows={2}
            />
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

          {/* Ubicación Detallada */}
          <div className="space-y-2">
            <Label htmlFor="ubicacionDetallada">Ubicación Detallada</Label>
            <Input
              id="ubicacionDetallada"
              value={ubicacionDetallada}
              onChange={(e) => setUbicacionDetallada(e.target.value)}
              placeholder="Detalle de ubicación"
            />
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

          {/* Método de Conteo */}
          <div className="space-y-2">
            <Label htmlFor="metodoConteo">Método de Conteo</Label>
            <Input
              id="metodoConteo"
              value={metodoConteo}
              onChange={(e) => setMetodoConteo(e.target.value)}
              placeholder="Método de conteo"
            />
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
