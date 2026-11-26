import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
export function useAjustesVigentes(inventoryId: string | null, enabled = true) {
  return useQuery({ queryKey: ['ajustes-vigentes', inventoryId], enabled: enabled && !!inventoryId, refetchInterval: 30000,
    queryFn: async () => {
      if (!inventoryId) return [];
      const all = [];
      for (let offset = 0; ; offset += 1000) {
        const { data, error } = await supabase.rpc('ajustes_cierre_vigentes', { _inventory_id: inventoryId }).range(offset, offset + 999);
        if (error) throw error;
        all.push(...(data ?? []));
        if ((data?.length ?? 0) < 1000) return all;
      }
    }
  });
}