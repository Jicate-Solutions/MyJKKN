'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

interface KpiCard {
  label: string;
  value: number;
  active: boolean;
  onClick: () => void;
}

interface TransferKpiCardsProps {
  cards: KpiCard[];
}

export function TransferKpiCards({ cards }: TransferKpiCardsProps) {
  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
      {cards.map((card) => (
        <button key={card.label} onClick={card.onClick} className="text-left w-full">
          <Card className={card.active ? 'ring-2 ring-primary' : 'hover:shadow-md transition-shadow'}>
            <CardHeader className="pb-1 pt-4 px-4">
              <CardTitle className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                {card.label}
              </CardTitle>
            </CardHeader>
            <CardContent className="px-4 pb-4">
              <div className="text-2xl font-bold">{card.value}</div>
            </CardContent>
          </Card>
        </button>
      ))}
    </div>
  );
}
