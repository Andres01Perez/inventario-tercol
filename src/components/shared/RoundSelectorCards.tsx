import React from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Loader2 } from 'lucide-react';

interface RoundSelectorCardsProps {
  isAdminMode: boolean;
  controlFilter: 'all' | 'null' | 'not_null';
}

interface RoundStats {
  pending: number;
  assigned: number;
  counted: number;
}

const roundConfigs = [
  { round: 1, label: 'Conteo 1' },
  { round: 2, label: 'Conteo 2' },
  { round: 3, label: 'Conteo 3' },
  { round: 4, label: 'Conteo 4' },
];

const RoundSelectorCards: React.FC<RoundSelectorCardsProps> = ({ isAdminMode, controlFilter }) => {
  const navigate = useNavigate();
  const { user } = useAuth();

  const { data: roundStats, isLoading } = useQuery({
    queryKey: ['round-stats', user?.id, controlFilter],
    queryFn: async () => {
      const stats: Record<number, RoundStats> = {};
      
      for (let round = 1; round <= 4; round++) {
        const operarioField = `operario_c${round}_id`;
        const statusField = `status_c${round}`;
        
        let query = supabase
          .from('locations')
          .select(`
            id,
            ${operarioField},
            ${statusField},
            inventory_master!inner(control)
          `);

        // Apply control filter
        if (controlFilter === 'not_null') {
          query = query.not('inventory_master.control', 'is', null);
        } else if (controlFilter === 'null') {
          query = query.is('inventory_master.control', null);
        }

        // Apply supervisor filter if not admin
        if (!isAdminMode && user?.id) {
          query = query.eq('assigned_supervisor_id', user.id);
        }

        const { data, error } = await query;
        
        if (error) {
          console.error(`Error fetching stats for round ${round}:`, error);
          stats[round] = { pending: 0, assigned: 0, counted: 0 };
          continue;
        }

        const locations = data || [];
        const pending = locations.filter(loc => !loc[operarioField]).length;
        const assigned = locations.filter(loc => loc[operarioField] && loc[statusField] !== 'contado').length;
        const counted = locations.filter(loc => loc[statusField] === 'contado').length;

        stats[round] = { pending, assigned, counted };
      }
      
      return stats;
    },
    enabled: !!user?.id,
  });

  const handleCardClick = (round: number) => {
    navigate(`/gestion-operativa/conteo/${round}`);
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
      {roundConfigs.map(({ round, label }) => {
        const stats = roundStats?.[round] || { pending: 0, assigned: 0, counted: 0 };
        
        return (
          <Card 
            key={round}
            className="cursor-pointer transition-all duration-300 hover:scale-[1.02] hover:shadow-lg border bg-card"
            onClick={() => handleCardClick(round)}
          >
            <CardHeader className="pb-2">
              <CardTitle className="text-xl text-center">{label}</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-3 gap-2 text-center">
                <div className="p-2 rounded-lg bg-muted/50">
                  <p className="text-lg font-bold text-amber-600">{stats.pending}</p>
                  <p className="text-xs text-muted-foreground">Pendientes</p>
                </div>
                <div className="p-2 rounded-lg bg-muted/50">
                  <p className="text-lg font-bold text-blue-600">{stats.assigned}</p>
                  <p className="text-xs text-muted-foreground">Asignados</p>
                </div>
                <div className="p-2 rounded-lg bg-muted/50">
                  <p className="text-lg font-bold text-green-600">{stats.counted}</p>
                  <p className="text-xs text-muted-foreground">Contados</p>
                </div>
              </div>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
};

export default RoundSelectorCards;
