// app/(routes)/resource-management/analytics/_components/analytics-stats-cards.tsx
'use client';

import {
  TrendingUp,
  Users,
  Calendar,
  Activity,
  BarChart3,
  Clock
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';

interface AnalyticsStatsCardsProps {
  stats: {
    total_resources: number;
    total_reservations: number;
    active_users: number;
    utilization_rate: number;
    avg_duration_hours: number;
    peak_usage_time: string;
  } | null;
  isLoading?: boolean;
}

export function AnalyticsStatsCards({
  stats,
  isLoading = false
}: AnalyticsStatsCardsProps) {
  const cards = [
    {
      title: 'Total Resources',
      value: stats?.total_resources || 0,
      icon: BarChart3,
      color: 'text-blue-600',
      bgColor: 'bg-blue-50',
      borderColor: 'border-blue-200',
      suffix: 'resources'
    },
    {
      title: 'Total Reservations',
      value: stats?.total_reservations || 0,
      icon: Calendar,
      color: 'text-green-600',
      bgColor: 'bg-green-50',
      borderColor: 'border-green-200',
      suffix: 'bookings'
    },
    {
      title: 'Active Users',
      value: stats?.active_users || 0,
      icon: Users,
      color: 'text-purple-600',
      bgColor: 'bg-purple-50',
      borderColor: 'border-purple-200',
      suffix: 'users'
    },
    {
      title: 'Utilization Rate',
      value: stats?.utilization_rate || 0,
      icon: TrendingUp,
      color: 'text-orange-600',
      bgColor: 'bg-orange-50',
      borderColor: 'border-orange-200',
      suffix: '%',
      isPercentage: true
    },
    {
      title: 'Avg. Duration',
      value: stats?.avg_duration_hours || 0,
      icon: Clock,
      color: 'text-indigo-600',
      bgColor: 'bg-indigo-50',
      borderColor: 'border-indigo-200',
      suffix: 'hours',
      isDecimal: true
    },
    {
      title: 'Peak Usage Time',
      value: stats?.peak_usage_time || 'N/A',
      icon: Activity,
      color: 'text-pink-600',
      bgColor: 'bg-pink-50',
      borderColor: 'border-pink-200',
      isText: true
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
              <Skeleton className='h-3 w-24 mt-2' />
            </CardContent>
          </Card>
        ))}
      </div>
    );
  }

  return (
    <div className='grid gap-4 md:grid-cols-2 lg:grid-cols-3'>
      {cards.map((card) => {
        const Icon = card.icon;
        const displayValue = card.isText
          ? card.value
          : card.isDecimal
          ? typeof card.value === 'number'
            ? card.value.toFixed(1)
            : card.value
          : card.value;

        const getUtilizationBadge = (rate: number) => {
          if (rate >= 80) return <Badge variant='default'>Excellent</Badge>;
          if (rate >= 60) return <Badge variant='secondary'>Good</Badge>;
          if (rate >= 40)
            return (
              <Badge className='bg-yellow-100 text-yellow-800'>Fair</Badge>
            );
          return <Badge variant='outline'>Low</Badge>;
        };

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
                <div className='text-3xl font-bold'>{displayValue}</div>
                {!card.isText && (
                  <span className='text-sm text-muted-foreground'>
                    {card.suffix}
                  </span>
                )}
              </div>
              <div className='mt-2'>
                {card.title === 'Utilization Rate' &&
                  typeof card.value === 'number' &&
                  getUtilizationBadge(card.value)}
                {card.title === 'Total Resources' && (
                  <p className='text-xs text-muted-foreground'>
                    Available for booking
                  </p>
                )}
                {card.title === 'Total Reservations' && (
                  <p className='text-xs text-muted-foreground'>
                    All time bookings
                  </p>
                )}
                {card.title === 'Active Users' && (
                  <p className='text-xs text-muted-foreground'>Last 30 days</p>
                )}
                {card.title === 'Avg. Duration' && (
                  <p className='text-xs text-muted-foreground'>
                    Per reservation
                  </p>
                )}
                {card.title === 'Peak Usage Time' && (
                  <p className='text-xs text-muted-foreground'>
                    Busiest time slot
                  </p>
                )}
              </div>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
