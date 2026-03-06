'use client';

import { Users, BookOpen, TrendingUp, Building2 } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import type { FacilitatorReportSummary } from '@/types/attendance';

interface Props {
  summary: FacilitatorReportSummary;
  departmentCount: number;
}

export function FacilitatorSummaryCards({ summary, departmentCount }: Props) {
  const cards = [
    {
      title: 'Total Facilitators',
      value: summary.totalFacilitators,
      icon: Users,
      color: 'text-blue-600',
      bg: 'bg-blue-50 dark:bg-blue-950',
    },
    {
      title: 'Periods Marked',
      value: summary.totalPeriodsMarked,
      icon: BookOpen,
      color: 'text-green-600',
      bg: 'bg-green-50 dark:bg-green-950',
    },
    {
      title: 'Avg Periods / Facilitator',
      value: summary.avgPeriodsPerFacilitator,
      icon: TrendingUp,
      color: 'text-purple-600',
      bg: 'bg-purple-50 dark:bg-purple-950',
    },
    {
      title: 'Departments Active',
      value: departmentCount,
      icon: Building2,
      color: 'text-orange-600',
      bg: 'bg-orange-50 dark:bg-orange-950',
    },
  ];

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
      {cards.map((card) => (
        <Card key={card.title}>
          <CardContent className="flex items-center gap-4 p-6">
            <div className={`rounded-full p-3 ${card.bg}`}>
              <card.icon className={`h-5 w-5 ${card.color}`} />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">{card.title}</p>
              <p className="text-2xl font-bold">{card.value}</p>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
