import React, { useState, useMemo } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import { 
  Loader2, 
  AlertTriangle, 
  Save, 
  CheckCircle2,
  Package,
  History
} from 'lucide-react';

interface Location {
  id: string;
  master_reference: string;
  location_name: string | null;
  location_detail: string | null;
  subcategoria: string | null;
  observaciones: string | null;
  punto_referencia: string | null;
  metodo_conteo: string | null;
}

interface CountHistoryEntry {
  round: number;
  sum_c1?: number;
  sum_c2?: number;
  sum?: number;
}

interface CriticalReference {
  referencia: string;
  material_type: string;
  control: string | null;
  cant_total_erp: number | null;
  count_history: CountHistoryEntry[] | null;
  locations: Location[];
}

interface CriticalReferenceCardProps {
  reference: CriticalReference;
  onClosed?: () => void;
}

const CriticalReferenceCard: React.FC<CriticalReferenceCardProps> = ({ reference, onClosed }) => {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [quantities, setQuantities] = useState<Record<string, string>>({});
  const [isSaving, setIsSaving] = useState(false);

  // Calculate the sum of C5 counts
  const totalC5 = useMemo(() => {
    return Object.values(quantities).reduce((sum, val) => {
      const num = parseFloat(val);
      return sum + (isNaN(num) ? 0 : num);
    }, 0);
  }, [quantities]);

  // Check if all locations have a quantity
  const allLocationsHaveQuantity = useMemo(() => {
    return reference.locations.every(loc => {
      const val = quantities[loc.id];
      return val !== undefined && val !== '' && !isNaN(parseFloat(val));
    });
  }, [quantities, reference.locations]);

  // Extract count history
  const countHistory = useMemo(() => {
    const history = reference.count_history || [];
    let c1 = 0, c2 = 0, c3 = 0, c4 = 0;

    history.forEach(entry => {
      if (entry.round === 1) {
        c1 = entry.sum_c1 || 0;
        c2 = entry.sum_c2 || 0;
      } else if (entry.round === 3) {
        c3 = entry.sum || 0;
      } else if (entry.round === 4) {
        c4 = entry.sum || 0;
      }
    });

    return { c1, c2, c3, c4 };
  }, [reference.count_history]);

  const saveAndCloseMutation = useMutation({
    mutationFn: async () => {
      // 1. Insert all C5 counts
      const countsToInsert = reference.locations.map(loc => ({
        location_id: loc.id,
        supervisor_id: user!.id,
        audit_round: 5,
        quantity_counted: parseFloat(quantities[loc.id]),
        operario_id: null,
      }));

      const { error: insertError } = await supabase
        .from('inventory_counts')
        .insert(countsToInsert);

      if (insertError) throw insertError;

      // 2. Call validate_and_close_round for forced closure
      const { data: result, error: rpcError } = await supabase.rpc('validate_and_close_round', {
        _reference: reference.referencia,
        _admin_id: user!.id,
      });

      if (rpcError) throw rpcError;

      return result;
    },
    onSuccess: (result) => {
      const validationResult = result as { success?: boolean; action?: string } | null;
      
      if (validationResult?.action === 'forced_close_superadmin') {
        toast.success(`✅ ${reference.referencia} - CERRADO FORZADO exitosamente`);
      } else {
        toast.success(`✅ ${reference.referencia} - Procesado correctamente`);
      }

      // Invalidate queries to refresh data
      queryClient.invalidateQueries({ queryKey: ['critical-references'] });
      queryClient.invalidateQueries({ queryKey: ['validation-references'] });
      
      onClosed?.();
    },
    onError: (error: Error) => {
      toast.error(`Error al guardar: ${error.message}`);
      setIsSaving(false);
    },
  });

  const handleSaveAndClose = () => {
    if (!allLocationsHaveQuantity) {
      toast.error('Ingrese cantidad para todas las ubicaciones');
      return;
    }

    setIsSaving(true);
    saveAndCloseMutation.mutate();
  };

  const erp = reference.cant_total_erp || 0;

  return (
    <Card className="border-red-500/30 bg-red-500/5">
      <CardHeader className="pb-4">
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-red-500/20 rounded-lg">
              <AlertTriangle className="w-6 h-6 text-red-500" />
            </div>
            <div>
              <CardTitle className="text-lg font-bold flex items-center gap-2">
                {reference.referencia}
                <Badge variant="outline" className="text-xs">
                  {reference.material_type}
                </Badge>
              </CardTitle>
              <p className="text-sm text-muted-foreground">
                {reference.control ? `Control: ${reference.control}` : 'Sin Control'}
              </p>
            </div>
          </div>
          <div className="text-right">
            <div className="flex items-center gap-2 text-lg font-bold">
              <Package className="w-5 h-5 text-muted-foreground" />
              <span>ERP: {erp.toLocaleString()}</span>
            </div>
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-6">
        {/* Count History */}
        <div className="bg-card border rounded-lg p-4">
          <div className="flex items-center gap-2 mb-3">
            <History className="w-4 h-4 text-muted-foreground" />
            <span className="font-medium text-sm">Historial de Conteos</span>
          </div>
          <div className="grid grid-cols-4 gap-3">
            <div className="text-center p-3 bg-blue-500/10 rounded-lg border border-blue-500/30">
              <div className="text-xs text-muted-foreground mb-1">C1</div>
              <div className="font-bold text-blue-600 dark:text-blue-400">{countHistory.c1.toLocaleString()}</div>
            </div>
            <div className="text-center p-3 bg-purple-500/10 rounded-lg border border-purple-500/30">
              <div className="text-xs text-muted-foreground mb-1">C2</div>
              <div className="font-bold text-purple-600 dark:text-purple-400">{countHistory.c2.toLocaleString()}</div>
            </div>
            <div className="text-center p-3 bg-amber-500/10 rounded-lg border border-amber-500/30">
              <div className="text-xs text-muted-foreground mb-1">C3</div>
              <div className="font-bold text-amber-600 dark:text-amber-400">{countHistory.c3.toLocaleString()}</div>
            </div>
            <div className="text-center p-3 bg-orange-500/10 rounded-lg border border-orange-500/30">
              <div className="text-xs text-muted-foreground mb-1">C4</div>
              <div className="font-bold text-orange-600 dark:text-orange-400">{countHistory.c4.toLocaleString()}</div>
            </div>
          </div>
        </div>

        {/* Locations Table */}
        <div>
          <h4 className="font-medium mb-3 flex items-center gap-2">
            <span>Ubicaciones para Conteo Final (C5)</span>
            <Badge variant="secondary">{reference.locations.length} ubicaciones</Badge>
          </h4>
          <div className="overflow-x-auto border rounded-lg">
            <table className="w-full text-sm">
              <thead className="bg-muted/50">
                <tr className="border-b">
                  <th className="p-3 text-left font-medium">Ubicación</th>
                  <th className="p-3 text-left font-medium">Detalle</th>
                  <th className="p-3 text-left font-medium">Subcategoría</th>
                  <th className="p-3 text-left font-medium">Método Conteo</th>
                  <th className="p-3 text-left font-medium">P. Referencia</th>
                  <th className="p-3 text-center font-medium">Cantidad C5</th>
                </tr>
              </thead>
              <tbody>
                {reference.locations.map(loc => (
                  <tr key={loc.id} className="border-b hover:bg-muted/30">
                    <td className="p-3 font-medium">{loc.location_name || '-'}</td>
                    <td className="p-3 text-muted-foreground">{loc.location_detail || '-'}</td>
                    <td className="p-3">{loc.subcategoria || '-'}</td>
                    <td className="p-3">{loc.metodo_conteo || '-'}</td>
                    <td className="p-3 text-muted-foreground">{loc.punto_referencia || '-'}</td>
                    <td className="p-3">
                      <Input
                        type="number"
                        min="0"
                        step="0.01"
                        placeholder="0"
                        className="w-28 text-center font-bold h-9 mx-auto"
                        value={quantities[loc.id] || ''}
                        onChange={(e) => setQuantities(prev => ({
                          ...prev,
                          [loc.id]: e.target.value
                        }))}
                        disabled={isSaving}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Total and Save Button */}
        <div className="flex items-center justify-between bg-card border rounded-lg p-4">
          <div className="flex items-center gap-4">
            <div className="text-center">
              <div className="text-xs text-muted-foreground mb-1">Suma Total C5</div>
              <div className={`text-2xl font-bold ${totalC5 === erp ? 'text-green-500' : 'text-foreground'}`}>
                {totalC5.toLocaleString()}
              </div>
            </div>
            {totalC5 === erp && (
              <div className="flex items-center gap-1 text-green-500">
                <CheckCircle2 className="w-4 h-4" />
                <span className="text-sm">Coincide con ERP</span>
              </div>
            )}
          </div>
          
          <Button
            size="lg"
            onClick={handleSaveAndClose}
            disabled={isSaving || !allLocationsHaveQuantity}
            className="gap-2"
          >
            {isSaving ? (
              <>
                <Loader2 className="w-5 h-5 animate-spin" />
                Guardando...
              </>
            ) : (
              <>
                <Save className="w-5 h-5" />
                Guardar y Cerrar Referencia
              </>
            )}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
};

export default CriticalReferenceCard;
