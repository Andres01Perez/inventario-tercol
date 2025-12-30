import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

interface Supervisor {
  id: string;
  full_name: string | null;
  email: string | null;
}

export const useSupervisors = () => {
  return useQuery({
    queryKey: ['supervisors'],
    queryFn: async () => {
      // Get all users with supervisor role
      const { data: roles, error: rolesError } = await supabase
        .from('user_roles')
        .select('user_id')
        .eq('role', 'supervisor');

      if (rolesError) throw rolesError;
      if (!roles || roles.length === 0) return [];

      const userIds = roles.map(r => r.user_id);

      // Get profiles for these users
      const { data: profiles, error: profilesError } = await supabase
        .from('profiles')
        .select('id, full_name, email')
        .in('id', userIds);

      if (profilesError) throw profilesError;
      return (profiles || []) as Supervisor[];
    },
    staleTime: 5 * 60 * 1000, // 5 minutes
    gcTime: 10 * 60 * 1000,   // 10 minutes
  });
};
