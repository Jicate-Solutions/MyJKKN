'use client';

import { Users, BookOpen, TrendingUp, Building2, Calendar, Clock } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import type { FacilitatorReportSummary } from '@/types/attendance';

interface Props {
  summary: FacilitatorReportSummary;
  departmentCount: number;
}

export function FacilitatorSummaryCards({ summary, departmentCount }: Props) {
  const rate = Number(summary.overallMarkingRate ?? 0);

  const rateColor =
    rate >= 80 ? 'text-green-600' :
    rate >= 50 ? 'text-yellow-600' :
    'text-red-600';

  const rateBg =
    rate >= 80 ? 'bg-green-50 dark:bg-green-950' :
    rate >= 50 ? 'bg-yellow-50 dark:bg-yellow-950' :
    'bg-red-50 dark:bg-red-950';

  const cards = [
    {
      label: 'Facilitators',
      value: summary.totalFacilitators,
      icon: Users,
      iconColor: 'text-blue-600',
      bg: 'bg-blue-50 dark:bg-blue-950',
      valueClass: '',
    },
    {
      label: 'Departments',
      value: departmentCount,
      icon: Building2,
      iconColor: 'text-orange-600',
      bg: 'bg-orange-50 dark:bg-orange-950',
      valueClass: '',
    },
    {
      label: 'Assigned',
      value: summary.totalPeriodsAssigned,
      icon: Calendar,
      iconColor: 'text-indigo-600',
      bg: 'bg-indigo-50 dark:bg-indigo-950',
      valueClass: '',
    },
    {
      label: 'Marked',
      value: summary.totalPeriodsMarked,
      icon: BookOpen,
      iconColor: 'text-green-600',
      bg: 'bg-green-50 dark:bg-green-950',
      valueClass: '',
    },
    {
      label: 'Pending',
      value: summary.totalPeriodsPending,
      icon: Clock,
      iconColor: 'text-red-500',
      bg: 'bg-red-50 dark:bg-red-950',
      valueClass: summary.totalPeriodsPending > 0 ? 'text-red-500' : '',
    },
    {
      label: 'Marking Rate',
      value: `${rate.toFixed(1)}%`,
      icon: TrendingUp,
      iconColor: rateColor,
      bg: rateBg,
      valueClass: rateColor,
    },
  ];

  return (
    <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3">
      {cards.map((card) => (
        <Card key={card.label}>
          <CardContent className="flex items-center gap-3 p-4">
            <div className={`rounded-full p-2 shrink-0 ${card.bg}`}>
              <card.icon className={`h-4 w-4 ${card.iconColor}`} />
            </div>
            <div className="min-w-0">
              <p className="text-xs text-muted-foreground truncate">{card.label}</p>
              <p className={`text-xl font-bold leading-tight ${card.valueClass}`}>
                {card.value}
              </p>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
