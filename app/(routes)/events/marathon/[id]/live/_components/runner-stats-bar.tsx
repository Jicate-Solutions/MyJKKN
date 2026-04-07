'use client';

import { Card, CardContent } from '@/components/ui/card';
import { Users, MapPin, Flag, Timer } from 'lucide-react';

interface RunnerStatsBarProps {
  totalTracking: number;
  onCourse: number;
  finished: number;
  avgPace: number;
}

function formatPace(paceSeconds: number): string {
  if (!paceSeconds || paceSeconds <= 0) return '--:--';
  const minutes = Math.floor(paceSeconds / 60);
  const seconds = Math.round(paceSeconds % 60);
  return `${minutes}:${String(seconds).padStart(2, '0')}`;
}

export function RunnerStatsBar({
  totalTracking,
  onCourse,
  finished,
  avgPace,
}: RunnerStatsBarProps) {
  const cards = [
    {
      label: 'Currently Tracking',
      value: totalTracking,
      icon: Users,
      color: 'text-blue-600',
    },
    {
      label: 'On Course',
      value: onCourse,
      icon: MapPin,
      color: 'text-green-600',
    },
    {
      label: 'Finished',
      value: finished,
      icon: Flag,
      color: 'text-purple-600',
    },
    {
      label: 'Avg Pace',
      value: `${formatPace(avgPace)} /km`,
      icon: Timer,
      color: 'text-orange-600',
    },
  ];

  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
      {cards.map((c) => (
        <Card key={c.label}>
          <CardContent className="pt-4 pb-3">
            <div className="flex items-center gap-2 text-muted-foreground text-xs mb-1">
              <c.icon className={`h-3.5 w-3.5 ${c.color}`} />
              {c.label}
            </div>
            <div className="text-2xl font-bold">{c.value}</div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
