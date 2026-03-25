// app/(routes)/resource-management/analytics-dashboard/_components/analytics-kpi-cards.tsx
'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Package,
  Calendar,
  Wrench,
  Users,
  TrendingUp,
  IndianRupee,
  Activity,
  CheckCircle
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import type { DashboardSummary } from '@/types/analytics';

interface AnalyticsKPICardsProps {
  data: DashboardSummary | undefined;
  isLoading: boolean;
}

export function AnalyticsKPICards({ data, isLoading }: AnalyticsKPICardsProps) {
  if (isLoading) {
    return (
      <div className='grid gap-4 md:grid-cols-2 lg:grid-cols-4'>
        {Array.from({ length: 8 }).map((_, i) => (
          <Card key={i}>
            <CardHeader className='pb-2'>
              <Skeleton className='h-4 w-24' />
            </CardHeader>
            <CardContent>
              <Skeleton className='h-8 w-16 mb-2' />
              <Skeleton className='h-3 w-32' />
            </CardContent>
          </Card>
        ))}
      </div>
    );
  }

  const kpis = [
    {
      title: 'Total Resources',
      value: data?.resources.total_resources || 0,
      icon: Package,
      trend: '+12%',
      trendUp: true,
      description: `${data?.resources.active_resources || 0} active`
    },
    {
      title: 'Total Reservations',
      value: data?.reservations.total_reservations || 0,
      icon: Calendar,
      trend: '+23%',
      trendUp: true,
      description: `${data?.reservations.completed_reservations || 0} completed`
    },
    {
      title: 'Maintenance Tasks',
      value: data?.maintenance.total_maintenance || 0,
      icon: Wrench,
      trend: '-5%',
      trendUp: false,
      description: `${data?.maintenance.overdue_maintenance || 0} overdue`
    },
    {
      title: 'Active Users',
      value: data?.users.active_users || 0,
      icon: Users,
      trend: '+8%',
      trendUp: true,
      description: 'Last 30 days'
    },
    {
      title: 'Utilization Rate',
      value: `${(data?.resources.avg_utilization_rate || 0).toFixed(1)}%`,
      icon: Activity,
      trend: '+5%',
      trendUp: true,
      description: 'Average usage'
    },
    {
      title: 'Total Revenue',
      value: `₹${(data?.financial.total_revenue || 0).toLocaleString()}`,
      icon: IndianRupee,
      trend: '+18%',
      trendUp: true,
      description: 'This period'
    },
    {
      title: 'Completion Rate',
      value: `${(
        ((data?.reservations.completed_reservations || 0) /
          (data?.reservations.total_reservations || 1)) *
        100
      ).toFixed(1)}%`,
      icon: CheckCircle,
      trend: '+3%',
      trendUp: true,
      description: 'Reservations'
    },
    {
      title: 'Net Profit',
      value: `₹${(data?.financial.net_profit || 0).toLocaleString()}`,
      icon: TrendingUp,
      trend:
        data?.financial.net_profit && data.financial.net_profit > 0
          ? '+15%'
          : '-2%',
      trendUp: (data?.financial.net_profit || 0) > 0,
      description: 'After expenses'
    }
  ];

  return (
    <div className='grid gap-4 md:grid-cols-2 lg:grid-cols-4'>
      {kpis.map((kpi, index) => (
        <Card key={index}>
          <CardHeader className='flex flex-row items-center justify-between pb-2'>
            <CardTitle className='text-sm font-medium text-muted-foreground'>
              {kpi.title}
            </CardTitle>
            <kpi.icon className='h-4 w-4 text-muted-foreground' />
          </CardHeader>
          <CardContent>
            <div className='text-2xl font-bold'>{kpi.value}</div>
            <div className='flex items-center gap-2 mt-1'>
              <Badge
                variant={kpi.trendUp ? 'default' : 'destructive'}
                className='text-xs'
              >
                {kpi.trend}
              </Badge>
              <p className='text-xs text-muted-foreground'>{kpi.description}</p>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
