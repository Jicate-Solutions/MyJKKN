'use client';

// app/(routes)/grievance/_components/dashboard-stats.tsx
// F004: Grievance Ticketing System - Dashboard Stats Component

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  AlertCircle,
  CheckCircle2,
  Clock,
  AlertTriangle,
  Star,
  Timer
} from 'lucide-react';
import type { GrievanceDashboardStats } from '@/types/grievance';

interface DashboardStatsProps {
  stats: GrievanceDashboardStats;
}

export function DashboardStats({ stats }: DashboardStatsProps) {
  const cards = [
    {
      title: 'Open Tickets',
      value: stats.total_open,
      icon: AlertCircle,
      color: 'text-blue-600',
      bgColor: 'bg-blue-100'
    },
    {
      title: 'In Progress',
      value: stats.total_in_progress,
      icon: Clock,
      color: 'text-yellow-600',
      bgColor: 'bg-yellow-100'
    },
    {
      title: 'Resolved',
      value: stats.total_resolved,
      icon: CheckCircle2,
      color: 'text-green-600',
      bgColor: 'bg-green-100'
    },
    {
      title: 'SLA Breached',
      value: stats.sla_breached,
      icon: AlertTriangle,
      color: 'text-red-600',
      bgColor: 'bg-red-100'
    },
    {
      title: 'Avg Satisfaction',
      value: stats.avg_satisfaction.toFixed(1),
      suffix: '/5',
      icon: Star,
      color: 'text-purple-600',
      bgColor: 'bg-purple-100'
    },
    {
      title: 'Avg Resolution Time',
      value: stats.avg_resolution_time_hours.toFixed(1),
      suffix: 'hrs',
      icon: Timer,
      color: 'text-orange-600',
      bgColor: 'bg-orange-100'
    }
  ];

  return (
    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
      {cards.map((card) => (
        <Card key={card.title}>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              {card.title}
            </CardTitle>
            <div className={`p-2 rounded-full ${card.bgColor}`}>
              <card.icon className={`h-4 w-4 ${card.color}`} />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {card.value}
              {card.suffix && (
                <span className="text-sm font-normal text-muted-foreground ml-1">
                  {card.suffix}
                </span>
              )}
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

export function SLAIndicators({ stats }: DashboardStatsProps) {
  const total = stats.sla_on_track + stats.sla_at_risk + stats.sla_breached;
  const onTrackPercent = total > 0 ? (stats.sla_on_track / total) * 100 : 100;
  const atRiskPercent = total > 0 ? (stats.sla_at_risk / total) * 100 : 0;
  const breachedPercent = total > 0 ? (stats.sla_breached / total) * 100 : 0;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">SLA Status Overview</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          {/* Progress bar */}
          <div className="flex h-3 rounded-full overflow-hidden bg-gray-100">
            <div
              className="bg-green-500 transition-all"
              style={{ width: `${onTrackPercent}%` }}
            />
            <div
              className="bg-yellow-500 transition-all"
              style={{ width: `${atRiskPercent}%` }}
            />
            <div
              className="bg-red-500 transition-all"
              style={{ width: `${breachedPercent}%` }}
            />
          </div>

          {/* Legend */}
          <div className="flex flex-wrap gap-4 text-sm">
            <div className="flex items-center gap-2">
              <div className="h-3 w-3 rounded-full bg-green-500" />
              <span>On Track ({stats.sla_on_track})</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="h-3 w-3 rounded-full bg-yellow-500" />
              <span>At Risk ({stats.sla_at_risk})</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="h-3 w-3 rounded-full bg-red-500" />
              <span>Breached ({stats.sla_breached})</span>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
