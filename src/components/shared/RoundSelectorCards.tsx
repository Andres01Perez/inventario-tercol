import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Card } from '@/components/ui/card';

const roundConfigs = [
  { round: 1, label: 'Conteo 1' },
  { round: 2, label: 'Conteo 2' },
  { round: 3, label: 'Conteo 3' },
  { round: 4, label: 'Conteo 4' },
];

const RoundSelectorCards: React.FC = () => {
  const navigate = useNavigate();

  const handleCardClick = (round: number) => {
    navigate(`/gestion-operativa/conteo/${round}`);
  };

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
      {roundConfigs.map(({ round, label }) => (
        <Card 
          key={round}
          className="cursor-pointer transition-all duration-300 hover:scale-[1.02] hover:shadow-lg border bg-card p-8"
          onClick={() => handleCardClick(round)}
        >
          <h3 className="text-2xl font-semibold text-center text-foreground">{label}</h3>
        </Card>
      ))}
    </div>
  );
};

export default RoundSelectorCards;
