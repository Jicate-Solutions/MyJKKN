'use client';

import { Card, CardContent } from '@/components/ui/card';
import {
  Users,
  GraduationCap,
  AlertTriangle,
  AlertOctagon,
  Clock,
  BarChart3,
} from 'lucide-react';
import type { CASEDashboardStats } from '@/types/case';

interface StatsCardsProps {
  stats: CASEDashboardStats;
}

interface StatCardItem {
  label: string;
  value: number | string;
  icon: React.ReactNode;
  color: string;
}

export function StatsCards({ stats }: StatsCardsProps) {
  const cards: StatCardItem[] = [
    {
      label: 'Total Learners',
      value: stats.total_learners.toLocaleString(),
      icon: <Users className="h-5 w-5" />,
      color: 'text-blue-600 bg-blue-100 dark:bg-blue-950 dark:text-blue-400',
    },
    {
      label: 'Graduation Ready',
      value: stats.graduation_ready_count.toLocaleString(),
      icon: <GraduationCap className="h-5 w-5" />,
      color: 'text-green-600 bg-green-100 dark:bg-green-950 dark:text-green-400',
    },
    {
      label: 'At Risk',
      value: stats.at_risk_count.toLocaleString(),
      icon: <AlertTriangle className="h-5 w-5" />,
      color: 'text-yellow-600 bg-yellow-100 dark:bg-yellow-950 dark:text-yellow-400',
    },
    {
      label: 'Critical',
      value: stats.critical_count.toLocaleString(),
      icon: <AlertOctagon className="h-5 w-5" />,
      color: 'text-red-600 bg-red-100 dark:bg-red-950 dark:text-red-400',
    },
    {
      label: 'Overdue',
      value: stats.overdue_count.toLocaleString(),
      icon: <Clock className="h-5 w-5" />,
      color: 'text-orange-600 bg-orange-100 dark:bg-orange-950 dark:text-orange-400',
    },
    {
      label: 'Avg Tracks Completed',
      value: stats.avg_tracks_completed.toFixed(1),
      icon: <BarChart3 className="h-5 w-5" />,
      color: 'text-violet-600 bg-violet-100 dark:bg-violet-950 dark:text-violet-400',
    },
  ];

  return (
    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
      {cards.map((card) => (
        <Card key={card.label}>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className={`rounded-lg p-2.5 ${card.color}`}>
                {card.icon}
              </div>
              <div>
                <p className="text-2xl font-bold">{card.value}</p>
                <p className="text-xs text-muted-foreground">{card.label}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
