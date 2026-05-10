'use client';

/**
 * KPI Card — reusable tile that renders a single KPI.
 *
 * Per decision #6: aggregate counts only, never individual names (screenshot-safe).
 * Per decision #5: drill-down by navigation, no modal editing.
 * Per decision #14: YoY delta badge next to value.
 * Per decision #10: red overdue badge when `overdue > 0`.
 * Per decision #24: skeleton variant for load state.
 */

import Link from 'next/link';
import {
  AlertTriangle,
  ArrowDownRight,
  ArrowRight,
  ArrowUpRight,
  type LucideIcon,
  Users,
  UserCheck,
  UsersRound,
  ClipboardList,
  CalendarDays,
  CalendarX2,
  Gauge,
  TrendingUp,
  CheckSquare,
  BookOpen,
  Workflow,
  Clock,
  Flame,
  Wallet,
  FileCheck,
  CalendarClock,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import type { DashboardKPI } from '@/types/hr-dashboard';

const ICONS: Record<string, LucideIcon> = {
  Users,
  UserCheck,
  UsersRound,
  ClipboardList,
  CalendarDays,
  CalendarX2,
  Gauge,
  TrendingUp,
  CheckSquare,
  BookOpen,
  Workflow,
  Clock,
  Flame,
  Wallet,
  FileCheck,
  CalendarClock,
};

function resolveIcon(name?: string): LucideIcon {
  return (name && ICONS[name]) || TrendingUp;
}

function formatValue(value: number, kpiName: string): string {
  // Special-case percentage KPIs for display clarity
  if (kpiName === 'fy_utilization_pct') return `${value}%`;
  return value.toLocaleString('en-IN');
}

export function KPICardSkeleton() {
  return (
    <Card className="h-full">
      <CardHeader className="pb-2">
        <div className="h-4 w-24 rounded bg-muted animate-pulse" />
      </CardHeader>
      <CardContent>
        <div className="h-8 w-16 rounded bg-muted animate-pulse mb-2" />
        <div className="h-3 w-20 rounded bg-muted/60 animate-pulse" />
      </CardContent>
    </Card>
  );
}

export function KPICard({ kpi }: { kpi: DashboardKPI }) {
  const Icon = resolveIcon(kpi.icon);
  const hasOverdue = typeof kpi.overdue === 'number' && kpi.overdue > 0;
  const yoy = kpi.yoy_delta_pct;
  const yoyUp = typeof yoy === 'number' && yoy > 0;
  const yoyDown = typeof yoy === 'number' && yoy < 0;

  const body = (
    <Card className="h-full hover:shadow-md hover:border-primary/40 transition-all">
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium">{kpi.label}</CardTitle>
        <Icon className="h-4 w-4 text-muted-foreground" />
      </CardHeader>
      <CardContent>
        <div className="flex items-baseline gap-2">
          <span className="text-2xl font-bold">{formatValue(kpi.value, kpi.name)}</span>
          {typeof yoy === 'number' && (
            <Badge
              variant="outline"
              className={cn(
                'text-[10px] px-1.5 py-0 h-5 gap-0.5',
                yoyUp && 'bg-green-50 text-green-700 border-green-300',
                yoyDown && 'bg-red-50 text-red-700 border-red-300',
                yoy === 0 && 'bg-muted text-muted-foreground'
              )}
            >
              {yoyUp && <ArrowUpRight className="h-3 w-3" />}
              {yoyDown && <ArrowDownRight className="h-3 w-3" />}
              {Math.abs(yoy)}% YoY
            </Badge>
          )}
        </div>
        {hasOverdue && (
          <div className="mt-2 flex items-center gap-1 text-xs text-red-700">
            <AlertTriangle className="h-3.5 w-3.5" />
            <span className="font-medium">{kpi.overdue} overdue &gt;48h</span>
          </div>
        )}
        {kpi.error && (
          <div className="mt-2 text-xs text-red-700">{kpi.error}</div>
        )}
        {!hasOverdue && !kpi.error && (
          <div className="mt-1 inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-primary transition-colors">
            View details <ArrowRight className="h-3 w-3" />
          </div>
        )}
      </CardContent>
    </Card>
  );

  // Drill-down link — entire card clickable (decision #5)
  return (
    <Link href={kpi.drill_url} className="block">
      {body}
    </Link>
  );
}
