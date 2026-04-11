'use client';

import Link from 'next/link';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Alert, AlertDescription } from '@/components/ui/alert';
import {
  Users,
  DollarSign,
  GraduationCap,
  AlertTriangle,
  ShieldCheck,
  Play,
  RefreshCw,
  Download,
  AlertCircle,
} from 'lucide-react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from 'recharts';
import { useSF100Program, useSF100PhaseFunnel, useSF100VerificationQueue } from '@/hooks/startup-studio';

interface SF100ProgramOverviewProps {
  programId: string;
}

const PHASE_COLORS: Record<string, string> = {
  ideation: '#6366f1',
  validation: '#f59e0b',
  mvp: '#3b82f6',
  revenue: '#10b981',
  growth: '#8b5cf6',
  graduated: '#22c55e',
  stalled: '#ef4444',
  eliminated: '#6b7280',
};

function StatCard({
  title,
  value,
  icon: Icon,
  colorClass = 'text-foreground',
}: {
  title: string;
  value: number | string;
  icon: React.ElementType;
  colorClass?: string;
}) {
  return (
    <Card>
      <CardContent className="pt-6">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm text-muted-foreground">{title}</p>
            <p className={`text-3xl font-bold mt-1 ${colorClass}`}>{value}</p>
          </div>
          <div className="p-3 rounded-full bg-muted">
            <Icon className="h-5 w-5 text-muted-foreground" />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function OverviewSkeleton() {
  return (
    <div className="space-y-6">
      <Skeleton className="h-8 w-64" />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Card key={i}>
            <CardContent className="pt-6">
              <Skeleton className="h-4 w-24 mb-2" />
              <Skeleton className="h-8 w-16" />
            </CardContent>
          </Card>
        ))}
      </div>
      <Card>
        <CardHeader>
          <Skeleton className="h-5 w-32" />
        </CardHeader>
        <CardContent>
          <Skeleton className="h-48 w-full" />
        </CardContent>
      </Card>
    </div>
  );
}

export function SF100ProgramOverview({ programId }: SF100ProgramOverviewProps) {
  const { data: programRaw, isLoading: programLoading, error: programError } = useSF100Program(programId);
  const { data: funnelRaw, isLoading: funnelLoading } = useSF100PhaseFunnel(programId);
  const { data: queueRaw } = useSF100VerificationQueue(programId);

  const program = (programRaw as any)?.data ?? programRaw;
  const funnelData: any[] = Array.isArray(funnelRaw)
    ? funnelRaw
    : (funnelRaw as any)?.data ?? [];
  const verificationQueue: any[] = Array.isArray(queueRaw)
    ? queueRaw
    : (queueRaw as any)?.data ?? [];

  if (programLoading) return <OverviewSkeleton />;

  if (programError) {
    return (
      <Alert variant="destructive">
        <AlertCircle className="h-4 w-4" />
        <AlertDescription>Failed to load program. Please try again.</AlertDescription>
      </Alert>
    );
  }

  const chartData = funnelData.map((item: any) => ({
    phase: item.phase ?? item.name,
    count: item.count ?? item.team_count ?? 0,
  }));

  const stallAlerts: any[] = (program?.stall_alerts ?? []);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">{program?.name ?? 'Program Overview'}</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            {program?.description ?? 'Solve for 100 program management'}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button size="sm" variant="outline" className="flex items-center gap-1.5">
            <Play className="h-3.5 w-3.5" />
            Auto-Advance
          </Button>
          <Button size="sm" variant="outline" className="flex items-center gap-1.5">
            <RefreshCw className="h-3.5 w-3.5" />
            Run Stall Check
          </Button>
          <Button size="sm" variant="outline" className="flex items-center gap-1.5">
            <Download className="h-3.5 w-3.5" />
            Export CSV
          </Button>
        </div>
      </div>

      {/* Stats cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          title="Total Teams"
          value={program?.total_teams ?? 0}
          icon={Users}
        />
        <StatCard
          title="Total Paid Users"
          value={program?.total_paid_users ?? 0}
          icon={DollarSign}
          colorClass="text-green-600"
        />
        <StatCard
          title="Graduated"
          value={program?.graduated_count ?? 0}
          icon={GraduationCap}
          colorClass="text-blue-600"
        />
        <StatCard
          title="Stalled"
          value={program?.stalled_count ?? 0}
          icon={AlertTriangle}
          colorClass="text-amber-600"
        />
      </div>

      {/* Phase funnel chart */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Phase Funnel</CardTitle>
        </CardHeader>
        <CardContent>
          {funnelLoading ? (
            <Skeleton className="h-48 w-full" />
          ) : chartData.length === 0 ? (
            <p className="text-sm text-muted-foreground py-8 text-center">
              No phase data available yet.
            </p>
          ) : (
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={chartData} margin={{ top: 4, right: 8, bottom: 4, left: 0 }}>
                <XAxis
                  dataKey="phase"
                  tick={{ fontSize: 12 }}
                  tickFormatter={(v) => v.charAt(0).toUpperCase() + v.slice(1)}
                />
                <YAxis tick={{ fontSize: 12 }} allowDecimals={false} />
                <Tooltip
                  formatter={(value: number) => [value, 'Teams']}
                  labelFormatter={(label) => label.charAt(0).toUpperCase() + label.slice(1)}
                />
                <Bar dataKey="count" radius={[4, 4, 0, 0]}>
                  {chartData.map((entry, index) => (
                    <Cell
                      key={index}
                      fill={PHASE_COLORS[entry.phase] ?? '#6366f1'}
                    />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          )}
        </CardContent>
      </Card>

      {/* Bottom row: Stall alerts + Verification queue */}
      <div className="grid gap-4 sm:grid-cols-2">
        {/* Stall alerts */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-amber-500" />
              Stall Alerts
              {stallAlerts.length > 0 && (
                <Badge className="bg-amber-100 text-amber-700 border-amber-200 text-xs">
                  {stallAlerts.length}
                </Badge>
              )}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {stallAlerts.length === 0 ? (
              <p className="text-sm text-muted-foreground">No active stall alerts.</p>
            ) : (
              <ul className="space-y-2">
                {stallAlerts.slice(0, 5).map((alert: any, i: number) => (
                  <li key={i} className="flex items-center justify-between text-sm">
                    <span className="font-medium truncate">{alert.team_name}</span>
                    <Badge variant="outline" className="text-xs text-amber-600 border-amber-300 shrink-0">
                      {alert.weeks_stalled}w stalled
                    </Badge>
                  </li>
                ))}
                {stallAlerts.length > 5 && (
                  <p className="text-xs text-muted-foreground pt-1">
                    +{stallAlerts.length - 5} more
                  </p>
                )}
              </ul>
            )}
          </CardContent>
        </Card>

        {/* Verification queue */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <ShieldCheck className="h-4 w-4 text-blue-500" />
              Verification Queue
              {verificationQueue.length > 0 && (
                <Badge className="bg-blue-100 text-blue-700 border-blue-200 text-xs">
                  {verificationQueue.length}
                </Badge>
              )}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {verificationQueue.length === 0 ? (
              <p className="text-sm text-muted-foreground">No pending verifications.</p>
            ) : (
              <p className="text-sm text-muted-foreground">
                {verificationQueue.length} paid user submission
                {verificationQueue.length !== 1 ? 's' : ''} awaiting review.
              </p>
            )}
            <Button asChild size="sm" variant="outline" className="w-full">
              <Link href={`/startup-studio/solve-for-100/programs/${programId}/verification-queue`}>
                Review Queue
              </Link>
            </Button>
          </CardContent>
        </Card>
      </div>

      {/* Navigation links */}
      <div className="flex flex-wrap gap-2 pt-2">
        <Button asChild variant="secondary" size="sm">
          <Link href={`/startup-studio/solve-for-100/programs/${programId}/enrollments`}>
            View All Enrollments
          </Link>
        </Button>
      </div>
    </div>
  );
}
