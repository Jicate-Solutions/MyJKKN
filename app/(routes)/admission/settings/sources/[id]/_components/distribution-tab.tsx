'use client';

import { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { format, subDays } from 'date-fns';
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
} from 'recharts';
import {
  Activity,
  CheckCircle2,
  Hourglass,
  Inbox,
  TrendingUp,
  Users,
} from 'lucide-react';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { DatePickerWithRange } from '@/components/ui/date-range-picker';

import {
  LeadDistributionService,
  type CounselorDistribution,
} from '@/lib/services/admission/lead-distribution-service';
import type { LeadSourceEnum } from '@/lib/services/admission/source-master-service';

const ROLE_LABEL: Record<string, string> = {
  admission_counselor: 'Admission',
  expo_counselor: 'Expo',
  learner_counselor: 'Learner',
  staff_counselor: 'Staff',
};

const ROLE_BADGE: Record<string, string> = {
  admission_counselor: 'bg-blue-100 text-blue-700 border-blue-200',
  expo_counselor: 'bg-purple-100 text-purple-700 border-purple-200',
  learner_counselor: 'bg-amber-100 text-amber-700 border-amber-200',
  staff_counselor: 'bg-emerald-100 text-emerald-700 border-emerald-200',
};

const PRESETS = [
  { label: 'Last 7 days', days: 7 },
  { label: 'Last 14 days', days: 14 },
  { label: 'Last 30 days', days: 30 },
  { label: 'Last 90 days', days: 90 },
] as const;

interface DistributionTabProps {
  sourceId: string;
  sourceEnum: LeadSourceEnum;
  institutionId?: string | null;
}

export function DistributionTab({
  sourceEnum,
  institutionId,
}: DistributionTabProps) {
  const [range, setRange] = useState<{ from: Date; to: Date }>(() => {
    const to = new Date();
    const from = subDays(to, 7);
    return { from, to };
  });

  const { data, isLoading, error } = useQuery({
    queryKey: [
      'lead-distribution',
      sourceEnum,
      range.from.toISOString().slice(0, 10),
      range.to.toISOString().slice(0, 10),
      institutionId ?? 'all',
    ],
    queryFn: () =>
      LeadDistributionService.get({
        sourceEnum,
        fromDate: range.from,
        toDate: range.to,
        institutionId,
      }),
  });

  const chartData = useMemo(() => {
    if (!data) return [];
    // Top 10 by total leads, dropping the unassigned bucket from the chart
    return data.perCounselor
      .filter((c) => c.user_id !== null && c.totalLeads > 0)
      .slice(0, 10)
      .map((c) => ({
        name: c.name.length > 16 ? c.name.slice(0, 14) + '…' : c.name,
        fullName: c.name,
        new: c.newLeads,
        progressed: c.progressedLeads,
        conversions: c.conversions,
        lost: c.lostLeads,
      }));
  }, [data]);

  const setPreset = (days: number) => {
    const to = new Date();
    const from = subDays(to, days);
    setRange({ from, to });
  };

  return (
    <div className="space-y-4">
      {/* Date range controls */}
      <Card>
        <CardContent className="flex flex-wrap items-center gap-3 pt-6">
          <div className="text-sm font-medium">Window:</div>
          <DatePickerWithRange
            value={{ from: range.from, to: range.to }}
            onChange={(r) =>
              r?.from && r?.to ? setRange({ from: r.from, to: r.to }) : undefined
            }
          />
          <div className="flex items-center gap-1 ml-auto">
            {PRESETS.map((p) => (
              <Button
                key={p.days}
                size="sm"
                variant="outline"
                className="h-7 text-xs"
                onClick={() => setPreset(p.days)}
              >
                {p.label}
              </Button>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Summary KPIs */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
        <KpiCard
          icon={<Inbox className="h-4 w-4" />}
          label="Total leads"
          value={data?.summary.totalLeads ?? 0}
          loading={isLoading}
        />
        <KpiCard
          icon={<Users className="h-4 w-4" />}
          label="Counselors"
          value={data?.summary.uniqueCounselors ?? 0}
          loading={isLoading}
        />
        <KpiCard
          icon={<Hourglass className="h-4 w-4" />}
          label="Unassigned"
          value={data?.summary.totalUnassigned ?? 0}
          accent={
            (data?.summary.totalUnassigned ?? 0) > 0
              ? 'text-orange-600'
              : 'text-muted-foreground'
          }
          loading={isLoading}
        />
        <KpiCard
          icon={<TrendingUp className="h-4 w-4" />}
          label="Progression rate"
          value={`${(data?.summary.progressionRate ?? 0).toFixed(1)}%`}
          loading={isLoading}
        />
        <KpiCard
          icon={<CheckCircle2 className="h-4 w-4" />}
          label="Conversion rate"
          value={`${(data?.summary.conversionRate ?? 0).toFixed(1)}%`}
          accent="text-green-600"
          loading={isLoading}
        />
      </div>

      {/* Chart */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center gap-2">
            <Activity className="h-4 w-4" />
            Top counselors by lead volume
          </CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading && <Skeleton className="h-64 w-full" />}
          {error && (
            <div className="text-sm text-destructive">
              Failed to load distribution. {(error as Error).message}
            </div>
          )}
          {!isLoading && chartData.length === 0 && (
            <div className="py-12 text-center text-sm text-muted-foreground">
              <Activity className="mx-auto mb-2 h-6 w-6 opacity-40" />
              No leads from this source in the selected window.
            </div>
          )}
          {!isLoading && chartData.length > 0 && (
            <ResponsiveContainer width="100%" height={280}>
              <BarChart data={chartData} margin={{ top: 8, right: 16, bottom: 8, left: 0 }}>
                <CartesianGrid strokeDasharray="3 3" className="opacity-40" />
                <XAxis dataKey="name" tick={{ fontSize: 11 }} interval={0} angle={-20} textAnchor="end" height={60} />
                <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
                <Tooltip
                  cursor={{ fill: 'hsl(var(--muted))', opacity: 0.4 }}
                  labelFormatter={(label, payload) => {
                    const item = payload?.[0]?.payload as { fullName?: string };
                    return item?.fullName ?? label;
                  }}
                  contentStyle={{ fontSize: 12 }}
                />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <Bar dataKey="conversions" stackId="a" name="Converted" fill="#16a34a" />
                <Bar dataKey="progressed" stackId="a" name="In progress" fill="#2563eb" />
                <Bar dataKey="new" stackId="a" name="New" fill="#94a3b8" />
                <Bar dataKey="lost" stackId="a" name="Lost" fill="#ef4444" />
              </BarChart>
            </ResponsiveContainer>
          )}
        </CardContent>
      </Card>

      {/* Per-counselor table */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Per-counselor breakdown</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading && (
            <div className="space-y-2">
              {Array.from({ length: 6 }).map((_, i) => (
                <Skeleton key={i} className="h-10 w-full" />
              ))}
            </div>
          )}

          {!isLoading && (data?.perCounselor.length ?? 0) === 0 && (
            <div className="py-8 text-center text-sm text-muted-foreground">
              No leads to break down.
            </div>
          )}

          {!isLoading && (data?.perCounselor.length ?? 0) > 0 && (
            <div className="overflow-x-auto rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Counselor</TableHead>
                    <TableHead>Role</TableHead>
                    <TableHead className="text-right">Total</TableHead>
                    <TableHead className="text-right hidden md:table-cell">New</TableHead>
                    <TableHead className="text-right hidden md:table-cell">In progress</TableHead>
                    <TableHead className="text-right">Converted</TableHead>
                    <TableHead className="text-right hidden md:table-cell">Lost</TableHead>
                    <TableHead className="text-right">Progression</TableHead>
                    <TableHead className="text-right">Last assigned</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(data?.perCounselor ?? []).map((c) => (
                    <CounselorRow key={c.user_id ?? 'unassigned'} c={c} />
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function KpiCard({
  icon,
  label,
  value,
  accent,
  loading,
}: {
  icon: React.ReactNode;
  label: string;
  value: number | string;
  accent?: string;
  loading?: boolean;
}) {
  return (
    <Card>
      <CardContent className="pt-4 pb-3">
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground mb-1">
          {icon}
          <span>{label}</span>
        </div>
        {loading ? (
          <Skeleton className="h-7 w-16" />
        ) : (
          <div
            className={`text-2xl font-semibold tabular-nums ${accent ?? ''}`}
          >
            {typeof value === 'number' ? value.toLocaleString() : value}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function CounselorRow({ c }: { c: CounselorDistribution }) {
  const isUnassigned = !c.user_id;
  return (
    <TableRow className={isUnassigned ? 'bg-orange-50/40' : ''}>
      <TableCell>
        <div className="flex flex-col">
          <span className="font-medium">{c.name}</span>
          {c.email && (
            <span className="text-xs text-muted-foreground truncate max-w-[200px]">
              {c.designation ? `${c.designation} · ` : ''}
              {c.email}
            </span>
          )}
        </div>
      </TableCell>
      <TableCell>
        {isUnassigned ? (
          <Badge variant="outline" className="text-orange-700 border-orange-200">
            Unassigned
          </Badge>
        ) : c.role_key ? (
          <Badge
            variant="outline"
            className={`text-[10px] ${ROLE_BADGE[c.role_key] ?? ''}`}
          >
            {ROLE_LABEL[c.role_key] ?? c.role_key}
          </Badge>
        ) : (
          <span className="text-xs text-muted-foreground">—</span>
        )}
      </TableCell>
      <TableCell className="text-right tabular-nums font-medium">
        {c.totalLeads.toLocaleString()}
      </TableCell>
      <TableCell className="text-right tabular-nums hidden md:table-cell">
        {c.newLeads.toLocaleString()}
      </TableCell>
      <TableCell className="text-right tabular-nums text-blue-700 hidden md:table-cell">
        {c.progressedLeads.toLocaleString()}
      </TableCell>
      <TableCell className="text-right tabular-nums text-green-700">
        {c.conversions.toLocaleString()}
      </TableCell>
      <TableCell className="text-right tabular-nums text-red-700 hidden md:table-cell">
        {c.lostLeads.toLocaleString()}
      </TableCell>
      <TableCell className="text-right tabular-nums">
        {c.progressionRate.toFixed(1)}%
      </TableCell>
      <TableCell className="text-right text-xs text-muted-foreground">
        {c.lastAssignedAt ? format(new Date(c.lastAssignedAt), 'MMM d, HH:mm') : '—'}
      </TableCell>
    </TableRow>
  );
}
