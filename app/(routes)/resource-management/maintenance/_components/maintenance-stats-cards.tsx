// app/(routes)/resource-management/maintenance/_components/maintenance-stats-cards.tsx
'use client';

import {
  Wrench,
  CheckCircle2,
  Clock,
  AlertTriangle,
  IndianRupee,
  Timer
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import type { MaintenanceStats } from '@/types/maintenance';

interface MaintenanceStatsCardsProps {
  stats: MaintenanceStats | null;
  isLoading?: boolean;
}

export function MaintenanceStatsCards({
  stats,
  isLoading = false
}: MaintenanceStatsCardsProps) {
  const cards = [
    {
      title: 'Total Maintenance',
      value: stats?.total_maintenance || 0,
      icon: Wrench,
      color: 'text-blue-600',
      bgColor: 'bg-blue-50',
      borderColor: 'border-blue-200',
      subtitle: 'All maintenance records'
    },
    {
      title: 'Completed',
      value: stats?.completed || 0,
      icon: CheckCircle2,
      color: 'text-green-600',
      bgColor: 'bg-green-50',
      borderColor: 'border-green-200',
      subtitle: 'Successfully completed'
    },
    {
      title: 'Pending',
      value: stats?.pending || 0,
      icon: Clock,
      color: 'text-yellow-600',
      bgColor: 'bg-yellow-50',
      borderColor: 'border-yellow-200',
      subtitle: 'Scheduled & In Progress'
    },
    {
      title: 'Overdue',
      value: stats?.overdue || 0,
      icon: AlertTriangle,
      color: 'text-red-600',
      bgColor: 'bg-red-50',
      borderColor: 'border-red-200',
      subtitle: 'Requires immediate attention'
    },
    {
      title: 'Total Cost',
      value: `₹${stats?.total_cost?.toLocaleString() || 0}`,
      icon: IndianRupee,
      color: 'text-purple-600',
      bgColor: 'bg-purple-50',
      borderColor: 'border-purple-200',
      subtitle: 'Maintenance expenses',
      isCurrency: true
    },
    {
      title: 'Avg. Completion Time',
      value: stats?.avg_completion_time?.toFixed(1) || '0',
      icon: Timer,
      color: 'text-indigo-600',
      bgColor: 'bg-indigo-50',
      borderColor: 'border-indigo-200',
      subtitle: 'Days to complete',
      suffix: 'days'
    }
  ];

  if (isLoading) {
    return (
      <div className='grid gap-4 md:grid-cols-2 lg:grid-cols-3'>
        {Array.from({ length: 6 }).map((_, i) => (
          <Card key={i}>
            <CardHeader className='flex flex-row items-center justify-between space-y-0 pb-2'>
              <Skeleton className='h-4 w-32' />
              <Skeleton className='h-4 w-4 rounded' />
            </CardHeader>
            <CardContent>
              <Skeleton className='h-8 w-20' />
              <Skeleton className='h-3 w-28 mt-2' />
            </CardContent>
          </Card>
        ))}
      </div>
    );
  }

  const getCompletionRate = () => {
    const total = stats?.total_maintenance || 0;
    const completed = stats?.completed || 0;
    if (total === 0) return 0;
    return Math.round((completed / total) * 100);
  };

  return (
    <div className='grid gap-4 md:grid-cols-2 lg:grid-cols-3'>
      {cards.map((card) => {
        const Icon = card.icon;
        return (
          <Card
            key={card.title}
            className={`border-2 ${card.borderColor} transition-all hover:shadow-md`}
          >
            <CardHeader className='flex flex-row items-center justify-between space-y-0 pb-2'>
              <CardTitle className='text-sm font-medium'>
                {card.title}
              </CardTitle>
              <div className={`${card.bgColor} p-2 rounded-lg`}>
                <Icon className={`h-4 w-4 ${card.color}`} />
              </div>
            </CardHeader>
            <CardContent>
              <div className='flex items-baseline gap-2'>
                <div className='text-3xl font-bold'>{card.value}</div>
                {card.suffix && !card.isCurrency && (
                  <span className='text-sm text-muted-foreground'>
                    {card.suffix}
                  </span>
                )}
              </div>
              <div className='mt-2 flex items-center justify-between'>
                <p className='text-xs text-muted-foreground'>{card.subtitle}</p>
                {card.title === 'Completed' && (
                  <Badge variant='outline' className='text-xs'>
                    {getCompletionRate()}% rate
                  </Badge>
                )}
                {card.title === 'Overdue' &&
                  stats?.overdue &&
                  stats.overdue > 0 && (
                    <Badge variant='destructive' className='text-xs'>
                      Action needed
                    </Badge>
                  )}
              </div>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
