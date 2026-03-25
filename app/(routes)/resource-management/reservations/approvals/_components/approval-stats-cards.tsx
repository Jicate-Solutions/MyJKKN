// app/(routes)/resource-management/reservations/approvals/_components/approval-stats-cards.tsx
'use client';

import {
  Clock,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  TrendingUp
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';

interface ApprovalStatsCardsProps {
  stats: {
    pending_approvals: number;
    approved_today: number;
    rejected_today: number;
    overdue_approvals: number;
  } | null;
  isLoading?: boolean;
}

export function ApprovalStatsCards({
  stats,
  isLoading = false
}: ApprovalStatsCardsProps) {
  const cards = [
    {
      title: 'Pending Approvals',
      value: stats?.pending_approvals || 0,
      icon: Clock,
      color: 'text-yellow-600',
      bgColor: 'bg-yellow-50',
      borderColor: 'border-yellow-200'
    },
    {
      title: 'Approved Today',
      value: stats?.approved_today || 0,
      icon: CheckCircle2,
      color: 'text-green-600',
      bgColor: 'bg-green-50',
      borderColor: 'border-green-200'
    },
    {
      title: 'Rejected Today',
      value: stats?.rejected_today || 0,
      icon: XCircle,
      color: 'text-red-600',
      bgColor: 'bg-red-50',
      borderColor: 'border-red-200'
    },
    {
      title: 'Overdue',
      value: stats?.overdue_approvals || 0,
      icon: AlertTriangle,
      color: 'text-orange-600',
      bgColor: 'bg-orange-50',
      borderColor: 'border-orange-200'
    }
  ];

  if (isLoading) {
    return (
      <div className='grid gap-4 md:grid-cols-2 lg:grid-cols-4'>
        {Array.from({ length: 4 }).map((_, i) => (
          <Card key={i}>
            <CardHeader className='flex flex-row items-center justify-between space-y-0 pb-2'>
              <Skeleton className='h-4 w-24' />
              <Skeleton className='h-4 w-4 rounded' />
            </CardHeader>
            <CardContent>
              <Skeleton className='h-8 w-16' />
              <Skeleton className='h-3 w-32 mt-2' />
            </CardContent>
          </Card>
        ))}
      </div>
    );
  }

  return (
    <div className='grid gap-4 md:grid-cols-2 lg:grid-cols-4'>
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
              <div className='text-3xl font-bold'>{card.value}</div>
              <p className='text-xs text-muted-foreground mt-1'>
                {card.title === 'Pending Approvals' && 'Awaiting your approval'}
                {card.title === 'Approved Today' && 'Approved in last 24h'}
                {card.title === 'Rejected Today' && 'Rejected in last 24h'}
                {card.title === 'Overdue' && 'Requires immediate action'}
              </p>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
