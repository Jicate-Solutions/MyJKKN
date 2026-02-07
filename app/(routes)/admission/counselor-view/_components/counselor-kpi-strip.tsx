'use client';

import { Card, CardContent } from '@/components/ui/card';
import { Users, CalendarCheck, Flame, TrendingUp, Clock } from 'lucide-react';
import type { CounselorKPIs } from '@/lib/services/admission/counselor-daily-view-service';

interface CounselorKPIStripProps {
  kpis: CounselorKPIs;
  isLoading?: boolean;
}

const KPI_ITEMS = [
  {
    key: 'my_leads_today' as const,
    label: 'My Leads Today',
    icon: Users,
    color: 'text-blue-600',
    bgColor: 'bg-blue-50',
  },
  {
    key: 'followups_due' as const,
    label: 'Follow-ups Due',
    icon: CalendarCheck,
    color: 'text-red-600',
    bgColor: 'bg-red-50',
    alert: true,
  },
  {
    key: 'hot_leads' as const,
    label: 'Hot Leads',
    icon: Flame,
    color: 'text-orange-600',
    bgColor: 'bg-orange-50',
  },
  {
    key: 'conversion_rate' as const,
    label: 'Conversions',
    icon: TrendingUp,
    color: 'text-green-600',
    bgColor: 'bg-green-50',
    suffix: '%',
  },
  {
    key: 'total_active' as const,
    label: 'Active Pipeline',
    icon: Clock,
    color: 'text-purple-600',
    bgColor: 'bg-purple-50',
  },
];

export function CounselorKPIStrip({ kpis, isLoading }: CounselorKPIStripProps) {
  if (isLoading) {
    return (
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
        {KPI_ITEMS.map((item) => (
          <Card key={item.key} className="animate-pulse">
            <CardContent className="p-4">
              <div className="h-4 w-20 bg-muted rounded mb-2" />
              <div className="h-8 w-12 bg-muted rounded" />
            </CardContent>
          </Card>
        ))}
      </div>
    );
  }

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
      {KPI_ITEMS.map((item) => {
        const value = kpis[item.key];
        const Icon = item.icon;
        const hasAlert = item.alert && value > 0;

        return (
          <Card key={item.key} className={hasAlert ? 'border-red-200 bg-red-50/30' : ''}>
            <CardContent className="p-4">
              <div className="flex items-center gap-2 mb-1">
                <div className={`p-1.5 rounded-md ${item.bgColor}`}>
                  <Icon className={`h-3.5 w-3.5 ${item.color}`} />
                </div>
                <span className="text-xs text-muted-foreground truncate">{item.label}</span>
              </div>
              <div className="flex items-baseline gap-1">
                <span className={`text-2xl font-bold ${hasAlert ? 'text-red-600' : ''}`}>
                  {value}
                </span>
                {item.suffix && <span className="text-sm text-muted-foreground">{item.suffix}</span>}
                {hasAlert && kpis.overdue_followups > 0 && (
                  <span className="text-xs text-red-500 ml-1">
                    ({kpis.overdue_followups} overdue)
                  </span>
                )}
              </div>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
