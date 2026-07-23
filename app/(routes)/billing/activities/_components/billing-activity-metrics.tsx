'use client';

import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Activity,
  Users,
  TrendingUp,
  TrendingDown,
  BarChart3,
  Zap
} from 'lucide-react';
import type { BillingActivityMetrics as Metrics } from '@/types/billing-activity';
import {
  BILLING_ACTION_LABELS,
  BILLING_RESOURCE_LABELS
} from '@/types/billing-activity';

interface BillingActivityMetricsProps {
  metrics: Metrics | undefined;
  isLoading: boolean;
}

export function BillingActivityMetricsCards({
  metrics,
  isLoading
}: BillingActivityMetricsProps) {
  if (isLoading) {
    return (
      <div className='grid grid-cols-2 lg:grid-cols-4 gap-4'>
        {Array.from({ length: 4 }).map((_, i) => (
          <Card key={i}>
            <CardContent className='p-4'>
              <Skeleton className='h-4 w-24 mb-2' />
              <Skeleton className='h-8 w-16 mb-1' />
              <Skeleton className='h-3 w-32' />
            </CardContent>
          </Card>
        ))}
      </div>
    );
  }

  if (!metrics) return null;

  const todayTrend =
    metrics.yesterdayCount > 0
      ? Math.round(
          ((metrics.todayCount - metrics.yesterdayCount) /
            metrics.yesterdayCount) *
            100
        )
      : metrics.todayCount > 0
      ? 100
      : 0;

  const cards = [
    {
      title: 'Total Activities',
      value: metrics.totalActivities.toLocaleString('en-IN'),
      subtitle: 'in selected period',
      icon: Activity,
      iconColor: 'text-blue-600',
      iconBg: 'bg-blue-50'
    },
    {
      title: 'Active Users',
      value: metrics.uniqueUsers.toLocaleString('en-IN'),
      subtitle: 'performed billing actions',
      icon: Users,
      iconColor: 'text-violet-600',
      iconBg: 'bg-violet-50'
    },
    {
      title: "Today's Activity",
      value: metrics.todayCount.toLocaleString('en-IN'),
      subtitle:
        todayTrend !== 0
          ? `${todayTrend > 0 ? '+' : ''}${todayTrend}% vs yesterday`
          : 'same as yesterday',
      icon: todayTrend >= 0 ? TrendingUp : TrendingDown,
      iconColor: todayTrend >= 0 ? 'text-emerald-600' : 'text-red-600',
      iconBg: todayTrend >= 0 ? 'bg-emerald-50' : 'bg-red-50',
      trendColor: todayTrend > 0 ? 'text-emerald-600' : todayTrend < 0 ? 'text-red-600' : 'text-muted-foreground'
    },
    {
      title: 'Top Action',
      value: metrics.topAction
        ? BILLING_ACTION_LABELS[metrics.topAction.type] || metrics.topAction.type
        : '—',
      subtitle: metrics.topAction
        ? `${metrics.topAction.count} times (${metrics.topAction.percentage}%)`
        : 'no activity yet',
      icon: Zap,
      iconColor: 'text-amber-600',
      iconBg: 'bg-amber-50'
    }
  ];

  return (
    <div className='grid grid-cols-2 lg:grid-cols-4 gap-4'>
      {cards.map((card) => (
        <Card key={card.title}>
          <CardContent className='p-4'>
            <div className='flex items-center justify-between mb-2'>
              <span className='text-sm text-muted-foreground font-medium'>
                {card.title}
              </span>
              <div className={`p-1.5 rounded-md ${card.iconBg}`}>
                <card.icon className={`h-4 w-4 ${card.iconColor}`} />
              </div>
            </div>
            <div className='text-2xl font-bold'>{card.value}</div>
            <p className={`text-xs mt-0.5 ${card.trendColor || 'text-muted-foreground'}`}>
              {card.subtitle}
            </p>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
