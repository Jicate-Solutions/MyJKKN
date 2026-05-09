'use client';

// app/(routes)/admission/insights/_components/quick-stats.tsx
// Always-on actionable summary cards for the AI Insights page.
//
// Renders instantly via /api/admission/insights/quick-stats — independent of
// the slower Claude-generated insights. This means the page is never blank,
// even on first load, fresh-AY institutions, or if the Claude API is down.

import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Activity,
  AlertCircle,
  AlertTriangle,
  ArrowRight,
  Info,
  Lightbulb,
  TrendingUp,
} from 'lucide-react';
import { cn } from '@/lib/utils';

interface QuickStat {
  id: string;
  title: string;
  description: string;
  severity: 'critical' | 'high' | 'medium' | 'low' | 'info';
  metric_value: number;
  metric_label: string;
  action_label: string;
  action_url: string | null;
}

interface QuickStatsResponse {
  stats: QuickStat[];
  summary: {
    total: number;
    active: number;
    enrolled: number;
    hot_no_contact: number;
    stale_early: number;
    near_conversion: number;
    unassigned_active: number;
    new_this_week: number;
    new_prior_week: number;
    wow_change_pct: number;
  };
  generated_at: string;
}

const SEVERITY_STYLES: Record<QuickStat['severity'], { card: string; iconBg: string; iconColor: string; Icon: typeof AlertCircle; badge: string; label: string }> = {
  critical: {
    card: 'border-red-200 bg-red-50/40',
    iconBg: 'bg-red-100',
    iconColor: 'text-red-600',
    Icon: AlertCircle,
    badge: 'bg-red-100 text-red-800 border-red-200',
    label: 'Critical',
  },
  high: {
    card: 'border-orange-200 bg-orange-50/40',
    iconBg: 'bg-orange-100',
    iconColor: 'text-orange-600',
    Icon: AlertTriangle,
    badge: 'bg-orange-100 text-orange-800 border-orange-200',
    label: 'High',
  },
  medium: {
    card: 'border-yellow-200 bg-yellow-50/40',
    iconBg: 'bg-yellow-100',
    iconColor: 'text-yellow-600',
    Icon: Info,
    badge: 'bg-yellow-100 text-yellow-800 border-yellow-200',
    label: 'Medium',
  },
  low: {
    card: 'border-blue-200 bg-blue-50/40',
    iconBg: 'bg-blue-100',
    iconColor: 'text-blue-600',
    Icon: Lightbulb,
    badge: 'bg-blue-100 text-blue-800 border-blue-200',
    label: 'Low',
  },
  info: {
    card: 'border-slate-200 bg-slate-50/40',
    iconBg: 'bg-slate-100',
    iconColor: 'text-slate-600',
    Icon: TrendingUp,
    badge: 'bg-slate-100 text-slate-800 border-slate-200',
    label: 'Info',
  },
};

interface QuickStatsProps {
  institutionId: string;
}

export function QuickStats({ institutionId }: QuickStatsProps) {
  const { data, isLoading, isError, refetch } = useQuery<QuickStatsResponse>({
    queryKey: ['admission-insights', 'quick-stats', institutionId],
    queryFn: async () => {
      const res = await fetch(`/api/admission/insights/quick-stats?institutionId=${institutionId}`);
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: 'Failed to load' }));
        throw new Error(err.error || `Quick stats failed (${res.status})`);
      }
      return res.json();
    },
    enabled: !!institutionId,
    staleTime: 60 * 1000, // 1 minute
    refetchInterval: 5 * 60 * 1000, // 5 minutes
  });

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Activity className="h-5 w-5 text-emerald-500" />
            Live Stats
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {[1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-32" />
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  if (isError || !data) {
    return (
      <Card className="border-yellow-200 bg-yellow-50/30">
        <CardContent className="py-4 text-sm text-yellow-800 flex items-center justify-between">
          <span>Couldn't load live stats. AI insights below may still be available.</span>
          <Button size="sm" variant="outline" onClick={() => refetch()}>
            Retry
          </Button>
        </CardContent>
      </Card>
    );
  }

  const { stats, summary, generated_at } = data;
  const generatedDate = new Date(generated_at);

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between flex-wrap gap-2">
          <CardTitle className="flex items-center gap-2 text-base">
            <Activity className="h-5 w-5 text-emerald-500" />
            Live Stats
            <Badge variant="secondary">{stats.length}</Badge>
          </CardTitle>
          <div className="text-xs text-muted-foreground">
            {summary.active.toLocaleString()} active &middot; {summary.total.toLocaleString()} total &middot; computed{' '}
            {generatedDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {stats.map((stat) => {
            const style = SEVERITY_STYLES[stat.severity];
            const Icon = style.Icon;
            return (
              <div
                key={stat.id}
                className={cn('rounded-lg border p-4 flex flex-col gap-2', style.card)}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className={cn('p-1.5 rounded', style.iconBg)}>
                    <Icon className={cn('h-4 w-4', style.iconColor)} />
                  </div>
                  <Badge variant="outline" className={cn('text-xs', style.badge)}>
                    {style.label}
                  </Badge>
                </div>
                <h3 className="font-semibold text-sm leading-snug">{stat.title}</h3>
                <p className="text-xs text-muted-foreground leading-relaxed flex-1">
                  {stat.description}
                </p>
                {stat.action_url && (
                  <Button
                    asChild
                    size="sm"
                    variant="outline"
                    className="self-start mt-1"
                  >
                    <Link href={stat.action_url}>
                      {stat.action_label}
                      <ArrowRight className="h-3 w-3 ml-1" />
                    </Link>
                  </Button>
                )}
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}
