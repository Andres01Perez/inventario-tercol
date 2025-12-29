import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import AppLayout from '@/components/layout/AppLayout';
import CriticalReferenceCard from '@/components/superadmin/CriticalReferenceCard';
import { AlertTriangle, CheckCircle2, Loader2 } from 'lucide-react';

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

interface CountSummary {
  c1: number;
  c2: number;
  c3: number;
  c4: number;
}

interface CriticalReference {
  referencia: string;
  material_type: string;
  control: string | null;
  cant_total_erp: number | null;
  count_history: CountHistoryEntry[] | null;
  locations: Location[];
  count_summary?: CountSummary;
}

const Criticos: React.FC = () => {
  // Fetch critical references (audit_round = 5)
  const { data: criticalReferences = [], isLoading, refetch } = useQuery({
    queryKey: ['critical-references'],
    queryFn: async () => {
      // Get all inventory_master with audit_round = 5
      const { data: masters, error: mastersError } = await supabase
        .from('inventory_master')
        .select('referencia, material_type, control, cant_total_erp, count_history')
        .eq('audit_round', 5);

      if (mastersError) throw mastersError;
      if (!masters || masters.length === 0) return [];

      // For each master, get its locations and count history from inventory_counts
      const referencesWithLocations: CriticalReference[] = await Promise.all(
        masters.map(async (master) => {
          const { data: locations } = await supabase
            .from('locations')
            .select(`
              id, master_reference, location_name, location_detail,
              subcategoria, observaciones, punto_referencia, metodo_conteo
            `)
            .eq('master_reference', master.referencia);

          // Filter out locations that already have C5 count
          const locationIds = locations?.map(l => l.id) || [];
          
          let filteredLocations = locations || [];
          
          if (locationIds.length > 0) {
            const { data: existingCounts } = await supabase
              .from('inventory_counts')
              .select('location_id')
              .in('location_id', locationIds)
              .eq('audit_round', 5);

            const countedLocationIds = new Set(existingCounts?.map(c => c.location_id) || []);
            filteredLocations = (locations || []).filter(loc => !countedLocationIds.has(loc.id));
          }

          // Get actual count sums from inventory_counts for C1-C4
          const allLocationIds = locations?.map(l => l.id) || [];
          let countSummary = { c1: 0, c2: 0, c3: 0, c4: 0 };
          
          if (allLocationIds.length > 0) {
            const { data: allCounts } = await supabase
              .from('inventory_counts')
              .select('audit_round, quantity_counted')
              .in('location_id', allLocationIds)
              .in('audit_round', [1, 2, 3, 4]);

            if (allCounts) {
              countSummary.c1 = allCounts.filter(c => c.audit_round === 1).reduce((sum, c) => sum + Number(c.quantity_counted), 0);
              countSummary.c2 = allCounts.filter(c => c.audit_round === 2).reduce((sum, c) => sum + Number(c.quantity_counted), 0);
              countSummary.c3 = allCounts.filter(c => c.audit_round === 3).reduce((sum, c) => sum + Number(c.quantity_counted), 0);
              countSummary.c4 = allCounts.filter(c => c.audit_round === 4).reduce((sum, c) => sum + Number(c.quantity_counted), 0);
            }
          }

          // Parse count_history safely
          let parsedHistory: CountHistoryEntry[] | null = null;
          if (master.count_history) {
            if (Array.isArray(master.count_history)) {
              parsedHistory = master.count_history as unknown as CountHistoryEntry[];
            }
          }

          return {
            referencia: master.referencia,
            material_type: master.material_type,
            control: master.control,
            cant_total_erp: master.cant_total_erp,
            count_history: parsedHistory,
            locations: filteredLocations,
            count_summary: countSummary,
          };
        })
      );

      // Only return references that still have pending locations
      return referencesWithLocations.filter(ref => ref.locations.length > 0);
    },
  });

  const handleReferenceClosed = () => {
    refetch();
  };

  return (
    <AppLayout
      title="Referencias Críticas"
      subtitle="Conteo 5 - Cierre Forzado"
      showBackButton={true}
      backPath="/dashboard"
    >
      <div className="space-y-6">
        <div>
          <h2 className="text-xl font-semibold text-foreground flex items-center gap-2">
            <AlertTriangle className="w-6 h-6 text-red-500" />
            Referencias Críticas (Conteo 5)
          </h2>
          <p className="text-muted-foreground">
            Estas referencias no coincidieron en ningún conteo previo y requieren tu intervención personal para el cierre forzado.
          </p>
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="w-8 h-8 animate-spin text-primary" />
          </div>
        ) : criticalReferences.length === 0 ? (
          <div className="text-center py-12 bg-card border rounded-lg">
            <CheckCircle2 className="w-12 h-12 text-green-500 mx-auto mb-4" />
            <p className="text-lg font-medium text-foreground">¡Todo en orden!</p>
            <p className="text-muted-foreground">
              No hay referencias críticas pendientes de cierre forzado.
            </p>
          </div>
        ) : (
          <div className="space-y-6">
            {criticalReferences.map(reference => (
              <CriticalReferenceCard
                key={reference.referencia}
                reference={reference}
                onClosed={handleReferenceClosed}
              />
            ))}
          </div>
        )}
      </div>
    </AppLayout>
  );
};

export default Criticos;
