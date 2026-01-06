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
  // OPTIMIZED: Fetch critical references with batch queries (eliminates N+1)
  const { data: criticalReferences = [], isLoading, refetch } = useQuery({
    queryKey: ['critical-references'],
    queryFn: async () => {
      // 1. Get all inventory_master with audit_round = 5
      const { data: masters, error: mastersError } = await supabase
        .from('inventory_master')
        .select('referencia, material_type, control, cant_total_erp, count_history')
        .eq('audit_round', 5);

      if (mastersError) throw mastersError;
      if (!masters || masters.length === 0) return [];

      const references = masters.map(m => m.referencia);

      // 2. Batch fetch ALL locations for all critical references
      const { data: allLocations } = await supabase
        .from('locations')
        .select(`
          id, master_reference, location_name, location_detail,
          subcategoria, observaciones, punto_referencia, metodo_conteo
        `)
        .in('master_reference', references);

      if (!allLocations || allLocations.length === 0) return [];

      const allLocationIds = allLocations.map(l => l.id);

      // 3. Batch fetch ALL counts for C1-C5 in one query
      const { data: allCounts } = await supabase
        .from('inventory_counts')
        .select('location_id, audit_round, quantity_counted')
        .in('location_id', allLocationIds)
        .in('audit_round', [1, 2, 3, 4, 5]);

      // 4. Build lookup maps for efficient grouping
      const locationsByRef = new Map<string, Location[]>();
      allLocations.forEach(loc => {
        const list = locationsByRef.get(loc.master_reference) || [];
        list.push(loc);
        locationsByRef.set(loc.master_reference, list);
      });

      const countsByLocationId = new Map<string, { round: number; qty: number }[]>();
      allCounts?.forEach(count => {
        const list = countsByLocationId.get(count.location_id) || [];
        list.push({ round: count.audit_round, qty: Number(count.quantity_counted) });
        countsByLocationId.set(count.location_id, list);
      });

      // 5. Build result using in-memory grouping (no more N+1 queries)
      const referencesWithLocations: CriticalReference[] = masters.map(master => {
        const locations = locationsByRef.get(master.referencia) || [];
        
        // Filter out locations that already have C5 count
        const c5CountedLocationIds = new Set<string>();
        locations.forEach(loc => {
          const counts = countsByLocationId.get(loc.id) || [];
          if (counts.some(c => c.round === 5)) {
            c5CountedLocationIds.add(loc.id);
          }
        });
        const filteredLocations = locations.filter(loc => !c5CountedLocationIds.has(loc.id));

        // Calculate count summary from in-memory data
        const countSummary = { c1: 0, c2: 0, c3: 0, c4: 0 };
        locations.forEach(loc => {
          const counts = countsByLocationId.get(loc.id) || [];
          counts.forEach(c => {
            if (c.round === 1) countSummary.c1 += c.qty;
            else if (c.round === 2) countSummary.c2 += c.qty;
            else if (c.round === 3) countSummary.c3 += c.qty;
            else if (c.round === 4) countSummary.c4 += c.qty;
          });
        });

        // Parse count_history safely
        let parsedHistory: CountHistoryEntry[] | null = null;
        if (master.count_history && Array.isArray(master.count_history)) {
          parsedHistory = master.count_history as unknown as CountHistoryEntry[];
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
      });

      // Only return references that still have pending locations
      return referencesWithLocations.filter(ref => ref.locations.length > 0);
    },
    staleTime: 30 * 1000, // 30 seconds - counts change frequently
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
