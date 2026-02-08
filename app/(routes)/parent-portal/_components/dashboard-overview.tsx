'use client';

import { Users, MessageSquare, Star, AlertTriangle } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import type { ParentDashboardData } from '@/types/parent-portal';

interface DashboardOverviewProps {
  data: ParentDashboardData;
}

export function DashboardOverview({ data }: DashboardOverviewProps) {
  const stats = [
    {
      label: 'Linked Learners',
      value: data.learners.length,
      icon: Users,
      color: 'text-blue-600',
      bgColor: 'bg-blue-100',
    },
    {
      label: 'Unread Messages',
      value: data.unread_messages,
      icon: MessageSquare,
      color: 'text-orange-600',
      bgColor: 'bg-orange-100',
    },
    {
      label: 'Pending Surveys',
      value: data.pending_surveys.length,
      icon: Star,
      color: 'text-yellow-600',
      bgColor: 'bg-yellow-100',
    },
    {
      label: 'Overdue Fees',
      value: data.learners.filter((l) => l.fees?.total_overdue > 0).length,
      icon: AlertTriangle,
      color: 'text-red-600',
      bgColor: 'bg-red-100',
    },
  ];

  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      {stats.map((stat) => (
        <Card key={stat.label}>
          <CardContent className="flex items-center gap-4 p-4">
            <div className={`rounded-full p-3 ${stat.bgColor}`}>
              <stat.icon className={`h-5 w-5 ${stat.color}`} />
            </div>
            <div>
              <p className="text-2xl font-bold">{stat.value}</p>
              <p className="text-sm text-gray-500">{stat.label}</p>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
