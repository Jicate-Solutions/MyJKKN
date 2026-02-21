'use client';

import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Users, IndianRupee, Trophy, AlertTriangle, RefreshCcw } from 'lucide-react';
import { useProspectStats } from '@/hooks/solutions/use-prospects';

function formatCurrency(amount: number): string {
  if (amount >= 10000000) {
    return `${(amount / 10000000).toFixed(1)}Cr`;
  }
  if (amount >= 100000) {
    return `${(amount / 100000).toFixed(1)}L`;
  }
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 0,
  }).format(amount);
}

export function PipelineStats() {
  const { data: stats, isLoading } = useProspectStats();

  if (isLoading) {
    return (
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        {Array.from({ length: 5 }).map((_, i) => (
          <Card key={i}>
            <CardContent className="p-4">
              <Skeleton className="h-4 w-20 mb-2" />
              <Skeleton className="h-7 w-16" />
            </CardContent>
          </Card>
        ))}
      </div>
    );
  }

  if (!stats) return null;

  const cards = [
    {
      label: 'Total Active',
      value: stats.total,
      icon: Users,
      color: 'text-blue-600',
      bgColor: 'bg-blue-50',
    },
    {
      label: 'Pipeline Value',
      value: formatCurrency(stats.totalPipelineValue),
      icon: IndianRupee,
      color: 'text-green-600',
      bgColor: 'bg-green-50',
    },
    {
      label: 'Won This Month',
      value: stats.wonThisMonth,
      icon: Trophy,
      color: 'text-amber-600',
      bgColor: 'bg-amber-50',
    },
    {
      label: 'Overdue Follow-ups',
      value: stats.overdueFollowUps,
      icon: AlertTriangle,
      color: stats.overdueFollowUps > 0 ? 'text-red-600' : 'text-gray-600',
      bgColor: stats.overdueFollowUps > 0 ? 'bg-red-50' : 'bg-gray-50',
    },
    {
      label: 'Ready to Re-engage',
      value: stats.readyToReengage || 0,
      icon: RefreshCcw,
      color: (stats.readyToReengage || 0) > 0 ? 'text-amber-600' : 'text-gray-600',
      bgColor: (stats.readyToReengage || 0) > 0 ? 'bg-amber-50' : 'bg-gray-50',
    },
  ];

  return (
    <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
      {cards.map((card) => {
        const Icon = card.icon;
        return (
          <Card key={card.label}>
            <CardContent className="p-4 flex items-center gap-3">
              <div className={`${card.bgColor} p-2 rounded-lg`}>
                <Icon className={`h-5 w-5 ${card.color}`} />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">{card.label}</p>
                <p className="text-xl font-bold">{card.value}</p>
              </div>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
