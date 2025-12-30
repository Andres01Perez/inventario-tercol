import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

interface Operario {
  id: string;
  full_name: string;
  turno: number | null;
}

export const useOperarios = (filterTurno?: number) => {
  return useQuery({
    queryKey: ['operarios', filterTurno ?? 'all'],
    queryFn: async () => {
      let query = supabase
        .from('operarios')
        .select('id, full_name, turno')
        .eq('is_active', true)
        .order('full_name', { ascending: true });

      if (filterTurno !== undefined) {
        query = query.in('turno', [filterTurno, 3]);
      }

      const { data, error } = await query;
      if (error) throw error;
      return data as Operario[];
    },
    staleTime: 5 * 60 * 1000,
    gcTime: 10 * 60 * 1000,
  });
};
