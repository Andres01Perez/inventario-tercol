import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@/contexts/AuthContext';
import { useInventory } from '@/contexts/InventoryContext';
import { supabase } from '@/integrations/supabase/client';
import AppLayout from '@/components/layout/AppLayout';
import RoundSelectorCards from '@/components/shared/RoundSelectorCards';

const GestionOperativa: React.FC = () => {
  const { role, user } = useAuth();
  const { inventoryId } = useInventory();

  const isSupervisor = role === 'supervisor';

  const subtitle = React.useMemo(() => {
    switch (role) {
      case 'admin_mp':
        return 'Materia Prima';
      case 'admin_pp':
        return 'Producto en Proceso';
      case 'superadmin':
        return 'Todas las referencias';
      default:
        return 'Tus ubicaciones asignadas';
    }
  }, [role]);

  // ¿El supervisor tiene pisos de PT asignados?
  const { data: ptFloors = 0 } = useQuery({
    queryKey: ['pt-floors-count', user?.id, inventoryId, isSupervisor],
    enabled: !!user?.id && !!inventoryId,
    queryFn: async () => {
      let query = supabase
        .from('pt_floor_assignments')
        .select('id', { count: 'exact', head: true })
        .eq('inventory_id', inventoryId!);
      if (isSupervisor) query = query.eq('supervisor_id', user!.id);
      const { count, error } = await query;
      if (error) throw error;
      return count ?? 0;
    },
  });

  // ¿El supervisor tiene ubicaciones MP/PP asignadas?
  const { data: mpppLocations = 0 } = useQuery({
    queryKey: ['mppp-locations-count', user?.id, inventoryId, isSupervisor],
    enabled: !!user?.id && !!inventoryId && isSupervisor,
    queryFn: async () => {
      const { count, error } = await supabase
        .from('locations')
        .select('id', { count: 'exact', head: true })
        .eq('inventory_id', inventoryId!)
        .eq('assigned_supervisor_id', user!.id);
      if (error) throw error;
      return count ?? 0;
    },
  });

  const showPt = ptFloors > 0;
  const showMpPp = !isSupervisor || mpppLocations > 0 || !showPt;

  return (
    <AppLayout
      title="Gestión Operativa"
      subtitle={subtitle}
      showBackButton={true}
      backPath="/dashboard"
    >
      <div className="space-y-8">
        {showMpPp && (
          <section className="space-y-4">
            <div>
              <h2 className="text-xl font-semibold text-foreground">Almacén / Planta (MP y PP)</h2>
              <p className="text-muted-foreground">
                {isSupervisor
                  ? 'Transcribe los conteos para tus ubicaciones asignadas'
                  : 'Gestiona y transcribe conteos de inventario'}
              </p>
            </div>
            <RoundSelectorCards />
          </section>
        )}

        {showPt && (
          <section className="space-y-4">
            <div>
              <h2 className="text-xl font-semibold text-foreground">Producto Terminado (PT)</h2>
              <p className="text-muted-foreground">
                {isSupervisor
                  ? 'Transcribe los conteos de los pisos que tienes asignados'
                  : 'Gestiona y transcribe conteos de producto terminado'}
              </p>
            </div>
            <RoundSelectorCards basePath="/gestion-operativa/pt/conteo" />
          </section>
        )}
      </div>
    </AppLayout>
  );
};

export default GestionOperativa;
