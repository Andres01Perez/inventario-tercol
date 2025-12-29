import React from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Loader2, ClipboardList, ClipboardCheck, Scale, Flag } from 'lucide-react';

interface RoundSelectorCardsProps {
  isAdminMode: boolean;
  controlFilter: 'all' | 'null' | 'not_null';
}

interface RoundStats {
  pending: number;
  assigned: number;
  counted: number;
  total: number;
}

const roundConfigs = [
  { 
    round: 1, 
    label: 'Conteo 1', 
    description: 'Primer turno de conteo',
    icon: ClipboardList,
    colorClass: 'bg-blue-500/10 border-blue-500/30 hover:bg-blue-500/20',
    badgeClass: 'bg-blue-500 text-white',
    iconColor: 'text-blue-500'
  },
  { 
    round: 2, 
    label: 'Conteo 2', 
    description: 'Segundo turno de conteo',
    icon: ClipboardCheck,
    colorClass: 'bg-purple-500/10 border-purple-500/30 hover:bg-purple-500/20',
    badgeClass: 'bg-purple-500 text-white',
    iconColor: 'text-purple-500'
  },
  { 
    round: 3, 
    label: 'Conteo 3', 
    description: 'Desempate',
    icon: Scale,
    colorClass: 'bg-amber-500/10 border-amber-500/30 hover:bg-amber-500/20',
    badgeClass: 'bg-amber-500 text-white',
    iconColor: 'text-amber-500'
  },
  { 
    round: 4, 
    label: 'Conteo 4', 
    description: 'Conteo final',
    icon: Flag,
    colorClass: 'bg-orange-500/10 border-orange-500/30 hover:bg-orange-500/20',
    badgeClass: 'bg-orange-500 text-white',
    iconColor: 'text-orange-500'
  },
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
          stats[round] = { pending: 0, assigned: 0, counted: 0, total: 0 };
          continue;
        }

        const locations = data || [];
        const pending = locations.filter(loc => !loc[operarioField]).length;
        const assigned = locations.filter(loc => loc[operarioField] && loc[statusField] !== 'contado').length;
        const counted = locations.filter(loc => loc[statusField] === 'contado').length;

        stats[round] = {
          pending,
          assigned,
          counted,
          total: locations.length
        };
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
      {roundConfigs.map(({ round, label, description, icon: Icon, colorClass, badgeClass, iconColor }) => {
        const stats = roundStats?.[round] || { pending: 0, assigned: 0, counted: 0, total: 0 };
        
        return (
          <Card 
            key={round}
            className={`cursor-pointer transition-all duration-300 hover:scale-[1.02] hover:shadow-lg border-2 ${colorClass}`}
            onClick={() => handleCardClick(round)}
          >
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <Badge className={badgeClass}>C{round}</Badge>
                <Icon className={`h-6 w-6 ${iconColor}`} />
              </div>
              <CardTitle className="text-xl">{label}</CardTitle>
              <CardDescription>{description}</CardDescription>
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
              <div className="mt-3 text-center">
                <p className="text-sm text-muted-foreground">
                  Total: <span className="font-semibold text-foreground">{stats.total}</span> ubicaciones
                </p>
              </div>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
};

export default RoundSelectorCards;
